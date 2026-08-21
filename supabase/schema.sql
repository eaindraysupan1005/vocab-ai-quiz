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
-- ai_questions: Gemini-written multiple-choice questions, cached per word so a
-- topic is only ever generated once. Shared across users like `words` — the
-- question is a property of the word, not of who is answering it.
-- ---------------------------------------------------------------------------
create table if not exists ai_questions (
  id uuid primary key default gen_random_uuid(),
  word_id uuid not null references words(id) on delete cascade,
  prompt text not null,
  -- All four answer choices. Option order is re-shuffled per quiz from the
  -- seed, so what's stored here is just the set.
  options text[] not null,
  correct_option text not null,
  model text not null default 'gemini-2.5-flash',
  created_at timestamptz not null default now(),
  unique (word_id)
);

alter table ai_questions enable row level security;

create policy "ai questions are readable by anyone"
  on ai_questions for select
  using (true);

-- No insert/update/delete policies. The cache is filled by the app with the
-- service_role key (`ensureAiQuestions` in src/lib/ai-questions.ts), never by
-- the signed-in user's own client.
--
-- There used to be an `insert ... with check (true)` policy for authenticated
-- users, on the reasoning that filling a gap is harmless because nobody can
-- edit what's already there. That reasoning was backwards: the cache is shared
-- and unique per word_id, so first writer wins and *nobody* can correct it.
-- One account could have pre-filled the whole bank with questions whose
-- "correct" option is wrong, for every other user, permanently.

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
  -- The calendar day this word was assigned into the user's daily learn
  -- batch. Pins batch membership so it stays fixed for the whole day
  -- regardless of check/uncheck state, independent of next_review_date.
  batch_date date,
  unique (user_id, word_id)
);

create index if not exists user_words_due_idx
  on user_words (user_id, next_review_date);

create index if not exists user_words_batch_idx
  on user_words (user_id, batch_date);

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

-- Added after the table shipped, so existing databases need these too.
--
-- Topic quizzes are practice on a fixed set of words rather than a dated
-- session: one per user per topic, resumed whenever the learner comes back,
-- however long that takes. So they carry a topic and no quiz_date, where
-- daily and weekly carry a quiz_date and no topic.
alter table quizzes add column if not exists topic text;
alter table quizzes alter column quiz_date drop not null;

alter table quizzes drop constraint if exists quizzes_type_check;
alter table quizzes add constraint quizzes_type_check
  check (type in ('daily', 'weekly', 'topic'));

-- A row is dated or topical, never both and never neither.
alter table quizzes drop constraint if exists quizzes_date_or_topic_check;
alter table quizzes add constraint quizzes_date_or_topic_check
  check (num_nonnulls(quiz_date, topic) = 1);

-- Lets the daily and weekly quizzes upsert on (user, date, type) instead of
-- creating a duplicate quizzes row every time a question is answered. Left
-- non-partial deliberately: `ON CONFLICT` can only infer a *partial* unique
-- index when the statement repeats its predicate, which PostgREST never emits,
-- so making this partial would break every upsert through it. Topic rows have
-- a null quiz_date and so never collide here.
create unique index if not exists quizzes_user_date_type_key on quizzes (user_id, quiz_date, type);

-- One topic quiz per user per topic. This one *is* partial, which is why
-- topic quizzes are found-or-inserted rather than upserted (see
-- `getOrCreateQuiz` in src/app/quiz/actions.ts).
create unique index if not exists quizzes_user_topic_key
  on quizzes (user_id, topic) where topic is not null;

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
  ai_suggestion text,
  created_at timestamptz not null default now()
);

-- Added after the table shipped, so existing databases need this too.
alter table quiz_answers add column if not exists ai_suggestion text;

create index if not exists quiz_answers_quiz_idx
  on quiz_answers (quiz_id);

alter table quiz_answers enable row level security;

create policy "users manage their own quiz_answers"
  on quiz_answers for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- ai_usage: how much paid AI a user has spent today. `gradeSentenceAnswer` is
-- an authenticated server action that calls Gemini with nothing between it and
-- the bill, so it spends one unit here first.
-- ---------------------------------------------------------------------------
create table if not exists ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The calendar day in the app's timezone, passed in by the caller rather
  -- than taken from `now()`, so the allowance resets on the same boundary as
  -- the daily batch (see APP_TIMEZONE in src/lib/dates.ts).
  usage_date date not null,
  sentence_grades int not null default 0,
  primary key (user_id, usage_date)
);

alter table ai_usage enable row level security;

-- Readable by its owner. No insert or update policy: the only writer is
-- claim_ai_grade below, which is security definer and bypasses RLS, so a user
-- can't edit their own counter back down to zero.
create policy "users read their own ai usage"
  on ai_usage for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Functions
--
-- These exist because PostgREST caps every response at 1000 rows (the
-- `max-rows` setting), and `.limit(5000)` does not override it. The words
-- table is past 2000 rows, so any query that needs to see the whole bank —
-- counting topics, excluding words a user has already met, sampling across
-- band levels — silently worked on the first 1000 rows before this. Doing the
-- work in Postgres and returning only the answer sidesteps the cap entirely,
-- and is less data over the wire besides.
-- ---------------------------------------------------------------------------

-- Word counts per topic, for the topic cards. Replaces fetching every row and
-- tallying in JS, which undercounted every topic once the bank passed 1000.
create or replace function topic_counts()
returns table (topic text, word_count bigint)
language sql
stable
as $$
  select w.topic, count(*) as word_count
  from words w
  where w.topic is not null
  group by w.topic
  order by count(*) desc, w.topic asc;
$$;

-- Words the calling user has never been shown, cheapest band first. Replaces
-- building a `.not("id", "in", (…))` list of every word the user has seen,
-- which blew past the URL length limit somewhere around 200 learned words.
-- `auth.uid()` is used rather than a parameter so a caller cannot ask about
-- somebody else's progress.
create or replace function unseen_words(p_limit int)
returns setof words
language sql
volatile
as $$
  select w.*
  from words w
  where not exists (
    select 1 from user_words uw
    where uw.word_id = w.id and uw.user_id = auth.uid()
  )
  order by random()
  limit p_limit;
$$;

-- A random sample of `p_per_band` words from each band level, for the band
-- level test. Sampling has to happen in the database: the test needs an even
-- spread across bands, and the client could only ever see a truncated,
-- arbitrarily-ordered slice of the bank to sample from.
create or replace function band_sample(p_per_band int default 6)
returns setof words
language sql
volatile
as $$
  select id, word, definition, example_sentence, topic, band_level, synonyms, created_at
  from (
    select w.*, row_number() over (partition by w.band_level order by random()) as rn
    from words w
    where w.band_level is not null
  ) ranked
  where rn <= p_per_band
  order by band_level asc, rn asc;
$$;

-- Spends one unit of the caller's AI allowance for `p_day` and returns whether
-- they were still inside `p_limit`. The increment and the test are one
-- statement, so two requests in flight can't both read the same count and each
-- conclude they're under the limit. Keyed on auth.uid() rather than a
-- parameter, so a caller cannot spend somebody else's allowance.
create or replace function claim_ai_grade(p_day date, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    return false;
  end if;

  insert into ai_usage (user_id, usage_date, sentence_grades)
  values (auth.uid(), p_day, 1)
  on conflict (user_id, usage_date)
  do update set sentence_grades = ai_usage.sentence_grades + 1
  returning sentence_grades into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function claim_ai_grade(date, int) from public, anon;
grant execute on function claim_ai_grade(date, int) to authenticated;
