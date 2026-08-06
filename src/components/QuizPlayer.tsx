"use client";

import { useState } from "react";

export type Question =
  | { id: string; type: "mcq"; word: string; prompt: string; options: string[]; correctIndex: number }
  | { id: string; type: "fill_blank"; word: string; prompt: string; answer: string }
  | { id: string; type: "sentence"; word: string; prompt: string };

type AnswerState = {
  submitted: boolean;
  selectedIndex?: number;
  text?: string;
};

function McqQuestion({
  q,
  state,
  onChange,
  onSubmit,
}: {
  q: Extract<Question, { type: "mcq" }>;
  state: AnswerState;
  onChange: (selectedIndex: number) => void;
  onSubmit: () => void;
}) {
  const isCorrect = state.selectedIndex === q.correctIndex;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-black dark:text-zinc-50">{q.prompt}</p>
      <div className="flex flex-col gap-2">
        {q.options.map((option, i) => (
          <label
            key={i}
            className="flex items-center gap-2 rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145]"
          >
            <input
              type="radio"
              name={q.id}
              checked={state.selectedIndex === i}
              disabled={state.submitted}
              onChange={() => onChange(i)}
            />
            {option}
          </label>
        ))}
      </div>
      {!state.submitted ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={state.selectedIndex === undefined}
          className="self-start rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
        >
          Submit
        </button>
      ) : (
        <p
          className={
            isCorrect
              ? "text-sm font-medium text-green-700 dark:text-green-400"
              : "text-sm font-medium text-red-700 dark:text-red-400"
          }
        >
          {isCorrect
            ? "Correct!"
            : `Not quite — the correct answer was "${q.options[q.correctIndex]}".`}
        </p>
      )}
    </div>
  );
}

function FillBlankQuestion({
  q,
  state,
  onChange,
  onSubmit,
}: {
  q: Extract<Question, { type: "fill_blank" }>;
  state: AnswerState;
  onChange: (text: string) => void;
  onSubmit: () => void;
}) {
  const isCorrect = (state.text ?? "").trim().toLowerCase() === q.answer.toLowerCase();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-black dark:text-zinc-50">{q.prompt}</p>
      <input
        type="text"
        value={state.text ?? ""}
        disabled={state.submitted}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type the missing word"
        className="rounded border border-black/[.08] bg-white px-3 py-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
      />
      {!state.submitted ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!state.text}
          className="self-start rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
        >
          Submit
        </button>
      ) : (
        <p
          className={
            isCorrect
              ? "text-sm font-medium text-green-700 dark:text-green-400"
              : "text-sm font-medium text-red-700 dark:text-red-400"
          }
        >
          {isCorrect ? "Correct!" : `Not quite — the correct answer was "${q.answer}".`}
        </p>
      )}
    </div>
  );
}

function SentenceQuestion({
  q,
  state,
  onChange,
  onSubmit,
}: {
  q: Extract<Question, { type: "sentence" }>;
  state: AnswerState;
  onChange: (text: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-black dark:text-zinc-50">{q.prompt}</p>
      <textarea
        value={state.text ?? ""}
        disabled={state.submitted}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="Write your sentence here"
        className="rounded border border-black/[.08] bg-white px-3 py-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
      />
      {!state.submitted ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!state.text}
          className="self-start rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
        >
          Submit
        </button>
      ) : (
        <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
          Nice attempt — AI grading isn&apos;t wired up yet, so this is just a preview of the
          layout.
        </p>
      )}
    </div>
  );
}

export default function QuizPlayer({ questions }: { questions: Question[] }) {
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});

  function getState(id: string): AnswerState {
    return answers[id] ?? { submitted: false };
  }

  function update(id: string, patch: Partial<AnswerState>) {
    setAnswers((prev) => ({ ...prev, [id]: { ...getState(id), ...patch } }));
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {questions.map((q, i) => {
        const state = getState(q.id);
        return (
          <div
            key={q.id}
            className="rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-black"
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              Question {i + 1} · {q.word}
            </p>
            {q.type === "mcq" && (
              <McqQuestion
                q={q}
                state={state}
                onChange={(selectedIndex) => update(q.id, { selectedIndex })}
                onSubmit={() => update(q.id, { submitted: true })}
              />
            )}
            {q.type === "fill_blank" && (
              <FillBlankQuestion
                q={q}
                state={state}
                onChange={(text) => update(q.id, { text })}
                onSubmit={() => update(q.id, { submitted: true })}
              />
            )}
            {q.type === "sentence" && (
              <SentenceQuestion
                q={q}
                state={state}
                onChange={(text) => update(q.id, { text })}
                onSubmit={() => update(q.id, { submitted: true })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
