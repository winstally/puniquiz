-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0019_submit_answer_lock.sql : serialize submit_answer against reveal_round
-- -----------------------------------------------------------------------------
-- Bug: host reveal showed "0人が正解" while a player saw "正解！".
--
-- Root cause — a read-committed race. reveal_round locks the game row
-- (`for update`) and scores every committed answer, but submit_answer read the
-- game state WITHOUT a lock:
--   1. submit_answer reads state='question_open' (no lock held)
--   2. reveal_round commits: state='reveal', scores the answers it can see
--   3. submit_answer INSERTs its answer and commits — too late to be scored
-- The answer is recorded but is_correct stays NULL, so correct_count = 0, while
-- the player's optimistic local pick still renders "正解！". Reproduces whenever
-- the host reveals before an in-flight answer commits (e.g. an instant manual
-- reveal in testing).
--
-- Fix: take the SAME `for update` lock on the game row that reveal_round /
-- reveal_answer / host_advance take. Now the two serialize:
--   • submit wins the lock → reveal_round waits, then scores the committed answer.
--   • reveal wins the lock → submit blocks, then re-reads state='reveal' and is
--     rejected ('not accepting answers'); the player's pick rolls back.
-- Either way the host count and the player verdict agree.
--
-- Identical to 0015_host_open_answers' submit_answer except the game SELECT now
-- takes `for update`. Idempotent. Do NOT edit 0001–0018.
-- =============================================================================

create or replace function public.submit_answer(p_game_id uuid, p_choice_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid       uuid := auth.uid();
  v_game      public.games;
  v_player_id uuid;
  v_round     public.rounds;
  v_resp_ms   int;
  v_inserted  boolean := false;
  v_final_key text;
begin
  if v_uid is null then raise exception 'auth required'; end if;

  -- Lock the game row so a concurrent reveal_round can't score the round between
  -- our state check and our INSERT (would leave the answer recorded-but-unscored).
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.state <> 'question_open' then
    raise exception 'not accepting answers';
  end if;

  select id into v_player_id from public.players where game_id = p_game_id and user_id = v_uid;
  if v_player_id is null then raise exception 'not a player'; end if;

  select * into v_round from public.rounds where game_id = p_game_id and position = v_game.current_position;
  if v_round.id is null then raise exception 'no open round'; end if;
  -- Lead guard: not answerable until the host opens answers AND the countdown
  -- has elapsed (answers_open_at is NULL during the await phase).
  if v_round.answers_open_at is null or now() < v_round.answers_open_at then
    raise exception 'answers not open yet';
  end if;
  if v_round.deadline is not null and now() > v_round.deadline then
    raise exception 'deadline passed';
  end if;

  -- Speed measured from answers_open_at (the lead time is not answering time).
  v_resp_ms := greatest(0, (extract(epoch from (now() - v_round.answers_open_at)) * 1000)::int);

  begin
    insert into public.answers (round_id, player_id, choice_key, answered_at, response_ms)
    values (v_round.id, v_player_id, p_choice_key, now(), v_resp_ms);
    v_inserted := true;
    v_final_key := p_choice_key;
  exception when unique_violation then
    -- Already answered (Kahoot: first answer is final). Reconcile the client to the
    -- ANSWER ON RECORD, not this rejected re-tap, so the player's verdict matches
    -- what the host scores.
    v_inserted := false;
    select choice_key into v_final_key
      from public.answers where round_id = v_round.id and player_id = v_player_id;
  end;

  if v_inserted then
    perform realtime.send(
      public._vote_payload(v_round.id),
      'vote', 'game:'||p_game_id::text, true);
  end if;

  return jsonb_build_object('accepted', v_inserted, 'choice_key', v_final_key, 'response_ms', v_resp_ms);
end;
$fn$;

-- end 0019_submit_answer_lock.sql
