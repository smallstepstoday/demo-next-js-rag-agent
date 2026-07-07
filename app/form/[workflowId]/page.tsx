import RecipientForm from "@/components/recipient-form"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"
import Link from "next/link"

/**
 * Form Page (Server Component)
 *
 * Step 4: Recipient clicks the link and displays a form to fill out
 *
 * This is a server component that:
 * - Fetches the workflow data from Supabase
 * - Validates the workflow exists and is in the correct state
 * - Renders the RecipientForm client component with the necessary data
 */

interface PageProps {
  params: Promise<{ workflowId: string }>
}

export default async function FormPage({ params }: PageProps) {
  // Await params to get the workflowId (Next.js 15+ async params)
  const { workflowId } = await params

  // Create server-side Supabase client for fetching workflow data
  const supabase = await createClient()

  // Fetch workflow data with related recipient information
  const { data: workflow, error } = await supabase
    .from("workflows")
    .select(`
      id,
      recipient_email,
      status,
      workflow_recipients(
        full_name,
        email,
        occupation,
        skills,
        bio_context
      )
    `)
    .eq("id", workflowId)
    .single()

  // Handle workflow not found
  if (error || !workflow) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
            <h2 className="mb-2 text-xl font-semibold">Workflow Not Found</h2>
            <p className="mb-4 text-balance text-center text-sm text-muted-foreground">
              This workflow could not be found. Please check the link and try again.
            </p>
            <p className="mb-6 text-balance text-center text-xs text-muted-foreground">
              Workflow ID: <code className="rounded bg-muted px-1">{workflowId}</code>
            </p>
            <Link href="/">
              <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Return to Home
              </button>
            </Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  // Show message if form already submitted
  if (workflow.workflow_recipients) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="mb-2 text-xl font-semibold">Form Already Submitted</h2>
            <p className="text-center text-muted-foreground">Thank you! Your information has already been received.</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  // Render the form for the recipient to fill out
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold tracking-tight">Share Your Information</h1>
          <p className="text-pretty text-muted-foreground">
            Please fill out the form below to help us create your biographical description
          </p>
        </header>

        {/* RecipientForm is a client component that handles form state and submission */}
        <RecipientForm workflowId={workflowId} recipientEmail={workflow.recipient_email} />
      </div>
    </main>
  )
}
