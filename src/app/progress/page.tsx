import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BATCH_SIZE } from "@/lib/daily-batch";
import { weekStartIso } from "@/lib/quiz-dates";
import AppShell from "@/components/AppShell";

// One full batch a day, every day of the week.
const WEEKLY_GOAL = BATCH_SIZE * 7;
const TREND_DAYS = 7;

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function lastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(isoDay(d));
  }
  return days;
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-text/10 bg-background p-5 shadow-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-text/50">{label}</span>
      <span className="text-2xl font-semibold text-text">{value}</span>
      {detail && <span className="text-sm text-text/60">{detail}</span>}
    </div>
  );
}

export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Progress" email={null}>
        <p className="mt-12 text-text/70">Sign in to see your progress.</p>
      </AppShell>
    );
  }

  const weekStart = weekStartIso();
  const trendStart = new Date();
  trendStart.setDate(trendStart.getDate() - (TREND_DAYS - 1));
  trendStart.setHours(0, 0, 0, 0);

  const [
    { count: learnedThisWeek },
    { count: learnedTotal },
    { data: recentAnswers },
    { data: weakRows },
  ] = await Promise.all([
    supabase
      .from("user_words")
      .select("word_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("learned_at", `${weekStart}T00:00:00.000Z`),
    supabase
      .from("user_words")
      .select("word_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("learned_at", "is", null),
    supabase
      .from("quiz_answers")
      .select("created_at, is_correct")
      .eq("user_id", user.id)
      .gte("created_at", trendStart.toISOString()),
    supabase
      .from("user_words")
      .select("word_id, times_correct, times_wrong")
      .eq("user_id", user.id)
      .gt("times_wrong", 0)
      .order("times_wrong", { ascending: false })
      .limit(20),
  ]);

  // Accuracy per day for the trend, rather than a lifetime average that can
  // never move once enough answers pile up.
  const perDay = new Map<string, { correct: number; total: number }>();
  for (const answer of recentAnswers ?? []) {
    const day = answer.created_at.slice(0, 10);
    const entry = perDay.get(day) ?? { correct: 0, total: 0 };
    entry.total++;
    if (answer.is_correct) entry.correct++;
    perDay.set(day, entry);
  }

  const trend = lastNDays(TREND_DAYS).map((day) => {
    const entry = perDay.get(day);
    return {
      day,
      total: entry?.total ?? 0,
      accuracy: entry && entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : null,
    };
  });

  const answered = trend.reduce((sum, d) => sum + d.total, 0);
  const weekCorrect = (recentAnswers ?? []).filter((a) => a.is_correct).length;
  const weekAccuracy = answered > 0 ? Math.round((weekCorrect / answered) * 100) : null;

  // Weak words are ranked by misses, then by how poorly they've gone overall.
  const weak = (weakRows ?? []).slice();
  let weakWords: { word: string; definition: string; correct: number; wrong: number }[] = [];
  if (weak.length > 0) {
    const { data: words } = await supabase
      .from("words")
      .select("id, word, definition")
      .in(
        "id",
        weak.map((w) => w.word_id),
      );
    const byId = new Map((words ?? []).map((w) => [w.id, w]));
    weakWords = weak
      .filter((row) => byId.has(row.word_id))
      .map((row) => ({
        word: byId.get(row.word_id)!.word,
        definition: byId.get(row.word_id)!.definition,
        correct: row.times_correct,
        wrong: row.times_wrong,
      }));
  }

  const weekProgress = Math.min(100, Math.round(((learnedThisWeek ?? 0) / WEEKLY_GOAL) * 100));

  return (
    <AppShell title="Progress" email={user.email}>
      <div className="flex w-full max-w-5xl flex-col gap-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <StatCard
            label="Learned this week"
            value={`${learnedThisWeek ?? 0} / ${WEEKLY_GOAL}`}
            detail={`${weekProgress}% of a full week of batches`}
          />
          <StatCard
            label="Learned in total"
            value={`${learnedTotal ?? 0}`}
            detail="words checked off all time"
          />
          <StatCard
            label="Accuracy, last 7 days"
            value={weekAccuracy != null ? `${weekAccuracy}%` : "—"}
            detail={
              answered > 0 ? `${weekCorrect} of ${answered} answers correct` : "no answers yet"
            }
          />
        </div>

        <div className="rounded-xl border border-text/10 bg-background p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-text">Accuracy per day, last 7 days</h2>
          <p className="mt-1 text-sm text-text/60">
            Each bar is one day&apos;s quiz answers. Days you didn&apos;t answer anything show a
            flat marker — they aren&apos;t counted as 0%.
          </p>

          <div className="mt-6">
            {/* pt-6 leaves room for the value label above a 100% bar; pl-11 is
                the axis-tick gutter. Both the gridlines and the bars measure
                from the same band inside that padding, so ticks line up with
                bar heights. */}
            <div className="relative h-36 pl-11 pt-6">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 top-6">
                {[100, 50, 0].map((tick) => (
                  <div
                    key={tick}
                    className="absolute inset-x-0 flex items-center"
                    style={{ top: `${100 - tick}%` }}
                  >
                    <span className="w-11 shrink-0 pr-2 text-right text-xs tabular-nums text-text/50">
                      {tick}%
                    </span>
                    {/* Hairline gridline, solid, one step off the surface. */}
                    <span
                      className={`flex-1 border-t ${tick === 0 ? "border-text/20" : "border-text/10"}`}
                    />
                  </div>
                ))}
              </div>

              <div className="relative flex h-full items-end gap-2">
                {trend.map((d) => (
                  <div
                    key={d.day}
                    className="relative flex h-full flex-1 flex-col justify-end"
                    title={
                      d.accuracy != null
                        ? `${d.day}: ${d.accuracy}% over ${d.total} ${d.total === 1 ? "answer" : "answers"}`
                        : `${d.day}: no answers`
                    }
                  >
                    {d.accuracy != null && (
                      <span
                        className="absolute inset-x-0 text-center text-xs font-medium tabular-nums text-text/70"
                        style={{ bottom: `calc(${d.accuracy}% + 4px)` }}
                      >
                        {d.accuracy}%
                      </span>
                    )}

                    {d.accuracy != null ? (
                      <div
                        className="mx-auto w-full max-w-6 rounded-t bg-chart-bar"
                        style={{ height: `${d.accuracy}%` }}
                      />
                    ) : (
                      <div className="mx-auto h-0.5 w-full max-w-6 rounded-sm bg-text/20" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-2 flex gap-2 pl-11">
              {trend.map((d) => (
                <span key={d.day} className="flex-1 text-center text-xs tabular-nums text-text/50">
                  {d.day.slice(5)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-text/10 bg-background p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-text">Weak words</h2>
          <p className="mt-1 text-sm text-text/60">
            Words you&apos;ve got wrong at least once, most-missed first. These are the ones the
            weekly review asks about before anything else.
          </p>

          {weakWords.length === 0 ? (
            <p className="mt-5 text-sm text-text/70">
              Nothing here yet — either you haven&apos;t been quizzed, or you haven&apos;t missed a
              word. <Link href="/quiz" className="text-primary underline">Take a quiz</Link>.
            </p>
          ) : (
            <ul className="mt-5 flex flex-col divide-y divide-text/10">
              {weakWords.map((w) => (
                <li key={w.word} className="flex items-baseline gap-4 py-3">
                  <span className="w-40 shrink-0 font-medium text-text">{w.word}</span>
                  <span className="flex-1 text-sm text-text/70">{w.definition}</span>
                  <span className="shrink-0 text-sm tabular-nums text-text/60">
                    {w.correct} right · {w.wrong} wrong
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
