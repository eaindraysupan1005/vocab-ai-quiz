import type { Database } from "@/lib/supabase/database.types";
import type { Question } from "@/components/QuizPlayer";

type Word = Database["public"]["Tables"]["words"]["Row"];

export const DAILY_QUIZ_LENGTH = 10;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// A seeded PRNG so the daily quiz — which words are picked, in which order,
// with which question style and option order — stays identical every time the
// page is loaded on a given day. Without this, a refresh mid-quiz would deal
// the user a different set of questions.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Matches the target word and its inflections ("economic" → "economics",
// "economy"). Built fresh on each call because /g regexes are stateful.
function wordPattern(word: string): RegExp {
  const core = word.trim().replace(/^to\s+/i, "").split(/\s+/)[0];
  const stem = core.length > 5 ? core.slice(0, core.length - 2) : core;
  return new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*\\b`, "gi");
}

function mentionsWord(text: string, word: string): boolean {
  return wordPattern(word).test(text);
}

function maskWord(text: string, word: string): string {
  return text.replace(wordPattern(word), "______");
}

function blankOutWord(sentence: string, word: string): string | null {
  if (!mentionsWord(sentence, word)) return null;
  return maskWord(sentence, word);
}

type QuestionKind = "meaning" | "word" | "fill_blank";

// Rotated over the picked words so a quiz mixes all three styles evenly.
const KIND_CYCLE: QuestionKind[] = ["meaning", "word", "fill_blank"];

// Distractors only need these columns, so the quiz page can fetch the whole
// bank as options without pulling example sentences it will never show.
export type DistractorWord = Pick<
  Word,
  "id" | "word" | "definition" | "band_level" | "topic" | "synonyms"
>;

function normalizeWord(word: string): string {
  return word.trim().toLowerCase().replace(/^to\s+/, "");
}

// The word bank has no part-of-speech column, but the entries carry two usable
// hints: verbs are written "To cope", and adverbs end in -ly. Matching on this
// keeps a fill-in-the-blank from offering options that can't grammatically fit
// the gap ("bar chart" against "Deliberate").
function posHint(word: string): "verb" | "adverb" | "other" {
  const w = word.trim().toLowerCase();
  if (w.startsWith("to ")) return "verb";
  if (w.endsWith("ly")) return "adverb";
  return "other";
}

// The bank mixes single words with phrases ("bar chart", "bring about
// significant changes"). Offering a phrase against a single-word target is an
// instant tell in a fill-in-the-blank, so like is matched with like.
function isPhrase(word: string): boolean {
  return normalizeWord(word).includes(" ");
}

// A synonym of the target can't be a distractor: it would be a second
// defensibly-correct option, so the question stops having one answer. Words
// that merely *share* a synonym are close enough to carry the same risk.
function isTooCloseToTarget(target: Word, candidate: DistractorWord): boolean {
  const targetWord = normalizeWord(target.word);
  const candidateWord = normalizeWord(candidate.word);
  if (targetWord === candidateWord) return true;

  const targetSynonyms = new Set(target.synonyms.map(normalizeWord));
  const candidateSynonyms = candidate.synonyms.map(normalizeWord);
  if (targetSynonyms.has(candidateWord)) return true;
  if (candidateSynonyms.includes(targetWord)) return true;
  return candidateSynonyms.some((s) => targetSynonyms.has(s));
}

// Orders the pool by how plausible each word is as a wrong answer for this
// target — same topic and a nearby band level make an option that has to be
// ruled out on meaning rather than on obviously belonging to another register.
// The seeded shuffle up front is what breaks ties, and `sort` is stable, so
// equally-good candidates still vary between words and days.
function rankCandidates(
  target: Word,
  pool: DistractorWord[],
  rng: () => number,
): DistractorWord[] {
  const targetPos = posHint(target.word);

  return seededShuffle(
    pool.filter((w) => w.id !== target.id && !isTooCloseToTarget(target, w)),
    rng,
  )
    .map((w) => {
      let score = 0;
      if (target.topic && w.topic === target.topic) score += 2;
      if (
        target.band_level != null &&
        w.band_level != null &&
        Math.abs(w.band_level - target.band_level) <= 0.5
      ) {
        score += 2;
      }
      if (posHint(w.word) === targetPos) score += 1;
      if (isPhrase(w.word) === isPhrase(target.word)) score += 1;
      return { w, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.w);
}

// Builds one multiple-choice question for `target` in the requested style,
// falling back to another style when the word can't support it (no example
// sentence to blank, or a definition that gives the answer away).
function buildObjectiveQuestion(
  target: Word,
  pool: DistractorWord[],
  rng: () => number,
  preferredKind: QuestionKind,
): Question {
  const candidates = rankCandidates(target, pool, rng);

  let kind = preferredKind;
  const blanked = target.example_sentence
    ? blankOutWord(target.example_sentence, target.word)
    : null;
  // Some definitions restate the word they define ("Intellectual: relating
  // to the intellect…"), which would give a meaning question away — the
  // correct option would be the only one naming the word in the prompt.
  const definitionLeaks = mentionsWord(target.definition, target.word);

  if (kind === "fill_blank" && !blanked) {
    // No usable example sentence to blank out.
    kind = definitionLeaks ? "word" : "meaning";
  } else if (kind === "meaning" && definitionLeaks) {
    kind = blanked ? "fill_blank" : "word";
  }

  if (kind === "meaning") {
    const distractors = candidates
      .filter((w) => w.definition !== target.definition)
      .slice(0, 3)
      .map((w) => w.definition);
    const options = seededShuffle([target.definition, ...distractors], rng);
    return {
      id: `meaning-${target.id}`,
      type: "mcq",
      wordId: target.id,
      word: target.word,
      prompt: `Which definition matches "${target.word}"?`,
      options,
      correctIndex: options.indexOf(target.definition),
    };
  }

  const distractors = candidates.slice(0, 3).map((w) => w.word);
  const options = seededShuffle([target.word, ...distractors], rng);

  if (kind === "word") {
    // Only one definition is on screen here, so masking a self-referential
    // definition hides the answer without singling the option out.
    const definition = definitionLeaks
      ? maskWord(target.definition, target.word)
      : target.definition;
    return {
      id: `word-${target.id}`,
      type: "mcq",
      wordId: target.id,
      word: target.word,
      prompt: `Which word means "${definition}"?`,
      options,
      correctIndex: options.indexOf(target.word),
    };
  }

  return {
    id: `fill-${target.id}`,
    type: "fill_blank",
    wordId: target.id,
    word: target.word,
    prompt: blanked!,
    options,
    correctIndex: options.indexOf(target.word),
  };
}

// The daily quiz: `count` words drawn from the user's pinned batch for the
// day, every question multiple choice in one of three styles —
//   meaning     word → pick its definition
//   word        definition → pick the word
//   fill_blank  example sentence with the word blanked → pick the word
// `distractorPool` supplies the three wrong options per question and should be
// a broad sample of the word bank. `seed` pins the whole thing for the day.
export function buildDailyQuizQuestions(
  batch: Word[],
  distractorPool: DistractorWord[],
  seed: string,
  count = DAILY_QUIZ_LENGTH,
  // Words the quiz has already tested at some point. The batch is 20 words and
  // the quiz asks 10, so without this the same words could keep winning the
  // draw while others were never tested — and an untested word never advances
  // its review interval, so it returns to the batch day after day. Still a
  // random 10 of the 20; already-tested words just go to the back of the queue.
  alreadyTested: Set<string> = new Set(),
): Question[] {
  const rng = mulberry32(hashString(seed));

  // Sort first: Supabase `.in()` results come back in arbitrary order, and the
  // seeded shuffle is only reproducible if its input order is too.
  const ordered = [...batch].sort((a, b) => a.id.localeCompare(b.id));
  const targets = seededShuffle(ordered, rng)
    .sort((a, b) => Number(alreadyTested.has(a.id)) - Number(alreadyTested.has(b.id)))
    .slice(0, count);
  const pool = [...distractorPool].sort((a, b) => a.id.localeCompare(b.id));

  return targets.map((target, i) =>
    buildObjectiveQuestion(target, pool, rng, KIND_CYCLE[i % KIND_CYCLE.length]),
  );
}

// A word the user learned during the past week, with its miss count so the
// weekly quiz can lean on the ones that gave trouble.
export type WeeklyWord = Word & { timesWrong: number };

// The weekly quiz covers half of everything learned in the past 7 days —
// learn 100 words, sit 50 questions. Rounded up so an odd count never drops a
// question.
export function weeklyQuestionCount(learnedCount: number): number {
  return Math.ceil(learnedCount / 2);
}

// One in four questions is sentence production; the rest rotate through the
// same three multiple-choice styles as the daily quiz.
const WEEKLY_KIND_CYCLE: (QuestionKind | "sentence")[] = [
  "meaning",
  "word",
  "fill_blank",
  "sentence",
];

// The weekly review quiz. Unlike the daily quiz this mixes in AI-graded
// sentence production, and it picks its words worst-first: anything the user
// has previously got wrong is chosen before anything they have always got
// right, with the seeded shuffle breaking ties.
export function buildWeeklyQuizQuestions(
  learned: WeeklyWord[],
  distractorPool: DistractorWord[],
  seed: string,
): Question[] {
  const rng = mulberry32(hashString(seed));
  const pool = [...distractorPool].sort((a, b) => a.id.localeCompare(b.id));

  const ordered = [...learned].sort((a, b) => a.id.localeCompare(b.id));
  const targets = seededShuffle(ordered, rng)
    .sort((a, b) => b.timesWrong - a.timesWrong)
    .slice(0, weeklyQuestionCount(learned.length));

  return targets.map((target, i) => {
    const kind = WEEKLY_KIND_CYCLE[i % WEEKLY_KIND_CYCLE.length];

    if (kind === "sentence") {
      return {
        id: `sentence-${target.id}`,
        type: "sentence",
        wordId: target.id,
        word: target.word,
        prompt: `Use "${target.word}" in a sentence that shows you understand its meaning.`,
      };
    }

    return buildObjectiveQuestion(target, pool, rng, kind);
  });
}

// A topic quiz aims to sweep the topic rather than sample it: four fifths of
// the topic's words, so working through one is a real pass over the set.
export const TOPIC_COVERAGE = 0.8;
// …up to a point. The real topic sizes make the coverage rule unusable on its
// own: `general` holds 553 of the bank's 2060 words, so 80% of it is a
// 443-question quiz asking for 133 AI-graded sentences — more than a learner
// is allowed in a day (DAILY_SENTENCE_GRADES), so it could not be finished in
// one even in principle. The smallest topic is 125 words, so in practice every
// topic hits this ceiling and a topic quiz is 40 questions.
//
// The trade-off is that a big topic is no longer swept: the seed is fixed per
// topic, so it's the same 40 words every time and the rest of `general` is
// never asked. Splitting a topic into numbered parts is the fuller fix — it
// needs the part in the quizzes row identity, which today is unique on
// (user_id, topic).
export const TOPIC_MAX_QUESTIONS = 40;
// Of those questions, 60% come from Gemini, split evenly between AI-written
// multiple choice ("which sentence uses the word correctly?") and AI-graded
// sentence production. The remaining 40% are the daily quiz's code-built
// multiple-choice styles, which need no API call and so keep working when
// Gemini is unavailable.
export const TOPIC_AI_SHARE = 0.6;

// What each question in the quiz is: an AI-written multiple choice, an
// AI-graded sentence the learner writes, or a code-built multiple choice.
export type TopicRole = "ai_mcq" | "sentence" | "mcq";

export function topicQuestionCount(topicWordCount: number): number {
  return Math.min(Math.ceil(topicWordCount * TOPIC_COVERAGE), TOPIC_MAX_QUESTIONS);
}

// How many of a quiz's questions involve Gemini at all — the AI multiple
// choice and the written sentences together.
export function topicAiCount(questionCount: number): number {
  return Math.round(questionCount * TOPIC_AI_SHARE);
}

export function topicSentenceCount(questionCount: number): number {
  return Math.round(topicAiCount(questionCount) / 2);
}

export function topicAiMcqCount(questionCount: number): number {
  return topicAiCount(questionCount) - topicSentenceCount(questionCount);
}

// Spreads each role evenly through the quiz instead of running all the AI
// questions together: an item that is the k-th of n in its role sits at
// (k + 0.5) / n of the way through, and the roles are merged on that position.
// `sort` is stable and the inputs are fixed, so the sequence is deterministic.
function interleaveRoles(counts: [TopicRole, number][]): TopicRole[] {
  const slots: { pos: number; role: TopicRole }[] = [];
  for (const [role, n] of counts) {
    for (let k = 0; k < n; k++) slots.push({ pos: (k + 0.5) / n, role });
  }
  return slots.sort((a, b) => a.pos - b.pos).map((s) => s.role);
}

export type TopicQuizPlan = { targets: Word[]; roles: TopicRole[] };

// Which words the topic quiz asks about and what kind of question each gets.
// Split out from building the questions because the `ai_mcq` slots have to be
// generated by Gemini first, and the caller needs to know which words those
// are before it can ask for them.
export function planTopicQuiz(topicWords: Word[], seed: string): TopicQuizPlan {
  const rng = mulberry32(hashString(seed));

  // Sorted first because Supabase returns rows in arbitrary order and the
  // seeded shuffle is only reproducible if its input order is too.
  const ordered = [...topicWords].sort((a, b) => a.id.localeCompare(b.id));
  const total = topicQuestionCount(ordered.length);
  const targets = seededShuffle(ordered, rng).slice(0, total);

  const sentences = topicSentenceCount(total);
  const aiMcqs = topicAiMcqCount(total);
  const roles = interleaveRoles([
    ["ai_mcq", aiMcqs],
    ["sentence", sentences],
    ["mcq", total - sentences - aiMcqs],
  ]);

  return { targets, roles };
}

// The words the plan wants an AI-written multiple choice for.
export function aiMcqTargets(plan: TopicQuizPlan): Word[] {
  return plan.targets.filter((_, i) => plan.roles[i] === "ai_mcq");
}

// A Gemini-written question as `buildTopicQuizQuestions` consumes it — the
// shape `ensureAiQuestions` returns, restated here so the quiz builder stays a
// pure function with no Supabase dependency.
export type AiMcq = { prompt: string; options: string[]; correctOption: string };

// The topic practice quiz. Turns a plan into questions, pulling the AI-written
// multiple choice out of `aiQuestions` (keyed by word id). A word whose AI
// question is missing — Gemini failed, or the cache hasn't been filled for it
// yet — falls back to a code-built one, so the quiz is always complete even
// when nothing can be generated.
export function buildTopicQuizQuestions(
  plan: TopicQuizPlan,
  distractorPool: DistractorWord[],
  seed: string,
  aiQuestions: Map<string, AiMcq> = new Map(),
): Question[] {
  const rng = mulberry32(hashString(seed));
  const pool = [...distractorPool].sort((a, b) => a.id.localeCompare(b.id));

  // Counted separately from the question index so the code-built styles still
  // rotate evenly once the AI questions are lifted out.
  let objectiveIndex = 0;

  return plan.targets.map((target, i) => {
    const role = plan.roles[i];

    if (role === "sentence") {
      return {
        id: `topic-sentence-${target.id}`,
        type: "sentence",
        wordId: target.id,
        word: target.word,
        prompt: `Use "${target.word}" in a sentence that shows you understand its meaning.`,
      };
    }

    const ai = role === "ai_mcq" ? aiQuestions.get(target.id) : undefined;
    if (ai) {
      const options = seededShuffle(ai.options, rng);
      return {
        id: `topic-ai-${target.id}`,
        type: "mcq",
        wordId: target.id,
        word: target.word,
        prompt: ai.prompt,
        options,
        correctIndex: options.indexOf(ai.correctOption),
      };
    }

    return buildObjectiveQuestion(
      target,
      pool,
      rng,
      KIND_CYCLE[objectiveIndex++ % KIND_CYCLE.length],
    );
  });
}

export type BandQuestion = {
  id: string;
  bandLevel: number;
  word: string;
  prompt: string;
  options: string[];
  correctIndex: number;
};

// The rungs of the band level test, easiest first. The word bank thins out
// badly at the top — a couple of dozen words at 8.0 and one each at 8.5 and
// 9.0 — so everything from 8.0 up is one rung rather than three that couldn't
// be filled.
export const BAND_LADDER = [5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0] as const;
// Questions per rung. Two is enough to tell "knows this level" from "guessed
// once" without making the test long enough that people abandon it.
export const QUESTIONS_PER_BAND = 2;

// Which rung a word belongs to: its own band, with everything above the top of
// the ladder folded into the top rung.
function rungFor(band: number): number {
  const top = BAND_LADDER[BAND_LADDER.length - 1];
  return band >= top ? top : band;
}

// Demo band-level test: `QUESTIONS_PER_BAND` questions at each rung of
// `BAND_LADDER`, ordered easiest first. Unrelated to the user's own
// learn/review progress and not persisted anywhere — it's a rough
// self-assessment.
//
// `pool` must be a sample spread across band levels (see the `band_sample`
// function in supabase/schema.sql). It used to be the first 60 rows the
// database happened to return, which meant the "test spanning several band
// levels" was really 10 words from an arbitrary slice of the bank.
export function buildBandLevelQuestions(pool: Word[]): BandQuestion[] {
  const byRung = new Map<number, Word[]>();
  for (const word of pool) {
    if (word.band_level == null) continue;
    const rung = rungFor(word.band_level);
    if (!BAND_LADDER.includes(rung as (typeof BAND_LADDER)[number])) continue;
    byRung.set(rung, [...(byRung.get(rung) ?? []), word]);
  }

  const questions: BandQuestion[] = [];

  for (const rung of BAND_LADDER) {
    const candidates = shuffle(byRung.get(rung) ?? []);
    const targets = candidates.slice(0, QUESTIONS_PER_BAND);

    for (const target of targets) {
      // Distractors are drawn from the same rung where possible, so a question
      // can't be answered by noticing that three options are obviously easier
      // words than the fourth.
      const sameRung = candidates.filter((w) => w.id !== target.id);
      const fallback = pool.filter(
        (w) => w.id !== target.id && !sameRung.some((s) => s.id === w.id),
      );
      const distractors = [...shuffle(sameRung), ...shuffle(fallback)]
        .filter((w) => w.definition !== target.definition)
        .slice(0, 3);

      // A rung with too few words to build four options is skipped rather than
      // asked with two — the estimator reads a missing rung as untested.
      if (distractors.length < 3) continue;

      const options = shuffle([target.definition, ...distractors.map((d) => d.definition)]);
      questions.push({
        id: `band-${target.id}`,
        bandLevel: rung,
        word: target.word,
        prompt: `Which definition matches "${target.word}"?`,
        options,
        correctIndex: options.indexOf(target.definition),
      });
    }
  }

  return questions;
}

export type BandEstimate = {
  band: number | null;
  // Per-rung tally, easiest first, for showing the learner where they stopped.
  breakdown: { band: number; correct: number; total: number }[];
};

// Estimates a band from the test by walking the ladder from the bottom and
// stopping at the first rung the learner fails — their level is the last rung
// they cleared.
//
// The previous version averaged the band levels of the words they got *right*
// and ignored the ones they got wrong, which is not an estimator: getting one
// band-9 word right and missing everything else reported band 9.0, while
// answering all but the hardest question correctly reported a lower band than
// someone who had barely passed.
//
// Four options means a 25% chance of guessing, so clearing a rung is defined
// as more than half correct — 2 of 2 at the default rung size. Getting exactly
// one of two right is treated as not yet solid rather than as a pass.
export function estimateBand(
  questions: BandQuestion[],
  correctIds: Set<string>,
): BandEstimate {
  const breakdown: BandEstimate["breakdown"] = [];

  for (const rung of BAND_LADDER) {
    const asked = questions.filter((q) => q.bandLevel === rung);
    if (asked.length === 0) continue;
    breakdown.push({
      band: rung,
      correct: asked.filter((q) => correctIds.has(q.id)).length,
      total: asked.length,
    });
  }

  let band: number | null = null;
  for (const rung of breakdown) {
    if (rung.correct * 2 <= rung.total) break;
    band = rung.band;
  }

  return { band, breakdown };
}
