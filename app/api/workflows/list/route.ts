/**
 * WORKFLOW LIST API ROUTE
 *
 * This API endpoint provides a server-side proxy for fetching all workflows.
 * It exists to work around RLS (Row Level Security) permission issues when
 * client components try to query Supabase directly with the anon key.
 *
 * WHY THIS EXISTS:
 * - Client components can't use the service role key (security risk)
 * - Anon key has limited permissions (RLS policies)
 * - This route uses the server client with elevated permissions
 * - Returns data in a format client components can consume
 *
 * ALTERNATIVE APPROACHES:
 * 1. Enable RLS policies for workflows table (production approach)
 * 2. Pass data as props from Server Components (simpler, but less dynamic)
 * 3. Use this API route approach (current implementation)
 *
 * ENDPOINT: GET /api/workflows/list
 * AUTHENTICATION: None (in production, should verify user session)
 * RESPONSE: { workflows: WorkflowState[] }
 *
 * USAGE IN CLIENT COMPONENTS:
 * ```tsx
 * const response = await fetch('/api/workflows/list')
 * const { workflows } = await response.json()
 * ```
 */

import { NextResponse } from "next/server";
import { getAllWorkflows } from "@/lib/workflow-store";

export async function GET() {
  try {
    console.log("API: Fetching all workflows via server route");

    // Use server-side function which has service role key permissions
    // This bypasses any RLS policies and can read all workflows
    const workflows = await getAllWorkflows();

    console.log(`API: Successfully fetched ${workflows.length} workflows`);

    // Return workflows in JSON format
    // Client components can consume this directly
    return NextResponse.json({ workflows });
  } catch (error: any) {
    // Log the error for debugging
    console.error("API: Error fetching workflows:", error.message);

    // Return error response with appropriate HTTP status
    return NextResponse.json(
      { error: error.message || "Failed to fetch workflows" },
      { status: 500 },
    );
  }
}
