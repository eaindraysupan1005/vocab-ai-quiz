import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WordStatus } from "@/lib/supabase/database.types";

export const BATCH_SIZE = 20;

export type BatchWord = Database["public"]["Tables"]["words"]["Row"] & {
  status: WordStatus;
  isDue: boolean;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function getDailyBatch(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<BatchWord[]> {
  const today = todayIso();

  const { data: dueUserWords, error: dueError } = await supabase
    .from("user_words")
    .select("status, word_id")
    .eq("user_id", userId)
    .lte("next_review_date", today)
    .order("next_review_date", { ascending: true });

  if (dueError) throw dueError;

  let due: BatchWord[] = [];

  if (dueUserWords && dueUserWords.length > 0) {
    const dueIds = dueUserWords.map((row) => row.word_id);
    const { data: dueWords, error: dueWordsError } = await supabase
      .from("words")
      .select("*")
      .in("id", dueIds);

    if (dueWordsError) throw dueWordsError;

    const wordsById = new Map((dueWords ?? []).map((word) => [word.id, word]));

    due = dueUserWords
      .filter((row) => wordsById.has(row.word_id))
      .map((row) => ({
        ...wordsById.get(row.word_id)!,
        status: row.status,
        isDue: true,
      }));
  }

  const remaining = BATCH_SIZE - due.length;
  let fresh: BatchWord[] = [];

  if (remaining > 0) {
    const { data: seenRows, error: seenError } = await supabase
      .from("user_words")
      .select("word_id")
      .eq("user_id", userId);

    if (seenError) throw seenError;

    const seenIds = (seenRows ?? []).map((row) => row.word_id);

    let query = supabase
      .from("words")
      .select("*")
      .order("band_level", { ascending: true })
      .order("word", { ascending: true })
      .limit(remaining);

    if (seenIds.length > 0) {
      query = query.not("id", "in", `(${seenIds.join(",")})`);
    }

    const { data: newWords, error: newError } = await query;
    if (newError) throw newError;

    fresh = (newWords ?? []).map((word) => ({
      ...word,
      status: "new" as WordStatus,
      isDue: false,
    }));
  }

  return [...due, ...fresh];
}
