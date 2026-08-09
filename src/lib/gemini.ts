const KEYS = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(
  (k): k is string => Boolean(k),
);
const MODEL = "gemini-2.5-flash";

// Tries each configured Gemini key in turn (GEMINI_API_KEY, then
// GEMINI_API_KEY_2) so a rate-limited or exhausted key doesn't take grading
// down — falls through to the next key on any failure.
export async function callGeminiJSON(prompt: string): Promise<unknown> {
  if (KEYS.length === 0) {
    throw new Error("No GEMINI_API_KEY configured.");
  }

  let lastError: unknown;

  for (const key of KEYS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        },
      );

      if (!res.ok) {
        throw new Error(`Gemini API error (${res.status}): ${await res.text()}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("No text returned from Gemini response.");

      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    } catch (err) {
      console.error("Gemini call failed, trying next key if available:", err);
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All Gemini API keys failed.");
}

export function buildSentenceGradingPrompt(word: string, definition: string, sentence: string) {
  return `You are grading an IELTS learner's sentence for correct usage of a vocabulary word.

Word: "${word}"
Definition: ${definition}
Learner's sentence: "${sentence}"

Judge whether the sentence uses the word correctly — right meaning, and reasonable grammar
and context for the word's part of speech. Minor grammar slips are fine as long as the word
is used with the correct meaning.

Return ONLY a JSON object with exactly these fields, nothing else:
{"is_correct": true or false, "feedback": "one short encouraging sentence explaining why, max 25 words"}`;
}
