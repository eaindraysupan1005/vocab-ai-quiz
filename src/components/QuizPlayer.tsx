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

type SentenceResult = { isCorrect: boolean; feedback: string; suggestion?: string };

// What the user answered, kept per word so the completed card can replay the
// whole quiz. Seeded from quiz_answers on load and added to as they play, so
// review works whether the quiz was finished now or on an earlier sitting.
export type AnswerRecord = {
  userAnswer: string;
  isCorrect: boolean;
  feedback?: string;
  suggestion?: string;
};
export type AnswerLog = Record<string, AnswerRecord>;

// One question replayed on the completed card: the prompt, every option with
// the right one marked, and which one the user picked.
function ReviewCard({
  index,
  question,
  record,
}: {
  index: number;
  question: Question;
  record: AnswerRecord | undefined;
}) {
  const answered = record !== undefined;

  return (
    <div className="rounded-xl border border-text/10 bg-background p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-text/50">
          Question {index + 1}
        </span>
        <span
          className={`text-xs font-medium ${
            !answered
              ? "text-text/50"
              : record.isCorrect
                ? "text-green-700 dark:text-green-400"
                : "text-red-700 dark:text-red-400"
          }`}
        >
          {!answered ? "Not answered" : record.isCorrect ? "Correct" : "Incorrect"}
        </span>
      </div>

      <p className="mt-2 text-text">{question.prompt}</p>

      {question.type === "sentence" ? (
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text/50">
              Your sentence
            </p>
            <p className="mt-1 text-sm text-text/80">{record?.userAnswer || "—"}</p>
          </div>
          {record?.feedback && <p className="text-sm text-text/70">{record.feedback}</p>}
          {record?.suggestion && (
            <div className="rounded-lg border border-text/10 bg-text/[0.03] px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-text/50">
                Suggested sentence
              </p>
              <p className="mt-1 text-sm text-text/80">{record.suggestion}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {question.options.map((option, i) => {
            const isAnswer = i === question.correctIndex;
            const wasPicked = answered && option === record.userAnswer;
            return (
              <div
                key={i}
                className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${
                  isAnswer
                    ? "border-green-600/40 bg-green-600/10 text-text"
                    : wasPicked
                      ? "border-red-600/40 bg-red-600/10 text-text"
                      : "border-text/10 text-text/70"
                }`}
              >
                <span>{option}</span>
                {wasPicked && (
                  <span className="shrink-0 text-xs font-medium text-text/60">Your answer</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function QuizPlayer({
  questions,
  startIndex = 0,
  initialCorrect = 0,
  initialAnswers,
  quizKind = "daily",
  persist = true,
  onFinishNote,
}: {
  questions: Question[];
  startIndex?: number;
  initialCorrect?: number;
  initialAnswers?: AnswerLog;
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
  const [answerLog, setAnswerLog] = useState<AnswerLog>(initialAnswers ?? {});
  const [reviewing, setReviewing] = useState(false);
  const [finished, setFinished] = useState(startIndex >= questions.length);
  const [, startTransition] = useTransition();

  function logAnswer(wordId: string, record: AnswerRecord) {
    setAnswerLog((log) => ({ ...log, [wordId]: record }));
  }

  if (questions.length === 0) return null;

  if (finished) {
    const reviewable = questions.some((q) => answerLog[q.wordId]);

    return (
      <div className="flex w-full max-w-3xl flex-col gap-4">
        <div className="rounded-xl border border-primary/30 bg-primary/[0.06] p-6 text-center shadow-sm">
          <p className="text-lg font-semibold text-text">Quiz complete!</p>
          <p className="mt-1 text-text/70">
            You scored {correctCount} of {questions.length}.
            {onFinishNote ? ` ${onFinishNote}` : ""}
          </p>

          {reviewable && (
            <button
              type="button"
              onClick={() => setReviewing((r) => !r)}
              className="mt-4 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-[#0f1704] shadow-sm transition-opacity hover:opacity-90"
            >
              {reviewing ? "Hide review" : "Review answers"}
            </button>
          )}
        </div>

        {reviewing &&
          questions.map((question, i) => (
            <ReviewCard
              key={question.id}
              index={i}
              question={question}
              record={answerLog[question.wordId]}
            />
          ))}
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
        logAnswer(q.wordId, { ...result, userAnswer: text });
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
    logAnswer(q.wordId, { userAnswer: answerText, isCorrect: correct });
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
            <>
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

              {q.type === "sentence" && sentenceResult?.suggestion && (
                <div className="mt-3 rounded-lg border border-text/10 bg-text/[0.03] px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-text/50">
                    Suggested sentence
                  </p>
                  <p className="mt-1 text-sm text-text/80">{sentenceResult.suggestion}</p>
                </div>
              )}
            </>
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
