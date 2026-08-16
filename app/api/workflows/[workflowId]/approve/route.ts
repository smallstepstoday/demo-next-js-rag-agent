/**
 * APPROVE BIOGRAPHY API ROUTE
 *
 * This route handles Step 8 of the workflow: User approves the generated biography
 *
 * WORKFLOW FLOW:
 * 1. Validates the workflow exists and belongs to this demo session
 * 2. Fetches recipient information for personalized email
 * 3. Fetches the biography that needs approval
 * 4. Updates workflow status to "approved"
 * 5. Marks biography as approved with timestamp
 * 6. Sends approval email to recipient with the final biography
 *
 * ENDPOINT: POST /api/workflows/[workflowId]/approve
 * BODY: None required (workflowId in URL)
 * RESPONSE: { message: string }
 *
 * DATABASE OPERATIONS:
 * - SELECT from workflows (verify workflow exists and is owned)
 * - SELECT from workflow_recipients (get recipient info)
 * - SELECT from workflow_biographies (get biography)
 * - UPDATE workflows (set status to "approved")
 * - UPDATE workflow_biographies (set approved=true, reviewed_at)
 *
 * EMAIL NOTIFICATION:
 * - Sent to: workflow.recipient_email
 * - Subject: "Your Biography Has Been Approved!"
 * - Contains: Full biography text
 *
 * SECURITY:
 * This route wrote a privileged status change with no caller check at all.
 * The human approval gate is the central claim of this project, and without an
 * ownership check it was not a gate: any visitor could approve content they
 * did not write, on a workflow they did not own. Ownership is now proved by
 * the session filter in getOwnedWorkflowRow before anything is written.
 */

import { createClient } from "@/lib/supabase/server";
import { generateApprovedBiographyEmail, sendEmail } from "@/lib/email-service";
import { developmentOnly, errorDetails } from "@/lib/api-errors";
import { requireDemoSession } from "@/lib/demo-session-server";
import { getOwnedWorkflowRow } from "@/lib/workflow-store";
import { NextResponse } from "next/server";

type SupabaseDiagnosticError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

function logSupabaseFailure(
  step: string,
  workflowId: string,
  error: SupabaseDiagnosticError | null,
) {
  console.error("Approve route - Supabase failure:", {
    step,
    workflowId,
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  });
}

/**
 * Logs the full Supabase failure and returns a 404.
 *
 * The `diagnostic` block used to carry the Postgres error code and message to
 * unauthenticated callers, which discloses schema and constraint detail.
 * It now appears outside production only; the log line above is unchanged, so
 * nothing is lost for debugging a deployed failure.
 */
function notFoundResponse(
  step: string,
  workflowId: string,
  message: string,
  error: SupabaseDiagnosticError | null,
) {
  logSupabaseFailure(step, workflowId, error);

  return NextResponse.json(
    {
      error: message,
      diagnostic: developmentOnly({
        step,
        workflowId,
        supabaseCode: error?.code,
        supabaseMessage: error?.message,
      }),
    },
    { status: 404 },
  );
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  try {
    const supabase = await createClient();
    const { workflowId } = await params;

    const session = await requireDemoSession();
    if ("response" in session) {
      return session.response;
    }
    const { sessionId } = session;

    console.log("Approve route - Starting approval:", { workflowId });

    // STEP 1: Verify workflow exists and this session owns it. A workflow
    // belonging to another visitor is reported as not found.
    const workflow = await getOwnedWorkflowRow(workflowId, sessionId);

    if (!workflow) {
      return notFoundResponse(
        "fetch_workflow",
        workflowId,
        "Workflow not found",
        null,
      );
    }

    console.log("Approve route - Workflow found:", {
      workflowId,
      status: workflow.status,
    });

    // STEP 2: Fetch recipient information for personalized email
    const { data: recipientInfo, error: recipientInfoError } = await supabase
      .from("workflow_recipients")
      .select("*")
      .eq("workflow_id", workflowId)
      .single();

    if (recipientInfoError || !recipientInfo) {
      return notFoundResponse(
        "fetch_recipient_info",
        workflowId,
        "Recipient info not found",
        recipientInfoError,
      );
    }

    console.log("Approve route - Recipient info found:", { workflowId });

    // STEP 3: Fetch the biography to include in approval email
    const { data: biography, error: biographyError } = await supabase
      .from("workflow_biographies")
      .select("*")
      .eq("workflow_id", workflowId)
      .single();

    if (biographyError || !biography) {
      return notFoundResponse(
        "fetch_biography",
        workflowId,
        "Biography not found",
        biographyError,
      );
    }

    console.log("Approve route - Biography found:", {
      workflowId,
      generatedAt: biography.generated_at,
      reviewedAt: biography.reviewed_at,
      approved: biography.approved,
      biographyLength: biography.biography_text?.length || 0,
    });

    // STEP 4: Update workflow status to "approved"
    // This marks the workflow as complete and approved by the user.
    // The session filter is repeated on the write so the update cannot land on
    // a row this caller does not own, even if the check above were bypassed.
    const { error: updateWorkflowError } = await supabase
      .from("workflows")
      .update({ status: "approved" })
      .eq("id", workflowId)
      .eq("session_id", sessionId);

    if (updateWorkflowError) {
      logSupabaseFailure(
        "update_workflow_status",
        workflowId,
        updateWorkflowError,
      );
      return NextResponse.json(
        { error: "Failed to update workflow status" },
        { status: 500 },
      );
    }

    // STEP 5: Mark biography as approved with timestamp
    // The reviewed_at timestamp indicates when the approval happened
    const { error: updateBiographyError } = await supabase
      .from("workflow_biographies")
      .update({ approved: true, reviewed_at: new Date().toISOString() })
      .eq("workflow_id", workflowId);

    if (updateBiographyError) {
      logSupabaseFailure(
        "update_biography_status",
        workflowId,
        updateBiographyError,
      );
      return NextResponse.json(
        { error: "Failed to update biography status" },
        { status: 500 },
      );
    }

    // STEP 6: Send approved biography to recipient via the shared mock email service.
    const emailContent = generateApprovedBiographyEmail(
      recipientInfo.full_name,
      biography.biography_text,
    );

    await sendEmail({
      to: workflow.recipient_email,
      subject: emailContent.subject,
      body: emailContent.body,
      type: "approved_biography",
    });

    console.log("Approve route - Approval completed:", { workflowId });

    return NextResponse.json({
      message: "Biography approved and sent to recipient",
    });
  } catch (error) {
    console.error("Approve route - Unexpected error:", error);
    return NextResponse.json(
      {
        error: "Failed to approve biography",
        details: errorDetails(error),
      },
      { status: 500 },
    );
  }
}
