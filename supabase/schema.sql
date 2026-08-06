-- IELTS Vocab App schema
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- words: shared word bank, read-only to app users, written by the seed script
-- (service_role) only.
-- ---------------------------------------------------------------------------
create table if not exists words (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  definition text not null,
  example_sentence text,
  topic text,
  band_level numeric(2,1) check (band_level >= 4.0 and band_level <= 9.0),
  synonyms text[] default '{}',
  created_at timestamptz not null default now()
);

-- Lets the seed script upsert on word instead of creating duplicates on re-run.
create unique index if not exists words_word_key on words (word);

alter table words enable row level security;

create policy "words are readable by anyone"
  on words for select
  using (true);

-- No insert/update/delete policies for anon/authenticated: only service_role
-- (which bypasses RLS) can write, via the seed script.

-- ---------------------------------------------------------------------------
-- user_words: per-user learning status + spaced repetition state for a word.
-- ---------------------------------------------------------------------------
create table if not exists user_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id uuid not null references words(id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'learning', 'learned')),
  times_seen int not null default 0,
  times_correct int not null default 0,
  times_wrong int not null default 0,
  next_review_date date,
  last_reviewed_at timestamptz,
  learned_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, word_id)
);

create index if not exists user_words_due_idx
  on user_words (user_id, next_review_date);

alter table user_words enable row level security;

create policy "users manage their own user_words"
  on user_words for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- quizzes: a generated daily or weekly quiz instance for a user.
-- ---------------------------------------------------------------------------
create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('daily', 'weekly')),
  quiz_date date not null,
  created_at timestamptz not null default now()
);

alter table quizzes enable row level security;

create policy "users manage their own quizzes"
  on quizzes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- quiz_answers: individual question/answer records within a quiz.
-- ---------------------------------------------------------------------------
create table if not exists quiz_answers (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id uuid not null references words(id) on delete cascade,
  question_type text not null check (question_type in ('mcq', 'fill_blank', 'sentence')),
  user_answer text,
  is_correct boolean,
  ai_feedback text,
  created_at timestamptz not null default now()
);

create index if not exists quiz_answers_quiz_idx
  on quiz_answers (quiz_id);

alter table quiz_answers enable row level security;

create policy "users manage their own quiz_answers"
  on quiz_answers for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
