import { todayIso, weekStartIso } from "@/lib/dates";

// Topic quizzes are practice on a fixed set of words rather than a dated
// session, so unlike daily and weekly they have no quiz_date — they're keyed
// by topic and resume wherever the learner left off, however long ago.
export type QuizKind = "daily" | "weekly" | "topic";

export { todayIso, weekStartIso };

// The `quiz_date` a quiz of this kind belongs to, or null for the kinds that
// aren't tied to a date.
export function quizDateFor(kind: QuizKind): string | null {
  if (kind === "topic") return null;
  return kind === "weekly" ? weekStartIso() : todayIso();
}
