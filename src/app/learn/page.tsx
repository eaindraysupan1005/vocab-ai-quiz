import { createClient } from "@/lib/supabase/server";
import { getDailyBatch } from "@/lib/daily-batch";
import DailyBatch from "@/components/DailyBatch";
import AppShell from "@/components/AppShell";

export default async function LearnPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const words = user ? await getDailyBatch(supabase, user.id) : [];

  return (
    <AppShell title="Today's words" email={user?.email}>
      {words.length > 0 ? (
        <DailyBatch words={words} />
      ) : (
        <p className="mt-12 text-text/70">Nothing due today — you&apos;re all caught up.</p>
      )}
    </AppShell>
  );
}
