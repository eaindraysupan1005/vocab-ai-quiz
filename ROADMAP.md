# Roadmap

Phased build order for the IELTS Vocabulary app. Full requirements live in
[`ielts-vocab-app-plan.txt`](ielts-vocab-app-plan.txt) — this is just the checklist of what to
build next, in order.

- [x] **0. Scaffold** — Next.js (TS, App Router, Tailwind) project created, `@supabase/supabase-js`
      and `@google/generative-ai` installed as deps. Not wired up yet.
- [ ] **1. Supabase project** — create project, enable email auth.
- [ ] **2. DB schema** — `words`, `user_words`, `quizzes`, `quiz_answers` tables + RLS policies.
- [ ] **3. Word list sourcing** — IELTS Academic Word List + topic-based vocab lists (raw data).
- [ ] **4. Seed script** — load word list into `words`, use Gemini to fill missing
      definitions/examples/synonyms.
- [ ] **5. Auth** — sign up / log in with Supabase Auth, wired into the app.
- [ ] **6. Daily learning page** — show a batch of ~15-20 words (new + due-for-review), checkbox
      to mark learned per user. Ship this first — usable for real study even before quiz features.
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
