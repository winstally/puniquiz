-- 0044_quiz_level_answer_mode.sql
--
-- The answer mode (早押し ⇄ じっくり) is a property of the QUIZ, decided while
-- authoring — not a lobby toggle. Move the flag from games to quizzes:
--   - quizzes.answer_change_allowed (default false = 早押し)
--   - save_quiz / get_quiz_for_edit read+write it
--   - submit_answer / reveal_round / get_game_snapshot resolve the mode from the
--     game's CURRENT quiz (tracks quiz chaining automatically)
--   - drop the lobby-time set_answer_mode RPC and games.answer_change_allowed

alter table public.quizzes
  add column if not exists answer_change_allowed boolean not null default false;

-- Preserve any mode already set on an active game (0043 shipped briefly).
update public.quizzes q
  set answer_change_allowed = true
  where exists (
    select 1 from public.games g
    where g.quiz_id = q.id and g.answer_change_allowed = true
  );

-- --- get_quiz_for_edit — expose the mode ---------------------------------------
create or replace function public.get_quiz_for_edit(p_quiz_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_quiz public.quizzes;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if not public.is_admin_user(v_uid) then
    raise exception 'admin invite required';
  end if;

  select * into v_quiz
  from public.quizzes
  where id = p_quiz_id;

  if v_quiz.id is null then
    raise exception 'quiz not found';
  end if;

  return jsonb_build_object(
    'id',           v_quiz.id,
    'title',        v_quiz.title,
    'description',  v_quiz.description,
    'is_published', v_quiz.is_published,
    'answer_change_allowed', v_quiz.answer_change_allowed,
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',                   q.id,
          'position',             q.position,
          'eyebrow',              q.eyebrow,
          'text',                 q.text,
          'choices',              q.choices,
          'correct_key',          q.correct_key,
          'time_limit_seconds',   q.time_limit_seconds,
          'points_base',          q.points_base,
          'media_url',            q.media_url
        ) order by q.position
      )
      from public.questions q
      where q.quiz_id = v_quiz.id
    ), '[]'::jsonb)
  );
end;
$$;

-- --- save_quiz — accept the mode (new arity replaces the old signature) --------
drop function if exists public.save_quiz(uuid, text, text, boolean, jsonb);

