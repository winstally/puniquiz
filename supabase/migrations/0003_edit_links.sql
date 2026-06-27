-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0003_edit_links.sql : "anyone-with-the-link can edit" authoring model
-- -----------------------------------------------------------------------------
-- Replaces login-based authoring with a per-quiz secret `edit_token` (uuid).
-- Knowing the edit-link (which embeds the token) IS the capability to edit —
-- like a Google-Docs "anyone with the link can edit". The token is validated
-- inside SECURITY DEFINER RPCs; no auth.uid() is required to author a quiz.
--
-- This migration layers on top of 0001_init.sql + 0002_harden.sql WITHOUT
-- regressing the verified live game loop. It only touches the authoring path:
--   (A) ALTER quizzes: add edit_token (+ index); make owner_id NULLABLE.
--   (B) NEW RPCs: create_quiz, get_quiz_for_edit, save_quiz (SECURITY DEFINER,
--       token-gated). get_quiz_for_edit is the ONLY way correct_key reaches the
--       editor.
--   (C) create_game updated: host when is_published OR owner_id = auth.uid()
--       (link-quizzes are published + ownerless, so anyone can host them).
--   (D) GRANTs: the three new RPCs + create_game callable by anon AND
--       authenticated (no login required).
--
-- Idempotent: add column via DO block (if not exists), create index if not
-- exists, drop owner_id NOT NULL guarded, create-or-replace functions.
-- Do NOT edit 0001/0002. Safe to run on the already-migrated DB.
-- =============================================================================


-- =============================================================================
-- (A) ALTER quizzes — edit_token + ownerless link-quizzes
-- -----------------------------------------------------------------------------
-- edit_token: secret per-quiz capability. NOT NULL, defaults to a fresh uuid so
-- existing rows get a token automatically. owner_id becomes NULLABLE so a
-- link-quiz (created with no signed-in user) can exist without an owner.
-- =============================================================================

-- add edit_token if missing (idempotent)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'quizzes' and column_name = 'edit_token'
  ) then
    alter table public.quizzes
      add column edit_token uuid not null default gen_random_uuid();
  end if;
end $$;

-- index for fast token lookups on the edit path
create index if not exists quizzes_edit_token_idx on public.quizzes(edit_token);

-- owner_id becomes nullable (link-quizzes have no owner). DROP NOT NULL is a
-- no-op if the constraint is already gone, so this is safe to re-run.
alter table public.quizzes alter column owner_id drop not null;


-- =============================================================================
-- (B) NEW AUTHORING RPCs — token-gated, SECURITY DEFINER
-- =============================================================================

-- create_quiz(p_title, p_description) -> {quiz_id, edit_token} -----------------
-- Inserts an ownerless, PUBLISHED quiz + a couple of starter questions (so the
-- editor isn't empty), returns the new id and its secret edit_token. No auth
-- required — the returned token is the capability to edit the quiz afterward.
create or replace function public.create_quiz(
  p_title text,
  p_description text
)
returns table (quiz_id uuid, edit_token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz   public.quizzes;
begin
  -- minimal input validation
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'title required';
  end if;

  -- ownerless + published so a link-quiz can be hosted by anyone with the link
  insert into public.quizzes (owner_id, title, description, is_published)
  values (null, btrim(p_title), p_description, true)
  returning * into v_quiz;

  -- starter questions so the editor opens with something to edit
  insert into public.questions (quiz_id, position, eyebrow, text, choices, correct_key, time_limit_seconds, points_base)
  values
    (v_quiz.id, 0, 'Q1', 'さいしょの問題です。ここを書きかえてね',
      '[{"key":"a","label":"せんたくし A"},{"key":"b","label":"せんたくし B"},{"key":"c","label":"せんたくし C"},{"key":"d","label":"せんたくし D"}]'::jsonb,
      'a', 20, 1000),
    (v_quiz.id, 1, 'Q2', 'ふたつめの問題です。ここを書きかえてね',
      '[{"key":"a","label":"せんたくし A"},{"key":"b","label":"せんたくし B"},{"key":"c","label":"せんたくし C"},{"key":"d","label":"せんたくし D"}]'::jsonb,
      'b', 20, 1000);

  return query select v_quiz.id, v_quiz.edit_token;
end;
$$;


-- get_quiz_for_edit(p_quiz_id, p_edit_token) -> jsonb -------------------------
-- Validates the edit_token (raise 'invalid edit link' on mismatch), then returns
-- the FULL quiz including correct_key for every question. This is the ONLY path
-- by which correct_key reaches the editor (the column is revoked from clients).
create or replace function public.get_quiz_for_edit(
  p_quiz_id uuid,
  p_edit_token uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quiz public.quizzes;
begin
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  -- token check: same error for "not found" and "wrong token" (no enumeration)
  if v_quiz.id is null or v_quiz.edit_token <> p_edit_token then
    raise exception 'invalid edit link';
  end if;

  return jsonb_build_object(
    'id',           v_quiz.id,
    'title',        v_quiz.title,
    'description',  v_quiz.description,
    'is_published', v_quiz.is_published,
    'edit_token',   v_quiz.edit_token,
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position',           q.position,
          'eyebrow',            q.eyebrow,
          'text',               q.text,
          'choices',            q.choices,
          'correct_key',        q.correct_key,
          'time_limit_seconds', q.time_limit_seconds,
          'points_base',        q.points_base
        ) order by q.position
      )
      from public.questions q
      where q.quiz_id = v_quiz.id
    ), '[]'::jsonb)
  );
