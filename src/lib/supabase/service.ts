import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// The service_role client. It bypasses RLS entirely, so this module must never
// reach the browser bundle — it reads `SUPABASE_SERVICE_ROLE_KEY`, which has no
// NEXT_PUBLIC_ prefix and so is undefined client-side, but the real guard is
// only importing it from server code.
//
// Used for the one write the app makes on a user's behalf that isn't the
// user's own data: filling the shared `ai_questions` cache. That table used to
// carry an `insert ... with check (true)` policy for authenticated users, which
// meant any signed-in account could write a question for any word — and since
// the cache is global and unique per word, first writer wins, so one user could
// have poisoned every other user's topic quizzes.
//
// Returns null rather than throwing when the key isn't configured: a missing
// key should cost a cache write, not a page.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
