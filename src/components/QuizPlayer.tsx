"use client";

import { useState, useTransition } from "react";
import { recordObjectiveAnswer, gradeSentenceAnswer } from "@/app/quiz/actions";
import type { QuizKind } from "@/lib/quiz-dates";

// `type` says how the question is framed, and is also what gets written to
// quiz_answers.question_type: "mcq" for meaning/word questions, "fill_blank"
// for a blanked sentence, "sentence" for AI-graded production.
export type Question =
  | {
      id: string;
      type: "mcq" | "fill_blank";
      wordId: string;
      word: string;
      prompt: string;
      options: string[];
      correctIndex: number;
    }
  | { id: string; type: "sentence"; wordId: string; word: string; prompt: string };

type SentenceResult = { isCorrect: boolean; feedback: string };

export default function QuizPlayer({
  questions,
  startIndex = 0,
  initialCorrect = 0,
  quizKind = "daily",
  persist = true,
  onFinishNote,
}: {
  questions: Question[];
  startIndex?: number;
  initialCorrect?: number;
  quizKind?: QuizKind;
  // Practice quizzes (the topic demo) render the same way but write nothing
  // to quiz_answers and don't touch the review schedule.
  persist?: boolean;
  onFinishNote?: string;
}) {
  const [index, setIndex] = useState(startIndex);
  const [selected, setSelected] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [grading, setGrading] = useState(false);
  const [sentenceResult, setSentenceResult] = useState<SentenceResult | null>(null);
  const [correctCount, setCorrectCount] = useState(initialCorrect);
  const [finished, setFinished] = useState(startIndex >= questions.length);
  const [, startTransition] = useTransition();

  if (questions.length === 0) return null;

  if (finished) {
    return (
      <div className="w-full max-w-3xl rounded-xl border border-primary/30 bg-primary/[0.06] p-6 text-center shadow-sm">
        <p className="text-lg font-semibold text-text">Quiz complete!</p>
        <p className="mt-1 text-text/70">
          You scored {correctCount} of {questions.length}.
          {onFinishNote ? ` ${onFinishNote}` : ""}
        </p>
      </div>
    );
  }

  const q = questions[index];
  const isLast = index === questions.length - 1;
  const progress = Math.round((index / questions.length) * 100);
  const isCorrect = q.type === "sentence" ? sentenceResult?.isCorrect : selected === q.correctIndex;
  const canSubmit = q.type === "sentence" ? text.trim().length > 0 : selected !== null;

  async function handleSubmit() {
    if (q.type === "sentence") {
      setSubmitted(true);
      if (!persist) {
        // Nothing to grade against without the AI call; practice mode never
        // generates sentence questions, so this is just a safety net.
        setSentenceResult({ isCorrect: false, feedback: "Sentence grading is off in practice mode." });
        return;
      }
      setGrading(true);
      try {
        const result = await gradeSentenceAnswer(q.wordId, text, quizKind);
        setSentenceResult(result);
        if (result.isCorrect) setCorrectCount((c) => c + 1);
      } catch {
        setSentenceResult({
          isCorrect: false,
          feedback: "Couldn't grade this right now — please try again in a bit.",
        });
      } finally {
        setGrading(false);
      }
      return;
    }

    const correct = selected === q.correctIndex;
    const answerText = q.options[selected ?? -1] ?? "";
    setSubmitted(true);
    if (correct) setCorrectCount((c) => c + 1);
    if (persist) {
      startTransition(() => {
        recordObjectiveAnswer(q.wordId, q.type, answerText, correct, quizKind).catch(() => {});
      });
    }
  }

  function handleNext() {
    setSelected(null);
    setText("");
    setSubmitted(false);
    setSentenceResult(null);
    if (isLast) setFinished(true);
    else setIndex((i) => i + 1);
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary/25">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium text-text/60">
          Question {index + 1} of {questions.length}
        </span>
      </div>

      <div className="rounded-xl border border-text/10 bg-background p-5 shadow-sm">
        {q.type === "fill_blank" && (
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text/50">
            Choose the word that fits the blank
          </p>
        )}
        {q.type === "sentence" && (
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text/50">
            Write a sentence — graded by AI
          </p>
        )}

        <p className="text-text">{q.prompt}</p>

        {q.type === "sentence" ? (
          <textarea
            value={text}
            disabled={submitted}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Write your sentence here"
            className="mt-4 w-full rounded-lg border border-text/10 bg-background px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
          />
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {q.options.map((option, i) => (
              <label
                key={i}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors ${
                  selected === i
                    ? "border-primary/40 bg-primary/10 text-text"
                    : "border-text/10 text-text/80 hover:bg-text/5"
                }`}
              >
                <input
                  type="radio"
                  name={q.id}
                  checked={selected === i}
                  disabled={submitted}
                  onChange={() => setSelected(i)}
                  style={{ accentColor: "var(--primary)" }}
                />
                {option}
              </label>
            ))}
          </div>
        )}

        {submitted &&
          (grading ? (
            <p className="mt-4 text-sm text-text/60">Grading your sentence with AI…</p>
          ) : (
            <p
              className={`mt-4 text-sm font-medium ${
                isCorrect
                  ? "text-green-700 dark:text-green-400"
                  : "text-red-700 dark:text-red-400"
              }`}
            >
              {q.type === "sentence"
                ? sentenceResult?.feedback
                : isCorrect
                  ? "Correct!"
                  : `Not quite — the correct answer was "${q.options[q.correctIndex]}".`}
            </p>
          ))}

        {!submitted ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-[#0f1704] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Submit
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            disabled={grading}
            className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-[#0f1704] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isLast ? "Finish" : "Next"}
          </button>
        )}
      </div>
    </div>
  );
}
