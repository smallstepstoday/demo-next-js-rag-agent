import { createClient as createServerClient } from "./supabase/server";
import { nanoid } from "./utils";
import type {
  WorkflowState,
  RecipientInfo,
  BiographyData,
} from "./workflow-types";
import type { CompiledInput } from "./biography-generation";

/**
 * Workflow Store - Supabase Implementation
 *
 * This module provides all database operations for the workflow system.
 * It acts as a data access layer, handling the conversion between
 * database rows (snake_case) and TypeScript objects (camelCase).
 *
 * ARCHITECTURE NOTE:
 * - Server-side functions use createServerClient() for server components and API routes
 * - Client-side functions use createBrowserClient() for client components
 * - All functions include comprehensive error handling and type safety
 */

// ============================================================================
// DATA TRANSFORMATION FUNCTIONS
// ============================================================================
// These functions convert between database format (snake_case columns)
// and application format (camelCase TypeScript interfaces)
// ============================================================================

/**
 * Converts a database workflow row to a WorkflowState object
 * Handles the transformation of joined tables and nested data
 */
function dbRowToWorkflowState(row: any): WorkflowState {
  let recipientInfo: RecipientInfo | undefined;
  if (row.workflow_recipients) {
    // If it's an array, take the first element; if it's an object, use it directly
    const recipientData = Array.isArray(row.workflow_recipients)
      ? row.workflow_recipients[0]
      : row.workflow_recipients;

    if (recipientData) {
      recipientInfo = {
        name: recipientData.full_name,
        email: recipientData.email,
        occupation: recipientData.occupation,
        yearsOfExperience: 0, // Not in current schema, using default
        skills: recipientData.skills || [],
        achievements: recipientData.bio_context || "",
        interests: recipientData.company || "",
      };
    }
  }

  let biography: BiographyData | undefined;
  let biographyData: any;
  if (row.workflow_biographies) {
    // If it's an array, take the first element; if it's an object, use it directly
    biographyData = Array.isArray(row.workflow_biographies)
      ? row.workflow_biographies[0]
      : row.workflow_biographies;

    if (biographyData && biographyData.biography_text) {
      biography = {
        description: biographyData.biography_text,
        generatedAt: new Date(biographyData.generated_at),
      };
    }
  }

  // Map database status to application status
  const statusMap: Record<string, WorkflowState["status"]> = {
    pending_form: "pending_recipient_info",
    form_submitted: "generating_bio",
    generating: "generating_bio",
    pending_review: "pending_approval",
    approved: "approved",
    rejected: "disapproved",
    initiated: "pending_recipient_info",
  };

  return {
    id: row.id,
    recipientEmail: row.recipient_email,
    status: statusMap[row.status] || "pending_recipient_info",
    recipientInfo,
    biography,
    disapprovalReason: biographyData?.rejection_reason,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Converts application RecipientInfo to database format
 */
function recipientInfoToDbRow(info: any) {
  return {
    full_name: info.name,
    email: info.email,
    occupation: info.occupation,
    company: info.interests || "",
    skills: info.skills || [],
    bio_context: info.achievements || "",
  };
}

// ============================================================================
// SERVER-SIDE WORKFLOW OPERATIONS
// ============================================================================
// These functions use the server client and are called from:
// - API routes (app/api/workflows/...)
// - Server components (app/page.tsx, app/form/[id]/page.tsx, etc.)
// ============================================================================

/**
 * Creates a new workflow and sends form link email to recipient
 *
 * WORKFLOW STEP 1: User initiates the process by providing recipient email
 *
 * @param recipientEmail - Email address of the person who will fill the form
 * @returns Newly created workflow ID
 */
export async function createWorkflow(recipientEmail: string) {
  const supabase = await createServerClient();
  const workflowId = nanoid();

  console.log("Creating workflow:", workflowId, "for", recipientEmail);

  const { error } = await supabase.from("workflows").insert([
    {
      id: workflowId,
      recipient_email: recipientEmail,
      status: "pending_form",
      initiated_by_email: "user@example.com", // TODO: Replace with actual authenticated user
    },
  ]);

  if (error) {
    console.error("Error creating workflow:", error);
    throw error;
  }

  console.log("Workflow created successfully:", workflowId);
  return workflowId;
}

/**
 * Retrieves a workflow by ID with all related data
 *
 * Joins with:
 * - workflow_recipients (form submission data)
 * - workflow_biographies (AI-generated biography)
 *
 * @param workflowId - Unique workflow identifier
 * @returns Complete workflow state or null if not found
 */
export async function getWorkflow(
  workflowId: string,
): Promise<WorkflowState | null> {
  const supabase = await createServerClient();

  console.log("Fetching workflow:", workflowId);

  const { data, error } = await supabase
    .from("workflows")
    .select(
      `
      *,
      workflow_recipients(*),
      workflow_biographies(*)
    `,
    )
    .eq("id", workflowId)
    .single();

  if (error) {
    console.error("Error fetching workflow:", error);
    return null;
  }

  if (!data) {
    console.log("Workflow not found:", workflowId);
    return null;
  }

  console.log(
    "Workflow fetched successfully:",
    workflowId,
    "Status:",
    data.status,
  );
  return dbRowToWorkflowState(data);
}

/**
 * Retrieves all workflows ordered by creation date (newest first).
 *
 * WORKFLOW STEP 6: Display all workflows on user dashboard.
 *
 * RETRY LOGIC:
 *   After a Supabase project is restored from a paused state, PostgREST may
 *   return HTTP 503 with error code PGRST002 while it rebuilds its schema cache.
 *   This function retries up to MAX_RETRIES times with exponential backoff
 *   (1 s, 2 s, 4 s) so the page loads cleanly once the cache is ready.
 *
 * @returns Array of all workflows with their complete state
 */
export async function getAllWorkflows(): Promise<WorkflowState[]> {
  const MAX_RETRIES = 3;
  const supabase = await createServerClient();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { data, error } = await supabase
      .from("workflows")
      .select(
        `
        *,
        workflow_recipients(*),
        workflow_biographies(*)
      `,
      )
      .order("created_at", { ascending: false });

    if (!error) {
      return (data || []).map(dbRowToWorkflowState);
    }

    // PGRST002 = schema cache not ready; worth retrying
    const isRetryable =
      error.code === "PGRST002" || error.message?.includes("schema cache");

    if (isRetryable && attempt < MAX_RETRIES) {
      const delayMs = 1000 * 2 ** (attempt - 1); // 1 s → 2 s → 4 s
      console.log(
        `Schema cache not ready (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${delayMs} ms...`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    // Non-retryable error, or final attempt exhausted
    console.error("Error fetching workflows:", error.message);
    return [];
  }

  return [];
}

/**
 * Updates the workflow status
 *
 * Status flow:
 * pending_form → form_submitted → generating → pending_review → approved/rejected
 *
 * @param workflowId - Workflow to update
 * @param status - New status value
 */
export async function updateWorkflowStatus(workflowId: string, status: string) {
  const supabase = await createServerClient();

  console.log("Updating workflow status:", workflowId, "→", status);

  const { error } = await supabase
    .from("workflows")
    .update({ status })
    .eq("id", workflowId);

  if (error) {
    console.error("Error updating workflow status:", error);
    throw error;
  }

  console.log("Workflow status updated successfully");
}

/**
 * Saves recipient information from form submission
 *
 * WORKFLOW STEP 4: Recipient submits the form with their information
 *
 * @param workflowId - Associated workflow ID
 * @param recipientInfo - Form data submitted by recipient
 */
export async function saveRecipientInfo(
  workflowId: string,
  recipientInfo: any,
) {
  const supabase = await createServerClient();

  console.log("Saving recipient info for workflow:", workflowId);

  // Convert to database format
  const dbRow = recipientInfoToDbRow(recipientInfo);

  const { error } = await supabase.from("workflow_recipients").upsert(
    {
      workflow_id: workflowId,
      ...dbRow,
    },
    { onConflict: "workflow_id" },
  );

  if (error) {
    console.error("Error saving recipient info:", error);
    throw error;
  }

  console.log("Recipient info saved successfully");
}

/**
 * Saves AI-generated biography
 *
 * WORKFLOW STEP 5: AI generates biography based on recipient info
 *
 * @param workflowId - Associated workflow ID
 * @param biographyText - AI-generated biographical description
 */
export async function saveBiography(workflowId: string, biographyText: string) {
  const supabase = await createServerClient();

  console.log("Saving biography for workflow:", workflowId);

  const { error } = await supabase.from("workflow_biographies").upsert(
    {
      workflow_id: workflowId,
      biography_text: biographyText,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "workflow_id" },
  );

  if (error) {
    console.error("Error saving biography:", error);
    throw error;
  }

  console.log("Biography saved successfully");
}

/**
 * Persists the compiled-input artifact for a generation run: the retrieval/
 * prompt/model versions, the retrieved references, and the exact prompt
 * text, fingerprinted so a later regression can be traced to a specific
 * compiler or template version instead of "the model got worse."
 *
 * https://cataluma.com/blog/llm-eval-shipping-workflows — "Recommendation: create a compiled-input artifact boundary"
 *
 * Best-effort: failures here are logged but never thrown, since this is an
 * audit/debugging trail, not part of the golden path — a missing artifact
 * table (e.g. before scripts/004 has been run) must not block generation.
 *
 * @param workflowId - Associated workflow ID
 * @param artifact - Compiled-input artifact returned by generateBiography
 */
export async function saveGenerationArtifact(
  workflowId: string,
  artifact: CompiledInput,
) {
  const supabase = await createServerClient();

  console.log("Saving generation artifact for workflow:", workflowId);

  const { error } = await supabase.from("workflow_generation_artifacts").insert({
    id: nanoid(),
    workflow_id: workflowId,
    compiler_version: artifact.compilerVersion,
    prompt_version: artifact.promptVersion,
    model_name: artifact.modelName,
    model_params: artifact.modelParams,
    compiled_input: {
      recipientInput: artifact.recipientInput,
      references: artifact.references,
      prompt: artifact.prompt,
    },
    fingerprint: artifact.fingerprint,
  });

  if (error) {
    console.error("Error saving generation artifact:", error);
    return;
  }

  console.log(
    "Generation artifact saved:",
    workflowId,
    "fingerprint:",
    artifact.fingerprint,
  );
}

/**
 * Approves a biography and sends it to the recipient
 *
 * WORKFLOW STEP 8: User approves the generated biography
 *
 * @param workflowId - Workflow to approve
 */
export async function approveBiography(workflowId: string) {
  const supabase = await createServerClient();

  console.log("Approving biography for workflow:", workflowId);

  // Mark biography as approved
  const { error: bioError } = await supabase
    .from("workflow_biographies")
    .update({ approved: true, reviewed_at: new Date().toISOString() })
    .eq("workflow_id", workflowId);

  if (bioError) {
    console.error("Error approving biography:", bioError);
    throw bioError;
  }

  // Update workflow status to approved
  await updateWorkflowStatus(workflowId, "approved");

  console.log("Biography approved successfully");
}

/**
 * Rejects a biography with a reason
 *
 * WORKFLOW STEP 9: User disapproves the biography and provides feedback
 *
 * @param workflowId - Workflow to reject
 * @param rejectionReason - Explanation of why the biography was rejected
 */
export async function rejectBiography(
  workflowId: string,
  rejectionReason: string,
) {
  const supabase = await createServerClient();

  console.log("Rejecting biography for workflow:", workflowId);

  // Mark biography as rejected with reason
  const { error: bioError } = await supabase
    .from("workflow_biographies")
    .update({
      approved: false,
      rejection_reason: rejectionReason,
      reviewed_at: new Date().toISOString(),
    })
    .eq("workflow_id", workflowId);

  if (bioError) {
    console.error("Error rejecting biography:", bioError);
    throw bioError;
  }

  // Update workflow status to rejected
  await updateWorkflowStatus(workflowId, "rejected");

  console.log("Biography rejected successfully");
}

/**
 * Deletes a workflow and all related data
 *
 * This will cascade delete:
 * - workflow_recipients
 * - workflow_biographies
 *
 * @param workflowId - Workflow to delete
 */
export async function deleteWorkflow(workflowId: string) {
  const supabase = await createServerClient();

  console.log("Deleting workflow:", workflowId);

  const { error } = await supabase
    .from("workflows")
    .delete()
    .eq("id", workflowId);

  if (error) {
    console.error("Error deleting workflow:", error);
    throw error;
  }

  console.log("Workflow deleted successfully");
}

// ============================================================================
// CLIENT-SIDE HOOKS (Optional)
// ============================================================================
// NOTE: These are no longer included in this file to avoid importing
// the browser client on the server side. Use API routes from client components.
// ============================================================================
