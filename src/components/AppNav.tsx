import Link from "next/link";

export default function AppNav() {
  return (
    <nav className="flex items-center gap-4 text-sm font-medium">
      <Link href="/" className="text-black hover:underline dark:text-zinc-50">
        Learn
      </Link>
      <Link href="/quiz" className="text-black hover:underline dark:text-zinc-50">
        Quiz
      </Link>
    </nav>
  );
}
