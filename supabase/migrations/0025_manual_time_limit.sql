-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0021_manual_time_limit.sql : per-question "manual" mode (no answer timer)
-- -----------------------------------------------------------------------------
-- A question's time_limit_seconds can now be NULL = "手動" (manual): the answer
-- window has NO countdown — the host keeps it open and closes it by hand (lock /
-- reveal). NOT NULL = timed (unchanged). Set per question in the admin editor.
--   • time_limit_seconds : nullable (NULL = manual)
--   • save_quiz          : keep NULL (no longer coalesced to 20)
--   • host_open_answers  : NULL time_limit → deadline NULL (no timer)
--   • reveal_round       : NULL time_limit → flat points (no speed weighting,
--                          since there's no time reference); timed = unchanged.
-- Idempotent. Do NOT edit 0001–0020.
-- =============================================================================

alter table public.questions alter column time_limit_seconds drop not null;

-- save_quiz — keep a NULL time_limit_seconds (manual) instead of forcing 20.
create or replace function public.save_quiz(
  p_quiz_id uuid,
  p_edit_token uuid,
  p_title text,
  p_description text,
  p_is_published boolean,
  p_questions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz       public.quizzes;
  v_q          jsonb;
  v_idx        int := 0;
  v_pos        int;
  v_choices    jsonb;
  v_correct    text;
begin
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if v_quiz.id is null or v_quiz.edit_token <> p_edit_token then
    raise exception 'invalid edit link';
  end if;

  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'title required';
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'questions must be an array';
  end if;
  if jsonb_array_length(p_questions) = 0 then
    raise exception 'at least one question required';
  end if;

  for v_q in select * from jsonb_array_elements(p_questions)
  loop
    v_pos := (v_q ->> 'position')::int;
    if v_pos is null or v_pos <> v_idx then
      raise exception 'positions must be contiguous from 0 (expected %, got %)', v_idx, coalesce(v_pos::text, 'null');
    end if;

    v_choices := v_q -> 'choices';
    if v_choices is null or jsonb_typeof(v_choices) <> 'array' then
      raise exception 'question % has no choices array', v_idx;
    end if;
    if jsonb_array_length(v_choices) <> 4 then
      raise exception 'question % must have exactly 4 choices', v_idx;
    end if;

    if (v_choices -> 0 ->> 'key') is distinct from 'a'
       or (v_choices -> 1 ->> 'key') is distinct from 'b'
       or (v_choices -> 2 ->> 'key') is distinct from 'c'
       or (v_choices -> 3 ->> 'key') is distinct from 'd' then
      raise exception 'question % choice keys must be a,b,c,d', v_idx;
    end if;

    v_correct := v_q ->> 'correct_key';
    if v_correct is null or v_correct not in ('a', 'b', 'c', 'd') then
      raise exception 'question % correct_key % is not one of its choice keys', v_idx, coalesce(v_correct, 'null');
    end if;

    v_idx := v_idx + 1;
  end loop;

  update public.quizzes
    set title        = btrim(p_title),
        description  = p_description,
        is_published = true,
        updated_at   = now()
  where id = p_quiz_id;

  delete from public.questions where quiz_id = p_quiz_id;

  insert into public.questions
    (quiz_id, position, eyebrow, text, choices, correct_key, time_limit_seconds, points_base, media_url)
  select
    p_quiz_id,
    (elem ->> 'position')::int,
    elem ->> 'eyebrow',
    elem ->> 'text',
    elem -> 'choices',
    elem ->> 'correct_key',
    (elem ->> 'time_limit_seconds')::int,            -- NULL = 手動 (manual)
    coalesce((elem ->> 'points_base')::int, 1000),
    nullif(elem ->> 'media_url', '')
  from jsonb_array_elements(p_questions) elem;
end;
$$;

grant execute on function public.save_quiz(uuid, uuid, text, text, boolean, jsonb) to anon, authenticated;

-- host_open_answers — manual question (NULL time_limit) → no deadline.
create or replace function public.host_open_answers(p_game_id uuid, p_host_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_game         public.games;
  v_round        public.rounds;
  v_q            public.questions;
  v_answers_open timestamptz;
  v_deadline     timestamptz;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.host_secret <> p_host_secret then raise exception 'not host'; end if;
  if v_game.state <> 'question_open' then
    raise exception 'not in a question';
  end if;

  select * into v_round from public.rounds where game_id = p_game_id and position = v_game.current_position;
  if v_round.id is null then raise exception 'no round'; end if;
  if v_round.answers_open_at is not null then
    raise exception 'answers already opening';
  end if;

  select * into v_q from public.questions where id = v_round.question_id;

  -- 3-2-1 "ready" countdown, then the answer window. Manual (NULL time_limit) has
  -- no deadline — the host closes it by hand (lock / reveal).
  v_answers_open := now() + interval '3 seconds';
  v_deadline     := case
                      when v_q.time_limit_seconds is null then null
                      else v_answers_open + make_interval(secs => v_q.time_limit_seconds)
                    end;

  update public.rounds set answers_open_at = v_answers_open, deadline = v_deadline
    where id = v_round.id;
  update public.games
    set phase_started_at = now(), phase_deadline = v_deadline, updated_at = now()
    where id = p_game_id;

  perform realtime.send(
    jsonb_build_object(
      'state','question_open','position',v_game.current_position,
      'deadline',v_deadline,'answers_open_at',v_answers_open,'server_now',now()),
    'phase', 'game:'||p_game_id::text, true);
end;
$fn$;

-- reveal_round — manual question scores FLAT (no speed reference); timed unchanged.
-- (Carries forward 0017's two-step: 'phase' only here; correct_key in reveal_answer.)
create or replace function public.reveal_round(p_game_id uuid, p_host_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game     public.games;
  v_round    public.rounds;
  v_q        public.questions;
  r          record;
  v_ratio    numeric;
  v_speed    numeric;
  v_awarded  int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.host_secret <> p_host_secret then raise exception 'not host'; end if;
  update public.games set state = 'reveal', phase_deadline = null, updated_at = now()
    where id = p_game_id and state in ('question_open','locked');
  if not found then
    raise exception 'cannot reveal from state %', v_game.state;
  end if;

  select * into v_round from public.rounds where game_id = p_game_id and position = v_game.current_position;
  if v_round.id is null then raise exception 'no round'; end if;
  select * into v_q from public.questions where id = v_round.question_id;

  for r in
    select a.*, p.id as pid from public.answers a
    join public.players p on p.id = a.player_id
    where a.round_id = v_round.id
  loop
    if r.choice_key = v_q.correct_key then
      if v_q.time_limit_seconds is null then
        v_awarded := v_q.points_base;                       -- manual: flat points
      else
        v_ratio   := least(greatest(r.response_ms::numeric / (v_q.time_limit_seconds * 1000), 0), 1);
        v_speed   := 1 - v_ratio / 2;                        -- instant=full, last=half
        v_awarded := least(round(v_q.points_base * v_speed)::int, v_q.points_base);
      end if;

      update public.scores set streak = streak + 1
        where game_id = p_game_id and player_id = r.pid;
      update public.scores
        set total_points  = total_points + v_awarded,
            correct_count = correct_count + 1,
            updated_at    = now()
      where game_id = p_game_id and player_id = r.pid;
      update public.answers set is_correct = true, awarded_points = v_awarded where id = r.id;
    else
      update public.scores set streak = 0, updated_at = now()
        where game_id = p_game_id and player_id = r.pid;
      update public.answers set is_correct = false, awarded_points = 0 where id = r.id;
    end if;
  end loop;

  update public.rounds set revealed_at = now(), answer_revealed_at = null where id = v_round.id;

  -- phase only — correct_key is withheld until reveal_answer (drumroll 溜め).
  perform realtime.send(
    jsonb_build_object('state','reveal','position',v_game.current_position,'deadline',null,'server_now',now()),
    'phase', 'game:'||p_game_id::text, true);
end;
$$;

-- end 0021_manual_time_limit.sql
