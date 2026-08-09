"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { firstReviewState } from "@/lib/spaced-repetition";

export async function toggleWordLearned(wordId: string, learned: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  if (learned) {
    const { data: existing } = await supabase
      .from("user_words")
      .select("times_seen")
      .eq("user_id", user.id)
      .eq("word_id", wordId)
      .maybeSingle();

    const { status, next_review_date } = firstReviewState();

    const { error } = await supabase.from("user_words").upsert(
      {
        user_id: user.id,
        word_id: wordId,
        status,
        times_seen: (existing?.times_seen ?? 0) + 1,
        // `last_reviewed_at` deliberately isn't touched here: checking a word
        // off is learning it, not recalling it. Leaving it to quiz answers
        // alone is what lets the daily quiz tell which of the day's words it
        // has already tested.
        learned_at: new Date().toISOString(),
        next_review_date,
      },
      { onConflict: "user_id,word_id" },
    );

    if (error) throw error;
  } else {
    // Reset to "not learned" without deleting the row — deleting it would
    // drop it out of today's pinned batch (batch_date) and let it get
    // reshuffled as a "new" word on the next visit.
    const { error } = await supabase
      .from("user_words")
      .update({
        status: "new",
        learned_at: null,
        next_review_date: null,
      })
      .eq("user_id", user.id)
      .eq("word_id", wordId);

    if (error) throw error;
  }

  revalidatePath("/learn");
}
