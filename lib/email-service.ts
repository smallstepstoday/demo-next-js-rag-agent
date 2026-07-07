/**
 * Email Service - Mock Email Sending
 *
 * This module simulates email sending functionality. In production,
 * you would integrate with services like:
 * - Resend (https://resend.com)
 * - SendGrid (https://sendgrid.com)
 * - AWS SES (https://aws.amazon.com/ses/)
 *
 * For this example, we log emails to console and return success.
 */

import type { EmailType } from "./workflow-types";

/**
 * Email payload structure
 */
interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  type: EmailType;
}

/**
 * Sends an email (simulated)
 * @param payload - Email data including recipient, subject, and body
 * @returns Promise that resolves when email is "sent"
 */
export async function sendEmail(
  payload: EmailPayload,
): Promise<{ success: boolean }> {
  console.log("Email Service - Sending Email:");
  console.log("To:", payload.to);
  console.log("Subject:", payload.subject);
  console.log("Type:", payload.type);
  console.log("Body:", payload.body);

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  return { success: true };
}

/**
 * Generates the initial form link email content
 * @param formUrl - URL to the recipient form
 * @returns Email subject and body
 */
export function generateFormLinkEmail(formUrl: string) {
  return {
    subject: "Please Complete Your Information",
    body: `Hello,

You have been invited to share your information for a biographical description.

Please click the link below to fill out the form:
${formUrl}

This link is unique to you and can only be used once.

Thank you!`,
  };
}

/**
 * Generates the approved biography email content
 * @param recipientName - Name of the recipient
 * @param biography - The approved biographical description
 * @returns Email subject and body
 */
export function generateApprovedBiographyEmail(
  recipientName: string,
  biography: string,
) {
  return {
    subject: "Your Biography Has Been Approved",
    body: `Hello ${recipientName},

Your biographical description has been approved!

Here is your biography:

${biography}

Thank you for your participation!`,
  };
}

/**
 * Generates the disapproved notice email content
 * @param recipientName - Name of the recipient
 * @param reason - Reason for disapproval
 * @returns Email subject and body
 */
export function generateDisapprovedEmail(
  recipientName: string,
  reason: string,
) {
  return {
    subject: "Biography Update Required",
    body: `Hello ${recipientName},

Thank you for submitting your information. However, we need to make some adjustments.

Reason: ${reason}

We'll be in touch with next steps.

Thank you for your understanding!`,
  };
}
