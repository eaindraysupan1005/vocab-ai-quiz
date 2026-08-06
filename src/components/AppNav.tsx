import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

export default function AppNav() {
  return (
    <nav className="flex items-center gap-4 text-sm font-medium">
      <Link href="/learn" className="text-text hover:underline">
        Learn
      </Link>
      <Link href="/quiz" className="text-text hover:underline">
        Quiz
      </Link>
      <ThemeToggle />
    </nav>
  );
}
