-- Preserve question identity and unchanged image references while editing.
-- Existing questions are updated by id, new questions are inserted, and only
-- ids omitted from the submitted document are deleted. Image keys omitted from
-- existing rows mean "unchanged"; an explicit JSON null means "remove".

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

create or replace function public.save_quiz(
  p_quiz_id uuid,
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
revoke all on function public.save_quiz(uuid, text, text, boolean, jsonb) from public, anon, authenticated, service_role;

grant execute on function public.get_quiz_for_edit(uuid) to authenticated;
grant execute on function public.save_quiz(uuid, text, text, boolean, jsonb) to authenticated;

notify pgrst, 'reload schema';
