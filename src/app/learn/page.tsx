import { createClient } from "@/lib/supabase/server";
import { getDailyBatch } from "@/lib/daily-batch";
import DailyBatch from "@/components/DailyBatch";
import AppNav from "@/components/AppNav";
import { signOut } from "../actions";

export default async function LearnPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const words = user ? await getDailyBatch(supabase, user.id) : [];

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-background px-4 py-10">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <AppNav />
        <div className="flex items-center gap-3">
          <span className="text-sm text-text/70">{user?.email}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full border border-text/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-text/5"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      <h1 className="w-full max-w-2xl text-xl font-semibold text-text">Today&apos;s words</h1>

      {words.length > 0 ? (
        <DailyBatch words={words} />
      ) : (
        <p className="mt-12 text-text/70">Nothing due today — you&apos;re all caught up.</p>
      )}
    </div>
  );
}
