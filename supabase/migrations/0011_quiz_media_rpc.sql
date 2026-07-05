-- 0007_quiz_media_rpc.sql
-- Carry image data through the RPCs. Per-answer images already flow for free
-- (they live inside questions.choices jsonb, which is stored/returned verbatim).
-- Only the question-level media_url needs threading: into save_quiz (store),
-- get_quiz_for_edit (reload in the editor), and _question_public (deliver to the
-- host screen + player phones — both build the public question through it).

-- (1) public question payload -> add media_url (choices already include image_url)
create or replace function public._question_public(p_quiz_id uuid, p_position int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(t) from (
    select q.position, q.eyebrow, q.text, q.choices, q.time_limit_seconds, q.media_url
    from public.questions q
    where q.quiz_id = p_quiz_id and q.position = p_position
  ) t;
$$;

-- (2) editor reload -> include media_url per question
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
          'points_base',        q.points_base,
          'media_url',          q.media_url
        ) order by q.position
      )
      from public.questions q
      where q.quiz_id = v_quiz.id
    ), '[]'::jsonb)
  );
end;
$$;

-- (3) save -> store media_url (choices jsonb, incl. per-answer image_url, is
--     stored verbatim, so no change needed for answer images)
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
    v_n_choices := jsonb_array_length(v_choices);
    if v_n_choices < 2 then
      raise exception 'question % needs at least 2 choices', v_idx;
    end if;

    select array_agg(c ->> 'key') into v_keys
    from jsonb_array_elements(v_choices) c;

    v_correct := v_q ->> 'correct_key';
    if v_correct is null or not (v_correct = any(v_keys)) then
      raise exception 'question % correct_key % is not one of its choice keys', v_idx, coalesce(v_correct, 'null');
    end if;

    v_idx := v_idx + 1;
  end loop;

  update public.quizzes
    set title        = btrim(p_title),
        description  = p_description,
        is_published = coalesce(p_is_published, true),
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
    coalesce((elem ->> 'time_limit_seconds')::int, 20),
    coalesce((elem ->> 'points_base')::int, 1000),
    nullif(elem ->> 'media_url', '')
  from jsonb_array_elements(p_questions) elem;
end;
$$;

grant execute on function public.save_quiz(uuid, uuid, text, text, boolean, jsonb) to anon, authenticated;
grant execute on function public.get_quiz_for_edit(uuid, uuid) to anon, authenticated;
