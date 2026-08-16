/**
 * MODULE: lib/demo-session.ts — Per-visitor demo session identity
 *
 * This demo has no user accounts, but every workflow still needs an owner.
 * Each visitor gets a signed, httpOnly `demo_session` cookie the first time
 * they touch the app (see proxy.ts). Workflows are stamped with the
 * session id that created them, and every privileged route filters or gates
 * on it, so a visitor sees and acts on only their own records.
 *
 * The cookie value is `<id>.<signature>`, where the signature is an
 * HMAC-SHA256 of the id. A visitor can read the id but cannot mint a valid
 * one for a session they do not own, so ids stay unguessable and unforgeable
 * without the server secret.
 *
 * Everything here uses Web Crypto rather than `node:crypto` so the same code
 * runs in the proxy (Edge runtime) and in route handlers (Node runtime).
 * This module must not import `next/headers` — the proxy cannot use it.
 * Server-side reads live in lib/demo-session-server.ts instead.
 */

export const DEMO_SESSION_COOKIE = "demo_session";

/**
 * Header the proxy writes the resolved session id onto, so a route
 * handler can read the session on the very same request that minted the
 * cookie (the `Set-Cookie` header is not visible to the request that set it).
 *
 * The proxy deletes any inbound copy of this header before setting its
 * own, so a client cannot supply it. Server-side readers verify the cookie
 * signature first and fall back to this header only when there is no valid
 * cookie yet.
 */
export const DEMO_SESSION_HEADER = "x-demo-session-id";

/**
 * Cookie lifetime, deliberately matched to the 48-hour data expiry window in
 * app/api/cron/expire-demo-data/route.ts. A session outliving its own
 * workflows would show an empty dashboard and invite confusion.
 */
export const DEMO_SESSION_MAX_AGE_SECONDS = 60 * 60 * 48;

let warnedAboutFallbackSecret = false;

/**
 * Resolves the HMAC secret.
 *
 * `DEMO_SESSION_SECRET` is the intended source. When it is absent we derive
 * from `SUPABASE_SECRET_KEY`, which the app already requires and which is
 * server-only, so a deployment that predates this variable keeps working
 * instead of returning 500 on every request. Rotating the Supabase key
 * invalidates every outstanding session, which is why the dedicated variable
 * is worth setting.
 */
function getSessionSecret(): string {
  const explicit = process.env.DEMO_SESSION_SECRET;
  if (explicit) {
    return explicit;
  }

  const fallback = process.env.SUPABASE_SECRET_KEY;
  if (fallback) {
    if (!warnedAboutFallbackSecret) {
      warnedAboutFallbackSecret = true;
      console.warn(
        "demo-session: DEMO_SESSION_SECRET is not set; deriving the session signing key from SUPABASE_SECRET_KEY. Set DEMO_SESSION_SECRET so sessions survive a Supabase key rotation.",
      );
    }
    return `demo-session:${fallback}`;
  }

  throw new Error(
    "demo-session: no signing secret available. Set DEMO_SESSION_SECRET (or SUPABASE_SECRET_KEY).",
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(id: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(id));
  return toBase64Url(new Uint8Array(signature));
}

/**
 * Length-independent, content-constant-time string comparison. Signature
 * comparison is not a realistic timing target here, but there is no reason to
 * leak the shape of a mismatch.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export type MintedDemoSession = {
  /** The bare session id, for stamping onto rows. */
  id: string;
  /** The signed cookie value, for `Set-Cookie`. */
  value: string;
};

/** Mints a fresh session id and its signed cookie value. */
export async function createDemoSession(): Promise<MintedDemoSession> {
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  const id = toHex(random);

  return { id, value: `${id}.${await sign(id)}` };
}

/**
 * Verifies a signed cookie value.
 *
 * @param value - Raw `demo_session` cookie value
 * @returns The session id, or null when the value is missing, malformed, or
 *   carries a signature this server did not produce
 */
export async function readDemoSessionId(
  value: string | undefined | null,
): Promise<string | null> {
  if (!value) {
    return null;
  }

  const separator = value.lastIndexOf(".");
  if (separator <= 0) {
    return null;
  }

  const id = value.slice(0, separator);
  const signature = value.slice(separator + 1);

  // Reject anything that is not the shape we mint, before spending a hash on
  // it.
  if (!/^[0-9a-f]{32}$/.test(id)) {
    return null;
  }

  return safeEqual(await sign(id), signature) ? id : null;
}
