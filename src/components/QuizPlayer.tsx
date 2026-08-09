"use client";

import { useState, useTransition } from "react";
import { recordObjectiveAnswer } from "@/app/quiz/actions";

// Every daily-quiz question is multiple choice. `type` only distinguishes how
// the question is framed (and how the answer is recorded in quiz_answers):
// "mcq" for meaning/word questions, "fill_blank" for a blanked sentence.
export type Question = {
  id: string;
  type: "mcq" | "fill_blank";
  wordId: string;
  word: string;
  prompt: string;
  options: string[];
  correctIndex: number;
};

export default function QuizPlayer({
  questions,
  startIndex = 0,
  initialCorrect = 0,
}: {
  questions: Question[];
  startIndex?: number;
  initialCorrect?: number;
}) {
  const [index, setIndex] = useState(startIndex);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [correctCount, setCorrectCount] = useState(initialCorrect);
  const [finished, setFinished] = useState(startIndex >= questions.length);
  const [, startTransition] = useTransition();

  if (questions.length === 0) return null;

  if (finished) {
    return (
      <div className="w-full max-w-3xl rounded-xl border border-primary/30 bg-primary/[0.06] p-6 text-center shadow-sm">
        <p className="text-lg font-semibold text-text">Today&apos;s quiz is done!</p>
        <p className="mt-1 text-text/70">
          You scored {correctCount} of {questions.length}. Come back tomorrow for more.
        </p>
      </div>
    );
  }

  const q = questions[index];
  const isLast = index === questions.length - 1;
  const isCorrect = selected === q.correctIndex;
  const progress = Math.round((index / questions.length) * 100);

  function handleSubmit() {
    const correct = selected === q.correctIndex;
    const answerText = q.options[selected ?? -1] ?? "";
    setSubmitted(true);
    if (correct) setCorrectCount((c) => c + 1);
    startTransition(() => {
      recordObjectiveAnswer(q.wordId, q.type, answerText, correct).catch(() => {});
    });
  }

  function handleNext() {
    setSelected(null);
    setSubmitted(false);
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

        <p className="text-text">{q.prompt}</p>

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

        {submitted && (
          <p
            className={`mt-4 text-sm font-medium ${
              isCorrect
                ? "text-green-700 dark:text-green-400"
                : "text-red-700 dark:text-red-400"
            }`}
          >
            {isCorrect
              ? "Correct!"
              : `Not quite — the correct answer was "${q.options[q.correctIndex]}".`}
          </p>
        )}

        {!submitted ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selected === null}
            className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-[#0f1704] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Submit
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-[#0f1704] shadow-sm transition-opacity hover:opacity-90"
          >
            {isLast ? "Finish" : "Next"}
          </button>
        )}
      </div>
    </div>
  );
}
