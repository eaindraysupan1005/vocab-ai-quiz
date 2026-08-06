import Link from "next/link";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-lg border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-black">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Log in</h1>

        {message && (
          <p className="mt-4 rounded bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <form action={login} className="mt-6 flex flex-col gap-4">
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
              autoComplete="current-password"
              className="rounded border border-black/[.08] bg-white px-3 py-2 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Log in
          </button>
        </form>

        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          No account?{" "}
          <Link href="/signup" className="font-medium text-zinc-950 dark:text-zinc-50">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
