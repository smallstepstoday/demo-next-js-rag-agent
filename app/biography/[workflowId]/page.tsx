import { getWorkflow } from "@/lib/workflow-store"
import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle } from "lucide-react"
import Link from "next/link"

/**
 * Biography View Page (Server Component)
 *
 * Displays the approved biography in a clean, readable format
 */

interface PageProps {
  params: Promise<{ workflowId: string }>
}

export default async function BiographyPage({ params }: PageProps) {
  const { workflowId } = await params
  const workflow = await getWorkflow(workflowId)

  // Show 404 if workflow doesn't exist
  if (!workflow) {
    notFound()
  }

  // Show message if no biography or not approved
  if (!workflow.biography || workflow.status !== "approved") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold">Biography Not Available</h2>
          <p className="text-muted-foreground">This biography is not yet approved or does not exist.</p>
          <Link href="/" className="mt-4 inline-block">
            <Button>Back to Workflows</Button>
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <div className="mb-2 flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle className="h-6 w-6" />
            <span className="font-semibold">Approved Biography</span>
          </div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight">{workflow.recipientInfo?.name}</h1>
          <p className="text-muted-foreground">{workflow.recipientInfo?.email}</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Professional Biography</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap leading-relaxed">{workflow.biography.description}</p>
            </div>

            {workflow.recipientInfo && (
              <div className="mt-8 border-t pt-6">
                <h3 className="mb-4 font-semibold">Profile Details</h3>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Occupation</dt>
                    <dd className="mt-1">{workflow.recipientInfo.occupation}</dd>
                  </div>
                  {workflow.recipientInfo.interests && (
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Company/Interests</dt>
                      <dd className="mt-1">{workflow.recipientInfo.interests}</dd>
                    </div>
                  )}
                  {workflow.recipientInfo.skills && workflow.recipientInfo.skills.length > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="text-sm font-medium text-muted-foreground">Skills</dt>
                      <dd className="mt-1 flex flex-wrap gap-2">
                        {workflow.recipientInfo.skills.map((skill, i) => (
                          <span key={i} className="rounded-full bg-secondary px-3 py-1 text-sm">
                            {skill}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            <div className="mt-8 flex justify-center">
              <Link href="/">
                <Button variant="outline">Back to Workflows</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
