/**
 * User Landing Page
 *
 * This is the main page where users can:
 * 1. Initiate a new workflow by entering a recipient's email
 * 2. View all existing workflows and their statuses
 * 3. Click on pending approvals to review biographies
 *
 * The page shows a simple form at the top and a list of workflow
 * cards below showing the current status of each workflow.
 */

import { EmailForm } from "@/components/email-form"
import { WorkflowList } from "@/components/workflow-list"
import { getAllWorkflows } from "@/lib/workflow-store"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  // Fetch all workflows from Supabase to display their current status
  const workflows = await getAllWorkflows()

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12">
        {/* Header Section */}
        <header className="mb-12 text-center">
          <h1 className="mb-3 text-4xl font-bold tracking-tight text-foreground">Biography Workflow Manager</h1>
          <p className="text-pretty text-lg text-muted-foreground">
            Send form links to recipients, generate AI biographies, and manage approvals
          </p>
        </header>

        {/* Email Input Form - Steps 1-2 */}
        <section className="mb-12">
          <EmailForm />
        </section>

        {/* Workflow List - Steps 6-7 */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold tracking-tight text-foreground">Active Workflows</h2>
          <WorkflowList workflows={workflows} />
        </section>
      </div>
    </main>
  )
}
