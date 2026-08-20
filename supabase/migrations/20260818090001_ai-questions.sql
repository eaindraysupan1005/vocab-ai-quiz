-- Migration 001 — AI question cache.
--
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- schema.sql is the full picture but can't be re-run against a live database
-- (its `create policy` statements have no `if not exists`), so this file holds
-- just the statements a database created before these changes still needs.
-- Every statement here is idempotent — running it twice is safe.
--
-- The quizzes changes and the functions that were originally in this file now
-- live in 002-quizzes-topic.sql and 003-rpcs.sql. The SQL Editor runs a script
-- as one transaction, so keeping them together meant one failure rolled back
-- all three; split, a failure is isolated to the part that caused it.

-- ---------------------------------------------------------------------------
-- 1. ai_questions — Gemini-written multiple choice, cached per word so a topic
--    is only ever generated once. Shared across users: the question is a
--    property of the word, not of who is answering it.
-- ---------------------------------------------------------------------------
create table if not exists ai_questions (
  id uuid primary key default gen_random_uuid(),
  word_id uuid not null references words(id) on delete cascade,
  prompt text not null,
  options text[] not null,
  correct_option text not null,
  model text not null default 'gemini-2.5-flash',
  created_at timestamptz not null default now(),
  unique (word_id)
);

alter table ai_questions enable row level security;

drop policy if exists "ai questions are readable by anyone" on ai_questions;
create policy "ai questions are readable by anyone"
  on ai_questions for select
  using (true);

-- No insert/update/delete policies. The cache is filled by the app with the
-- service_role key (`ensureAiQuestions` in src/lib/ai-questions.ts), which
-- bypasses RLS, so the signed-in user's own client never writes here.
--
-- This file used to grant authenticated users `insert ... with check (true)`,
-- on the reasoning that filling a gap is harmless because nobody can edit what
-- is already there. That reasoning was backwards: the cache is shared and
-- unique per word_id, so the first writer wins and *nobody* can correct it —
-- one account could have pre-filled the whole bank with questions whose
-- "correct" option is wrong, for every other user, permanently.
--
-- Removed here rather than dropped in a later migration because this table has
-- never been created in any database, so the policy has never existed.
-- 004-ai-questions-lockdown.sql still drops it, for any environment where an
-- older copy of this file was already run.
drop policy if exists "signed-in users can fill the ai question cache" on ai_questions;

