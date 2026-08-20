-- Migration 005 — a per-user daily allowance for AI sentence grading.
--
-- Run in the Supabase SQL Editor. Idempotent: safe to run twice.
--
-- `gradeSentenceAnswer` is an authenticated server action that calls a paid API
-- with nothing between it and the bill. One counter row per user per day, spent
-- one unit at a time before the Gemini call is made.

create table if not exists ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The calendar day in the app's timezone, passed in by the caller rather
  -- than taken from `now()` here, so the allowance resets on the same boundary
  -- as the daily batch (see APP_TIMEZONE in src/lib/dates.ts).
  usage_date date not null,
  sentence_grades int not null default 0,
  primary key (user_id, usage_date)
);

alter table ai_usage enable row level security;

-- Readable by its owner so the number can be shown in the UI later. There is
-- deliberately no insert or update policy: the only writer is claim_ai_grade
-- below, which is security definer and so bypasses RLS. That keeps a user from
-- editing their own counter back down to zero.
drop policy if exists "users read their own ai usage" on ai_usage;
create policy "users read their own ai usage"
  on ai_usage for select
  using (auth.uid() = user_id);

-- Spends one unit of the caller's allowance for `p_day` and returns whether
-- they were still inside `p_limit`.
--
-- The increment and the test are one statement so two requests in flight can't
-- both read the same count and each conclude they're under the limit. Keyed on
-- auth.uid() rather than a parameter, so a caller cannot spend somebody else's
-- allowance — and calling this directly with a made-up p_day or a huge p_limit
-- gains nothing: it's the server action's own call, with the real day and the
-- real limit, that decides whether Gemini is invoked.
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
