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
      root `middleware.ts`) so Server/Client Components and Route Handlers can talk to Supabase
      with session cookies handled automatically.
- [x] **3. Word list sourcing** — 833 words in `scripts/words.txt`, enriched via Gemini into
      `scripts/enriched-words.json` (`npm run words:enrich`).
- [x] **4. Seed script** — [`scripts/seed-words.js`](scripts/seed-words.js) (`npm run words:seed`)
      upserts `enriched-words.json` into the `words` table via the service_role key. Run — all 833
      words are live in the `words` table.
- [x] **5. Auth** — `/login` and `/signup` pages using Server Actions
      (`src/app/{login,signup}/actions.ts`) + Supabase Auth, sign-out action in `src/app/actions.ts`.
      Route protection lives in `src/lib/supabase/middleware.ts` (redirects unauthenticated visitors
      to `/login`, redirects logged-in visitors away from `/login`/`/signup`). `src/app/page.tsx` is
      currently just a placeholder "you're signed in" screen — replaced by step 6 next.
- [ ] **6. Daily learning page** — show a batch of ~15-20 words (new + due-for-review), checkbox
      to mark learned per user. Ship this first — usable for real study even before quiz features.
      Replaces the placeholder home page from step 5.
- [ ] **7. AI daily quiz** — generate next-day quiz from previously learned words; MCQ/fill-in for
      new words, AI-graded sentence production for repeat words.
- [ ] **8. Weekly review quiz** — larger quiz across the week, weighted toward previously-wrong
      words.
- [ ] **9. Spaced repetition scheduling** — track correct/wrong per word, adjust next review date,
      feed "due" words into the daily batch.
- [ ] **10. Progress dashboard** — words learned this week vs. goal, 7-day accuracy trend, explicit
      weak-word list. No gamification.

## Tech stack
Next.js (frontend + API routes) · PostgreSQL via Supabase · Supabase Auth · Google Gemini API ·
Tailwind CSS.
