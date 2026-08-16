/**
 * MODULE: lib/validation.ts — Request body schemas
 *
 * None of the API routes validated their input. `create` checked only that
 * `recipientEmail` was truthy; `submit` read `body.name`, `body.skills` and
 * the rest straight off the parsed JSON and interpolated them into a model
 * prompt.
 *
 * The length caps here are the load-bearing part. `buildBiographyPrompt`
 * joins `skills` and inlines `achievements` and `interests`, so without caps a
 * single request can carry an arbitrarily large prompt — unbounded model spend
 * on an endpoint with no authentication. Capping the input bounds the cost of
 * a request and shrinks the room available for prompt injection at the same
 * time. Neither is solved by validation alone; see the rate limits in
 * lib/rate-limit.ts and the prompt delimiting in lib/biography-generation.ts.
 *
 * zod was already a dependency and imported nowhere under app/api/.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { developmentOnly } from "./api-errors";

/**
 * Longest address RFC 5321 permits. Capping at the standard rather than
 * something rounder avoids rejecting a legitimate address.
 */
const MAX_EMAIL_LENGTH = 254;

export const createWorkflowSchema = z.object({
  recipientEmail: z.string().trim().min(3).max(MAX_EMAIL_LENGTH).email(),
});

export const submitWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().min(3).max(MAX_EMAIL_LENGTH).email(),
  occupation: z.string().trim().min(1).max(100),
  // Upper bound is deliberately generous but finite: nobody has 200 years of
  // experience, and an unbounded number reaches the prompt as free text.
  yearsOfExperience: z.coerce.number().int().min(0).max(100),
  skills: z.array(z.string().trim().min(1).max(50)).min(1).max(10),
  achievements: z.string().trim().max(1000).optional().default(""),
  interests: z.string().trim().max(500).optional().default(""),
});

export const disapproveWorkflowSchema = z.object({
  rejectionReason: z.string().trim().min(1).max(1000),
});

export type CreateWorkflowBody = z.infer<typeof createWorkflowSchema>;
export type SubmitWorkflowBody = z.infer<typeof submitWorkflowSchema>;
export type DisapproveWorkflowBody = z.infer<typeof disapproveWorkflowSchema>;

/**
 * Parses and validates a JSON request body.
 *
 * Returns a discriminated result rather than throwing, so a route reads as a
 * straight line: parse, bail on failure, continue with typed data.
 *
 * Field-level issues are returned only in development. In production the
 * caller gets "Invalid request body" and nothing about the shape expected.
 *
 * USAGE:
 * ```ts
 * const parsed = await parseJsonBody(request, submitWorkflowSchema)
 * if ("response" in parsed) return parsed.response
 * // parsed.data is now typed and validated
 * ```
 */
export async function parseJsonBody<Schema extends z.ZodTypeAny>(
  request: Request,
  schema: Schema,
): Promise<{ data: z.infer<Schema> } | { response: NextResponse }> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    return {
      response: NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      ),
    };
  }

  const result = schema.safeParse(raw);

  if (!result.success) {
    console.error(
      "Validation failed:",
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );

    return {
      response: NextResponse.json(
        {
          error: "Invalid request body",
          issues: developmentOnly(
            result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          ),
        },
        { status: 400 },
      ),
    };
  }

  return { data: result.data };
}
