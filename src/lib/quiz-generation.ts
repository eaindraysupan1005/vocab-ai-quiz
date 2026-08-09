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

// The daily quiz: `count` words drawn from the user's pinned batch for the
// day, every question multiple choice in one of three styles —
//   meaning     word → pick its definition
//   word        definition → pick the word
//   fill_blank  example sentence with the word blanked → pick the word
// `distractorPool` supplies the three wrong options per question and should be
// a broad sample of the word bank. `seed` pins the whole thing for the day.
export function buildDailyQuizQuestions(
  batch: Word[],
  distractorPool: Word[],
  seed: string,
  count = DAILY_QUIZ_LENGTH,
): Question[] {
  const rng = mulberry32(hashString(seed));

  // Sort first: Supabase `.in()` results come back in arbitrary order, and the
  // seeded shuffle is only reproducible if its input order is too.
  const ordered = [...batch].sort((a, b) => a.id.localeCompare(b.id));
  const targets = seededShuffle(ordered, rng).slice(0, count);
  const pool = [...distractorPool].sort((a, b) => a.id.localeCompare(b.id));

  return targets.map((target, i) => {
    const candidates = seededShuffle(
      pool.filter((w) => w.id !== target.id && w.word !== target.word),
      rng,
    );

    let kind = KIND_CYCLE[i % KIND_CYCLE.length];
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
