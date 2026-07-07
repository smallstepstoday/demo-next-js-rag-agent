/**
 * Biography Generation Workflow
 *
 * DurableAgent-oriented workflow definition for the same operator/recipient
 * flow exposed by the API routes:
 *
 * 1. Operator sends form link to recipient
 * 2. Recipient submits biographical information
 * 3. Workflow retrieves reference documents and generates the biography
 * 4. Operator approves or rejects
 * 5. Workflow sends the approved biography or rejection feedback
 *
 * The API route is the active demo entry point today. This file remains aligned
 * with it by using the shared biography-generation module, so the DurableAgent
 * step cannot bypass document retrieval or use a different prompt.
 */

"use server";

import { createClient } from "@/lib/supabase/server";
import type { RecipientInfo } from "@/lib/workflow-types";
import {
  generateApprovedBiographyEmail,
  generateDisapprovedEmail,
  generateFormLinkEmail,
  sendEmail,
} from "@/lib/email-service";
import {
  generateBiography,
  recipientInfoToBiographyInput,
} from "@/lib/biography-generation";

/**
 * Main Biography Workflow
 *
 * The "use workflow" directive is intentionally retained for the DurableAgent
 * implementation. Hook wiring is supplied by the agent runtime; the local demo
 * currently drives the same flow through API routes.
 */
export async function biographyWorkflow(
  workflowId: string,
  recipientEmail: string,
) {
  "use workflow";

  console.log("Workflow started:", workflowId);

  await sendFormLinkStep(workflowId, recipientEmail);

  const recipientInfo = await waitForRecipientInfo(workflowId);
  const biography = await generateBiographyStep(recipientInfo);
  const approval = await waitForApproval(workflowId);

  if (approval.approved) {
    await sendApprovedEmailStep(recipientEmail, recipientInfo.name, biography);
  } else {
    await sendDisapprovedEmailStep(
      recipientEmail,
      recipientInfo.name,
      approval.reason || "No reason provided",
    );
  }

  console.log("Workflow completed:", workflowId);

  return {
    status: approval.approved ? "approved" : "disapproved",
    biography,
  };
}

async function sendFormLinkStep(workflowId: string, recipientEmail: string) {
  "use step";

  const formUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/form/${workflowId}`;
  const emailContent = generateFormLinkEmail(formUrl);

  await sendEmail({
    to: recipientEmail,
    subject: emailContent.subject,
    body: emailContent.body,
    type: "recipient_form_link",
  });

  console.log("Workflow - Form link sent to:", recipientEmail);
}

async function generateBiographyStep(
  recipientInfo: RecipientInfo,
): Promise<string> {
  "use step";

  const supabase = await createClient();
  const { text, references } = await generateBiography(
    supabase,
    recipientInfoToBiographyInput(recipientInfo),
  );

  console.log(
    "Workflow - Biography generated with references:",
    references.length,
  );

  return text;
}

async function sendApprovedEmailStep(
  recipientEmail: string,
  recipientName: string,
  biography: string,
) {
  "use step";

  const emailContent = generateApprovedBiographyEmail(recipientName, biography);

  await sendEmail({
    to: recipientEmail,
    subject: emailContent.subject,
    body: emailContent.body,
    type: "approved_biography",
  });

  console.log("Workflow - Approved biography sent to:", recipientEmail);
}

async function sendDisapprovedEmailStep(
  recipientEmail: string,
  recipientName: string,
  reason: string,
) {
  "use step";

  const emailContent = generateDisapprovedEmail(recipientName, reason);

  await sendEmail({
    to: recipientEmail,
    subject: emailContent.subject,
    body: emailContent.body,
    type: "disapproved_notice",
  });

  console.log("Workflow - Disapproval notice sent to:", recipientEmail);
}

async function waitForRecipientInfo(
  _workflowId: string,
): Promise<RecipientInfo> {
  throw new Error("DurableAgent hook not wired in the local API-route demo");
}

async function waitForApproval(
  _workflowId: string,
): Promise<{ approved: boolean; reason?: string }> {
  throw new Error("DurableAgent hook not wired in the local API-route demo");
}
