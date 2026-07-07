/**
 * DELETE WORKFLOW API ROUTE
 *
 * This route handles the deletion of a workflow and all its related data.
 *
 * WORKFLOW CLEANUP:
 * Deletes the workflow and all associated data through CASCADE deletion:
 * - workflow_recipients (form submission data)
 * - workflow_biographies (AI-generated biography)
 * - workflows (main workflow record)
 *
 * CASCADE DELETE is configured in the database schema:
 * - workflow_recipients has ON DELETE CASCADE on workflow_id
 * - workflow_biographies has ON DELETE CASCADE on workflow_id
 *
 * ENDPOINT: DELETE /api/workflows/[workflowId]/delete
 * BODY: None required (workflowId in URL)
 * RESPONSE: { success: boolean }
 *
 * SECURITY NOTE:
 * In a production app, this should verify the user has permission to delete
 * this workflow. Currently, any user can delete any workflow.
 */

import { deleteWorkflow } from "@/lib/workflow-store";
import { NextResponse } from "next/server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  try {
    // Await params to get the workflowId (Next.js 15+ async params)
    const { workflowId } = await params;

    console.log("Delete route - Deleting workflow:", workflowId);

    // Call the workflow store function which handles the database deletion
    // This will CASCADE delete all related records automatically
    await deleteWorkflow(workflowId);

    console.log("Delete route - Workflow deleted successfully");

    return NextResponse.json({ success: true });
  } catch (error) {
    // Log and return error if deletion fails
    console.error("Delete route - Error deleting workflow:", error);
    return NextResponse.json(
      { error: "Failed to delete workflow" },
      { status: 500 },
    );
  }
}
