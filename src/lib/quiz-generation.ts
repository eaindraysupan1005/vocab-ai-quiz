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

// A topic quiz sweeps the topic rather than sampling it: three quarters of the
// topic's words get asked, so working through one is a real pass over the set.
export const TOPIC_COVERAGE = 0.75;
// Of those questions, roughly three in ten ask the user to produce a sentence
// (graded by Gemini); the rest are the daily quiz's multiple-choice styles.
export const TOPIC_SENTENCE_SHARE = 0.3;

export function topicQuestionCount(topicWordCount: number): number {
  return Math.ceil(topicWordCount * TOPIC_COVERAGE);
}

export function topicSentenceCount(questionCount: number): number {
  return Math.round(questionCount * TOPIC_SENTENCE_SHARE);
}

// The topic practice quiz. Same three multiple-choice styles as the daily
// quiz, plus AI-graded sentence production for ~30% of the questions, over
// `TOPIC_COVERAGE` of the topic's words. Seeded on the topic alone, so the
// draw and ordering survive a reload mid-quiz.
export function buildTopicQuizQuestions(
  topicWords: Word[],
  distractorPool: DistractorWord[],
  seed: string,
): Question[] {
  const rng = mulberry32(hashString(seed));
  const pool = [...distractorPool].sort((a, b) => a.id.localeCompare(b.id));

  const ordered = [...topicWords].sort((a, b) => a.id.localeCompare(b.id));
  const total = topicQuestionCount(ordered.length);
  const targets = seededShuffle(ordered, rng).slice(0, total);
  const sentences = topicSentenceCount(total);

  // Counted separately from the question index so the multiple-choice styles
  // still rotate evenly once the sentence questions are lifted out.
  let objectiveIndex = 0;

  return targets.map((target, i) => {
    // Spaces the sentence questions evenly across the quiz (the same trick a
    // line-drawing algorithm uses) instead of clumping them at one end.
    const isSentence =
      Math.floor((i * sentences) / total) < Math.floor(((i + 1) * sentences) / total);

    if (isSentence) {
      return {
        id: `topic-sentence-${target.id}`,
        type: "sentence",
        wordId: target.id,
        word: target.word,
        prompt: `Use "${target.word}" in a sentence that shows you understand its meaning.`,
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
  bandLevel: number | null;
  word: string;
  prompt: string;
  options: string[];
  correctIndex: number;
};

// Demo band-level test: a fixed-length MCQ quiz sampled across the word
// bank's band levels, unrelated to the user's own learn/review progress and
// not persisted anywhere — it's just a rough self-assessment.
export function buildBandLevelQuestions(pool: Word[], count = 10): BandQuestion[] {
  const targets = shuffle(pool).slice(0, count);

  return targets.map((target) => {
    const distractors = shuffle(pool.filter((w) => w.id !== target.id)).slice(0, 3);
    const options = shuffle([target.definition, ...distractors.map((d) => d.definition)]);

    return {
      id: `band-${target.id}`,
      bandLevel: target.band_level,
      word: target.word,
      prompt: `Which definition matches "${target.word}"?`,
      options,
      correctIndex: options.indexOf(target.definition),
    };
  });
}
