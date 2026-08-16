/**
 * PROXY: per-visitor demo session
 *
 * Next.js 16 renamed the `middleware` file convention to `proxy`; this is the
 * same interception point under its current name.
 *
 * The demo has no login, so this is where visitor identity comes from. Every
 * matched request either carries a valid signed `demo_session` cookie or gets
 * a fresh one minted here. The resolved id is written onto a request header
 * so the handler for this same request can read it, since a cookie set on the
 * response is not visible to the request that set it.
 *
 * The matcher must cover every path that reads the session. A path left out
 * would reach its handler with no session and be rejected by
 * requireDemoSession, which is the safe direction to fail.
 *
 * See lib/demo-session.ts for the signing scheme.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  DEMO_SESSION_COOKIE,
  DEMO_SESSION_HEADER,
  DEMO_SESSION_MAX_AGE_SECONDS,
  createDemoSession,
  readDemoSessionId,
} from "@/lib/demo-session";

export async function proxy(request: NextRequest) {
  const existing = request.cookies.get(DEMO_SESSION_COOKIE)?.value;

  let sessionId = await readDemoSessionId(existing);
  let cookieToIssue: string | null = null;

  if (!sessionId) {
    const minted = await createDemoSession();
    sessionId = minted.id;
    cookieToIssue = minted.value;
  }

  // Strip any client-supplied copy before setting our own, so the header is
  // only ever what this proxy put there.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(DEMO_SESSION_HEADER);
  requestHeaders.set(DEMO_SESSION_HEADER, sessionId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (cookieToIssue) {
    response.cookies.set({
      name: DEMO_SESSION_COOKIE,
      value: cookieToIssue,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: DEMO_SESSION_MAX_AGE_SECONDS,
    });
  }

  return response;
}

export const config = {
  // Everything except Next.js internals and static assets. Broad on purpose:
  // the cost of matching a path that does not need a session is one HMAC, and
  // the cost of missing one is a route that cannot identify its caller.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|txt|xml)$).*)",
  ],
};
