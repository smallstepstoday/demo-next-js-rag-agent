/**
 * APPROVE BIOGRAPHY API ROUTE
 *
 * This route handles Step 8 of the workflow: User approves the generated biography
 *
 * WORKFLOW FLOW:
 * 1. Validates the workflow exists
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
 * - SELECT from workflows (verify workflow exists)
 * - SELECT from workflow_recipients (get recipient info)
 * - SELECT from workflow_biographies (get biography)
 * - UPDATE workflows (set status to "approved")
 * - UPDATE workflow_biographies (set approved=true, reviewed_at)
 *
 * EMAIL NOTIFICATION:
 * - Sent to: workflow.recipient_email
 * - Subject: "Your Biography Has Been Approved!"
 * - Contains: Full biography text
 */

import { createClient } from "@/lib/supabase/server";
import { generateApprovedBiographyEmail, sendEmail } from "@/lib/email-service";
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
      diagnostic: {
        step,
        workflowId,
        supabaseCode: error?.code,
        supabaseMessage: error?.message,
      },
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

    console.log("Approve route - Starting approval:", { workflowId });

    // STEP 1: Verify workflow exists
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .single();

    if (workflowError || !workflow) {
      return notFoundResponse(
        "fetch_workflow",
        workflowId,
        "Workflow not found",
        workflowError,
      );
    }

    console.log("Approve route - Workflow found:", {
      workflowId,
      status: workflow.status,
      recipientEmail: workflow.recipient_email,
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

    console.log("Approve route - Recipient info found:", {
      workflowId,
      recipientName: recipientInfo.full_name,
      recipientEmail: recipientInfo.email,
    });

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
    // This marks the workflow as complete and approved by the user
    const { error: updateWorkflowError } = await supabase
      .from("workflows")
      .update({ status: "approved" })
      .eq("id", workflowId);

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
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
