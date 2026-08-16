/**
 * WORKFLOW LIST API ROUTE
 *
 * This API endpoint provides a server-side proxy for fetching the calling
 * visitor's workflows. It exists because there is no browser Supabase client
 * in this app: the `rag_demo` tables have RLS enabled with no anon or
 * authenticated policies, so only the server-side service_role client can
 * read them.
 *
 * WHY THIS EXISTS:
 * - Client components can't use the service role key (security risk)
 * - The anon key reaches nothing in this schema by design
 * - This route uses the server client with elevated permissions
 * - Returns data in a format client components can consume
 *
 * SCOPING:
 * This route returned every workflow in the system to any caller — every
 * name, email address, occupation, submitted context, and generated
 * biography, in one response. It now returns only the workflows belonging to
 * the caller's demo session. Because the service_role client bypasses RLS,
 * that session filter is the only thing enforcing the boundary, which is why
 * it lives inside getAllWorkflows rather than in each caller.
 *
 * ENDPOINT: GET /api/workflows/list
 * AUTHENTICATION: Demo session cookie (see lib/demo-session.ts)
 * RESPONSE: { workflows: WorkflowState[] }
 *
 * USAGE IN CLIENT COMPONENTS:
 * ```tsx
 * const response = await fetch('/api/workflows/list')
 * const { workflows } = await response.json()
 * ```
 */

import { NextResponse } from "next/server";
import { errorDetails } from "@/lib/api-errors";
import { requireDemoSession } from "@/lib/demo-session-server";
import { getAllWorkflows } from "@/lib/workflow-store";

export async function GET() {
  try {
    const session = await requireDemoSession();
    if ("response" in session) {
      return session.response;
    }

    console.log("API: Fetching workflows for the calling session");

    // Server-side function with service_role permissions, filtered to this
    // session. See lib/workflow-store.ts getAllWorkflows.
    const workflows = await getAllWorkflows(session.sessionId);

    console.log(`API: Successfully fetched ${workflows.length} workflows`);

    // Return workflows in JSON format
    // Client components can consume this directly
    return NextResponse.json({ workflows });
  } catch (error) {
    // Log the error for debugging
    console.error("API: Error fetching workflows:", error);

    // Return a generic message; the specific one is logged, and reaches the
    // client only outside production.
    return NextResponse.json(
      { error: "Failed to fetch workflows", details: errorDetails(error) },
      { status: 500 },
    );
  }
}
