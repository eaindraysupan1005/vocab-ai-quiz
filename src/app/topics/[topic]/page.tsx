import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";

export default async function TopicWordsPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic: rawTopic } = await params;
  const topic = decodeURIComponent(rawTopic);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: words } = await supabase
    .from("words")
    .select("*")
    .eq("topic", topic)
    .order("word", { ascending: true })
    .limit(2000);

  if (!words || words.length === 0) notFound();

  return (
    <AppShell title={`Topic: ${topic}`} email={user?.email}>
      <div className="w-full max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link
            href="/topics"
            className="flex items-center gap-1.5 text-sm font-medium text-text/70 transition-colors hover:text-text"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            All topics
          </Link>
          <span className="text-sm text-text/60">
            {words.length} {words.length === 1 ? "word" : "words"}
          </span>
        </div>

        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {words.map((word) => (
            <li
              key={word.id}
              className="flex flex-col gap-3 rounded-xl border border-text/10 bg-background p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold text-text">{word.word}</span>
                {word.band_level != null && (
                  <span className="rounded-full bg-secondary/25 px-2 py-0.5 text-xs font-medium text-text/80">
                    band {word.band_level}
                  </span>
                )}
              </div>

              <p className="text-sm text-primary">{word.definition}</p>

              {word.synonyms.length > 0 && (
                <p className="text-xs text-blue-900 dark:text-blue-300">
                  Synonyms: {word.synonyms.join(", ")}
                </p>
              )}

              {word.example_sentence && (
                <p className="mt-auto text-sm italic text-text">
                  &ldquo;{word.example_sentence}&rdquo;
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
