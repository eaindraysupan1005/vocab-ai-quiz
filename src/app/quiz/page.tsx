import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isDailyBatchComplete } from "@/lib/daily-batch";
import {
  buildDailyQuizQuestions,
  buildWeeklyQuizQuestions,
  buildBandLevelQuestions,
  buildTopicQuizQuestions,
  planTopicQuiz,
  aiMcqTargets,
  weeklyQuestionCount,
  topicQuestionCount,
  topicAiCount,
  TOPIC_MAX_QUESTIONS,
} from "@/lib/quiz-generation";
import { fetchDistractorPool } from "@/lib/distractor-pool";
import { ensureAiQuestions } from "@/lib/ai-questions";
import { todayIso, weekStartIso } from "@/lib/quiz-dates";
import QuizPlayer, { type AnswerLog } from "@/components/QuizPlayer";
import BandLevelQuiz from "@/components/BandLevelQuiz";
import QuizTabs, { type QuizTab } from "@/components/QuizTabs";
import TopicCards from "@/components/TopicCards";
import { fetchTopicCounts } from "@/lib/topics";
import AppShell from "@/components/AppShell";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// PostgREST caps a response at 1000 rows regardless of `.limit()`, so a query
// that has to see a whole topic asks for a page at a time.
const PAGE_SIZE = 1000;

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
  answers: StoredAnswer[],
) {
  const asked = new Set(questions.map((q) => q.wordId));
  const answeredIds = new Set<string>();
  // What the user actually picked, so the completed card can replay the quiz
  // question by question instead of just showing a score.
  const initialAnswers: AnswerLog = {};
  let correctCount = 0;
  for (const answer of answers) {
    if (!asked.has(answer.word_id)) continue;
    answeredIds.add(answer.word_id);
    if (answer.is_correct) correctCount++;
    initialAnswers[answer.word_id] = {
      userAnswer: answer.user_answer ?? "",
      isCorrect: Boolean(answer.is_correct),
      feedback: answer.ai_feedback ?? undefined,
      suggestion: answer.ai_suggestion ?? undefined,
    };
  }

  const answered = questions.filter((q) => answeredIds.has(q.wordId));
  const remaining = questions.filter((q) => !answeredIds.has(q.wordId));

  return {
    questions: [...answered, ...remaining],
    startIndex: answered.length,
    correctCount,
    initialAnswers,
  };
}

type StoredAnswer = {
  word_id: string;
  is_correct: boolean | null;
  user_answer: string | null;
  ai_feedback: string | null;
  ai_suggestion: string | null;
};

async function fetchAnswers(supabase: Supabase, quizId: string | undefined) {
  if (!quizId) return [];
  const { data } = await supabase
    .from("quiz_answers")
    .select("word_id, is_correct, user_answer, ai_feedback, ai_suggestion")
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
  if (batchIds.length === 0) {
    return { questions: [], startIndex: 0, correctCount: 0, initialAnswers: {} as AnswerLog };
  }

  const [{ data: batchWords }, pool] = await Promise.all([
    supabase.from("words").select("*").in("id", batchIds),
    fetchDistractorPool(),
  ]);

  // `last_reviewed_at` is only ever set by answering a quiz question, so it
  // marks the batch words the quiz has already tested. Words tested *today*
  // are excluded: demoting them mid-quiz would swap them out of the draw for
  // fresh ones on every reload, so the day's 10 would never stay put and the
  // quiz could never read as complete. They get demoted from tomorrow on.
  const alreadyTested = new Set(
    (batchRows ?? [])
      .filter((r) => r.last_reviewed_at != null && !r.last_reviewed_at.startsWith(today))
      .map((r) => r.word_id),
  );

  const questions = buildDailyQuizQuestions(
    batchWords ?? [],
    pool,
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
    return {
      questions: [],
      startIndex: 0,
      correctCount: 0,
      learnedCount: 0,
      initialAnswers: {} as AnswerLog,
    };
  }

  const [{ data: words }, pool] = await Promise.all([
    supabase
      .from("words")
      .select("*")
      .in(
        "id",
        rows.map((r) => r.word_id),
      ),
    fetchDistractorPool(),
  ]);

  const missesByWord = new Map(rows.map((r) => [r.word_id, r.times_wrong]));
  const learned = (words ?? []).map((w) => ({
    ...w,
    timesWrong: missesByWord.get(w.id) ?? 0,
  }));

  const questions = buildWeeklyQuizQuestions(
    learned,
    pool,
    `${userId}:weekly:${weekStart}`,
  );
  const answers = await fetchAnswers(supabase, quiz?.id);

  return { ...resumeState(questions, answers), learnedCount: learned.length };
}

