import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";

const TOPIC_STYLES: Record<string, string> = {
  environment: "bg-primary/15 text-primary",
  education: "bg-accent/15 text-accent",
  technology: "bg-accent/15 text-accent",
  health: "bg-primary/15 text-primary",
  economy: "bg-secondary/25 text-text",
  society: "bg-secondary/25 text-text",
  culture: "bg-accent/15 text-accent",
  crime: "bg-primary/15 text-primary",
  government: "bg-secondary/25 text-text",
};
const DEFAULT_TOPIC_STYLE = "bg-accent/15 text-accent";

export default async function TopicsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = await supabase.from("words").select("topic").limit(10000);

  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    if (!row.topic) continue;
    counts.set(row.topic, (counts.get(row.topic) ?? 0) + 1);
  }

  const topics = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <AppShell title="Topics" email={user?.email}>
      <div className="w-full max-w-5xl">
        <p className="mb-6 rounded-lg bg-secondary/20 px-4 py-2.5 text-sm text-text shadow-sm">
          Browse the whole word bank by theme. Pick a topic to see every word in it.
        </p>

        {topics.length === 0 ? (
          <p className="mt-12 text-text/70">No words in the word bank yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map(([topic, count]) => (
              <li key={topic}>
                <Link
                  href={`/topics/${encodeURIComponent(topic)}`}
                  className="flex h-full flex-col gap-3 rounded-xl border border-text/10 bg-background p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span
                    className={`self-start rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      TOPIC_STYLES[topic] ?? DEFAULT_TOPIC_STYLE
                    }`}
                  >
                    {topic}
                  </span>
                  <span className="text-lg font-semibold capitalize text-text">{topic}</span>
                  <span className="mt-auto text-sm text-text/60">
                    {count} {count === 1 ? "word" : "words"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
