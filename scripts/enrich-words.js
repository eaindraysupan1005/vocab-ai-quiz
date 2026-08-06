/**
 * enrich-words.js
 * ---------------------------------------------------------
 * Takes a plain word list (e.g. extracted from an IELTS PDF)
 * and uses Gemini to generate structured vocab data:
 * definition, example sentence, topic, band level, synonyms.
 *
 * USAGE:
 *   1. Put your word list in words.txt (one word per line)
 *   2. Set your Gemini API key:
 *        export GEMINI_API_KEY="your_key_here"
 *   3. Run:
 *        node enrich-words.js
 *   4. Output is written to enriched-words.json
 *      (ready to seed into your Supabase `words` table)
 *
 * Processes words in batches of 50 to keep responses reliable
 * and avoid truncated JSON.
 * ---------------------------------------------------------
 */

const fs = require("fs");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";
const BATCH_SIZE = 50;
const INPUT_FILE = process.env.WORDS_INPUT_FILE || "words.txt";
const OUTPUT_FILE = process.env.WORDS_OUTPUT_FILE || "enriched-words.json";
const DELAY_BETWEEN_BATCHES_MS = 4000; // be gentle with free-tier rate limits

if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY environment variable.");
  process.exit(1);
}

function buildPrompt(words) {
  return `You are helping build an IELTS vocabulary database.

For each word in this list, return an object with these exact fields:
- "word": the word itself
- "definition": a clear, concise definition (1 sentence)
- "example_sentence": a natural example sentence at IELTS academic
  writing/speaking level, using the word correctly
- "topic": one topic tag from this set: environment, education, technology,
  health, economy, society, culture, crime, government, general
- "band_level": estimated IELTS band relevance as a single number between
  4.0 and 9.0 in steps of 0.5 (e.g. 6.5), not a range
- "synonyms": an array of 2-4 synonyms

Return ONLY a valid JSON array of these objects, nothing else.
No markdown formatting, no code fences, no explanation text before or after.

Words:
${words.join(", ")}`;
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No text returned from Gemini response.");
  }

  return text;
}

function parseJsonResponse(rawText) {
  // Strip markdown code fences if Gemini adds them despite instructions
  const cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Failed to parse JSON. Raw response was:\n", cleaned);
    throw err;
  }
}

const VALID_TOPICS = new Set([
  "environment",
  "education",
  "technology",
  "health",
  "economy",
  "society",
  "culture",
  "crime",
  "government",
  "general",
]);

function validateEntry(entry) {
  const errors = [];

  if (typeof entry.word !== "string" || !entry.word.trim()) {
    errors.push("missing/invalid word");
  }
  if (typeof entry.definition !== "string" || !entry.definition.trim()) {
    errors.push("missing/invalid definition");
  }
  if (typeof entry.band_level !== "number" || Number.isNaN(entry.band_level)) {
    errors.push(`band_level is not a number (got ${JSON.stringify(entry.band_level)})`);
  } else if (entry.band_level < 4.0 || entry.band_level > 9.0) {
    errors.push(`band_level ${entry.band_level} out of range [4.0, 9.0]`);
  }
  if (
    entry.topic !== undefined &&
    entry.topic !== null &&
    !VALID_TOPICS.has(String(entry.topic).toLowerCase())
  ) {
    errors.push(`topic "${entry.topic}" not in allowed set`);
  } else if (typeof entry.topic === "string") {
    entry.topic = entry.topic.toLowerCase();
  }
  if (entry.synonyms !== undefined && !Array.isArray(entry.synonyms)) {
    errors.push("synonyms is not an array");
  }

  return errors;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file "${INPUT_FILE}" not found.`);
    console.error("Create it with one word per line, then re-run.");
    process.exit(1);
  }

  const rawWords = fs
    .readFileSync(INPUT_FILE, "utf-8")
    .split("\n")
    .map((w) => w.trim())
    .filter(Boolean);

  console.log(`Loaded ${rawWords.length} words from ${INPUT_FILE}`);

  const batches = chunkArray(rawWords, BATCH_SIZE);
  console.log(`Processing in ${batches.length} batch(es) of up to ${BATCH_SIZE} words`);

  const allResults = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\nBatch ${i + 1}/${batches.length} (${batch.length} words)...`);

    try {
      const prompt = buildPrompt(batch);
      const rawText = await callGemini(prompt);
      const parsed = parseJsonResponse(rawText);

      if (!Array.isArray(parsed)) {
        throw new Error("Expected a JSON array in response.");
      }

      const valid = [];
      for (const entry of parsed) {
        const errors = validateEntry(entry);
        if (errors.length > 0) {
          console.error(`  Skipping "${entry.word ?? "?"}": ${errors.join("; ")}`);
        } else {
          valid.push(entry);
        }
      }

      allResults.push(...valid);
      console.log(`  -> Got ${parsed.length} words, ${valid.length} passed validation.`);
    } catch (err) {
      console.error(`  Batch ${i + 1} failed: ${err.message}`);
      console.error(`  Words in this failed batch: ${batch.join(", ")}`);
      console.error("  Skipping this batch — you can retry it separately later.");
    }

    // Avoid hammering the free-tier rate limit between batches
    if (i < batches.length - 1) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allResults, null, 2));
  console.log(`\nDone. ${allResults.length} words written to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});