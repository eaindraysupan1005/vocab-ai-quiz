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
- [x] **3. Word list sourcing** — 833 words in `scripts/words.txt` + 477 more in
      `scripts/words1.txt` (deduped against `words.txt`, proper nouns filtered out), enriched via
      Gemini into `enriched-words.json`/`enriched-words1.json`
      (`WORDS_INPUT_FILE=... WORDS_OUTPUT_FILE=... npm run words:enrich`).
- [x] **4. Seed script** — [`scripts/seed-words.js`](scripts/seed-words.js) (`npm run words:seed`,
      or `WORDS_JSON_FILE=... npm run words:seed` for a specific file) upserts into the `words`
      table via the service_role key. Run for both files — **1310 words** are live in the table.
- [x] **5. Auth** — `/login` and `/signup` pages using Server Actions
      (`src/app/{login,signup}/actions.ts`) + Supabase Auth, sign-out action in `src/app/actions.ts`.
      Route protection lives in `src/lib/supabase/middleware.ts` + `src/proxy.ts` (redirects
      unauthenticated visitors to `/login`, redirects logged-in visitors away from `/login`/`/signup`).
- [x] **6. Daily learning page** — [`src/app/page.tsx`](src/app/page.tsx) shows a batch of up to 20
      words (due-for-review first, filled with new words) via
      [`getDailyBatch`](src/lib/daily-batch.ts); checkbox toggles `user_words` through
      [`toggleWordLearned`](src/app/word-actions.ts). Uses a fixed "review again tomorrow" interval
      as a placeholder — step 9 replaces it with real spaced-repetition math.
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
