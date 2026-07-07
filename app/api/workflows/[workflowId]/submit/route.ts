import { createClient } from "@/lib/supabase/server";
import { generateBiography } from "@/lib/biography-generation";
import { NextResponse } from "next/server";

// STEP 3 API: Handle recipient form submission and trigger AI biography generation
// This endpoint is called when the recipient completes and submits their biographical information form
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  try {
    const { workflowId } = await params;

    const supabase = await createClient();

    // Parse the incoming form data from the recipient
    const body = await request.json();

    console.log("Submit route - Workflow ID:", workflowId);
    console.log("Submit route - Received data:", body);

    // Verify the workflow exists in the database
    const { data, error } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .single();

    if (error || !data) {
      console.error("Submit route - Workflow not found:", error);
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    // Convert the form data (camelCase) to database format (snake_case)
    // The form sends: name, email, occupation, yearsOfExperience, skills, achievements, interests
    const recipientDbRow = {
      workflow_id: workflowId,
      full_name: body.name,
      email: body.email,
      occupation: body.occupation,
      company: body.interests || "", // Reusing company field for interests
      skills: body.skills || [],
      // Combine achievements and years of experience into bio_context
      bio_context: `${body.achievements || ""}\nYears of Experience: ${body.yearsOfExperience || 0}`,
    };

    console.log("Submit route - Saving recipient info:", recipientDbRow);

    // Save or update the recipient information in the database
    // Using upsert to handle both new and existing records
    const { error: recipientError } = await supabase
      .from("workflow_recipients")
      .upsert(recipientDbRow, { onConflict: "workflow_id" });

    if (recipientError) {
      console.error(
        "Submit route - Error saving recipient info:",
        recipientError,
      );
      return NextResponse.json(
        {
          error: "Failed to save recipient information",
          details: recipientError.message,
        },
        { status: 500 },
      );
    }

    // Update workflow status to indicate form has been submitted (STEP 4 complete)
    const { error: statusError } = await supabase
      .from("workflows")
      .update({ status: "form_submitted" })
      .eq("id", workflowId);

    if (statusError) {
      console.error(
        "Submit route - Error updating workflow status:",
        statusError,
      );
    }

    // STEP 5: Retrieve role-specific reference material, then generate biography using AI.
    console.log("Submit route - Generating biography with AI");

    const { text: biographyText } = await generateBiography(supabase, {
      name: body.name,
      occupation: body.occupation,
      yearsOfExperience: body.yearsOfExperience,
      skills: body.skills || [],
      achievements: body.achievements,
      interests: body.interests,
    });

    console.log("Submit route - Biography generated successfully");

    // Save the generated biography to the database
    const { error: saveBiographyError } = await supabase
      .from("workflow_biographies")
      .upsert(
        {
          workflow_id: workflowId,
          biography_text: biographyText,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "workflow_id" },
      );

    if (saveBiographyError) {
      console.error(
        "Submit route - Error saving biography:",
        saveBiographyError,
      );
      return NextResponse.json(
        {
          error: "Failed to save biography",
          details: saveBiographyError.message,
        },
        { status: 500 },
      );
    }

    console.log("Submit route - Biography saved to database");

    // STEP 6: Update workflow status to pending_review (ready for user approval)
    const { error: updateStatusError } = await supabase
      .from("workflows")
      .update({ status: "pending_review" })
      .eq("id", workflowId);

    if (updateStatusError) {
      console.error(
        "Submit route - Error updating to pending_review:",
        updateStatusError,
      );
      return NextResponse.json(
        {
          error: "Failed to update workflow status",
          details: updateStatusError.message,
        },
        { status: 500 },
      );
    }

    console.log("Submit route - Workflow status updated to pending_review");

    // Return success response to the client
    return NextResponse.json({
      message: "Biography generated and pending approval",
      success: true,
    });
  } catch (e) {
    // Catch any unexpected errors and return a detailed error response
    console.error("Submit route - Unexpected error:", e);
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to process submission", details: errorMessage },
      { status: 500 },
    );
  }
}
