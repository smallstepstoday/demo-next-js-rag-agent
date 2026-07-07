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
 * - Sends the mock form-link email to the recipient
 * - Returns workflow ID to client for confirmation
 *
 * ENDPOINT: POST /api/workflows/create
 * BODY: { recipientEmail: string }
 * RESPONSE: { workflowId: string }
 *
 * DATABASE OPERATIONS:
 * - INSERT into workflows table
 * - Fields: id, recipient_email, status, initiated_by_email, created_at, updated_at
 *
 * EMAIL SIMULATION:
 * - Uses lib/email-service.ts so every email in the demo follows one path.
 * - In production, that service can be backed by Resend, SendGrid, or AWS SES.
 *
 * SECURITY CONSIDERATIONS:
 * - Validates recipientEmail is provided
 * - Uses the server-side Supabase client for database operations
 * - In production, should verify initiated_by_email is authenticated user
 */

import { createClient } from "@/lib/supabase/server";
import { generateFormLinkEmail, sendEmail } from "@/lib/email-service";
import { nanoid } from "@/lib/utils";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // Create server-side Supabase client
    const supabase = await createClient();

    // Parse and validate request body
    const { recipientEmail } = await request.json();

    if (!recipientEmail) {
      return NextResponse.json(
        { error: "Recipient email is required" },
        { status: 400 },
      );
    }

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
          // TODO: Replace with actual authenticated user email from session
          initiated_by_email: "user@example.com",
        },
      ])
      .select();

    if (error) {
      console.error("Error creating workflow in database:", error);
      return NextResponse.json(
        { error: "Failed to create workflow", details: error.message },
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
    // Catch any unexpected errors and return detailed error information
    console.error("Unexpected error in workflow creation:", err);
    return NextResponse.json(
      {
        error: "Failed to create workflow",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
