import type { Database } from "@/lib/supabase/database.types";
import type { Question } from "@/components/QuizPlayer";

type Word = Database["public"]["Tables"]["words"]["Row"];

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function blankOutWord(sentence: string | null, word: string): string {
  if (!sentence) return `___ (definition-based blank for "${word}")`;
  const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*\\b`, "i");
  if (pattern.test(sentence)) {
    return sentence.replace(pattern, "______");
  }
  return `${sentence} (______ = "${word}")`;
}

// Mock question builder — placeholder for real Gemini-generated quizzes
// (roadmap step 7). Uses real word data, fake question framing.
export function buildMockQuestions(words: Word[]): Question[] {
  if (words.length < 6) return [];

  const questions: Question[] = [];

  // MCQ: word -> pick correct definition among 3 distractors.
  for (let i = 0; i < 2; i++) {
    const target = words[i];
    const distractors = words.filter((w) => w.id !== target.id).slice(2, 5);
    const options = shuffle([target.definition, ...distractors.map((d) => d.definition)]);
    questions.push({
      id: `mcq-${target.id}`,
      type: "mcq",
      word: target.word,
      prompt: `Which definition matches "${target.word}"?`,
      options,
      correctIndex: options.indexOf(target.definition),
    });
  }

  // Fill in the blank: use the example sentence with the word blanked out.
  for (let i = 2; i < 4; i++) {
    const target = words[i];
    questions.push({
      id: `fill-${target.id}`,
      type: "fill_blank",
      word: target.word,
      prompt: blankOutWord(target.example_sentence, target.word),
      answer: target.word,
    });
  }

  // Sentence production: words seen 2+ times (mocked — just the last two words here).
  for (let i = 4; i < 6; i++) {
    const target = words[i];
    questions.push({
      id: `sentence-${target.id}`,
      type: "sentence",
      word: target.word,
      prompt: `Use "${target.word}" in a sentence that shows you understand its meaning.`,
    });
  }

  return questions;
}
