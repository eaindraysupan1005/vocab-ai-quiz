import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-4 text-center dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Welcome, {user?.email}
      </h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        The daily learning page will live here next. For now, this just confirms you&apos;re
        signed in.
      </p>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-full border border-black/[.08] px-5 py-2.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