// Practice quiz for a single topic: four fifths of the topic's words, 60% of
// the questions from Gemini (AI-written multiple choice + AI-graded sentence
// production). Graded but not saved, and it doesn't affect the review schedule.
//
// The AI multiple choice is generated here rather than at answer time because
// the question has to exist before it can be shown. `ensureAiQuestions` serves
// the cache when it's warm, so only the first visit to a topic pays for it.
async function loadTopicQuiz(supabase: Supabase, userId: string, topic: string) {
  const [{ data: topicWords }, pool, { data: quiz }] = await Promise.all([
    supabase.from("words").select("*").eq("topic", topic).limit(PAGE_SIZE),
    fetchDistractorPool(),
    supabase
      .from("quizzes")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "topic")
      .eq("topic", topic)
      .maybeSingle(),
  ]);

  const seed = `topic:${topic}`;
  const plan = planTopicQuiz(topicWords ?? [], seed);
  const aiQuestions = await ensureAiQuestions(supabase, aiMcqTargets(plan));
  const questions = buildTopicQuizQuestions(plan, pool, seed, aiQuestions);
  const answers = await fetchAnswers(supabase, quiz?.id);

  return resumeState(questions, answers);
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
  let topicQuiz: Awaited<ReturnType<typeof loadTopicQuiz>> | null = null;
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
        topicQuiz = await loadTopicQuiz(supabase, user.id, topic);
      } else {
        topics = await fetchTopicCounts(supabase);
      }
    }

    if (activeTab === "band") {
      // A stratified sample from the database, not the first 60 rows it
      // happened to return — the test is meaningless unless the words are
      // spread across the bands it claims to measure.
      const { data: bandPool } = await supabase.rpc("band_sample", { p_per_band: 8 });
      bandQuestions = buildBandLevelQuestions(bandPool ?? []);
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
              initialAnswers={daily.initialAnswers}
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
              initialAnswers={weekly.initialAnswers}
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
              Practice quiz on <span className="font-medium capitalize">{topic}</span> —{" "}
              {topicQuiz?.questions.length ?? 0} questions drawn from the topic&apos;s words.{" "}
              {topicAiCount(topicQuiz?.questions.length ?? 0)} of them come from AI: half ask you to
              spot the sentence that uses the word correctly, half ask you to write a sentence of
              your own for AI grading. Your place is saved as you go, so you can stop and come back
              — but this is practice, so it doesn&apos;t affect your review schedule.
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

            {topicQuiz && topicQuiz.questions.length > 0 ? (
              <QuizPlayer
                questions={topicQuiz.questions}
                startIndex={topicQuiz.startIndex}
                initialCorrect={topicQuiz.correctCount}
                initialAnswers={topicQuiz.initialAnswers}
                quizKind="topic"
                quizTopic={topic}
                onFinishNote="Practice only — your review schedule is unchanged."
              />
            ) : (
              <p className="mt-12 text-text/70">No words in this topic yet.</p>
            )}
          </>
        ) : (
          <>
            <Blurb>
              Pick a topic to practise the words in it. Each quiz is up to {TOPIC_MAX_QUESTIONS}{" "}
              questions drawn from that topic, and 60% of them are AI — half AI-written multiple
              choice, half sentences you write for AI grading. Your place is saved as you go;
              they&apos;re practice, so your review schedule is untouched.
            </Blurb>

            <div className="w-full max-w-5xl">
              {topics.length === 0 ? (
                <p className="mt-12 text-text/70">No words in the word bank yet.</p>
              ) : (
                <TopicCards
                  topics={topics}
                  hrefPrefix="/quiz?tab=topic&topic="
                  countLabel={(count) => `${count} words · ${topicQuestionCount(count)} questions`}
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
