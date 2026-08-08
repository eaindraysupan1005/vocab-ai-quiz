import { createClient } from "@/lib/supabase/server";
import { buildMockQuestions } from "@/lib/mock-quiz";
import QuizPlayer from "@/components/QuizPlayer";
import AppShell from "@/components/AppShell";

export default async function QuizPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pull a larger pool and filter out messy entries (parentheticals, slash
  // alternatives, leading articles) before picking a random 6 for the mock
  // quiz — keeps the preview readable. Real quiz generation (step 7) will
  // pick words based on what the user actually learned, not randomly.
  const { data: pool } = await supabase
    .from("words")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(150);

  const clean = (pool ?? []).filter(
    (w) => !/[(/]/.test(w.word) && !/^(a|an|the)\s/i.test(w.word),
  );
  const words = [...clean].sort(() => Math.random() - 0.5).slice(0, 6);

  const questions = buildMockQuestions(words);

  return (
    <AppShell title="Daily quiz" email={user?.email}>
      <div className="w-full max-w-3xl">
        <p className="rounded-lg bg-secondary/20 px-4 py-2.5 text-sm text-text shadow-sm">
          Preview only — questions use real words but aren&apos;t AI-generated or graded yet
          (that&apos;s roadmap step 7). Grading here is just local mock logic.
        </p>
      </div>

      {questions.length > 0 ? (
        <QuizPlayer questions={questions} />
      ) : (
        <p className="mt-12 text-text/70">
          Not enough words in the bank yet to build a preview quiz.
        </p>
      )}
    </AppShell>
  );
}
