/**
 * DISAPPROVE BIOGRAPHY API ROUTE
 *
 * This route handles Step 9 of the workflow: User disapproves the biography with feedback
 *
 * WORKFLOW FLOW:
 * 1. Validates the workflow exists
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
 * - SELECT from workflows (verify workflow exists)
 * - SELECT from workflow_recipients (get recipient info)
 * - UPDATE workflows (set status to "rejected")
 * - UPDATE workflow_biographies (set approved=false, rejection_reason, reviewed_at)
 *
 * EMAIL NOTIFICATION:
 * - Sent to: workflow.recipient_email
 * - Subject: "Feedback on Your Biography Submission"
 * - Contains: Rejection reason and instructions to resubmit
 */

import { createClient } from "@/lib/supabase/server";
import { generateDisapprovedEmail, sendEmail } from "@/lib/email-service";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  // Create server-side Supabase client with service role key
  const supabase = await createClient();
  const { workflowId } = await params;

  // Parse request body to get the rejection reason
  const { rejectionReason } = await request.json();

  // STEP 1: Verify workflow exists
  const { data: workflow, error: workflowError } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .single();

  if (workflowError || !workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
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
  // This indicates the biography was reviewed but not accepted
  const { error: updateWorkflowError } = await supabase
    .from("workflows")
    .update({ status: "rejected" })
    .eq("id", workflowId);

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
}
