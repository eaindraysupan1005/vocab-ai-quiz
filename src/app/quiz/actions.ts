"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { callGeminiJSON, buildSentenceGradingPrompt } from "@/lib/gemini";
import { nextReviewState } from "@/lib/spaced-repetition";
import { quizDateFor, type QuizKind } from "@/lib/quiz-dates";

// One quizzes row per user per day (daily) or per week (weekly). Requires the
// unique index in supabase/schema.sql (user_id, quiz_date, type) for the
// upsert to work.
async function getOrCreateQuiz(
  supabase: SupabaseClient<Database>,
  userId: string,
  kind: QuizKind,
) {
  const { data, error } = await supabase
    .from("quizzes")
    .upsert(
      { user_id: userId, type: kind, quiz_date: quizDateFor(kind) },
      { onConflict: "user_id,quiz_date,type" },
    )
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function applyReviewOutcome(
  supabase: SupabaseClient<Database>,
  userId: string,
  wordId: string,
  correct: boolean,
) {
  const { data: existing } = await supabase
    .from("user_words")
    .select("times_seen, times_correct, times_wrong")
    .eq("user_id", userId)
    .eq("word_id", wordId)
    .maybeSingle();

  const { status, next_review_date } = nextReviewState(
    correct,
    existing?.times_correct ?? 0,
    existing?.times_wrong ?? 0,
  );

  const { error } = await supabase.from("user_words").upsert(
    {
      user_id: userId,
      word_id: wordId,
      status,
      times_seen: (existing?.times_seen ?? 0) + 1,
      times_correct: (existing?.times_correct ?? 0) + (correct ? 1 : 0),
      times_wrong: (existing?.times_wrong ?? 0) + (correct ? 0 : 1),
      last_reviewed_at: new Date().toISOString(),
      next_review_date,
    },
    { onConflict: "user_id,word_id" },
  );

  if (error) throw error;
}

export async function recordObjectiveAnswer(
  wordId: string,
  questionType: "mcq" | "fill_blank",
  userAnswer: string,
  isCorrect: boolean,
  kind: QuizKind = "daily",
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const quizId = await getOrCreateQuiz(supabase, user.id, kind);

  const { error } = await supabase.from("quiz_answers").insert({
    quiz_id: quizId,
    user_id: user.id,
    word_id: wordId,
    question_type: questionType,
    user_answer: userAnswer,
    is_correct: isCorrect,
  });
  if (error) throw error;

  await applyReviewOutcome(supabase, user.id, wordId, isCorrect);
  revalidatePath("/quiz");
}

export async function gradeSentenceAnswer(
  wordId: string,
  sentence: string,
  kind: QuizKind = "weekly",
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: word, error: wordError } = await supabase
    .from("words")
    .select("word, definition")
    .eq("id", wordId)
    .single();
  if (wordError) throw wordError;

  const prompt = buildSentenceGradingPrompt(word.word, word.definition, sentence);
  const result = (await callGeminiJSON(prompt)) as { is_correct?: unknown; feedback?: unknown };
  const isCorrect = Boolean(result.is_correct);
  const feedback = typeof result.feedback === "string" ? result.feedback : "";

  const quizId = await getOrCreateQuiz(supabase, user.id, kind);

  const { error } = await supabase.from("quiz_answers").insert({
    quiz_id: quizId,
    user_id: user.id,
    word_id: wordId,
    question_type: "sentence",
    user_answer: sentence,
    is_correct: isCorrect,
    ai_feedback: feedback,
  });
  if (error) throw error;

  await applyReviewOutcome(supabase, user.id, wordId, isCorrect);
  revalidatePath("/quiz");

  return { isCorrect, feedback };
}
