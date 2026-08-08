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
    <div className="flex flex-col gap-4">
      <p className="text-text">{q.prompt}</p>
      <div className="flex flex-col gap-2">
        {q.options.map((option, i) => {
          const selected = state.selectedIndex === i;
          return (
            <label
              key={i}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors ${
                selected
                  ? "border-primary/40 bg-primary/10 text-text"
                  : "border-text/10 text-text/80 hover:bg-text/5"
              }`}
            >
              <input
                type="radio"
                name={q.id}
                checked={selected}
                disabled={state.submitted}
                onChange={() => onChange(i)}
                style={{ accentColor: "var(--primary)" }}
              />
              {option}
            </label>
          );
        })}
      </div>
      {!state.submitted ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={state.selectedIndex === undefined}
          className="self-start rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-[#0f1704] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
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
    <div className="flex flex-col gap-4">
      <p className="text-text">{q.prompt}</p>
      <input
        type="text"
        value={state.text ?? ""}
        disabled={state.submitted}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type the missing word"
        className="rounded-lg border border-text/10 bg-background px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
      />
      {!state.submitted ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!state.text}
          className="self-start rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-[#0f1704] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
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
    <div className="flex flex-col gap-4">
      <p className="text-text">{q.prompt}</p>
      <textarea
        value={state.text ?? ""}
        disabled={state.submitted}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="Write your sentence here"
        className="rounded-lg border border-text/10 bg-background px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
      />
      {!state.submitted ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!state.text}
          className="self-start rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-[#0f1704] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Submit
        </button>
      ) : (
        <p className="text-sm font-medium text-accent">
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
    <div className="flex w-full max-w-3xl flex-col gap-5">
      {questions.map((q, i) => {
        const state = getState(q.id);
        return (
          <div
            key={q.id}
            className="rounded-xl border border-text/10 bg-background p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <p className="text-xs font-medium uppercase tracking-wide text-text/50">{q.word}</p>
            </div>
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
