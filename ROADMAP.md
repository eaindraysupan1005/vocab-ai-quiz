# Roadmap

Phased build order for the IELTS Vocabulary app. Full requirements live in
[`ielts-vocab-app-plan.txt`](ielts-vocab-app-plan.txt) — this is just the checklist of what to
build next, in order.

- [x] **0. Scaffold** — Next.js (TS, App Router, Tailwind) project created, `@supabase/supabase-js`
      and `@google/generative-ai` installed as deps. Not wired up yet.
- [x] **1. Supabase project** — project created, keys in `.env.local`.
- [x] **2. DB schema** — `words`, `user_words`, `quizzes`, `quiz_answers` tables + RLS policies
      written in [`supabase/schema.sql`](supabase/schema.sql) (run manually in the Supabase SQL
      Editor). `@supabase/ssr` client utilities added (`src/lib/supabase/{client,server,middleware}.ts`,
      `src/proxy.ts`) so Server/Client Components and Route Handlers can talk to Supabase with
      session cookies handled automatically.
- [x] **3. Word list sourcing** — 769 words in `scripts/words.txt` + 451 more in
      `scripts/words1.txt` (deduped against `words.txt`, proper nouns filtered out), enriched via
      Gemini into `enriched-words.json`/`enriched-words1.json`
      (`WORDS_INPUT_FILE=... WORDS_OUTPUT_FILE=... npm run words:enrich`).
- [x] **4. Seed script** — [`scripts/seed-words.js`](scripts/seed-words.js) (`npm run words:seed`,
      or `WORDS_JSON_FILE=... npm run words:seed` for a specific file) upserts into the `words`
      table via the service_role key. Run for both files, then pruned all band 4.0/4.5 entries (too
      basic for an 8.0 target) from the live table and source files — **1220 words** are live.
- [x] **5. Auth** — `/login` and `/signup` pages using Server Actions
      (`src/app/{login,signup}/actions.ts`) + Supabase Auth, sign-out action in `src/app/actions.ts`.
      Route protection lives in `src/lib/supabase/middleware.ts` + `src/proxy.ts` (redirects
      unauthenticated visitors to `/login`, redirects logged-in visitors away from `/login`/`/signup`).
- [x] **6. Daily learning page** — [`src/app/learn/page.tsx`](src/app/learn/page.tsx) shows a
      batch of up to 20 words (due-for-review first, filled with new words) via
      [`getDailyBatch`](src/lib/daily-batch.ts); checkbox toggles `user_words` through
      [`toggleWordLearned`](src/app/word-actions.ts). Uses a fixed "review again tomorrow" interval
      as a placeholder — step 9 replaces it with real spaced-repetition math.
- [x] **Theme + public landing page** (not a numbered roadmap step, general UI work) — `/` is now a
      public landing page ([`src/app/page.tsx`](src/app/page.tsx)) explaining the product; the
      learning app moved to `/learn`. Added a light/dark theme
      ([`globals.css`](src/app/globals.css) tokens + [`ThemeToggle`](src/components/ThemeToggle.tsx),
      persisted, defaults to system preference) and redesigned `/login`/`/signup` to match.
- [x] **Topics browser** (not a numbered roadmap step, general UI work) —
      [`/topics`](src/app/topics/page.tsx) lists the word bank by theme as cards with word counts;
      [`/topics/[topic]`](src/app/topics/[topic]/page.tsx) shows every word in a topic
      (definition, band, synonyms, example). Sidebar nav is now Daily Words / Quiz / Topics, with
      the old "Learn" label renamed to **Daily Words** (route is still `/learn`).
- [x] **7. Daily quiz** — [`src/app/quiz/page.tsx`](src/app/quiz/page.tsx) +
      [`QuizPlayer`](src/components/QuizPlayer.tsx), unlocked once the day's batch is checked off.
      10 questions on 10 words drawn from that day's pinned batch, **all multiple choice** in three
      styles (word→definition, definition→word, fill-the-blank in the example sentence), one
      question per screen with Submit → feedback → Next. Built in code by
      [`buildDailyQuizQuestions`](src/lib/quiz-generation.ts) from stored definitions/examples with
      distractors sampled from the word bank — **no Gemini at quiz time**; the picks are seeded on
      (user, date) so the quiz is stable across reloads and resumes where you left off. Answers
      persist to `quizzes`/`quiz_answers` and feed the review schedule.
      *Deviation from the plan:* AI-graded sentence production was dropped from the daily quiz —
      it moves to step 8. [`gradeSentenceAnswer`](src/app/quiz/actions.ts) and
      [`buildSentenceGradingPrompt`](src/lib/gemini.ts) are written and working but currently
      unused.
- [x] **8. Weekly review quiz** — the **Weekly review** tab covers everything learned in the past
      7 days, at **half the word count** (learn 100 → 50 questions, rounded up) via
      [`buildWeeklyQuizQuestions`](src/lib/quiz-generation.ts). Words the user has previously got
      wrong are picked first. Every fourth question is **AI-graded sentence production** — Gemini
      judges the sentence through [`gradeSentenceAnswer`](src/app/quiz/actions.ts) — and the rest
      rotate through the same three MCQ styles as the daily quiz. Answers persist to a single
      `quizzes` row per week (`quiz_date` = that Monday, see
      [`weekStartIso`](src/lib/quiz-dates.ts)) and feed the review schedule; the quiz is resumable
      across sittings even as the week's learned set grows.
      *Still outstanding from the plan:* AI grading returns correct/incorrect + a brief reason but
      no suggested improved sentence.
- [x] **Topic quiz** (not a numbered roadmap step) — a **Topic quiz** tab lists topic cards; picking
      one opens a 10-question MCQ practice quiz on that topic (`/quiz?tab=topic&topic=…`).
      **Demo only**: nothing is written to `quiz_answers` and the review schedule is untouched
      (`QuizPlayer persist={false}`).
- [x] **9. Spaced repetition scheduling** — [`spaced-repetition.ts`](src/lib/spaced-repetition.ts)
      runs a **1 → 3 → 7 → 14 → 30 day** interval ladder. Checking a word off on Daily Words puts
      it on the bottom rung (`firstReviewState`, back tomorrow — which is what puts it in range of
      the next day's quiz); each correct quiz answer climbs a rung, a miss drops the word to
      "learning" and back to tomorrow. [`getDailyBatch`](src/lib/daily-batch.ts) feeds due words
      into the batch off `next_review_date`.
      Two earlier gaps are closed: `toggleWordLearned` no longer hardcodes "review tomorrow" (and
      no longer touches `last_reviewed_at`, since checking a word off is learning it, not recalling
      it), and the daily quiz now sends already-tested batch words to the back of the draw, so the
      10 of 20 it skips on one day are the 10 it asks on the next instead of stalling on the first
      interval forever.
      *Known simplification:* there's no `review_streak` column, so the rung is derived from
      `times_correct - times_wrong` rather than a true consecutive-correct streak.
- [x] **10. Progress dashboard** — [`/progress`](src/app/progress/page.tsx): words learned this
      week against a full-week goal (7 × `BATCH_SIZE`), total learned, and accuracy over the last
      7 days. The accuracy trend is a per-day bar chart rather than a lifetime average, and days
      with no answers render blank rather than as 0%. Below it, the explicit weak-word list —
      every word missed at least once, most-missed first, with its right/wrong tally. No badges,
      no streaks, no XP.

## Tech stack
Next.js (frontend + API routes) · PostgreSQL via Supabase · Supabase Auth · Google Gemini API ·
Tailwind CSS.
