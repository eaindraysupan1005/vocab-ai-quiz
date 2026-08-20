# IELTS Vocabulary Trainer

A spaced-repetition vocabulary app for IELTS preparation. Learn a daily batch of words, get quizzed
on them the next day, and let the review schedule bring words back before you forget them.

- **Daily words** — a batch of new + due-for-review words each day, pulled from a 2,060-word bank
  spanning IELTS bands 5.0–9.0.
- **Quizzes** — a daily quiz on yesterday's batch, a weekly review across the past 7 days, an
  on-demand quiz per topic, and a band-level placement test. Questions mix code-built multiple
  choice with AI-written questions and AI-graded sentence production (Google Gemini).
- **Spaced repetition** — a 1 → 3 → 7 → 14 → 30 day interval ladder drives which words come back
  and when.
- **Progress dashboard** — words learned this week, accuracy trend, and a weak-word list.

## Tech stack

Next.js (App Router, Server Actions) · TypeScript · PostgreSQL via Supabase (Auth + RLS) ·
Google Gemini API · Tailwind CSS.

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
