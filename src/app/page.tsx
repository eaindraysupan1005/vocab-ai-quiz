import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ThemeToggle from "@/components/ThemeToggle";

const features = [
  {
    title: "Daily learning batches",
    description:
      "Each day you get a focused batch of ~15-20 words — new words plus anything due for review — with clear definitions and example sentences.",
  },
  {
    title: "AI-generated quizzes",
    description:
      "The next day, get quizzed specifically on what you learned: MCQ and fill-in-the-blank for new words, AI-graded sentence writing for words you've seen before.",
  },
  {
    title: "Spaced repetition",
    description:
      "Correct answers push a word further out; mistakes bring it back sooner — so review time goes where it's actually needed.",
  },
  {
    title: "Honest progress tracking",
    description:
      "Words learned this week, your accuracy trend, and an explicit weak-words list. No badges, no XP — just a plain, honest signal.",
  },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/learn");
  }

  return (
    <div className="flex flex-1 flex-col bg-background text-text">
      <header className="flex w-full items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <Image src="/Logo.png" alt="Vocably" width={28} height={28} className="rounded-full" />
          Vocably
        </span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className="text-sm font-medium hover:underline">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-[#0f1704]"
          >
            Sign up
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 py-16 text-center">
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
          Build IELTS vocabulary that actually{" "}
          <span className="text-primary">sticks</span>.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-text/70">
          Learn a daily batch of IELTS-relevant vocabulary, get quizzed on it the next day, and
          let spaced repetition decide what you review — all the way to band 8.0.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/signup"
            className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-[#0f1704]"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-text/10 px-6 py-3 text-sm font-medium hover:bg-text/5"
          >
            Log in
          </Link>
        </div>

        <div className="mt-20 grid w-full max-w-4xl gap-6 text-left sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-text/10 bg-background p-6"
            >
              <div className="mb-3 h-2 w-10 rounded-full bg-accent" />
              <h2 className="text-lg font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-text/70">{f.description}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
