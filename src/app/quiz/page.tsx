import { createClient } from "@/lib/supabase/server";
import { buildMockQuestions } from "@/lib/mock-quiz";
import QuizPlayer from "@/components/QuizPlayer";
import AppNav from "@/components/AppNav";
import { signOut } from "../actions";

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
    <div className="flex flex-1 flex-col items-center gap-6 bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <AppNav />
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{user?.email}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="w-full max-w-2xl">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Daily quiz</h1>
        <p className="mt-1 rounded bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          Preview only — questions use real words but aren&apos;t AI-generated or graded yet
          (that&apos;s roadmap step 7). Grading here is just local mock logic.
        </p>
      </div>

      {questions.length > 0 ? (
        <QuizPlayer questions={questions} />
      ) : (
        <p className="mt-12 text-zinc-600 dark:text-zinc-400">
          Not enough words in the bank yet to build a preview quiz.
        </p>
      )}
    </div>
  );
}
