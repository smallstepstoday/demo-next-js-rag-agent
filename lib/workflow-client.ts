/**
 * Client-side Workflow Operations
 *
 * This module provides client-side functions for interacting with workflows.
 * It should only be imported in client components ('use client').
 *
 * IMPORTANT: Keep this separate from workflow-store.ts to prevent
 * the browser Supabase client from being loaded on the server.
 */

import { createClient } from "./supabase/client";
import type { WorkflowState } from "./workflow-types";

/**
 * Converts a database workflow row to a WorkflowState object
 * This is duplicated from workflow-store.ts to keep client code independent
 */
function dbRowToWorkflowState(row: any): WorkflowState {
  // Extract recipient info from the joined workflow_recipients table
  const recipientInfo = row.workflow_recipients?.[0]
    ? {
        name: row.workflow_recipients[0].full_name,
        email: row.workflow_recipients[0].email,
        occupation: row.workflow_recipients[0].occupation,
        yearsOfExperience: 0,
        skills: row.workflow_recipients[0].skills || [],
        achievements: row.workflow_recipients[0].bio_context || "",
        interests: row.workflow_recipients[0].company || "",
      }
    : undefined;

  // Extract biography from the joined workflow_biographies table
  const biography = row.workflow_biographies?.[0]
    ? {
        description: row.workflow_biographies[0].biography_text,
        generatedAt: new Date(row.workflow_biographies[0].generated_at),
      }
    : undefined;

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
    disapprovalReason: row.workflow_biographies?.[0]?.rejection_reason,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Client-side hook for fetching workflows
 * Uses the browser Supabase client for client components
 *
 * Usage in client components:
 * ```tsx
 * 'use client'
 * import { useWorkflows } from '@/lib/workflow-client'
 *
 * const { fetchWorkflows } = useWorkflows()
 * const workflows = await fetchWorkflows()
 * ```
 *
 * @returns Object with fetchWorkflows function
 */
export function useWorkflows() {
  const supabase = createClient();

  const fetchWorkflows = async () => {
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

    if (error) {
      console.error("Client error fetching workflows:", error);
      throw error;
    }

    return (data || []).map(dbRowToWorkflowState);
  };

  return { fetchWorkflows };
}

/**
 * Client-side hook for fetching a single workflow
 * Uses the browser Supabase client for client components
 *
 * @param workflowId - Workflow ID to fetch
 * @returns Object with fetchWorkflow function
 */
export function useWorkflow(workflowId: string) {
  const supabase = createClient();

  const fetchWorkflow = async (): Promise<WorkflowState | null> => {
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
      console.error("Client error fetching workflow:", error);
      return null;
    }

    if (!data) {
      return null;
    }

    return dbRowToWorkflowState(data);
  };

  return { fetchWorkflow };
}
