function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Correct answers push the review date further out (capped at 30 days,
// growing with the streak); a miss brings the word back tomorrow and drops
// it back to "learning" so it resurfaces as a recognition question again.
export function nextReviewState(
  correct: boolean,
  timesCorrectSoFar: number,
): { status: "learned" | "learning"; next_review_date: string } {
  if (correct) {
    const interval = Math.min(3 * (timesCorrectSoFar + 1), 30);
    return { status: "learned", next_review_date: addDaysIso(interval) };
  }
  return { status: "learning", next_review_date: addDaysIso(1) };
}
