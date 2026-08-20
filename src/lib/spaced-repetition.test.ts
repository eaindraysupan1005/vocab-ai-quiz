import { describe, expect, it } from "vitest";
import { addDaysIso, todayIso } from "@/lib/dates";
import { firstReviewState, nextReviewState } from "@/lib/spaced-repetition";

describe("firstReviewState", () => {
  it("starts a newly-learned word at the bottom rung, due tomorrow", () => {
    expect(firstReviewState()).toEqual({
      status: "learned",
      next_review_date: addDaysIso(1),
    });
  });
});

describe("nextReviewState", () => {
  it("drops a missed word to learning, due tomorrow, regardless of history", () => {
    expect(nextReviewState(false, 5, 0)).toEqual({
      status: "learning",
      next_review_date: addDaysIso(1),
    });
  });

  it("climbs one rung per net correct answer", () => {
    // 0 correct, 0 wrong so far -> this answer makes net 1 -> rung 1 (3 days)
    expect(nextReviewState(true, 0, 0)).toEqual({
      status: "learned",
      next_review_date: addDaysIso(3),
    });
    // net 2 -> rung 2 (7 days)
    expect(nextReviewState(true, 1, 0)).toEqual({
      status: "learned",
      next_review_date: addDaysIso(7),
    });
    // net 3 -> rung 3 (14 days)
    expect(nextReviewState(true, 2, 0)).toEqual({
      status: "learned",
      next_review_date: addDaysIso(14),
    });
    // net 4 -> rung 4 (30 days)
    expect(nextReviewState(true, 3, 0)).toEqual({
      status: "learned",
      next_review_date: addDaysIso(30),
    });
  });

  it("caps the ladder at the top rung instead of climbing past it", () => {
    expect(nextReviewState(true, 10, 0)).toEqual({
      status: "learned",
      next_review_date: addDaysIso(30),
    });
  });

  it("derives the rung from net correct (misses cancel hits), not a true streak", () => {
    // 4 correct, 3 wrong so far; this answer -> 5 correct, 3 wrong -> net 2 -> rung 2 (7 days).
    // Documents the known simplification: this is the same rung as a single first-time correct
    // answer (net 2 either way), even though the histories are very different.
    expect(nextReviewState(true, 4, 3)).toEqual({
      status: "learned",
      next_review_date: addDaysIso(7),
    });
  });

  it("never lets net correct go negative", () => {
    // 0 correct, 5 wrong so far; this correct answer -> net = max(0, 1 - 5) = 0 -> rung 0.
    expect(nextReviewState(true, 0, 5)).toEqual({
      status: "learned",
      next_review_date: addDaysIso(1),
    });
  });
});

describe("addDaysIso / todayIso sanity", () => {
  it("round-trips through today", () => {
    expect(addDaysIso(0)).toBe(todayIso());
  });
});
