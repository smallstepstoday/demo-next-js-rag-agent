/**
 * DELETE WORKFLOW API ROUTE
 *
 * This route handles the deletion of a workflow and all its related data.
 *
 * WORKFLOW CLEANUP:
 * Deletes the workflow and all associated data through CASCADE deletion:
 * - workflow_recipients (form submission data)
 * - workflow_biographies (AI-generated biography)
 * - workflow_generation_artifacts (compiled-input audit trail)
 * - workflows (main workflow record)
 *
 * CASCADE DELETE is configured in the database schema:
 * - workflow_recipients has ON DELETE CASCADE on workflow_id
 * - workflow_biographies has ON DELETE CASCADE on workflow_id
 * - workflow_generation_artifacts has ON DELETE CASCADE on workflow_id
 *
 * ENDPOINT: DELETE /api/workflows/[workflowId]/delete
 * BODY: None required (workflowId in URL)
 * RESPONSE: { success: boolean }
 *
 * SECURITY:
 * This route had no authentication, no ownership check, and no confirmation,
 * and workflow ids are not secret — the list route hands them out. Reading the
 * list and looping the delete was a two-request path to destroying the demo.
 *
 * Deletion is now scoped to the caller's demo session. The session filter sits
 * in the DELETE statement itself (see lib/workflow-store.ts deleteWorkflow),
 * so there is no gap between checking ownership and removing the row, and a
 * delete aimed at another visitor's workflow removes nothing and returns 404.
 */

import { errorDetails } from "@/lib/api-errors";
import { requireDemoSession } from "@/lib/demo-session-server";
import { deleteWorkflow } from "@/lib/workflow-store";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  try {
    // Await params to get the workflowId (Next.js 15+ async params)
    const { workflowId } = await params;

    const session = await requireDemoSession();
    if ("response" in session) {
      return session.response;
    }

    console.log("Delete route - Deleting workflow:", workflowId);

    // Scoped delete. Returns false when no row matched this session, which
    // covers both "does not exist" and "belongs to someone else" — the caller
    // cannot tell those apart.
    const deleted = await deleteWorkflow(workflowId, session.sessionId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    console.log("Delete route - Workflow deleted successfully");

    return NextResponse.json({ success: true });
  } catch (error) {
    // Log and return error if deletion fails
    console.error("Delete route - Error deleting workflow:", error);
    return NextResponse.json(
      { error: "Failed to delete workflow", details: errorDetails(error) },
      { status: 500 },
    );
  }
}
