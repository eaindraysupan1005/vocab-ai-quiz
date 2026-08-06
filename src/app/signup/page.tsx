import Link from "next/link";
import { signup } from "./actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-lg border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-black">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Sign up</h1>

        {error && (
          <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <form action={signup} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Email
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="rounded border border-black/[.08] bg-white px-3 py-2 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Password
            <input
              type="password"
              name="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="rounded border border-black/[.08] bg-white px-3 py-2 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Sign up
          </button>
        </form>

        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-zinc-950 dark:text-zinc-50">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
