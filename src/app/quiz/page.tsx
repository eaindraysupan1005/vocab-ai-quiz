import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isDailyBatchComplete } from "@/lib/daily-batch";
import {
  buildDailyQuizQuestions,
  buildWeeklyQuizQuestions,
  buildBandLevelQuestions,
  weeklyQuestionCount,
} from "@/lib/quiz-generation";
import { todayIso, weekStartIso } from "@/lib/quiz-dates";
import QuizPlayer from "@/components/QuizPlayer";
import BandLevelQuiz from "@/components/BandLevelQuiz";
import QuizTabs, { type QuizTab } from "@/components/QuizTabs";
import TopicCards, { countTopics } from "@/components/TopicCards";
import AppShell from "@/components/AppShell";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// The whole bank, minus the columns distractors never use — options are picked
// by topic/band/part-of-speech proximity, so narrowing the pool first would
// leave too few good matches to choose from.
function fetchDistractorPool(supabase: Supabase) {
  return supabase
    .from("words")
    .select("id, word, definition, band_level, topic, synonyms")
    .order("id", { ascending: true })
    .limit(5000);
}

// Where to resume a partly-finished quiz, and the score so far. Answers are
// matched by word, which works because a word is asked at most once per quiz.
//
// Already-answered questions are moved to the front and skipped rather than
// dropped, so the total stays honest ("Question 12 of 50"). They're reordered
// instead of assumed to be a prefix because the weekly quiz's word set grows
// as the week goes on: learning more words reshuffles the order, which would
// otherwise leave answered questions sitting after the resume point and get
// them asked twice.
function resumeState<T extends { wordId: string }>(
  questions: T[],
  answers: { word_id: string; is_correct: boolean | null }[],
) {
  const asked = new Set(questions.map((q) => q.wordId));
  const answeredIds = new Set<string>();
  let correctCount = 0;
  for (const answer of answers) {
    if (!asked.has(answer.word_id)) continue;
    answeredIds.add(answer.word_id);
    if (answer.is_correct) correctCount++;
  }

  const answered = questions.filter((q) => answeredIds.has(q.wordId));
  const remaining = questions.filter((q) => !answeredIds.has(q.wordId));

  return {
    questions: [...answered, ...remaining],
    startIndex: answered.length,
    correctCount,
  };
}

async function fetchAnswers(supabase: Supabase, quizId: string | undefined) {
  if (!quizId) return [];
  const { data } = await supabase
    .from("quiz_answers")
    .select("word_id, is_correct")
    .eq("quiz_id", quizId);
  return data ?? [];
}

