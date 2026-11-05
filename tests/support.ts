import { existsSync } from "node:fs";
import { supabase } from "../lib/supabase.ts";

// Next.js loads .env.local by itself, but plain `node --test` does not. Load it here so the
// Supabase keys are available to the tests. Keys already set in the shell take precedence.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// The tests run against the live tables, so every row they create is tagged with a "TEST " prefix.
// Cleanup deletes only tagged rows, never a real booking or photo.
export const TAG = "TEST ";

export async function clearTestRows() {
  const b = await supabase().from("bookings").delete().like("name", `${TAG}%`);
  if (b.error) throw new Error(`cleanup bookings: ${b.error.message}`);
  const g = await supabase().from("gallery").delete().like("alt", `${TAG}%`);
  if (g.error) throw new Error(`cleanup gallery: ${g.error.message}`);
}