create or replace function public.save_quiz(
  p_quiz_id uuid,
  p_title text,
  p_description text,
  p_is_published boolean,
  p_questions jsonb,
  p_answer_change_allowed boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_quiz public.quizzes;
  v_q jsonb;
  v_idx int := 0;
  v_pos int;
  v_choices jsonb;
  v_correct text;
  v_question_id uuid;
  v_seen_ids uuid[] := array[]::uuid[];
  v_existing_choices jsonb;
  v_merged_choices jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if not public.is_admin_user(v_uid) then
    raise exception 'admin invite required';
  end if;

  select * into v_quiz
  from public.quizzes
  where id = p_quiz_id
  for update;

  if v_quiz.id is null then
    raise exception 'quiz not found';
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

  perform 1
  from public.questions
  where quiz_id = p_quiz_id
  for update;

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

    if v_q ? 'id' then
      begin
        v_question_id := (v_q ->> 'id')::uuid;
      exception when invalid_text_representation then
        raise exception 'question % has an invalid id', v_idx;
      end;

      if v_question_id is null then
        raise exception 'question % has an invalid id', v_idx;
      end if;
      if v_question_id = any(v_seen_ids) then
        raise exception 'question % repeats an existing id', v_idx;
      end if;
      if not exists (
        select 1 from public.questions
        where id = v_question_id and quiz_id = p_quiz_id
      ) then
        raise exception 'question % does not belong to this quiz', v_idx;
      end if;
      v_seen_ids := array_append(v_seen_ids, v_question_id);
    end if;

    v_idx := v_idx + 1;
  end loop;

  update public.quizzes
    set title        = btrim(p_title),
        description  = p_description,
        is_published = coalesce(p_is_published, true),
        answer_change_allowed = coalesce(p_answer_change_allowed, answer_change_allowed),
        updated_at   = now()
  where id = p_quiz_id;

  delete from public.questions
  where quiz_id = p_quiz_id
    and not (id = any(v_seen_ids));

  -- Move retained positions out of the non-negative range first so swaps do
  -- not collide with the unique (quiz_id, position) constraint.
  update public.questions
  set position = -position - 1
  where quiz_id = p_quiz_id;

  for v_q in select * from jsonb_array_elements(p_questions)
  loop
    v_question_id := null;
    if v_q ? 'id' then
      v_question_id := (v_q ->> 'id')::uuid;
    end if;
    v_choices := v_q -> 'choices';

    if v_question_id is null then
      insert into public.questions
        (quiz_id, position, eyebrow, text, choices, correct_key, time_limit_seconds, points_base, media_url)
      values
        (p_quiz_id,
         (v_q ->> 'position')::int,
         v_q ->> 'eyebrow',
         v_q ->> 'text',
         v_choices,
         v_q ->> 'correct_key',
         (v_q ->> 'time_limit_seconds')::int,
         coalesce((v_q ->> 'points_base')::int, 100),
         nullif(v_q ->> 'media_url', ''));
    else
      select choices into v_existing_choices
      from public.questions
      where id = v_question_id and quiz_id = p_quiz_id;

      select jsonb_agg(
        case
          when submitted.choice ? 'image_url' then submitted.choice
          else submitted.choice || coalesce((
            select jsonb_build_object('image_url', existing.choice -> 'image_url')
            from jsonb_array_elements(v_existing_choices) existing(choice)
            where existing.choice ->> 'key' = submitted.choice ->> 'key'
              and existing.choice ? 'image_url'
            limit 1
          ), '{}'::jsonb)
        end
        order by submitted.ordinality
      ) into v_merged_choices
      from jsonb_array_elements(v_choices) with ordinality submitted(choice, ordinality);

      update public.questions
      set position = (v_q ->> 'position')::int,
          eyebrow = v_q ->> 'eyebrow',
          text = v_q ->> 'text',
          choices = v_merged_choices,
          correct_key = v_q ->> 'correct_key',
          time_limit_seconds = (v_q ->> 'time_limit_seconds')::int,
          points_base = coalesce((v_q ->> 'points_base')::int, 100),
          media_url = case
            when v_q ? 'media_url' then nullif(v_q ->> 'media_url', '')
            else media_url
          end
      where id = v_question_id and quiz_id = p_quiz_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.get_quiz_for_edit(uuid) from public, anon, authenticated, service_role;
revoke all on function public.save_quiz(uuid, text, text, boolean, jsonb, boolean) from public, anon, authenticated, service_role;
grant execute on function public.get_quiz_for_edit(uuid) to authenticated;
grant execute on function public.save_quiz(uuid, text, text, boolean, jsonb, boolean) to authenticated;

-- --- submit_answer — mode comes from the game's current quiz --------------------
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
  v_allowed   boolean;
begin
  if v_uid is null then raise exception 'auth required'; end if;

  select * into v_game from public.games where id = p_game_id;
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

  select coalesce(answer_change_allowed, false) into v_allowed
  from public.quizzes where id = v_game.quiz_id;

  if v_allowed then
    -- じっくり mode: last pick wins; a change refreshes the recorded time.
    insert into public.answers (round_id, player_id, choice_key, answered_at, response_ms)
    values (v_round.id, v_player_id, p_choice_key, now(), v_resp_ms)
    on conflict (round_id, player_id) do update
      set choice_key = excluded.choice_key,
          answered_at = excluded.answered_at,
          response_ms = excluded.response_ms;
    v_inserted := true;
  else
    -- 早押し mode: the first answer is final (UNIQUE swallows re-answers).
    begin
      insert into public.answers (round_id, player_id, choice_key, answered_at, response_ms)
      values (v_round.id, v_player_id, p_choice_key, now(), v_resp_ms);
      v_inserted := true;
    exception when unique_violation then
      v_inserted := false;
    end;
  end if;

  if v_inserted then
    perform realtime.send(
      public._vote_payload(v_round.id),
      'vote', 'game:'||p_game_id::text, true);
  end if;

  return jsonb_build_object('accepted', v_inserted, 'choice_key', p_choice_key, 'response_ms', v_resp_ms);
end;
$fn$;

-- --- reveal_round — mode comes from the game's current quiz ---------------------
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
  v_reveal_at timestamptz;
  v_allowed  boolean;
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

  select coalesce(answer_change_allowed, false) into v_allowed
  from public.quizzes where id = v_game.quiz_id;

  for r in
    select a.*, p.id as pid from public.answers a
    join public.players p on p.id = a.player_id
    where a.round_id = v_round.id
  loop
    if r.choice_key = v_q.correct_key then
      if v_q.time_limit_seconds is null or v_allowed then
        v_awarded := v_q.points_base;
      else
        v_ratio   := least(greatest(r.response_ms::numeric / (v_q.time_limit_seconds * 1000), 0), 1);
        v_speed   := 1 - v_ratio / 2;
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

  v_reveal_at := now() + interval '4 seconds';
  update public.rounds set revealed_at = now(), answer_reveal_at = v_reveal_at where id = v_round.id;

  perform realtime.send(
    jsonb_build_object('state','reveal','position',v_game.current_position,'deadline',null,'server_now',now()),
    'phase', 'game:'||p_game_id::text, true);
  perform realtime.send(
    jsonb_build_object(
      'correct_key', v_q.correct_key,
      'counts', (public._vote_payload(v_round.id) -> 'counts'),
      'total',  (public._vote_payload(v_round.id) -> 'total'),
      'correct_count', (select count(*)::int from public.answers where round_id = v_round.id and is_correct),
      'leaderboard', public._leaderboard(p_game_id),
      'score_max_points', public._quiz_score_max_points(v_game.quiz_id, v_game.current_position, false),
      'answer_reveal_at', v_reveal_at,
      'server_now', now()),
    'reveal', 'game:'||p_game_id::text, true);
end;
$$;

-- --- get_game_snapshot — mode from the game's current quiz ----------------------
create or replace function public.get_game_snapshot(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_game   public.games;
  v_round  public.rounds;
  v_me     uuid;
  v_my     jsonb := null;
  v_question jsonb := null;
  v_correct text := null;
  v_revealed boolean := false;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception 'game not found'; end if;
  if not public.is_game_member(p_game_id) then raise exception 'not a member'; end if;

  if v_game.state <> 'lobby' then
    v_question := public._question_public(v_game.quiz_id, v_game.current_position);
    select * into v_round from public.rounds where game_id = p_game_id and position = v_game.current_position;
    v_revealed := v_round.id is not null and v_round.revealed_at is not null;
    if v_revealed then
      select correct_key into v_correct from public.questions where id = v_round.question_id;
    end if;
  end if;

  select id into v_me from public.players where game_id = p_game_id and user_id = v_uid;
  if v_me is not null and v_round.id is not null then
    select jsonb_build_object(
      'choice_key', a.choice_key,
      'is_correct', case when v_revealed then a.is_correct else null end,
      'awarded_points', case when v_revealed then a.awarded_points else null end
    ) into v_my
    from public.answers a where a.round_id = v_round.id and a.player_id = v_me;
  end if;

  return jsonb_build_object(
    'state', v_game.state,
    'current_position', v_game.current_position,
    'current_question', v_question,
    'phase_deadline', v_game.phase_deadline,
    'answers_open_at', v_round.answers_open_at,
    'server_now', now(),
    'registration_locked', v_game.registration_locked,
    'answer_change_allowed', coalesce((select answer_change_allowed from public.quizzes where id = v_game.quiz_id), false),
    'has_next', (v_game.next_quiz_id is not null),
    'is_demo', coalesce((select is_demo from public.quizzes where id = v_game.quiz_id), false),
    'max_points', public._quiz_max_points(v_game.quiz_id),
    'score_max_points', public._quiz_score_max_points(v_game.quiz_id, v_game.current_position, v_game.state = 'ended'),
    'correct_key', v_correct,
    'answer_reveal_at', v_round.answer_reveal_at,
    'correct_count', case
      when v_revealed
      then (select count(*)::int from public.answers where round_id = v_round.id and is_correct)
      else 0 end,
    'my_answer', v_my,
    'vote', case when v_round.id is not null then public._vote_payload(v_round.id) else null end,
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', p.id, 'nickname', p.nickname,
        'avatar_color', p.avatar_color, 'avatar_initial', p.avatar_initial,
        'is_connected', p.is_connected))
      from public.players p where p.game_id = p_game_id), '[]'::jsonb),
    'leaderboard', public._leaderboard(p_game_id)
  );
end;
$fn$;

-- --- retire the lobby-time toggle -----------------------------------------------
drop function if exists public.set_answer_mode(uuid, uuid, boolean);
alter table public.games drop column if exists answer_change_allowed;

notify pgrst, 'reload schema';
