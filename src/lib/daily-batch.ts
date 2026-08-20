import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WordStatus } from "@/lib/supabase/database.types";
import { todayIso } from "@/lib/dates";

export const BATCH_SIZE = 20;

export type BatchWord = Database["public"]["Tables"]["words"]["Row"] & {
  status: WordStatus;
  isDue: boolean;
};

type AssignedRow = { word_id: string; status: WordStatus; created_at: string };

async function hydrateBatch(
  supabase: SupabaseClient<Database>,
  rows: AssignedRow[],
  today: string,
): Promise<BatchWord[]> {
  if (rows.length === 0) return [];

  const { data: words, error } = await supabase
    .from("words")
    .select("*")
    .in(
      "id",
      rows.map((r) => r.word_id),
    );
  if (error) throw error;

  const wordsById = new Map((words ?? []).map((word) => [word.id, word]));

  return rows
    .filter((r) => wordsById.has(r.word_id))
    .map((r) => ({
      ...wordsById.get(r.word_id)!,
      status: r.status,
      // A row created before today was already known (a review); one
      // created today is a brand-new word being introduced.
      isDue: r.created_at.slice(0, 10) < today,
    }));
}

// The batch of words a user sees on the Learn page is pinned for the whole
// calendar day via `batch_date`, so checking/unchecking words (which only
// changes `status` and `next_review_date`) never changes which words are
// shown until the next day.
export async function getDailyBatch(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<BatchWord[]> {
  const today = todayIso();

  const { data: assignedRows, error: assignedError } = await supabase
    .from("user_words")
    .select("word_id, status, created_at")
    .eq("user_id", userId)
    .eq("batch_date", today)
    .order("created_at", { ascending: true });
  if (assignedError) throw assignedError;

  if (assignedRows && assignedRows.length > 0) {
    return hydrateBatch(supabase, assignedRows, today);
  }

  // First visit today: assemble the batch (due reviews + new words) and pin
  // it with batch_date so it stays fixed for the rest of the day.
  const { data: dueRows, error: dueError } = await supabase
    .from("user_words")
    .select("word_id, status, created_at")
    .eq("user_id", userId)
    .lte("next_review_date", today)
    .order("next_review_date", { ascending: true })
    .limit(BATCH_SIZE);
  if (dueError) throw dueError;

  const due = dueRows ?? [];
  const remaining = BATCH_SIZE - due.length;

  let newWordIds: string[] = [];
  if (remaining > 0) {
    // Done in Postgres (see `unseen_words` in supabase/schema.sql) rather than
    // by fetching every word the user has seen and excluding those ids here.
    // That list went into the query string, so it outgrew PostgREST's URL
    // limit at a few hundred learned words — and the fetch itself was capped
    // at 1000 rows, so past that the user would start being re-shown words
    // they had already learned.
    const { data: newWords, error: newError } = await supabase.rpc("unseen_words", {
      p_limit: remaining,
    });
    if (newError) throw newError;

    newWordIds = (newWords ?? []).map((word) => word.id);
  }

  if (due.length > 0) {
    const { error } = await supabase
      .from("user_words")
      .update({ batch_date: today })
      .eq("user_id", userId)
      .in(
        "word_id",
        due.map((r) => r.word_id),
      );
    if (error) throw error;
  }

  if (newWordIds.length > 0) {
    const { error } = await supabase.from("user_words").insert(
      newWordIds.map((wordId) => ({
        user_id: userId,
        word_id: wordId,
        status: "new" as WordStatus,
        batch_date: today,
      })),
    );
    if (error) throw error;
  }

  const assigned: AssignedRow[] = [
    ...due,
    ...newWordIds.map((wordId) => ({
      word_id: wordId,
      status: "new" as WordStatus,
      created_at: today,
    })),
  ];

  return hydrateBatch(supabase, assigned, today);
}

// Whether the user has checked off every word in today's pinned batch. Used
// to gate the daily quiz — you must finish learning today's words before you
// can be quizzed on them. Returns false if today's batch hasn't been assigned
// yet (i.e. the user hasn't visited Learn today).
//
// "Checked off" is `status != 'new'`, not `status == 'learned'`. A word the
// user gets wrong in the quiz drops to `'learning'` while still sitting in
// today's batch, so requiring 'learned' re-locked the quiz on the first wrong
// answer — unmounting the player mid-quiz and sending the learner back to
// Daily Words. Only `'new'` means "never checked off", which is what the gate
// is actually asking about.
export async function isDailyBatchComplete(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const today = todayIso();

  const { data, error } = await supabase
    .from("user_words")
    .select("status")
    .eq("user_id", userId)
    .eq("batch_date", today);
  if (error) throw error;

  if (!data || data.length === 0) return false;
  return data.every((row) => row.status !== "new");
}
