/**
 * MODULE: lib/generation-errors.ts — Classifying generation failures
 *
 * The AI Gateway enforces this project's spend budget. Once the daily limit is
 * reached it rejects requests with HTTP 402 and
 * `type: "quota_for_entity_exceeded"`, which reaches us as a thrown error out
 * of generateText.
 *
 * That is a routine, expected state for a public demo with a spend cap, not a
 * bug, and it deserves a different response from a genuine failure: the
 * visitor should be told the demo is rate limited for the day rather than
 * shown a generic error over a workflow that looks stuck.
 *
 * https://vercel.com/docs/ai-gateway/observability-and-spend/budgets
 */

import { APICallError, RetryError } from "ai";

/** Marker the gateway puts in the response body for every budget rejection. */
const QUOTA_ERROR_TYPE = "quota_for_entity_exceeded";

/**
 * Walks an error and everything it wraps.
 *
 * The SDK nests failures in more than one way — `cause` chains, and
 * RetryError's `errors` array and `lastError` when retries are exhausted — so
 * checking only the top-level error would miss a budget rejection that arrived
 * inside a wrapper. The depth limit guards against a cyclic cause chain.
 */
function* unwrapErrors(error: unknown, depth = 0): Generator<unknown> {
  if (error === null || error === undefined || depth > 5) {
    return;
  }

  yield error;

  if (RetryError.isInstance(error)) {
    for (const nested of error.errors ?? []) {
      yield* unwrapErrors(nested, depth + 1);
    }
    yield* unwrapErrors(error.lastError, depth + 1);
  }

  if (typeof error === "object" && "cause" in error) {
    yield* unwrapErrors((error as { cause: unknown }).cause, depth + 1);
  }
}

/**
 * Reports whether a generation failure was the AI Gateway spend budget.
 *
 * Checks the status code and the quota marker separately rather than relying
 * on either alone. A 402 from the gateway is a budget rejection today, and
 * matching the documented `type` string as well means an unrelated future use
 * of 402 would not be misreported as a spend cap, and a budget rejection
 * arriving with a different status code would still be caught.
 *
 * @param error - Anything thrown out of generateBiography
 */
export function isGatewayBudgetError(error: unknown): boolean {
  for (const candidate of unwrapErrors(error)) {
    if (APICallError.isInstance(candidate)) {
      if (candidate.statusCode === 402) {
        return true;
      }

      if (
        typeof candidate.responseBody === "string" &&
        candidate.responseBody.includes(QUOTA_ERROR_TYPE)
      ) {
        return true;
      }
    }

    if (
      candidate instanceof Error &&
      candidate.message.includes(QUOTA_ERROR_TYPE)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Seconds until the daily budget resets.
 *
 * Gateway budgets on a daily refresh period reset at midnight UTC, so this is
 * an honest Retry-After rather than a guess. Floored at 60 seconds: a visitor
 * who hits the limit a few seconds before reset should not be handed a
 * Retry-After of 3.
 */
export function secondsUntilBudgetReset(now: Date = new Date()): number {
  const nextMidnightUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );

  return Math.max(60, Math.ceil((nextMidnightUtc - now.getTime()) / 1000));
}