end;
$$;


-- save_quiz(p_quiz_id, p_edit_token, p_title, p_description, p_is_published,
--           p_questions) -> void --------------------------------------------
-- Validates the token, updates the quiz fields, then REPLACES all questions from
-- p_questions (array of {position,eyebrow,text,choices:[{key,label}],correct_key,
-- time_limit_seconds,points_base}). Validates each question: >= 2 choices,
-- correct_key is one of the choice keys, and positions are contiguous from 0.
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
  v_n_choices  int;
  v_keys       text[];
begin
  -- token check
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if v_quiz.id is null or v_quiz.edit_token <> p_edit_token then
    raise exception 'invalid edit link';
  end if;

  -- quiz-level validation
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'title required';
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'questions must be an array';
  end if;
  if jsonb_array_length(p_questions) = 0 then
    raise exception 'at least one question required';
  end if;

  -- validate every question BEFORE mutating anything (all-or-nothing in the tx)
  for v_q in select * from jsonb_array_elements(p_questions)
  loop
    -- contiguous positions from 0 in array order
    v_pos := (v_q ->> 'position')::int;
    if v_pos is null or v_pos <> v_idx then
      raise exception 'positions must be contiguous from 0 (expected %, got %)', v_idx, coalesce(v_pos::text, 'null');
    end if;

    v_choices := v_q -> 'choices';
    if v_choices is null or jsonb_typeof(v_choices) <> 'array' then
      raise exception 'question % has no choices array', v_idx;
    end if;
    v_n_choices := jsonb_array_length(v_choices);
    if v_n_choices < 2 then
      raise exception 'question % needs at least 2 choices', v_idx;
    end if;

    -- collect choice keys; correct_key must be one of them
    select array_agg(c ->> 'key') into v_keys
    from jsonb_array_elements(v_choices) c;

    v_correct := v_q ->> 'correct_key';
    if v_correct is null or not (v_correct = any(v_keys)) then
      raise exception 'question % correct_key % is not one of its choice keys', v_idx, coalesce(v_correct, 'null');
    end if;

    v_idx := v_idx + 1;
  end loop;

  -- update quiz fields
  update public.quizzes
    set title        = btrim(p_title),
        description  = p_description,
        is_published = coalesce(p_is_published, true),
        updated_at   = now()
  where id = p_quiz_id;

  -- REPLACE all questions: clear then re-insert from the validated payload
  delete from public.questions where quiz_id = p_quiz_id;

  insert into public.questions
    (quiz_id, position, eyebrow, text, choices, correct_key, time_limit_seconds, points_base)
  select
    p_quiz_id,
    (elem ->> 'position')::int,
    elem ->> 'eyebrow',
    elem ->> 'text',
    elem -> 'choices',
    elem ->> 'correct_key',
    coalesce((elem ->> 'time_limit_seconds')::int, 20),
    coalesce((elem ->> 'points_base')::int, 1000)
  from jsonb_array_elements(p_questions) elem;
end;
$$;


-- =============================================================================
-- (C) create_game — allow hosting link-quizzes (published OR owned)
-- -----------------------------------------------------------------------------
-- Identical to 0001's create_game EXCEPT the ownership gate: a link-quiz is
-- published + ownerless, so hosting is allowed when the quiz is published OR
-- owned by the caller. Everything else (auth.uid() host, PIN generation,
-- host_secret default, lobby insert) is preserved verbatim.
-- =============================================================================

create or replace function public.create_game(p_quiz_id uuid)
returns table (game_id uuid, pin text, host_secret uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_pin    text;
  v_game   public.games;
  v_tries  int := 0;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;
  -- Host a published quiz (link-quiz: ownerless+published) OR one you own.
  if not exists (
    select 1 from public.quizzes q
    where q.id = p_quiz_id and (q.is_published or q.owner_id = v_uid)
  ) then
    raise exception 'cannot host this quiz';
  end if;

  -- Generate a unique 6-digit PIN among non-ended games.
  loop
    v_tries := v_tries + 1;
    v_pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into public.games (quiz_id, pin, host_id, state, current_position)
      values (p_quiz_id, v_pin, v_uid, 'lobby', 0)
      returning * into v_game;
      exit;
    exception when unique_violation then
      if v_tries > 20 then raise exception 'could not allocate pin'; end if;
    end;
  end loop;

  return query select v_game.id, v_game.pin, v_game.host_secret;
end;
$$;


-- =============================================================================
-- (D) GRANTS — authoring + hosting without login (anon AND authenticated)
-- -----------------------------------------------------------------------------
-- The new authoring RPCs are gated internally by edit_token, so they are safe to
-- expose to anon. create_game is re-granted to anon too so an anonymous host can
-- start a link-quiz. (0002 revoked EXECUTE from public/anon/authenticated, then
-- re-granted the client RPC set to authenticated; we add anon for these.)
-- =============================================================================

grant execute on function public.create_quiz(text, text)                       to anon, authenticated;
grant execute on function public.get_quiz_for_edit(uuid, uuid)                 to anon, authenticated;
grant execute on function public.save_quiz(uuid, uuid, text, text, boolean, jsonb) to anon, authenticated;

-- anonymous hosts allowed for published (link) quizzes
grant execute on function public.create_game(uuid)                             to anon, authenticated;

-- end 0003_edit_links.sql
