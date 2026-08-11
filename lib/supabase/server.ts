import { createClient as supabaseCreateClient } from "@supabase/supabase-js";

/**
 * MODULE: lib/supabase/server.ts — Supabase Server Client Factory
 *
 * Creates a Supabase client for use in Server Components, Route Handlers, and Server Actions.
 *
 * We use `createClient` from `@supabase/supabase-js` directly (NOT `@supabase/ssr`) to avoid
 * cookie-adapter conflicts that cause "Invalid request" errors in the runtime environment.
 *
 * AUTHENTICATION STRATEGY:
 *   - Uses the SECRET KEY (SUPABASE_SECRET_KEY), which authenticates as the
 *     `service_role` Postgres role and bypasses RLS.
 *   - `rag_demo` tables have RLS enabled with no policies (see
 *     `scripts/003_secure_rag_demo_schema.sql`), so anon/authenticated get no
 *     access at all — only this server-side client, via service_role, can
 *     reach them.
 *   - Tables live in the `rag_demo` schema (not `public`), so the client
 *     passes `db: { schema: "rag_demo" }`. That schema must also be added to
 *     the Supabase project's exposed schemas (Project Settings > Data API).
 *
 * This file must only ever be imported on the server. There is no browser
 * client for this app — every read/write goes through this client via API
 * routes or Server Components, never directly from the client.
 *
 * @returns A Supabase client instance configured for server-side database operations
 */
export async function createClient() {
  return supabaseCreateClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        // Disable auto-refresh and session persistence on the server.
        // Server-side calls are stateless — no session management needed.
        autoRefreshToken: false,
        persistSession: false,
      },
      db: { schema: "rag_demo" },
    },
  );
}
