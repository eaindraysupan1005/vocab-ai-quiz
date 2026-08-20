import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import {
  aiMcqTargets,
  buildDailyQuizQuestions,
  buildTopicQuizQuestions,
  buildWeeklyQuizQuestions,
  DAILY_QUIZ_LENGTH,
  planTopicQuiz,
  topicAiCount,
  topicAiMcqCount,
  topicQuestionCount,
  topicSentenceCount,
  weeklyQuestionCount,
  type DistractorWord,
  type WeeklyWord,
} from "@/lib/quiz-generation";

type Word = Database["public"]["Tables"]["words"]["Row"];

function makeWord(overrides: Partial<Word> & { id: string; word: string }): Word {
  return {
    definition: `definition of ${overrides.word}`,
    example_sentence: `An example using ${overrides.word} in context.`,
    topic: "general",
    band_level: 6.5,
    synonyms: [],
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// A word bank big enough to always supply 3 distinct distractors.
function makeBank(count: number, topic = "general"): Word[] {
  return Array.from({ length: count }, (_, i) =>
    makeWord({ id: `w${i}`, word: `word${i}`, topic }),
  );
}

describe("buildDailyQuizQuestions", () => {
  const bank = makeBank(30);

  it("asks at most DAILY_QUIZ_LENGTH questions, capped by the batch size", () => {
    const questions = buildDailyQuizQuestions(bank.slice(0, 20), bank, "seed-1");
    expect(questions).toHaveLength(DAILY_QUIZ_LENGTH);

    const smallBatch = bank.slice(0, 3);
    expect(buildDailyQuizQuestions(smallBatch, bank, "seed-1")).toHaveLength(3);
  });

  it("is deterministic for a given seed", () => {
    const a = buildDailyQuizQuestions(bank.slice(0, 20), bank, "same-seed");
    const b = buildDailyQuizQuestions(bank.slice(0, 20), bank, "same-seed");
    expect(a).toEqual(b);
  });

  it("varies with the seed", () => {
    const a = buildDailyQuizQuestions(bank.slice(0, 20), bank, "seed-a");
    const b = buildDailyQuizQuestions(bank.slice(0, 20), bank, "seed-b");
    expect(a).not.toEqual(b);
  });

  it("every question has exactly one correct option among its choices", () => {
    const questions = buildDailyQuizQuestions(bank.slice(0, 20), bank, "seed-check");
    for (const q of questions) {
      if (q.type === "sentence") continue;
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(q.options.length);
      expect(new Set(q.options).size).toBe(q.options.length);
    }
  });

  it("sends already-tested words to the back, preferring untested words first", () => {
    const batch = bank.slice(0, 20);
    const alreadyTested = new Set(batch.slice(0, 15).map((w) => w.id));
    const questions = buildDailyQuizQuestions(batch, bank, "seed-retest", 10, alreadyTested);
    const untestedIds = new Set(batch.slice(15).map((w) => w.id));
    const untestedAsked = questions.filter((q) => untestedIds.has(q.wordId)).length;
    // All 5 untested words should be asked before any already-tested one is repeated.
    expect(untestedAsked).toBe(5);
  });
});

describe("weeklyQuestionCount", () => {
  it("is half the learned count, rounded up", () => {
    expect(weeklyQuestionCount(100)).toBe(50);
    expect(weeklyQuestionCount(7)).toBe(4);
    expect(weeklyQuestionCount(1)).toBe(1);
    expect(weeklyQuestionCount(0)).toBe(0);
  });
});

describe("buildWeeklyQuizQuestions", () => {
  const pool: DistractorWord[] = makeBank(30);

  it("picks previously-wrong words before never-wrong words", () => {
    const learned: WeeklyWord[] = [
      ...makeBank(10).map((w) => ({ ...w, timesWrong: 0 })),
      ...makeBank(2, "general").map((w, i) => ({
        ...w,
        id: `wrong${i}`,
        word: `wrongword${i}`,
        timesWrong: 3,
      })),
    ];
    const questions = buildWeeklyQuizQuestions(learned, pool, "weekly-seed");
    // weeklyQuestionCount(12) = 6, and the 2 previously-wrong words should be among them.
    expect(questions.length).toBe(6);
    const askedIds = new Set(questions.map((q) => q.wordId));
    expect(askedIds.has("wrong0")).toBe(true);
    expect(askedIds.has("wrong1")).toBe(true);
  });

  it("puts a sentence-production question every 4th slot", () => {
    const learned: WeeklyWord[] = makeBank(20).map((w) => ({ ...w, timesWrong: 0 }));
    const questions = buildWeeklyQuizQuestions(learned, pool, "weekly-seed-2");
    questions.forEach((q, i) => {
      if (i % 4 === 3) expect(q.type).toBe("sentence");
      else expect(q.type).not.toBe("sentence");
    });
  });
});

describe("topic quiz sizing", () => {
  it("covers 80% of a small topic, capped at TOPIC_MAX_QUESTIONS", () => {
    expect(topicQuestionCount(10)).toBe(8);
    expect(topicQuestionCount(125)).toBe(40); // 80% of 125 = 100, capped at 40
  });

  it("splits AI share evenly between sentence and AI multiple choice", () => {
    const total = topicQuestionCount(125); // 40
    expect(topicAiCount(total)).toBe(24); // 60% of 40
    expect(topicSentenceCount(total)).toBe(12);
    expect(topicAiMcqCount(total)).toBe(12);
    // The three roles always add up to the total question count.
    expect(
      topicSentenceCount(total) + topicAiMcqCount(total) + (total - topicAiCount(total)),
    ).toBe(total);
  });
});

describe("planTopicQuiz / buildTopicQuizQuestions", () => {
  const topicWords = makeBank(125, "environment");
  const pool: DistractorWord[] = makeBank(200);

  it("plans exactly topicQuestionCount targets with matching roles", () => {
    const plan = planTopicQuiz(topicWords, "topic-seed");
    expect(plan.targets).toHaveLength(topicQuestionCount(topicWords.length));
    expect(plan.roles).toHaveLength(plan.targets.length);
  });

  it("falls back to a code-built question when no AI question is cached", () => {
    const plan = planTopicQuiz(topicWords, "topic-seed");
    const questions = buildTopicQuizQuestions(plan, pool, "topic-seed");
    // Every planned slot still produces a question even with an empty AI cache.
    expect(questions).toHaveLength(plan.targets.length);
    const aiMcqSlots = aiMcqTargets(plan);
    // Every slot resolves to a real question type, never left unanswered.
    const validTypes = new Set(["mcq", "fill_blank", "sentence"]);
    expect(questions.every((q) => validTypes.has(q.type))).toBe(true);
    expect(aiMcqSlots.length).toBe(topicAiMcqCount(topicQuestionCount(topicWords.length)));
  });

  it("uses a cached AI question when available", () => {
    const plan = planTopicQuiz(topicWords, "topic-seed-ai");
    const aiTargets = aiMcqTargets(plan);
    expect(aiTargets.length).toBeGreaterThan(0);
    const target = aiTargets[0];
    const aiQuestions = new Map([
      [
        target.id,
        {
          prompt: `Which sentence uses "${target.word}" correctly?`,
          options: ["right one", "wrong a", "wrong b", "wrong c"],
          correctOption: "right one",
        },
      ],
    ]);
    const questions = buildTopicQuizQuestions(plan, pool, "topic-seed-ai", aiQuestions);
    const q = questions.find((q) => q.wordId === target.id)!;
    if (q.type === "sentence") throw new Error("expected an mcq question");
    expect(q.options).toContain("right one");
    expect(q.options[q.correctIndex]).toBe("right one");
  });
});
