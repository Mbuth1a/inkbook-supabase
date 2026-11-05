import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only client. It uses the secret key, which bypasses Row Level Security, so this file
// must never be imported from a "use client" component.
const g = globalThis as unknown as { __inkSupabase?: SupabaseClient };

export function supabase(): SupabaseClient {
  if (g.__inkSupabase) return g.__inkSupabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");
  }
  // Tests set SUPABASE_SCHEMA=test so they use their own copy of the tables, never the live data.
  const schema = (process.env.SUPABASE_SCHEMA || "public") as "public";
  g.__inkSupabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema },
  }) as SupabaseClient;
  return g.__inkSupabase;
}
