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
 *   - Uses the ANON KEY (NEXT_PUBLIC_SUPABASE_ANON_KEY) rather than the service role key.
 *   - Table-level permissions are granted to the `anon` Postgres role via:
 *       GRANT ALL ON TABLE public.<table> TO anon;
 *     This is configured in `scripts/001_create_workflows_table.sql`.
 *   - RLS is disabled on these tables, so the anon key has full CRUD access.
 *   - If you later enable RLS, add appropriate policies or switch to the service role key.
 *
 * WHY NOT THE SERVICE ROLE KEY?
 *   The runtime environment returns "Invalid request" when using the service role JWT.
 *   The anon key + explicit GRANTs achieves the same result without that issue.
 *
 * IMPORTANT: Even though this uses the anon key, this file should only be imported
 * on the server side. Client components should use `lib/supabase/client.ts` instead.
 *
 * @returns A Supabase client instance configured for server-side database operations
 */
export async function createClient() {
  return supabaseCreateClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Disable auto-refresh and session persistence on the server.
        // Server-side calls are stateless — no session management needed.
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
