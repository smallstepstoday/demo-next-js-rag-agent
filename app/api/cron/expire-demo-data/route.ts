/**
 * DEMO DATA EXPIRY CRON ROUTE
 *
 * Deletes workflows older than 48 hours, and everything hanging off them via
 * ON DELETE CASCADE: recipients, biographies, and generation artifacts.
 *
 * WHY:
 * - Bounds table growth on a public demo nobody prunes by hand.
 * - Limits how long any injected or unwanted generated content stays
 *   reachable, which matters because that content is rendered on pages served
 *   from a domain linked to a portfolio.
 * - Keeps stray personal data from accumulating. Anyone can type a real
 *   person's details into the form; a demo should not hold them indefinitely.
 *
 * The window matches DEMO_SESSION_MAX_AGE_SECONDS in lib/demo-session.ts, so
 * a visitor's session and their data expire together rather than leaving them
 * looking at an empty dashboard.
 *
 * ENDPOINT: GET /api/cron/expire-demo-data
 * SCHEDULE: see vercel.json
 *
 * AUTHENTICATION:
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is
 * set on the project. This route requires it. Without the check the endpoint
 * would be a public "delete every workflow older than 48 hours" button, which
 * is a smaller version of the problem the delete route had.
 *
 * When CRON_SECRET is unset the route refuses to run rather than running
 * unauthenticated: a scheduled deleter that fails closed is easy to notice and
 * safe to leave alone, and one that runs open is neither.
 */

import { errorDetails } from "@/lib/api-errors";
import { deleteWorkflowsCreatedBefore } from "@/lib/workflow-store";
import { NextResponse } from "next/server";

/** Matches the demo session lifetime in lib/demo-session.ts. */
const RETENTION_HOURS = 48;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error(
      "Expiry cron - CRON_SECRET is not set; refusing to run unauthenticated.",
    );
    return NextResponse.json(
      { error: "Cron is not configured" },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);
    const deletedIds = await deleteWorkflowsCreatedBefore(cutoff);

    console.log(
      `Expiry cron - Deleted ${deletedIds.length} workflow(s) created before ${cutoff.toISOString()}`,
    );

    return NextResponse.json({
      deleted: deletedIds.length,
      cutoff: cutoff.toISOString(),
    });
  } catch (error) {
    console.error("Expiry cron - Failed to expire demo data:", error);
    return NextResponse.json(
      { error: "Failed to expire demo data", details: errorDetails(error) },
      { status: 500 },
    );
  }
}
