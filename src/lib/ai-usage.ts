import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { todayIso } from "@/lib/dates";

// AI-graded sentences one user can spend in a day. `gradeSentenceAnswer` is an
// authenticated server action wired straight to a paid API with nothing else
// between it and the bill, so a loop — scripted or accidental — is a cost
// incident waiting to happen.
//
// Sized to sit well above real use: a weekly review of 50 questions asks for
// about 13 sentences, and a topic quiz of 80 asks for about 24. Someone doing
// both in one day plus a second topic is still under 70.
export const DAILY_SENTENCE_GRADES = 100;

// Spends one unit of today's allowance and says whether the caller was still
// inside it. The counting happens in Postgres (`claim_ai_grade`) so two
// requests in flight can't both read the same count and each think they're the
// hundredth — a read-modify-write here would be exactly the race the limit
// exists to survive.
//
// The day comes from the app's timezone, not the database's, so the allowance
// resets when the learner's day does — the same boundary the daily batch uses.
//
// Fails open. The RPC lives in a migration that has to be run by hand in the
// Supabase SQL Editor, and until it is, an unrecognised function should leave
// grading working exactly as it did before rather than break it for everyone.
export async function claimSentenceGrade(
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_ai_grade", {
    p_day: todayIso(),
    p_limit: DAILY_SENTENCE_GRADES,
  });

  if (error) {
    console.error("AI usage limit check failed — allowing the grade:", error);
    return true;
  }

  return data !== false;
}
