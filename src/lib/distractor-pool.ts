import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import type { DistractorWord } from "@/lib/quiz-generation";

// PostgREST caps a response at 1000 rows regardless of `.limit()`, so the whole
// bank has to be read a page at a time. `.limit(5000)` doesn't do what it looks
// like: it returned the first 1000 words by id and no error, so every
// distractor in the app was drawn from the same arbitrary half of the bank.
const PAGE_SIZE = 1000;

// The word bank only changes when the seed script runs, so an hour-old pool is
// as good as a fresh one. Revalidate sooner with `revalidateTag("words")`.
const CACHE_SECONDS = 3600;

// Read with a plain anon client rather than the cookie-backed server client:
// a cached scope can't reach `cookies()`, and it has no reason to — `words` is
// readable by anyone under RLS and the pool is identical for every user.
function wordBankClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

// The whole bank, minus the columns distractors never use — options are picked
// by topic/band/part-of-speech proximity, so narrowing the pool first would
// leave too few good matches to choose from.
async function readDistractorPool(): Promise<DistractorWord[]> {
  const supabase = wordBankClient();
  const pool: DistractorWord[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("words")
      .select("id, word, definition, band_level, topic, synonyms")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    pool.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return pool;
}

// Every quiz needs the same ~2000-row pool, and it used to be re-read on every
// render of /quiz — which, while answers still revalidated that path, meant
// three full paged reads per question answered. Cached across requests
// instead: it's the same public data for everyone.
export const fetchDistractorPool = unstable_cache(readDistractorPool, ["distractor-pool"], {
  revalidate: CACHE_SECONDS,
  tags: ["words"],
});
