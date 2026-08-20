"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { callGeminiJSON, buildSentenceGradingPrompt } from "@/lib/gemini";
import { MAX_SENTENCE_LENGTH } from "@/lib/quiz-limits";
import { claimSentenceGrade } from "@/lib/ai-usage";
import { nextReviewState } from "@/lib/spaced-repetition";
import { quizDateFor, type QuizKind } from "@/lib/quiz-dates";

// One quizzes row per user per day (daily), per week (weekly), or per topic.
//
// Daily and weekly upsert on the (user_id, quiz_date, type) unique index.
// Topic quizzes can't: their uniqueness comes from a *partial* index, which
// `ON CONFLICT` can't infer without repeating the predicate, so they're
// found-or-inserted instead — with the unique violation from a concurrent
// insert treated as "somebody else just made it", which is the answer we
// wanted anyway.
async function getOrCreateQuiz(
  supabase: SupabaseClient<Database>,
  userId: string,
  kind: QuizKind,
  topic?: string,
) {
  if (kind === "topic") {
    if (!topic) throw new Error("A topic quiz needs a topic.");

    const existing = await supabase
      .from("quizzes")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "topic")
      .eq("topic", topic)
      .maybeSingle();
    if (existing.data) return existing.data.id;

    const inserted = await supabase
      .from("quizzes")
      .insert({ user_id: userId, type: "topic", quiz_date: null, topic })
      .select("id")
      .single();
    if (inserted.data) return inserted.data.id;

    const raced = await supabase
      .from("quizzes")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "topic")
      .eq("topic", topic)
      .maybeSingle();
    if (raced.data) return raced.data.id;

    throw inserted.error ?? new Error("Could not create the topic quiz.");
  }

  const { data, error } = await supabase
    .from("quizzes")
    .upsert(
      { user_id: userId, type: kind, quiz_date: quizDateFor(kind), topic: null },
      { onConflict: "user_id,quiz_date,type" },
    )
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

// Answers change what /progress shows, so that path is revalidated.
//
// /quiz deliberately is not. The player keeps its own state and re-reads its
// place from quiz_answers on the next fresh load, so refreshing the page it is
// sitting on re-ran every query the quiz makes — including the ~2000-row
// distractor pool — once per answered question, 80 times over for a topic quiz.
function revalidateAfterAnswer() {
  revalidatePath("/progress");
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

// Topic quizzes are practice over a whole topic, most of which the learner has
// never been taught. Their answers are recorded so the quiz can be resumed,
// but they must not move the review schedule: doing so would mark hundreds of
// unstudied words as "learning" and flood the daily batch with them.
function affectsReviewSchedule(kind: QuizKind): boolean {
  return kind !== "topic";
}

export async function recordObjectiveAnswer(
  wordId: string,
  questionType: "mcq" | "fill_blank",
  userAnswer: string,
  isCorrect: boolean,
  kind: QuizKind = "daily",
  topic?: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const quizId = await getOrCreateQuiz(supabase, user.id, kind, topic);

  const { error } = await supabase.from("quiz_answers").insert({
    quiz_id: quizId,
    user_id: user.id,
    word_id: wordId,
    question_type: questionType,
    user_answer: userAnswer,
    is_correct: isCorrect,
  });
  if (error) throw error;

  if (affectsReviewSchedule(kind)) {
    await applyReviewOutcome(supabase, user.id, wordId, isCorrect);
  }
  revalidateAfterAnswer();
}

export async function gradeSentenceAnswer(
  wordId: string,
  sentence: string,
  kind: QuizKind = "weekly",
  // Set false to grade without recording anything at all. Distinct from a
  // topic quiz, which *is* recorded (so it can be resumed) but still leaves
  // the review schedule alone.
  persist = true,
  topic?: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Checked before anything is fetched or sent: the textarea is a free-text
  // field wired straight to a paid API, so an oversized submission is turned
  // away here rather than truncated and graded as if it were what they wrote.
  const trimmed = sentence.trim();
  if (trimmed.length === 0) {
    return { isCorrect: false, feedback: "Write a sentence first.", suggestion: "" };
  }
  if (trimmed.length > MAX_SENTENCE_LENGTH) {
    return {
      isCorrect: false,
      feedback: `That's too long to grade — keep it under ${MAX_SENTENCE_LENGTH} characters.`,
      suggestion: "",
    };
  }

  // Claimed after the cheap validation above so a blank or oversized
  // submission doesn't cost the learner a unit of their daily allowance, and
  // before the Gemini call so hitting the cap costs nothing at all.
  if (!(await claimSentenceGrade(supabase))) {
    return {
      isCorrect: false,
      feedback: "You've used up today's AI grading — the rest of the quiz still works.",
      suggestion: "",
    };
  }

  const { data: word, error: wordError } = await supabase
    .from("words")
    .select("word, definition")
    .eq("id", wordId)
    .single();
  if (wordError) throw wordError;

  const prompt = buildSentenceGradingPrompt(word.word, word.definition, trimmed);
  const result = (await callGeminiJSON(prompt)) as {
    is_correct?: unknown;
    feedback?: unknown;
    suggestion?: unknown;
  };
  const isCorrect = Boolean(result.is_correct);
  const feedback = typeof result.feedback === "string" ? result.feedback : "";
  // Gemini returns "" when the learner's sentence needs no rewrite; it also
  // sometimes echoes the sentence back verbatim, which is equally unhelpful.
  const rawSuggestion = typeof result.suggestion === "string" ? result.suggestion.trim() : "";
  const suggestion = rawSuggestion === trimmed ? "" : rawSuggestion;

  if (!persist) return { isCorrect, feedback, suggestion };

  const quizId = await getOrCreateQuiz(supabase, user.id, kind, topic);

  const { error } = await supabase.from("quiz_answers").insert({
    quiz_id: quizId,
    user_id: user.id,
    word_id: wordId,
    question_type: "sentence",
    user_answer: trimmed,
    is_correct: isCorrect,
    ai_feedback: feedback,
    ai_suggestion: suggestion || null,
  });
  if (error) throw error;

  if (affectsReviewSchedule(kind)) {
    await applyReviewOutcome(supabase, user.id, wordId, isCorrect);
  }
  revalidateAfterAnswer();

  return { isCorrect, feedback, suggestion };
}
