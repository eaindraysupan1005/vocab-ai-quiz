/**
 * seed-words.js
 * ---------------------------------------------------------
 * Upserts scripts/enriched-words.json into the Supabase `words`
 * table, using the service_role key so it bypasses RLS (the
 * words table has no insert/update policy for anon/authenticated).
 *
 * USAGE:
 *   node seed-words.js
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY,
 * loaded automatically from ../.env.local.
 *
 * Safe to re-run: upserts on the `word` column (see the unique
 * index in supabase/schema.sql), so existing words are updated in
 * place instead of duplicated.
 * ---------------------------------------------------------
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });

const fs = require("fs");
const path = require("path");

// @supabase/supabase-js always spins up a Realtime client, which needs a
// WebSocket constructor. Node 20 doesn't expose one globally (that lands in
// Node 22), so polyfill it — this script never actually opens a socket.
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = require("ws");
}

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INPUT_FILE = process.env.WORDS_JSON_FILE || path.join(__dirname, "enriched-words.json");
const BATCH_SIZE = 200;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function toRow(entry) {
  return {
    word: entry.word,
    definition: entry.definition,
    example_sentence: entry.example_sentence ?? null,
    topic: entry.topic ?? null,
    band_level: entry.band_level ?? null,
    synonyms: Array.isArray(entry.synonyms) ? entry.synonyms : [],
  };
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file "${INPUT_FILE}" not found. Run enrich-words.js first.`);
    process.exit(1);
  }

  const entries = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  console.log(`Loaded ${entries.length} words from ${INPUT_FILE}`);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const rows = entries.map(toRow);
  const batches = chunkArray(rows, BATCH_SIZE);
  console.log(`Upserting in ${batches.length} batch(es) of up to ${BATCH_SIZE} rows`);

  let total = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const { data, error } = await supabase
      .from("words")
      .upsert(batch, { onConflict: "word" })
      .select("id");

    if (error) {
      console.error(`Batch ${i + 1}/${batches.length} failed: ${error.message}`);
      process.exit(1);
    }

    total += data.length;
    console.log(`Batch ${i + 1}/${batches.length} -> upserted ${data.length} rows`);
  }

  console.log(`\nDone. ${total} words upserted into the words table.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
