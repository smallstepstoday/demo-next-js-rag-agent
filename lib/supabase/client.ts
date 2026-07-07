import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Singleton instance of the Supabase browser client
 * This ensures only ONE client is created per browser session,
 * preventing the "Multiple GoTrueClient instances" warning
 */
let client: SupabaseClient | undefined

/**
 * Creates or returns the existing Supabase browser client instance
 *
 * IMPORTANT: This uses a singleton pattern to ensure only one client
 * exists in the browser context. Multiple clients would cause auth
 * conflicts and undefined behavior.
 *
 * Usage in client components:
 * ```tsx
 * 'use client'
 * const supabase = createClient()
 * ```
 *
 * @returns Singleton Supabase browser client instance
 */
export const createClient = () => {
  // If client already exists, return it (singleton pattern)
  if (client) {
    return client
  }

  // Create the client only once
  client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  return client
}
