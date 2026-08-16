// Tests for the request body schemas.
//
// The length caps are the part worth testing. buildBiographyPrompt inlines
// name, occupation, skills, achievements, and interests, so an uncapped field
// is unbounded prompt size on a route that spends money — and unbounded room
// for injected instructions. These assert the caps hold at the boundary rather
// than somewhere near it.

import { describe, expect, it } from "vitest";
import {
  createWorkflowSchema,
  disapproveWorkflowSchema,
  submitWorkflowSchema,
} from "./validation";

const validSubmit = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  occupation: "Software Engineer",
  yearsOfExperience: 8,
  skills: ["TypeScript", "React"],
  achievements: "Shipped several products",
  interests: "Mathematics",
};

describe("createWorkflowSchema", () => {
  it("accepts a well-formed address", () => {
    expect(
      createWorkflowSchema.safeParse({ recipientEmail: "a@example.com" })
        .success,
    ).toBe(true);
  });

  // The old route checked truthiness only, so any non-empty string passed.
  it("rejects a non-address string", () => {
    expect(
      createWorkflowSchema.safeParse({ recipientEmail: "not-an-email" })
        .success,
    ).toBe(false);
  });

  it("rejects a missing or empty address", () => {
    expect(createWorkflowSchema.safeParse({}).success).toBe(false);
    expect(
      createWorkflowSchema.safeParse({ recipientEmail: "" }).success,
    ).toBe(false);
  });
});

describe("submitWorkflowSchema — length caps", () => {
  it("accepts a well-formed submission", () => {
    const result = submitWorkflowSchema.safeParse(validSubmit);
    expect(result.success).toBe(true);
  });

  it("caps name and occupation at 100 characters", () => {
    expect(
      submitWorkflowSchema.safeParse({ ...validSubmit, name: "a".repeat(100) })
        .success,
    ).toBe(true);
    expect(
      submitWorkflowSchema.safeParse({ ...validSubmit, name: "a".repeat(101) })
        .success,
    ).toBe(false);
    expect(
      submitWorkflowSchema.safeParse({
        ...validSubmit,
        occupation: "a".repeat(101),
      }).success,
    ).toBe(false);
  });

  // Both dimensions matter: ten short skills and one enormous one are
  // different shapes of the same unbounded-prompt problem.
  it("caps skills at 10 entries of 50 characters", () => {
    expect(
      submitWorkflowSchema.safeParse({
        ...validSubmit,
        skills: Array(10).fill("TypeScript"),
      }).success,
    ).toBe(true);
    expect(
      submitWorkflowSchema.safeParse({
        ...validSubmit,
        skills: Array(11).fill("TypeScript"),
      }).success,
    ).toBe(false);
    expect(
      submitWorkflowSchema.safeParse({
        ...validSubmit,
        skills: ["a".repeat(51)],
      }).success,
    ).toBe(false);
  });

  it("caps achievements at 1000 and interests at 500 characters", () => {
    expect(
      submitWorkflowSchema.safeParse({
        ...validSubmit,
        achievements: "a".repeat(1001),
      }).success,
    ).toBe(false);
    expect(
      submitWorkflowSchema.safeParse({
        ...validSubmit,
        interests: "a".repeat(501),
      }).success,
    ).toBe(false);
  });

  it("bounds yearsOfExperience to a sane integer range", () => {
    for (const yearsOfExperience of [-1, 101, 1.5]) {
      expect(
        submitWorkflowSchema.safeParse({ ...validSubmit, yearsOfExperience })
          .success,
      ).toBe(false);
    }
  });

  it("requires at least one skill", () => {
    expect(
      submitWorkflowSchema.safeParse({ ...validSubmit, skills: [] }).success,
    ).toBe(false);
  });

  it("defaults the optional free-text fields to empty strings", () => {
    const result = submitWorkflowSchema.safeParse({
      name: "Ada Lovelace",
      email: "ada@example.com",
      occupation: "Software Engineer",
      yearsOfExperience: 8,
      skills: ["TypeScript"],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.achievements).toBe("");
      expect(result.data.interests).toBe("");
    }
  });
});

describe("disapproveWorkflowSchema", () => {
  it("requires a non-empty reason and caps it at 1000 characters", () => {
    expect(
      disapproveWorkflowSchema.safeParse({ rejectionReason: "Too formal" })
        .success,
    ).toBe(true);
    expect(
      disapproveWorkflowSchema.safeParse({ rejectionReason: "   " }).success,
    ).toBe(false);
    expect(
      disapproveWorkflowSchema.safeParse({
        rejectionReason: "a".repeat(1001),
      }).success,
    ).toBe(false);
  });

  // The review component sent `reason`, not `rejectionReason`, so every
  // disapproval stored undefined and emailed an empty explanation. The schema
  // is what turns that class of mismatch into a visible 400.
  it("rejects the field name the client used to send", () => {
    expect(
      disapproveWorkflowSchema.safeParse({ reason: "Too formal" }).success,
    ).toBe(false);
  });
});
