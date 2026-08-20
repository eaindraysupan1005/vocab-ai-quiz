"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { estimateBand, type BandQuestion } from "@/lib/quiz-generation";

export default function BandLevelQuiz({ questions }: { questions: BandQuestion[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [correctIds, setCorrectIds] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState(false);

  if (questions.length === 0) {
    return <p className="mt-12 text-text/70">No band-level questions available right now.</p>;
  }

  if (finished) {
    const score = correctIds.size;
    const { band, breakdown } = estimateBand(questions, correctIds);

    return (
      <div className="w-full max-w-2xl rounded-xl border border-primary/30 bg-primary/[0.06] p-6 text-center shadow-sm">
        <p className="text-lg font-semibold text-text">Demo band-level test complete!</p>
        <p className="mt-1 text-text/70">
          You scored {score} of {questions.length}.
        </p>
        <p className="mt-3 text-2xl font-semibold text-primary">
          {band != null
            ? `Estimated band: ${band.toFixed(1)}`
            : `Below band ${breakdown[0]?.band.toFixed(1) ?? "5.0"}`}
        </p>

        {/* Where they stopped matters more than the single number — the
            estimate is the last rung they cleared, so showing the rungs makes
            it obvious why. */}
        <div className="mt-4 flex flex-col gap-1.5">
          {breakdown.map((rung) => {
            const cleared = rung.correct * 2 > rung.total;
            return (
              <div
                key={rung.band}
                className="flex items-center justify-between gap-3 rounded-lg border border-text/10 px-4 py-2 text-sm"
              >
                <span className="text-text/70">Band {rung.band.toFixed(1)}</span>
                <span className={cleared ? "text-green-700 dark:text-green-400" : "text-text/50"}>
                  {rung.correct} of {rung.total}
                  {cleared ? " · cleared" : ""}
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-xs text-text/50">
          A rough demo estimate: the highest level where you got more than half right, counting up
          from the easiest and stopping at the first one you missed. Not an official IELTS score.
        </p>
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setSelected(null);
            setSubmitted(false);
            setCorrectIds(new Set());
            setFinished(false);
            router.refresh();
          }}
          className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-[#0f1704] shadow-sm transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      </div>
    );
  }

  const q = questions[index];
  const isLast = index === questions.length - 1;

  return (
    <div className="w-full max-w-2xl rounded-xl border border-text/10 bg-background p-5 shadow-sm">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text/50">
        Question {index + 1} of {questions.length}
      </p>
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
            selected === q.correctIndex
              ? "text-green-700 dark:text-green-400"
              : "text-red-700 dark:text-red-400"
          }`}
        >
          {selected === q.correctIndex
            ? "Correct!"
            : `Not quite — the correct answer was "${q.options[q.correctIndex]}".`}
        </p>
      )}

      {!submitted ? (
        <button
          type="button"
          disabled={selected === null}
          onClick={() => {
            if (selected === q.correctIndex) {
              setCorrectIds((prev) => new Set(prev).add(q.id));
            }
            setSubmitted(true);
          }}
          className="mt-5 self-start rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-[#0f1704] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Submit
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setSubmitted(false);
            if (isLast) {
              setFinished(true);
            } else {
              setIndex((i) => i + 1);
            }
          }}
          className="mt-5 self-start rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-[#0f1704] shadow-sm transition-opacity hover:opacity-90"
        >
          {isLast ? "Finish" : "Next"}
        </button>
      )}
    </div>
  );
}
