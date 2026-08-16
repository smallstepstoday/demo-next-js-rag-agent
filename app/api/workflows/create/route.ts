/**
 * CREATE WORKFLOW API ROUTE
 *
 * This route handles Steps 1-2 of the workflow:
 * 1. User indicates they want to send a link via email
 * 2. System creates a new workflow and sends form link to recipient
 *
 * WORKFLOW INITIALIZATION:
 * - Generates unique workflow ID using nanoid
 * - Creates workflow record in database with "pending_form" status
 * - Stamps the record with the visitor's demo session
 * - Sends the mock form-link email to the recipient
 * - Returns workflow ID to client for confirmation
 *
 * ENDPOINT: POST /api/workflows/create
 * BODY: { recipientEmail: string }
 * RESPONSE: { workflowId: string }
 *
 * DATABASE OPERATIONS:
 * - INSERT into workflows table
 * - Fields: id, recipient_email, session_id, status, initiated_by_email,
 *   created_at, updated_at
 *
 * EMAIL SIMULATION:
 * - Uses lib/email-service.ts so every email in the demo follows one path.
 * - In production, that service can be backed by Resend, SendGrid, or AWS SES.
 *
 * SECURITY CONSIDERATIONS:
 * - Requires a demo session and records it as the workflow's owner, so only
 *   this visitor can later list, review, approve, or delete the workflow.
 * - Validates the body against a zod schema rather than a truthiness check.
 * - Rate limited on two axes: a per-session burst window, and a durable cap
 *   on total workflows per session. This route is the entry point to submit,
 *   which is the one that spends money.
 * - Uses the server-side Supabase client for database operations.
 * - In production, should verify initiated_by_email is authenticated user
 */

import { createClient } from "@/lib/supabase/server";
import { generateFormLinkEmail, sendEmail } from "@/lib/email-service";
import { nanoid } from "@/lib/utils";
import { errorDetails } from "@/lib/api-errors";
import { requireDemoSession } from "@/lib/demo-session-server";
import {
  MAX_WORKFLOWS_PER_SESSION,
  RATE_LIMITS,
  consumeRateLimit,
} from "@/lib/rate-limit";
import { createWorkflowSchema, parseJsonBody } from "@/lib/validation";
import { countWorkflowsForSession } from "@/lib/workflow-store";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await requireDemoSession();
    if ("response" in session) {
      return session.response;
    }
    const { sessionId } = session;

    // Burst limit first: it is the cheapest check and needs no database round
    // trip, so a hammering client is rejected before touching Supabase.
    const burst = consumeRateLimit(
      `create:${sessionId}`,
      RATE_LIMITS.create.limit,
      RATE_LIMITS.create.windowMs,
    );

    if (!burst.allowed) {
      return NextResponse.json(
        { error: "Too many workflows created. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(burst.retryAfterSeconds) },
        },
      );
    }

    const parsed = await parseJsonBody(request, createWorkflowSchema);
    if ("response" in parsed) {
      return parsed.response;
    }
    const { recipientEmail } = parsed.data;

    // Durable cap. The burst window above lives in instance memory and resets
    // on a cold start; this counts rows, so it holds across instances.
    const existingCount = await countWorkflowsForSession(sessionId);
    if (existingCount >= MAX_WORKFLOWS_PER_SESSION) {
      return NextResponse.json(
        {
          error: `This demo session has reached its limit of ${MAX_WORKFLOWS_PER_SESSION} workflows. Delete one to create another.`,
        },
        { status: 429 },
      );
    }

    // Create server-side Supabase client
    const supabase = await createClient();

    // Generate unique workflow ID using nanoid (shorter and URL-safe)
    // Format: wf_[timestamp]_[random]
    const workflowId = nanoid();

    console.log("Creating workflow:", { workflowId, recipientEmail });

    // Insert new workflow record into database.
    // Status "pending_form" means the operator has sent the link and the app is waiting for the recipient.
    const { data, error } = await supabase
      .from("workflows")
      .insert([
        {
          id: workflowId,
          recipient_email: recipientEmail,
          status: "pending_form",
          // Owner of this workflow for the life of the demo session.
          session_id: sessionId,
          // TODO: Replace with actual authenticated user email from session
          initiated_by_email: "user@example.com",
        },
      ])
      .select();

    if (error) {
      console.error("Error creating workflow in database:", error);
      return NextResponse.json(
        { error: "Failed to create workflow", details: errorDetails(error) },
        { status: 500 },
      );
    }

    console.log("Workflow created successfully:", data);

    // STEP 3: Send form link to recipient through the shared mock email service.
    const formUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/form/${workflowId}`;
    const emailContent = generateFormLinkEmail(formUrl);

    await sendEmail({
      to: recipientEmail,
      subject: emailContent.subject,
      body: emailContent.body,
      type: "recipient_form_link",
    });

    // Return the workflow ID to the client
    // The client can use this to show a confirmation message
    return NextResponse.json({ workflowId });
  } catch (err) {
    // Catch any unexpected errors. The message reaches the logs either way;
    // it reaches the response body only outside production.
    console.error("Unexpected error in workflow creation:", err);
    return NextResponse.json(
      {
        error: "Failed to create workflow",
        details: errorDetails(err),
      },
      { status: 500 },
    );
  }
}
