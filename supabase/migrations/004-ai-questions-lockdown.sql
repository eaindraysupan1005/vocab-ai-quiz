-- Migration 004 — close the ai_questions insert hole.
--
-- Run in the Supabase SQL Editor. Idempotent: safe to run twice.
--
-- `ai_questions` is a *shared* cache: the Gemini-written question is a property
-- of the word, not of who is answering it, and it's unique per word_id so the
-- first writer wins. It shipped with
--
--   create policy "signed-in users can fill the ai question cache"
--     on ai_questions for insert to authenticated with check (true);
--
-- so any signed-in account could write any row — including pre-filling every
-- word in the bank with a question whose "correct" option is wrong, for every
-- other user, permanently (there's no update or delete policy to fix it with).
--
-- The app now fills the cache with the service_role key instead, from
-- `ensureAiQuestions` in src/lib/ai-questions.ts, which runs server-side only.
-- Reads are untouched: the select policy still lets anyone read a question.
--
-- 001 no longer creates that policy, so on a database migrated from scratch
-- this file has nothing to do. It stays for any environment where an older
-- copy of 001 was already run, and is wrapped so that a database without the
-- table yet — where `drop policy` would fail with "relation does not exist"
-- and roll back the whole script — is simply left alone.
do $$
begin
  if to_regclass('public.ai_questions') is not null then
    execute 'drop policy if exists "signed-in users can fill the ai question cache" on ai_questions';
  end if;
end $$;
