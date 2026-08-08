"use client";

import { useState, useTransition } from "react";
import { toggleWordLearned } from "@/app/word-actions";
import type { BatchWord } from "@/lib/daily-batch";

const TOPIC_STYLES: Record<string, string> = {
  environment: "bg-primary/15 text-primary",
  education: "bg-accent/15 text-accent",
  technology: "bg-accent/15 text-accent",
  health: "bg-primary/15 text-primary",
  economy: "bg-secondary/25 text-text",
  society: "bg-secondary/25 text-text",
  culture: "bg-accent/15 text-accent",
  crime: "bg-primary/15 text-primary",
  government: "bg-secondary/25 text-text",
};
const DEFAULT_TOPIC_STYLE = "bg-accent/15 text-accent";

export default function DailyBatch({ words }: { words: BatchWord[] }) {
  const [learned, setLearned] = useState<Set<string>>(
    () => new Set(words.filter((w) => w.status === "learned").map((w) => w.id)),
  );
  const [, startTransition] = useTransition();

  const learnedCount = learned.size;
  const progress = words.length > 0 ? Math.round((learnedCount / words.length) * 100) : 0;

  function handleToggle(wordId: string, checked: boolean) {
    setLearned((prev) => {
      const next = new Set(prev);
      if (checked) next.add(wordId);
      else next.delete(wordId);
      return next;
    });

    startTransition(() => {
      toggleWordLearned(wordId, checked).catch(() => {
        // Revert optimistic update on failure.
        setLearned((prev) => {
          const next = new Set(prev);
          if (checked) next.delete(wordId);
          else next.add(wordId);
          return next;
        });
      });
    });
  }

  return (
    <div className="w-full max-w-5xl">
      <div className="mb-6 flex items-center gap-4 rounded-xl border border-text/10 bg-background p-4 shadow-sm">
        <p className="shrink-0 text-sm font-medium text-text">
          {learnedCount} of {words.length} learned today
        </p>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary/25">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="shrink-0 text-sm font-semibold text-primary">{progress}%</span>
      </div>

      <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {words.map((word) => {
          const checked = learned.has(word.id);
          const topicStyle = word.topic
            ? (TOPIC_STYLES[word.topic] ?? DEFAULT_TOPIC_STYLE)
            : null;

          return (
            <li
              key={word.id}
              className={`flex min-h-[190px] flex-col gap-3 rounded-xl border p-5 shadow-sm transition-shadow hover:shadow-md ${
                checked
                  ? "border-primary/30 bg-primary/[0.06]"
                  : "border-text/10 bg-background"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold text-text">{word.word}</span>
                  {word.isDue && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      review
                    </span>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => handleToggle(word.id, e.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 cursor-pointer"
                  style={{ accentColor: "var(--primary)" }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {topicStyle && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${topicStyle}`}>
                    {word.topic}
                  </span>
                )}
                {word.band_level != null && (
                  <span className="rounded-full bg-secondary/25 px-2 py-0.5 text-xs font-medium text-text/80">
                    band {word.band_level}
                  </span>
                )}
              </div>

              <p className="text-sm text-text/80">{word.definition}</p>

              {word.example_sentence && (
                <p className="mt-auto rounded-lg bg-secondary/10 px-3 py-2 text-sm italic text-text/60">
                  &ldquo;{word.example_sentence}&rdquo;
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
