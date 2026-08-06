import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <div className="flex flex-1 flex-col bg-background text-text">
      <header className="flex items-center justify-between px-6 py-5">
        <Link href="/" className="text-lg font-semibold">
          Vocably
        </Link>
        <ThemeToggle />
      </header>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm rounded-lg border border-text/10 bg-background p-8">
          <div className="mb-2 h-2 w-10 rounded-full bg-accent" />
          <h1 className="text-2xl font-semibold">Log in</h1>

          {message && (
            <p className="mt-4 rounded bg-secondary/20 px-3 py-2 text-sm text-text">{message}</p>
          )}
          {error && (
            <p className="mt-4 rounded bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <form action={login} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm text-text/70">
              Email
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                className="rounded border border-text/10 bg-background px-3 py-2 text-text outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text/70">
              Password
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="rounded border border-text/10 bg-background px-3 py-2 text-text outline-none focus:border-primary"
              />
            </label>
            <button
              type="submit"
              className="mt-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-[#0f1704] transition-opacity hover:opacity-90"
            >
              Log in
            </button>
          </form>

          <p className="mt-6 text-sm text-text/70">
            No account?{" "}
            <Link href="/signup" className="font-medium text-text hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
