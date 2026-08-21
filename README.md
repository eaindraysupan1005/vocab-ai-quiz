# IELTS Vocabulary Trainer

A full-stack spaced-repetition vocabulary trainer for IELTS preparation, built with Next.js and
Supabase. Learn a daily batch of words, get quizzed on them the next day, and let a spaced-repetition
schedule bring words back before you forget them — across a self-enriched 2,060-word bank spanning
IELTS bands 5.0–9.0.

**Live app:** [vocabquiz.eaindraysupan.tech](https://vocabquiz.eaindraysupan.tech/)

## Features

- **Daily words** — a batch of 20 words each day (due-for-review words first, topped up with new
  ones), pulled at random across the full band 5.0–9.0 range so a brand-new account isn't stuck
  learning only the easiest words first. Pinned for the day via a `batch_date` column so checking
  words off doesn't reshuffle the list mid-session.
- **Spaced repetition** — a 1 → 3 → 7 → 14 → 30 day interval ladder. Checking a word off puts it on
  the bottom rung (back tomorrow, ready for the next day's quiz); a correct quiz answer climbs a
  rung, a miss drops it back to "learning."
- **Quizzes, four ways:**
  - **Daily quiz** — 10 code-built multiple-choice questions on yesterday's batch, unlocked once
    the day's words are checked off. Question picks are seeded on (user, date) so the quiz is
    stable across reloads.
  - **Weekly review** — covers everything learned in the past 7 days at half the word count.
    Previously-missed words are prioritized, and every fourth question is AI-graded sentence
    production, judged by Google Gemini with a suggested improved sentence when the answer could
    be better.
  - **Topic quiz** — an on-demand practice quiz per topic (up to 40 questions), mixing AI-written
    multiple choice, AI-graded sentence production, and code-built MCQ. AI questions are generated
    once per word and cached in Postgres so only the first visitor to a topic pays the generation
    cost.
  - **Band-level placement test** — 14 questions sampled across band rungs 5.0–8.0+ to estimate the
    learner's current IELTS vocabulary band.
- **Topics browser** — the word bank organized by theme, with word counts and per-topic detail
  pages (definition, band, synonyms, example sentence).
- **Progress dashboard** — words learned this week against a weekly goal, a daily accuracy trend,
  and an explicit weak-word list (every word missed at least once, most-missed first).
- **Light/dark theme**, persisted, defaulting to system preference.

## Engineering highlights

Things that went wrong in an earlier pass and got fixed — see [`docs/ROADMAP.md`](docs/ROADMAP.md)
for the full list:

- **Timezone-correct day boundaries.** Every date computation goes through a single
  `APP_TIMEZONE`-aware helper, instead of `toISOString()`'s implicit UTC — which previously rolled
  the day over at 11pm local time.
- **Worked around PostgREST's 1,000-row response cap** for a 2,060-word bank: unseen-word selection,
  topic counts, and band sampling all moved into Postgres RPC functions instead of fetching-then-
  filtering in the client, which had also been silently truncating topic counts and distractor pools.
- **Prompt-injection hardening** on AI-graded sentence answers — the learner's sentence is fenced as
  data with delimiters the prompt names explicitly, instead of being interpolated directly into the
  grading prompt.
- **Rate-limited AI spend** — sentence grading draws from a daily per-user allowance enforced
  server-side in Postgres (so concurrent requests can't both slip under the cap), and topic-quiz
  question generation is capped per request and cached, so cost converges instead of recurring.
- **Concurrency-safe caching** — the shared AI question cache writes with a service-role key instead
  of a client-writable RLS policy, closing a hole where any user could have permanently seeded a
  wrong "correct" answer for everyone.

## Tech stack

- **Frontend/backend:** Next.js 16 (App Router, Server Actions, Server Components), React 19,
  TypeScript
- **Database & auth:** PostgreSQL via Supabase (Row-Level Security, Postgres RPC functions for
  server-side sampling/aggregation), Supabase Auth with `@supabase/ssr` cookie-based sessions
- **AI:** Google Gemini API — AI-written multiple choice, AI-graded sentence production with
  structured feedback
- **Styling:** Tailwind CSS 4, light/dark theming
- **Testing:** Vitest (unit tests for quiz generation and spaced-repetition logic)
- **Tooling:** a word-bank enrichment pipeline (`scripts/enrich-words.js`) that classifies and
  annotates raw word lists via Gemini, then seeds them into Supabase (`scripts/seed-words.js`)

## Getting started

Requires a Supabase project and a Gemini API key. Copy your keys into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
```

Apply the database schema (`supabase/schema.sql`) and run the migrations in `supabase/migrations/`
against your Supabase project (`supabase link` + `supabase db push`), then seed the word bank:

```bash
npm install
npm run words:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tests

```bash
npm test
```

## More

Build history, deliberate scope cuts, and cross-cutting fixes (timezones, PostgREST row caps,
prompt-injection hardening, rate limiting) are written up in [`docs/ROADMAP.md`](docs/ROADMAP.md).
The original project brief is in [`docs/ielts-vocab-app-plan.txt`](docs/ielts-vocab-app-plan.txt).
