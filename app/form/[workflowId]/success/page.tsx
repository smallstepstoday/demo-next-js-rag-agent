/**
 * FORM SUBMISSION SUCCESS PAGE
 *
 * This page is shown immediately after a recipient successfully submits
 * their biographical information form (Step 4 complete).
 *
 * PURPOSE:
 * - Confirms successful submission to the recipient
 * - Sets expectations about what happens next (AI generation + approval)
 * - Provides closure to the form submission flow
 * - Prevents accidental duplicate submissions (navigating back)
 *
 * USER JOURNEY:
 * 1. Recipient clicks email link → /form/[workflowId]
 * 2. Fills out biographical information form
 * 3. Submits form (POST /api/workflows/[workflowId]/submit)
 * 4. Redirected here → /form/[workflowId]/success ✓
 * 5. API retrieves reference documents and generates the biography
 * 6. User reviews and approves
 * 7. Recipient receives approved biography via email
 *
 * DESIGN NOTES:
 * - Centered card layout for focus
 * - Green check circle for positive confirmation
 * - Clear messaging about next steps
 * - No actions required from recipient (passive waiting)
 */

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, Info } from "lucide-react"
import Link from "next/link"

export default function SuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center py-12">
          {/* Success Icon: Green circle with checkmark */}
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
          </div>

          {/* Success Heading */}
          <h2 className="mb-2 text-2xl font-bold">Thank You!</h2>

          {/* Explanation of what happens next */}
          <p className="text-center text-pretty text-muted-foreground">
            Your information has been submitted successfully. Your biographical description is ready for review.
          </p>

          <div className="mt-6 w-full rounded-md border border-blue-500/20 bg-blue-500/10 p-4 text-sm">
            <div className="flex gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" />
              <div className="space-y-3">
                <p className="font-medium text-blue-900 dark:text-blue-100">Biography ready for review</p>
                <p className="text-blue-900/80 dark:text-blue-100/80">
                  This demo logs emails to the server console. The dashboard now contains the pending biography for
                  review.
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/">Return to dashboard</Link>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
