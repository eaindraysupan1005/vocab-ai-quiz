import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { callGeminiJSON, buildTopicMcqPrompt } from "@/lib/gemini";
import { createServiceClient } from "@/lib/supabase/service";

type Supabase = SupabaseClient<Database>;

// A Gemini-written multiple-choice question for one word, as the quiz builder
// wants it: the options as a set, plus which one is right. Option *order* is
// decided per quiz by the seeded shuffle, not stored.
export type AiQuestion = {
  wordId: string;
  prompt: string;
  options: string[];
  correctOption: string;
};

export type AiQuestionMap = Map<string, AiQuestion>;

// Words per Gemini call. Small enough that one bad response only costs that
// chunk, large enough that a 40-question topic is a handful of calls.
const CHUNK_SIZE = 10;
// Chunks generated at once. Generation happens during the page render, so this
// trades page latency against how hard we lean on the rate limit.
const CONCURRENCY = 4;
// Ceiling on how many words one page load will generate for. A 200-word topic
// would otherwise mean 20 sequential-ish rounds of Gemini on a cold cache;
// instead the cache fills over the first few visits and the words that missed
// out fall back to code-built multiple choice in the meantime.
const MAX_PER_REQUEST = CHUNK_SIZE * CONCURRENCY * 2;

type Target = { id: string; word: string; definition: string };

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchCached(supabase: Supabase, wordIds: string[]): Promise<AiQuestionMap> {
  const map: AiQuestionMap = new Map();
  if (wordIds.length === 0) return map;

  const { data, error } = await supabase
    .from("ai_questions")
    .select("word_id, prompt, options, correct_option")
    .in("word_id", wordIds);

  if (error) {
    console.error("Failed to read the AI question cache:", error);
    return map;
  }

  for (const row of data ?? []) {
    // A row whose correct answer isn't among its options would render as a
    // question with no right answer, so drop it rather than ask it.
    if (!row.options.includes(row.correct_option)) continue;
    map.set(row.word_id, {
      wordId: row.word_id,
      prompt: row.prompt,
      options: row.options,
      correctOption: row.correct_option,
    });
  }

  return map;
}

type GeminiItem = { word?: unknown; correct?: unknown; wrong?: unknown };

// Gemini is asked to return items in the order the words were given, but it's
// matched back by word text anyway — a dropped or reordered item would
// otherwise attach a question to the wrong word.
function parseChunk(targets: Target[], raw: unknown): AiQuestion[] {
  if (!Array.isArray(raw)) return [];

  const byWord = new Map(targets.map((t) => [t.word.trim().toLowerCase(), t]));
  const out: AiQuestion[] = [];

  for (const item of raw as GeminiItem[]) {
    if (typeof item?.word !== "string") continue;
    const target = byWord.get(item.word.trim().toLowerCase());
    if (!target) continue;

    const correct = typeof item.correct === "string" ? item.correct.trim() : "";
    const wrong = Array.isArray(item.wrong)
      ? item.wrong.filter((s): s is string => typeof s === "string").map((s) => s.trim())
      : [];

    // Anything short of one right answer and three wrong ones isn't a usable
    // four-option question.
    if (!correct || wrong.length < 3) continue;
    const options = [correct, ...wrong.slice(0, 3)];
    if (new Set(options).size !== 4) continue;

    out.push({
      wordId: target.id,
      prompt: `Which sentence uses "${target.word}" correctly?`,
      options,
      correctOption: correct,
    });
    // One question per word, even if Gemini repeats itself.
    byWord.delete(item.word.trim().toLowerCase());
  }

  return out;
}

async function generateChunk(targets: Target[]): Promise<AiQuestion[]> {
  try {
    const raw = await callGeminiJSON(buildTopicMcqPrompt(targets));
    return parseChunk(targets, raw);
  } catch (err) {
    // A failed chunk isn't fatal: those words just fall back to code-built
    // multiple choice, and the next page load will try them again.
    console.error("Failed to generate AI questions for a chunk:", err);
    return [];
  }
}

// Returns a question for every word it can, generating and caching the ones
// that aren't stored yet. Never throws — a caller that gets back fewer
// questions than it asked for is expected to fall back, not to fail.
export async function ensureAiQuestions(
  supabase: Supabase,
  words: Target[],
): Promise<AiQuestionMap> {
  if (words.length === 0) return new Map();

  const cached = await fetchCached(
    supabase,
    words.map((w) => w.id),
  );

  const missing = words.filter((w) => !cached.has(w.id)).slice(0, MAX_PER_REQUEST);
  if (missing.length === 0) return cached;

  const chunks = chunk(missing, CHUNK_SIZE);
  const generated: AiQuestion[] = [];

  for (const batch of chunk(chunks, CONCURRENCY)) {
    const results = await Promise.all(batch.map(generateChunk));
    for (const questions of results) generated.push(...questions);
  }

  if (generated.length > 0) {
    // Written with the service_role client rather than the caller's.
    // `ai_questions` is a shared cache with no insert policy for ordinary
    // users any more — see `createServiceClient` for what that policy allowed.
    const writer = createServiceClient();
    if (!writer) {
      console.error("No SUPABASE_SERVICE_ROLE_KEY: generated AI questions were not cached.");
      for (const q of generated) cached.set(q.wordId, q);
      return cached;
    }

    const { error } = await writer.from("ai_questions").upsert(
      generated.map((q) => ({
        word_id: q.wordId,
        prompt: q.prompt,
        options: q.options,
        correct_option: q.correctOption,
      })),
      { onConflict: "word_id", ignoreDuplicates: true },
    );
    // A cache write that fails costs a regeneration next time, nothing more —
    // the questions are already in hand for this request.
    if (error) console.error("Failed to cache AI questions:", error);

    for (const q of generated) cached.set(q.wordId, q);
  }

  return cached;
}
