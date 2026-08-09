import { createClient } from "@/lib/supabase/server";
import { isDailyBatchComplete } from "@/lib/daily-batch";
import { buildDailyQuizQuestions, buildBandLevelQuestions } from "@/lib/quiz-generation";
import QuizPlayer from "@/components/QuizPlayer";
import BandLevelQuiz from "@/components/BandLevelQuiz";
import QuizTabs from "@/components/QuizTabs";
import AppShell from "@/components/AppShell";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Builds today's quiz from the batch of words pinned to today on the Daily
// Words page: 10 of those words, every question multiple choice. The question
// set is seeded on (user, date) so it stays identical across reloads, and
// answers already recorded today decide where the user resumes.
async function loadDailyQuiz(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const today = todayIso();

  const [{ data: batchRows }, { data: quiz }] = await Promise.all([
    supabase
      .from("user_words")
      .select("word_id")
      .eq("user_id", userId)
      .eq("batch_date", today),
    supabase
      .from("quizzes")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "daily")
      .eq("quiz_date", today)
      .maybeSingle(),
  ]);

  const batchIds = (batchRows ?? []).map((r) => r.word_id);
  if (batchIds.length === 0) {
    return { questions: [], startIndex: 0, correctCount: 0 };
  }

  const [{ data: batchWords }, { data: distractorPool }] = await Promise.all([
    supabase.from("words").select("*").in("id", batchIds),
    // The whole bank, minus the columns distractors never use — options are
    // picked by topic/band/part-of-speech proximity, so narrowing the pool
    // first would leave too few good matches to choose from.
    supabase
      .from("words")
      .select("id, word, definition, band_level, topic, synonyms")
      .order("id", { ascending: true })
      .limit(5000),
  ]);

  const questions = buildDailyQuizQuestions(
    batchWords ?? [],
    distractorPool ?? [],
    `${userId}:${today}`,
  );

  const answeredWordIds = new Set<string>();
  let correctCount = 0;
  if (quiz) {
    const { data: answers } = await supabase
      .from("quiz_answers")
      .select("word_id, is_correct")
      .eq("quiz_id", quiz.id);

    const askedIds = new Set(questions.map((q) => q.wordId));
    for (const answer of answers ?? []) {
      if (!askedIds.has(answer.word_id)) continue;
      answeredWordIds.add(answer.word_id);
      if (answer.is_correct) correctCount++;
    }
  }

  const firstUnanswered = questions.findIndex((q) => !answeredWordIds.has(q.wordId));
  const startIndex = firstUnanswered === -1 ? questions.length : firstUnanswered;

  return { questions, startIndex, correctCount };
}

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "band" ? "band" : "daily";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let dailyLocked = true;
  let daily: Awaited<ReturnType<typeof loadDailyQuiz>> | null = null;
  let bandQuestions: ReturnType<typeof buildBandLevelQuestions> = [];

  if (user) {
    dailyLocked = !(await isDailyBatchComplete(supabase, user.id));

    if (activeTab === "daily" && !dailyLocked) {
      daily = await loadDailyQuiz(supabase, user.id);
    }

    if (activeTab === "band") {
      const { data: bandPool } = await supabase.from("words").select("*").limit(60);
      bandQuestions = buildBandLevelQuestions(bandPool ?? [], 10);
    }
  }

  return (
    <AppShell title="Quiz" email={user?.email}>
      <QuizTabs active={activeTab} dailyLocked={dailyLocked} />

      {activeTab === "daily" ? (
        <>
          <div className="w-full max-w-3xl">
            <p className="rounded-lg bg-secondary/20 px-4 py-2.5 text-sm text-text shadow-sm">
              10 multiple-choice questions on 10 words picked at random from today&apos;s batch:
              match a word to its definition, a definition to its word, or fill the blank in an
              example sentence.
            </p>
          </div>

          {dailyLocked ? (
            <div className="w-full max-w-3xl rounded-xl border border-text/10 bg-background p-6 text-center shadow-sm">
              <p className="text-lg font-semibold text-text">
                Finish today&apos;s words before you can take the daily quiz.
              </p>
              <p className="mt-1 text-text/70">
                Head to the Daily Words page and check off everything in today&apos;s batch first.
              </p>
              <a
                href="/learn"
                className="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-[#0f1704] shadow-sm transition-opacity hover:opacity-90"
              >
                Go to Daily Words
              </a>
            </div>
          ) : daily && daily.questions.length > 0 ? (
            <QuizPlayer
              questions={daily.questions}
              startIndex={daily.startIndex}
              initialCorrect={daily.correctCount}
            />
          ) : (
            <p className="mt-12 text-text/70">
              Learn some words on the Daily Words page first, then come back here to get quizzed
              on them.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="w-full max-w-3xl">
            <p className="rounded-lg bg-secondary/20 px-4 py-2.5 text-sm text-text shadow-sm">
              A quick demo self-test spanning several band levels — unlike the daily quiz, it
              doesn&apos;t affect your review schedule and isn&apos;t saved.
            </p>
          </div>
          <BandLevelQuiz questions={bandQuestions} />
        </>
      )}
    </AppShell>
  );
}
