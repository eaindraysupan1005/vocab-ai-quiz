"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

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

    const now = new Date().toISOString();

    const { error } = await supabase.from("user_words").upsert(
      {
        user_id: user.id,
        word_id: wordId,
        status: "learned",
        times_seen: (existing?.times_seen ?? 0) + 1,
        last_reviewed_at: now,
        learned_at: now,
        next_review_date: tomorrowIso(),
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
