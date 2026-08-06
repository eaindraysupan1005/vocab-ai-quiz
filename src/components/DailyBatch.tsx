"use client";

import { useState, useTransition } from "react";
import { toggleWordLearned } from "@/app/word-actions";
import type { BatchWord } from "@/lib/daily-batch";

export default function DailyBatch({ words }: { words: BatchWord[] }) {
  const [learned, setLearned] = useState<Set<string>>(
    () => new Set(words.filter((w) => w.status === "learned").map((w) => w.id)),
  );
  const [, startTransition] = useTransition();

  const learnedCount = learned.size;

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
    <div className="w-full max-w-2xl">
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        {learnedCount} of {words.length} learned today
      </p>

      <ul className="flex flex-col gap-3">
        {words.map((word) => {
          const checked = learned.has(word.id);
          return (
            <li
              key={word.id}
              className="flex items-start gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-black"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => handleToggle(word.id, e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0"
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-black dark:text-zinc-50">{word.word}</span>
                  {word.isDue && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      review
                    </span>
                  )}
                  {word.topic && (
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                      {word.topic}
                    </span>
                  )}
                  {word.band_level != null && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-500">
                      band {word.band_level}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{word.definition}</p>
                {word.example_sentence && (
                  <p className="mt-1 text-sm italic text-zinc-500 dark:text-zinc-500">
                    {word.example_sentence}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
