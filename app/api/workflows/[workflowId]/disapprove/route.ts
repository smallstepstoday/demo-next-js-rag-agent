/**
 * DISAPPROVE BIOGRAPHY API ROUTE
 *
 * This route handles Step 9 of the workflow: User disapproves the biography with feedback
 *
 * WORKFLOW FLOW:
 * 1. Validates the workflow exists and belongs to this demo session
 * 2. Fetches recipient information for personalized email
 * 3. Receives rejection reason from user
 * 4. Updates workflow status to "rejected"
 * 5. Saves rejection reason with timestamp
 * 6. Sends feedback email to recipient explaining why it was rejected
 *
 * ENDPOINT: POST /api/workflows/[workflowId]/disapprove
 * BODY: { rejectionReason: string }
 * RESPONSE: { message: string }
 *
 * DATABASE OPERATIONS:
 * - SELECT from workflows (verify workflow exists and is owned)
 * - SELECT from workflow_recipients (get recipient info)
 * - UPDATE workflows (set status to "rejected")
 * - UPDATE workflow_biographies (set approved=false, rejection_reason, reviewed_at)
 *
 * EMAIL NOTIFICATION:
 * - Sent to: workflow.recipient_email
 * - Subject: "Feedback on Your Biography Submission"
 * - Contains: Rejection reason and instructions to resubmit
 *
 * SECURITY:
 * Like approve, this route wrote a privileged status change with no caller
 * check, and accepted any string as `rejectionReason` — text that is then
 * stored and emailed. Ownership is now proved before any write, and the body
 * is validated and length-capped.
 *
 * The whole handler is wrapped in try/catch. It previously was not, so a
 * malformed body threw out of `request.json()` and surfaced as an unhandled
 * framework error rather than a 400.
 */

import { createClient } from "@/lib/supabase/server";
import { generateDisapprovedEmail, sendEmail } from "@/lib/email-service";
import { errorDetails } from "@/lib/api-errors";
import { requireDemoSession } from "@/lib/demo-session-server";
import { disapproveWorkflowSchema, parseJsonBody } from "@/lib/validation";
import { getOwnedWorkflowRow } from "@/lib/workflow-store";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  try {
    // Create server-side Supabase client with service role key
    const supabase = await createClient();
    const { workflowId } = await params;

    const session = await requireDemoSession();
    if ("response" in session) {
      return session.response;
    }
    const { sessionId } = session;

    // Parse and validate the rejection reason
    const parsed = await parseJsonBody(request, disapproveWorkflowSchema);
    if ("response" in parsed) {
      return parsed.response;
    }
    const { rejectionReason } = parsed.data;

    // STEP 1: Verify workflow exists and this session owns it
    const workflow = await getOwnedWorkflowRow(workflowId, sessionId);

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    // STEP 2: Fetch recipient information for personalized feedback email
    const { data: recipientInfo, error: recipientInfoError } = await supabase
      .from("workflow_recipients")
      .select("*")
      .eq("workflow_id", workflowId)
      .single();

    if (recipientInfoError || !recipientInfo) {
      return NextResponse.json(
        { error: "Recipient info not found" },
        { status: 404 },
      );
    }

    // STEP 3: Update workflow status to "rejected"
    // This indicates the biography was reviewed but not accepted.
    // The session filter is repeated on the write, so the update cannot land
    // on a row this caller does not own.
    const { error: updateWorkflowError } = await supabase
      .from("workflows")
      .update({ status: "rejected" })
      .eq("id", workflowId)
      .eq("session_id", sessionId);

    if (updateWorkflowError) {
      console.error("Error updating workflow status:", updateWorkflowError);
      return NextResponse.json(
        { error: "Failed to update workflow status" },
        { status: 500 },
      );
    }

    // STEP 4: Save rejection details in biography record
    // - approved: false (explicitly marks as rejected)
    // - rejection_reason: stores the feedback for reference
    // - reviewed_at: timestamp of when decision was made
    const { error: updateBiographyError } = await supabase
      .from("workflow_biographies")
      .update({
        approved: false,
        rejection_reason: rejectionReason,
        reviewed_at: new Date().toISOString(),
      })
      .eq("workflow_id", workflowId);

    if (updateBiographyError) {
      console.error("Error updating biography status:", updateBiographyError);
      return NextResponse.json(
        { error: "Failed to update biography status" },
        { status: 500 },
      );
    }

    // STEP 5: Send constructive feedback to recipient through the shared mock email service.
    const emailContent = generateDisapprovedEmail(
      recipientInfo.full_name,
      rejectionReason,
    );

    await sendEmail({
      to: workflow.recipient_email,
      subject: emailContent.subject,
      body: emailContent.body,
      type: "disapproved_notice",
    });

    return NextResponse.json({
      message: "Biography disapproved and feedback sent",
    });
  } catch (error) {
    console.error("Disapprove route - Unexpected error:", error);
    return NextResponse.json(
      {
        error: "Failed to disapprove biography",
        details: errorDetails(error),
      },
      { status: 500 },
    );
  }
}
