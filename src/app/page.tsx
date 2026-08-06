import { createClient } from "@/lib/supabase/server";
import { getDailyBatch } from "@/lib/daily-batch";
import DailyBatch from "@/components/DailyBatch";
import { signOut } from "./actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const words = user ? await getDailyBatch(supabase, user.id) : [];

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          Today&apos;s words — {user?.email}
        </h1>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Sign out
          </button>
        </form>
      </div>

      {words.length > 0 ? (
        <DailyBatch words={words} />
      ) : (
        <p className="mt-12 text-zinc-600 dark:text-zinc-400">
          Nothing due today — you&apos;re all caught up.
        </p>
      )}
    </div>
  );
}
