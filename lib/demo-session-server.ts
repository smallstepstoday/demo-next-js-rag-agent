/**
 * MODULE: lib/demo-session-server.ts — Reading the demo session on the server
 *
 * Split from lib/demo-session.ts because this file imports `next/headers`,
 * which the proxy cannot use. Route handlers and Server Components import
 * this one; the proxy imports the other.
 */

import { headers, cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  DEMO_SESSION_COOKIE,
  DEMO_SESSION_HEADER,
  readDemoSessionId,
} from "./demo-session";

/**
 * Resolves the current visitor's session id.
 *
 * Prefers the cookie. Falls back to the proxy-set request header, which covers
 * the first request of a session — the one where the cookie is on the response
 * but not yet on the request.
 *
 * Both carry the same signed value and both are verified here. The proxy also
 * strips any inbound copy of the header, but this function does not depend on
 * that: an unsigned or wrongly signed header is rejected exactly like an
 * unsigned cookie, so a request that somehow reaches a handler without passing
 * through the proxy cannot name a session it does not own.
 *
 * @returns The session id, or null when no session could be resolved
 */
export async function getDemoSessionId(): Promise<string | null> {
  const cookieStore = await cookies();

  const fromCookie = await readDemoSessionId(
    cookieStore.get(DEMO_SESSION_COOKIE)?.value,
  );
  if (fromCookie) {
    return fromCookie;
  }

  const headerStore = await headers();
  return readDemoSessionId(headerStore.get(DEMO_SESSION_HEADER));
}

/**
 * Route-handler guard: resolves the session or returns a 401 response.
 *
 * A missing session means the proxy did not run for this path, which is
 * a configuration error rather than something a visitor can cause. Failing
 * closed here keeps a matcher mistake from quietly reopening every route.
 *
 * USAGE:
 * ```ts
 * const session = await requireDemoSession()
 * if ("response" in session) return session.response
 * // session.sessionId is now available
 * ```
 */
export async function requireDemoSession(): Promise<
  { sessionId: string } | { response: NextResponse }
> {
  const sessionId = await getDemoSessionId();

  if (!sessionId) {
    return {
      response: NextResponse.json(
        { error: "No demo session. Reload the page and try again." },
        { status: 401 },
      ),
    };
  }

  return { sessionId };
}
