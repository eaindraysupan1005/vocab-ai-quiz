import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import TopicCards, { countTopics } from "@/components/TopicCards";

export default async function TopicsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = await supabase.from("words").select("topic").limit(10000);
  const topics = countTopics(rows ?? []);

  return (
    <AppShell title="Topics" email={user?.email}>
      <div className="w-full max-w-5xl">
        <p className="mb-6 rounded-lg bg-secondary/20 px-4 py-2.5 text-sm text-text shadow-sm">
          Browse the whole word bank by theme. Pick a topic to see every word in it.
        </p>

        {topics.length === 0 ? (
          <p className="mt-12 text-text/70">No words in the word bank yet.</p>
        ) : (
          <TopicCards topics={topics} hrefPrefix="/topics/" />
        )}
      </div>
    </AppShell>
  );
}
