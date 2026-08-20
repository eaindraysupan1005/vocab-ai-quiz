-- Migration 002 — topic quizzes on the quizzes table.
--
-- Run in the Supabase SQL Editor. Idempotent: safe to run twice.
--
-- Topic quizzes are practice on a fixed set of words rather than a dated
-- session: one per user per topic, resumed whenever the learner comes back.
-- They carry a topic and no quiz_date; daily and weekly carry a quiz_date and
-- no topic.

alter table quizzes add column if not exists topic text;
alter table quizzes alter column quiz_date drop not null;

alter table quizzes drop constraint if exists quizzes_type_check;
alter table quizzes add constraint quizzes_type_check
  check (type in ('daily', 'weekly', 'topic'));

-- A row is dated or topical, never both and never neither.
alter table quizzes drop constraint if exists quizzes_date_or_topic_check;
alter table quizzes add constraint quizzes_date_or_topic_check
  check (num_nonnulls(quiz_date, topic) = 1);

-- One topic quiz per user per topic. Partial, which is why topic quizzes are
-- found-or-inserted rather than upserted: ON CONFLICT can only infer a partial
-- unique index when the statement repeats the predicate, and PostgREST never
-- emits one. The pre-existing (user_id, quiz_date, type) index is deliberately
-- left non-partial for the same reason — topic rows have a null quiz_date and
-- so never collide in it.
create unique index if not exists quizzes_user_topic_key
  on quizzes (user_id, topic) where topic is not null;
