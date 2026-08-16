// Tests for classifying generation failures.
//
// The distinction matters because the two outcomes differ for the visitor: a
// budget rejection means "come back tomorrow", anything else means "that
// broke, try again". Getting it backwards either tells someone to retry
// against an exhausted budget, or tells them the demo is closed for the day
// when a transient error would have cleared on a retry.

import { APICallError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import {
  isGatewayBudgetError,
  secondsUntilBudgetReset,
} from "./generation-errors";

function gatewayQuotaError(statusCode = 402) {
  return new APICallError({
    message: "Project budget exceeded.",
    url: "https://ai-gateway.vercel.sh/v1/chat/completions",
    requestBodyValues: {},
    statusCode,
    responseBody: JSON.stringify({
      error: {
        message:
          "Project budget exceeded. Current spend: $5.00, limit: $5.00. Please contact your administrator to increase the budget.",
        type: "quota_for_entity_exceeded",
      },
    }),
  });
}

describe("isGatewayBudgetError", () => {
  it("recognizes a 402 from the gateway", () => {
    expect(isGatewayBudgetError(gatewayQuotaError())).toBe(true);
  });

  // Belt and braces: the documented quota marker is matched independently of
  // the status code, so a budget rejection delivered with a different code is
  // still classified correctly.
  it("recognizes the quota marker even without a 402 status", () => {
    expect(isGatewayBudgetError(gatewayQuotaError(429))).toBe(true);
  });

  it("finds a budget error wrapped in a RetryError", () => {
    const wrapped = new RetryError({
      message: "Failed after 3 attempts",
      reason: "maxRetriesExceeded",
      errors: [new Error("transient"), gatewayQuotaError()],
    });

    expect(isGatewayBudgetError(wrapped)).toBe(true);
  });

  it("finds a budget error down a cause chain", () => {
    const outer = new Error("Generation failed", {
      cause: new Error("upstream", { cause: gatewayQuotaError() }),
    });

    expect(isGatewayBudgetError(outer)).toBe(true);
  });

  // The failure this guards against: treating an ordinary outage as a spend
  // cap would tell visitors the demo is closed until midnight when a retry
  // would have worked.
  it("does not classify other API failures as budget errors", () => {
    const serverError = new APICallError({
      message: "Internal server error",
      url: "https://ai-gateway.vercel.sh/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 500,
      responseBody: JSON.stringify({ error: { message: "boom" } }),
    });

    expect(isGatewayBudgetError(serverError)).toBe(false);
  });

  it("handles non-errors and empty values without throwing", () => {
    for (const value of [null, undefined, "", 0, {}, new Error("plain")]) {
      expect(isGatewayBudgetError(value)).toBe(false);
    }
  });

  it("terminates on a cyclic cause chain", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    const b = new Error("b") as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;

    expect(isGatewayBudgetError(a)).toBe(false);
  });
});

describe("secondsUntilBudgetReset", () => {
  // Daily gateway budgets reset at midnight UTC, so Retry-After should be a
  // real number of seconds rather than a guessed constant.
  it("counts the seconds to the next midnight UTC", () => {
    const at2230Utc = new Date("2026-08-16T22:30:00.000Z");

    expect(secondsUntilBudgetReset(at2230Utc)).toBe(90 * 60);
  });

  it("floors at 60 seconds just before the reset", () => {
    const justBefore = new Date("2026-08-16T23:59:57.000Z");

    expect(secondsUntilBudgetReset(justBefore)).toBe(60);
  });

  it("handles a month boundary", () => {
    const lastDay = new Date("2026-08-31T23:00:00.000Z");

    expect(secondsUntilBudgetReset(lastDay)).toBe(60 * 60);
  });
});
