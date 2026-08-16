/**
 * MODULE: lib/api-errors.ts — Error detail disclosure
 *
 * The routes used to return `error.message` from Supabase, and the approve
 * route returned a `diagnostic` object carrying the Postgres error code, to
 * unauthenticated callers. That is schema and constraint information handed to
 * anyone with the URL.
 *
 * These helpers keep the detail in development, where it earns its place, and
 * drop it in production. The server-side `console.error` calls are untouched:
 * the information still reaches the logs, just not the response body.
 *
 * `NextResponse.json` omits keys whose value is undefined, so a route can pass
 * `details: errorDetails(err)` unconditionally and get a clean body either way.
 */

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Extracts a human-readable message from an unknown thrown value.
 *
 * @returns The message in development, undefined in production
 */
export function errorDetails(error: unknown): string | undefined {
  if (isProduction()) {
    return undefined;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "Unknown error";
}

/**
 * Passes a diagnostic payload through in development, drops it in production.
 *
 * @param payload - Structured detail worth seeing locally
 * @returns The payload in development, undefined in production
 */
export function developmentOnly<T>(payload: T): T | undefined {
  return isProduction() ? undefined : payload;
}
