-- 0004_lookup_game.sql
--
-- lookup_game(p_pin) — validate a join code WITHOUT creating a player row.
--
-- The redesigned landing gates the "enter nickname" step on a real, joinable
-- game: the player scans a QR (or types the code), we confirm a game exists for
-- that PIN, and only then ask for a nickname + show 参加する. join_game still does
-- the actual join; this is a cheap, side-effect-free pre-check.
--
-- Mirrors join_game's joinable predicate (state <> 'ended'). Exposes only the
-- game id, state, and the quiz title — never correct_key or any secret. Granted
-- to anon so the pre-check needs no anonymous sign-in (we only mint a session
-- when the player actually joins).
create or replace function public.lookup_game(p_pin text)
returns table(game_id uuid, state text, quiz_title text)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.state::text, q.title
  from public.games g
  join public.quizzes q on q.id = g.quiz_id
  where g.pin = p_pin and g.state <> 'ended'
  limit 1;
$$;

revoke all on function public.lookup_game(text) from public;
grant execute on function public.lookup_game(text) to anon, authenticated;
