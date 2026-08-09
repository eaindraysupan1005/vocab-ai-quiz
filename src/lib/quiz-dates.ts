export type QuizKind = "daily" | "weekly";

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// The Monday of the current week, used as the weekly quiz's `quiz_date` so a
// week's answers all land on one quizzes row no matter which day they're given.
export function weekStartIso() {
  const d = new Date();
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

// The `quiz_date` a quiz of this kind belongs to.
export function quizDateFor(kind: QuizKind) {
  return kind === "weekly" ? weekStartIso() : todayIso();
}
