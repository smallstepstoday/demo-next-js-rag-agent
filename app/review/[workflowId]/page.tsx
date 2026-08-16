import BiographyReview from "@/components/biography-review";
import { getDemoSessionId } from "@/lib/demo-session-server";
import { getWorkflow } from "@/lib/workflow-store";
import { notFound } from "next/navigation";

/**
 * Review Page (Server Component)
 *
 * Step 7: User clicks on description card to display full description with approve button
 *
 * This server component:
 * - Fetches the workflow with biography data from Supabase
 * - Validates the workflow is ready for review
 * - Renders the BiographyReview client component with the data
 *
 * Scoped to the visitor's demo session. This page renders model output built
 * from recipient-supplied text, so a workflow belonging to another visitor is
 * a 404 rather than a page.
 */

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ workflowId: string }>;
}

export default async function ReviewPage({ params }: PageProps) {
  // Await params to get the workflowId (Next.js 15+ async params)
  const { workflowId } = await params;

  const sessionId = await getDemoSessionId();

  // Fetch the workflow from Supabase with all related data, scoped to session
  const workflow = sessionId ? await getWorkflow(workflowId, sessionId) : null;

  console.log("Review page - Workflow ID:", workflowId);
  console.log("Review page - Workflow found:", !!workflow);
  console.log("Review page - Workflow status:", workflow?.status);
  console.log("Review page - Biography exists:", !!workflow?.biography);

  // Show 404 if the workflow doesn't exist or isn't this session's
  if (!workflow) {
    notFound();
  }

  // Show message if not ready for review
  if (workflow.status !== "pending_approval" || !workflow.biography) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold">Not Ready for Review</h2>
          <p className="text-muted-foreground">
            This biography is not yet ready for review.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Status: {workflow.status} | Biography:{" "}
            {workflow.biography ? "Present" : "Missing"}
          </p>
        </div>
      </main>
    );
  }

  // Render the biography review component
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold tracking-tight">
            Review Biography
          </h1>
          <p className="text-pretty text-muted-foreground">
            Review the generated biography and approve or request changes
          </p>
        </header>

        {/* BiographyReview is a client component that handles approval/disapproval actions */}
        <BiographyReview workflow={workflow} />
      </div>
    </main>
  );
}
