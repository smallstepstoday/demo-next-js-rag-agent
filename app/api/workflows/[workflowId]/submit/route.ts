import { createClient } from "@/lib/supabase/server";
import { generateBiography } from "@/lib/biography-generation";
import {
  getOwnedWorkflowRow,
  resetWorkflowAfterFailedGeneration,
  saveGenerationArtifact,
} from "@/lib/workflow-store";
import { errorDetails } from "@/lib/api-errors";
import { requireDemoSession } from "@/lib/demo-session-server";
import {
  isGatewayBudgetError,
  secondsUntilBudgetReset,
} from "@/lib/generation-errors";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import { parseJsonBody, submitWorkflowSchema } from "@/lib/validation";
import { NextResponse } from "next/server";

// STEP 3 API: Handle recipient form submission and trigger AI biography generation
// This endpoint is called when the recipient completes and submits their biographical information form
//
// THIS IS THE ROUTE THAT SPENDS MONEY. Every successful call is one
// generateText call against the model. It is guarded four ways:
//
//   1. Demo session ownership — only the session that created the workflow
//      can submit against it.
//   2. zod validation with hard length caps — bounds the size of the prompt
//      the caller can construct (see lib/validation.ts).
//   3. A per-session burst window (see lib/rate-limit.ts).
//   4. One generation per workflow — a workflow that already has a biography
//      cannot be resubmitted, so the create cap is also a generation cap.
//
// On the demo's single-browser story: emails are simulated through a console
// log, so the "recipient" opening the form link is always the same visitor who
// created the workflow. Gating submit on the creating session is therefore
// free here. A production version that mails real links would instead give the
// recipient a signed, single-use link token and verify that, rather than
// requiring them to share the operator's session.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  try {
    const { workflowId } = await params;

    const session = await requireDemoSession();
    if ("response" in session) {
      return session.response;
    }
    const { sessionId } = session;

    const burst = consumeRateLimit(
      `submit:${sessionId}`,
      RATE_LIMITS.submit.limit,
      RATE_LIMITS.submit.windowMs,
    );

    if (!burst.allowed) {
      return NextResponse.json(
        { error: "Too many biography generations. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(burst.retryAfterSeconds) },
        },
      );
    }

    const supabase = await createClient();

    // Parse and validate the incoming form data. Length caps here are what
    // bound the prompt this request can build.
    const parsed = await parseJsonBody(request, submitWorkflowSchema);
    if ("response" in parsed) {
      return parsed.response;
    }
    const body = parsed.data;

    console.log("Submit route - Workflow ID:", workflowId);

    // Verify the workflow exists AND belongs to this session. A workflow
    // owned by someone else is reported as not found, so this route cannot be
    // used to probe which workflow ids exist.
    const workflow = await getOwnedWorkflowRow(workflowId, sessionId);

    if (!workflow) {
      console.error("Submit route - Workflow not found for this session");
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    // One generation per workflow. Without this, a single workflow id could be
    // resubmitted indefinitely and the per-session workflow cap would bound
    // nothing. Checked before any write so a repeat submission costs one
    // SELECT rather than a model call.
    const { data: existingBiography } = await supabase
      .from("workflow_biographies")
      .select("workflow_id")
      .eq("workflow_id", workflowId)
      .maybeSingle();

    if (existingBiography) {
      return NextResponse.json(
        {
          error:
            "This workflow already has a generated biography. Create a new workflow to generate another.",
        },
        { status: 409 },
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

    console.log("Submit route - Saving recipient info for:", workflowId);

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
          details: errorDetails(recipientError),
        },
        { status: 500 },
      );
    }

    // Update workflow status to indicate form has been submitted (STEP 4 complete)
    const { error: statusError } = await supabase
      .from("workflows")
      .update({ status: "form_submitted" })
      .eq("id", workflowId)
      .eq("session_id", sessionId);

    if (statusError) {
      console.error(
        "Submit route - Error updating workflow status:",
        statusError,
      );
    }

    // STEP 5: Retrieve role-specific reference material, then generate biography using AI.
    console.log("Submit route - Generating biography with AI");

    // Everything above this point has already been written: the recipient row
    // exists and the status says form_submitted. If generation throws and we
    // simply propagate, the workflow is stranded there — the card reads
    // "Generating Biography" forever and the form link will not reopen. So any
    // failure here resets the status first, which reopens the form for a
    // retry, and the visitor is told which kind of failure it was.
    let biographyText: string;
    let compiledInput: Awaited<
      ReturnType<typeof generateBiography>
    >["compiledInput"];

    try {
      ({ text: biographyText, compiledInput } = await generateBiography(
        supabase,
        {
          name: body.name,
          occupation: body.occupation,
          yearsOfExperience: body.yearsOfExperience,
          skills: body.skills || [],
          achievements: body.achievements,
          interests: body.interests,
        },
      ));
    } catch (generationError) {
      await resetWorkflowAfterFailedGeneration(workflowId, sessionId);

      // The spend budget doing its job is an expected state for a public
      // demo, not a fault. Saying so is more useful than a generic error, and
      // it stops the demo looking broken when it is working as designed.
      if (isGatewayBudgetError(generationError)) {
        const retryAfter = secondsUntilBudgetReset();

        console.warn(
          "Submit route - AI Gateway spend budget reached; generation refused.",
          { workflowId, retryAfterSeconds: retryAfter },
        );

        return NextResponse.json(
          {
            error:
              "This demo has reached its daily generation limit. The limit resets at midnight UTC — please try again then.",
            budgetExhausted: true,
          },
          {
            status: 503,
            headers: { "Retry-After": String(retryAfter) },
          },
        );
      }

      console.error("Submit route - Biography generation failed:", generationError);

      return NextResponse.json(
        {
          error:
            "Biography generation failed. Your form has been reopened, so you can submit it again.",
          details: errorDetails(generationError),
        },
        { status: 502 },
      );
    }

    console.log("Submit route - Biography generated successfully");

    // Persist the compiled-input artifact (versions, retrieved references,
    // prompt, fingerprint) so this run is replayable and regressions can be
    // localized to the compiler vs. the model. Best-effort — see
    // lib/workflow-store.ts saveGenerationArtifact.
    await saveGenerationArtifact(workflowId, compiledInput);

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
          details: errorDetails(saveBiographyError),
        },
        { status: 500 },
      );
    }

    console.log("Submit route - Biography saved to database");

    // STEP 6: Update workflow status to pending_review (ready for user approval)
    const { error: updateStatusError } = await supabase
      .from("workflows")
      .update({ status: "pending_review" })
      .eq("id", workflowId)
      .eq("session_id", sessionId);

    if (updateStatusError) {
      console.error(
        "Submit route - Error updating to pending_review:",
        updateStatusError,
      );
      return NextResponse.json(
        {
          error: "Failed to update workflow status",
          details: errorDetails(updateStatusError),
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
    // Catch any unexpected errors. Logged in full; disclosed to the caller
    // only outside production.
    console.error("Submit route - Unexpected error:", e);
    return NextResponse.json(
      { error: "Failed to process submission", details: errorDetails(e) },
      { status: 500 },
    );
  }
}
