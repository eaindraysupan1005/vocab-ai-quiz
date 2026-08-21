-- `unseen_words` previously ordered by `band_level asc`, so a brand-new
-- account's first batch (and any later batch topping up from the unseen
-- pool) was filled entirely from the lowest available bands before ever
-- reaching higher ones — band 5/5.5 alone outnumber a 20-word batch. Order
-- randomly instead so a batch draws from the full band 5-9 range.
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