// Today's quiz: 10 words from the batch pinned to today on the Daily Words
// page, all multiple choice. Seeded on (user, date) so it stays identical
// across reloads.
async function loadDailyQuiz(supabase: Supabase, userId: string) {
  const today = todayIso();

  const [{ data: batchRows }, { data: quiz }] = await Promise.all([
    supabase
      .from("user_words")
      .select("word_id, last_reviewed_at")
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
  if (batchIds.length === 0) return { questions: [], startIndex: 0, correctCount: 0 };

  const [{ data: batchWords }, { data: pool }] = await Promise.all([
    supabase.from("words").select("*").in("id", batchIds),
    fetchDistractorPool(supabase),
  ]);

  // `last_reviewed_at` is only ever set by answering a quiz question, so it
  // marks the batch words the quiz has already tested.
  const alreadyTested = new Set(
    (batchRows ?? []).filter((r) => r.last_reviewed_at != null).map((r) => r.word_id),
  );

  const questions = buildDailyQuizQuestions(
    batchWords ?? [],
    pool ?? [],
    `${userId}:${today}`,
    undefined,
    alreadyTested,
  );
  const answers = await fetchAnswers(supabase, quiz?.id);

  return resumeState(questions, answers);
}

// The weekly review: half of everything learned in the past 7 days, mixing
// multiple choice with AI-graded sentence production, worst-first.
async function loadWeeklyQuiz(supabase: Supabase, userId: string) {
  const weekStart = weekStartIso();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [{ data: learnedRows }, { data: quiz }] = await Promise.all([
    supabase
      .from("user_words")
      .select("word_id, times_wrong")
      .eq("user_id", userId)
      .not("learned_at", "is", null)
      .gte("learned_at", sevenDaysAgo.toISOString()),
    supabase
      .from("quizzes")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "weekly")
      .eq("quiz_date", weekStart)
      .maybeSingle(),
  ]);

  const rows = learnedRows ?? [];
  if (rows.length === 0) {
    return { questions: [], startIndex: 0, correctCount: 0, learnedCount: 0 };
  }

  const [{ data: words }, { data: pool }] = await Promise.all([
    supabase
      .from("words")
      .select("*")
      .in(
        "id",
        rows.map((r) => r.word_id),
      ),
    fetchDistractorPool(supabase),
  ]);

  const missesByWord = new Map(rows.map((r) => [r.word_id, r.times_wrong]));
  const learned = (words ?? []).map((w) => ({
    ...w,
    timesWrong: missesByWord.get(w.id) ?? 0,
  }));

  const questions = buildWeeklyQuizQuestions(
    learned,
    pool ?? [],
    `${userId}:weekly:${weekStart}`,
  );
  const answers = await fetchAnswers(supabase, quiz?.id);

  return { ...resumeState(questions, answers), learnedCount: learned.length };
}

// Demo practice quiz for a single topic: 10 multiple-choice questions drawn
// from that topic's words, not saved and not affecting the review schedule.
async function loadTopicQuiz(supabase: Supabase, topic: string) {
  const [{ data: topicWords }, { data: pool }] = await Promise.all([
    supabase.from("words").select("*").eq("topic", topic).limit(2000),
    fetchDistractorPool(supabase),
  ]);

  return buildDailyQuizQuestions(topicWords ?? [], pool ?? [], `topic:${topic}`, 10);
}

function Blurb({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-3xl">
      <p className="rounded-lg bg-secondary/20 px-4 py-2.5 text-sm text-text shadow-sm">
        {children}
      </p>
    </div>
  );
}

function isQuizTab(value: string | undefined): value is QuizTab {
  return value === "daily" || value === "weekly" || value === "topic" || value === "band";
}

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; topic?: string }>;
}) {
  const { tab, topic } = await searchParams;
  const activeTab: QuizTab = isQuizTab(tab) ? tab : "daily";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let dailyLocked = true;
  let daily: Awaited<ReturnType<typeof loadDailyQuiz>> | null = null;
  let weekly: Awaited<ReturnType<typeof loadWeeklyQuiz>> | null = null;
  let topics: [string, number][] = [];
  let topicQuestions: Awaited<ReturnType<typeof loadTopicQuiz>> = [];
  let bandQuestions: ReturnType<typeof buildBandLevelQuestions> = [];

  if (user) {
    dailyLocked = !(await isDailyBatchComplete(supabase, user.id));

    if (activeTab === "daily" && !dailyLocked) {
      daily = await loadDailyQuiz(supabase, user.id);
    }

    if (activeTab === "weekly") {
      weekly = await loadWeeklyQuiz(supabase, user.id);
    }

    if (activeTab === "topic") {
      if (topic) {
        topicQuestions = await loadTopicQuiz(supabase, topic);
      } else {
        const { data: rows } = await supabase.from("words").select("topic").limit(10000);
        topics = countTopics(rows ?? []);
      }
    }

    if (activeTab === "band") {
      const { data: bandPool } = await supabase.from("words").select("*").limit(60);
      bandQuestions = buildBandLevelQuestions(bandPool ?? [], 10);
    }
  }

  return (
    <AppShell title="Quiz" email={user?.email}>
      <QuizTabs active={activeTab} dailyLocked={dailyLocked} />

      {activeTab === "daily" && (
        <>
          <Blurb>
            10 multiple-choice questions on 10 words picked at random from today&apos;s batch:
            match a word to its definition, a definition to its word, or fill the blank in an
            example sentence.
          </Blurb>

          {dailyLocked ? (
            <div className="w-full max-w-3xl rounded-xl border border-text/10 bg-background p-6 text-center shadow-sm">
              <p className="text-lg font-semibold text-text">
                Finish today&apos;s words before you can take the daily quiz.
              </p>
              <p className="mt-1 text-text/70">
                Head to the Daily Words page and check off everything in today&apos;s batch first.
              </p>
              <Link
                href="/learn"
                className="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-[#0f1704] shadow-sm transition-opacity hover:opacity-90"
              >
                Go to Daily Words
              </Link>
            </div>
          ) : daily && daily.questions.length > 0 ? (
            <QuizPlayer
              questions={daily.questions}
              startIndex={daily.startIndex}
              initialCorrect={daily.correctCount}
              quizKind="daily"
              onFinishNote="Come back tomorrow for more."
            />
          ) : (
            <p className="mt-12 text-text/70">
              Learn some words on the Daily Words page first, then come back here to get quizzed
              on them.
            </p>
          )}
        </>
      )}

      {activeTab === "weekly" && (
        <>
          <Blurb>
            A review of everything you learned in the past 7 days — half as many questions as
            words learned{weekly && weekly.learnedCount > 0
              ? `, so ${weekly.learnedCount} words means ${weeklyQuestionCount(weekly.learnedCount)} questions`
              : ""}
            . Words you&apos;ve got wrong before come first, and every fourth question asks you to
            write a sentence, graded by AI.
          </Blurb>

          {weekly && weekly.questions.length > 0 ? (
            <QuizPlayer
              questions={weekly.questions}
              startIndex={weekly.startIndex}
              initialCorrect={weekly.correctCount}
              quizKind="weekly"
              onFinishNote="Your answers have updated the review schedule."
            />
          ) : (
            <p className="mt-12 text-text/70">
              Nothing to review yet — learn some words on the Daily Words page and this quiz will
              cover them at the end of the week.
            </p>
          )}
        </>
      )}

      {activeTab === "topic" &&
        (topic ? (
          <>
            <Blurb>
              Practice quiz on <span className="font-medium capitalize">{topic}</span> — a demo, so
              it isn&apos;t saved and doesn&apos;t affect your review schedule.
            </Blurb>

            <div className="w-full max-w-3xl">
              <Link
                href="/quiz?tab=topic"
                className="flex items-center gap-1.5 text-sm font-medium text-text/70 transition-colors hover:text-text"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                All topics
              </Link>
            </div>

            {topicQuestions.length > 0 ? (
              <QuizPlayer questions={topicQuestions} persist={false} />
            ) : (
              <p className="mt-12 text-text/70">No words in this topic yet.</p>
            )}
          </>
        ) : (
          <>
            <Blurb>
              Pick a topic to practise the words in it. These are demo quizzes — nothing is saved
              and your review schedule is untouched.
            </Blurb>

            <div className="w-full max-w-5xl">
              {topics.length === 0 ? (
                <p className="mt-12 text-text/70">No words in the word bank yet.</p>
              ) : (
                <TopicCards
                  topics={topics}
                  hrefPrefix="/quiz?tab=topic&topic="
                  countLabel={(count) => `${count} words · 10 questions`}
                />
              )}
            </div>
          </>
        ))}

      {activeTab === "band" && (
        <>
          <Blurb>
            A quick demo self-test spanning several band levels — unlike the daily quiz, it
            doesn&apos;t affect your review schedule and isn&apos;t saved.
          </Blurb>
          <BandLevelQuiz questions={bandQuestions} />
        </>
      )}
    </AppShell>
  );
}
