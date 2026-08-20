-- Migration 003 — the functions that work around PostgREST's row cap.
--
-- Run in the Supabase SQL Editor. Idempotent: safe to run twice.
--
-- PostgREST caps every response at 1000 rows (the `max-rows` setting) and
-- `.limit(5000)` does not override it. The words table is past 2000 rows, so
-- any query needing the whole bank silently worked on the first 1000 —
-- undercounting every topic on the topic cards, drawing distractors from half
-- the bank, and re-showing words a user had already learned. Doing the work in
-- Postgres and returning only the answer sidesteps the cap.

-- Word counts per topic, for the topic cards.
-- Every reference to a table column is qualified with `w.`, because the
-- RETURNS TABLE column names are also parameter names in scope in the body.
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
-- which blew past the URL length limit around 200 learned words. `auth.uid()`
-- rather than a parameter, so a caller cannot ask about someone else's
-- progress.
create or replace function unseen_words(p_limit int)
returns setof words
language sql
stable
as $$
  select w.*
  from words w
  where not exists (
    select 1 from user_words uw
    where uw.word_id = w.id and uw.user_id = auth.uid()
  )
  order by w.band_level asc nulls last, w.word asc
  limit p_limit;
$$;

-- A random sample of `p_per_band` words from each band level, for the band
-- level test. Sampling has to happen in the database: the test needs an even
-- spread across bands, and the client could only ever see a truncated,
-- arbitrarily-ordered slice of the bank to sample from.
--
-- The column list must match the `words` rowtype exactly, in table order,
-- because of `returns setof words`.
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
