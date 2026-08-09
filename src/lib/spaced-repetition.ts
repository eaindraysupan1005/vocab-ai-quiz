function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Days until the next review, by how many rungs up the ladder a word has
// climbed. A word seen correctly again and again backs off quickly; the top
// rung repeats monthly, which is enough to hold a word over a 6-month course.
const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

// How far up the ladder a word sits. There's no streak column on user_words,
// so this derives one from the lifetime counts: each miss cancels a hit. It
// isn't a true consecutive-correct streak — a word with 4 right and 3 wrong
// lands on rung 1, the same as one answered right once — but it does keep
// repeatedly-missed words on short intervals, which is the behaviour that
// matters. A dedicated `review_streak` column would model it exactly.
function ladderRung(timesCorrect: number, timesWrong: number): number {
  const net = Math.max(0, timesCorrect - timesWrong);
  return Math.min(net, REVIEW_INTERVALS.length - 1);
}

// Where a word lands after being answered in a quiz. Correct answers climb the
// ladder; a miss drops the word back to "learning" and brings it back tomorrow,
// so it re-enters the next daily batch as something to relearn.
export function nextReviewState(
  correct: boolean,
  timesCorrectSoFar: number,
  timesWrongSoFar: number,
): { status: "learned" | "learning"; next_review_date: string } {
  if (!correct) {
    return { status: "learning", next_review_date: addDaysIso(REVIEW_INTERVALS[0]) };
  }

  const rung = ladderRung(timesCorrectSoFar + 1, timesWrongSoFar);
  return { status: "learned", next_review_date: addDaysIso(REVIEW_INTERVALS[rung]) };
}

// Where a word lands when it's first checked off on the Daily Words page.
// Learning a word isn't evidence of recall, so it starts at the bottom of the
// ladder and comes back tomorrow — which is also what puts it in range of the
// next day's quiz.
export function firstReviewState(): { status: "learned"; next_review_date: string } {
  return { status: "learned", next_review_date: addDaysIso(REVIEW_INTERVALS[0]) };
}
