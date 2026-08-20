import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Word count per topic, largest first.
//
// Counted in Postgres by the `topic_counts` function rather than by fetching
// every row and tallying here: PostgREST caps a response at 1000 rows and the
// word bank is past 2000, so the JS tally undercounted every topic — the cards
// advertised "environment · 50 words" for a topic holding 172.
export async function fetchTopicCounts(
  supabase: SupabaseClient<Database>,
): Promise<[string, number][]> {
  const { data, error } = await supabase.rpc("topic_counts");
  if (error) throw error;
  // count(*) comes back as a bigint, which PostgREST serialises as a string.
  return (data ?? []).map((row) => [row.topic, Number(row.word_count)]);
}
