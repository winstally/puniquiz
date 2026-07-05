-- Admin authoring authority is the app invite cookie, not a per-quiz URL token.
-- These RPCs are now service-role-only; Server Actions verify the invite cookie
-- before calling them with SUPABASE_SECRET_KEY.

drop function if exists public.create_quiz(text, text);
drop function if exists public.get_quiz_for_edit(uuid, uuid);
drop function if exists public.save_quiz(uuid, uuid, text, text, boolean, jsonb);

drop index if exists public.quizzes_edit_token_idx;
alter table public.quizzes drop column if exists edit_token;

create function public.create_quiz(
  p_title text,
  p_description text
)
returns table (quiz_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz public.quizzes;
begin
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'title required';
  end if;

  insert into public.quizzes (owner_id, title, description, is_published)
  values (null, btrim(p_title), p_description, true)
  returning * into v_quiz;

  insert into public.questions (quiz_id, position, eyebrow, text, choices, correct_key, time_limit_seconds, points_base)
  values
    (v_quiz.id, 0, 'Q1', 'さいしょの問題です。ここを書きかえてね',
      '[{"key":"a","label":"せんたくし A"},{"key":"b","label":"せんたくし B"},{"key":"c","label":"せんたくし C"},{"key":"d","label":"せんたくし D"}]'::jsonb,
      'a', 20, 1000),
    (v_quiz.id, 1, 'Q2', 'ふたつめの問題です。ここを書きかえてね',
      '[{"key":"a","label":"せんたくし A"},{"key":"b","label":"せんたくし B"},{"key":"c","label":"せんたくし C"},{"key":"d","label":"せんたくし D"}]'::jsonb,
      'b', 20, 1000);

  return query select v_quiz.id;
end;
$$;

create function public.get_quiz_for_edit(p_quiz_id uuid)
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

create function public.save_quiz(
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
  v_quiz       public.quizzes;
  v_q          jsonb;
  v_idx        int := 0;
  v_pos        int;
  v_choices    jsonb;
  v_correct    text;
begin
  select * into v_quiz from public.quizzes where id = p_quiz_id;
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
    (elem ->> 'time_limit_seconds')::int,
    coalesce((elem ->> 'points_base')::int, 1000),
    nullif(elem ->> 'media_url', '')
  from jsonb_array_elements(p_questions) elem;
end;
$$;

revoke all on function public.create_quiz(text, text) from public, anon, authenticated;
revoke all on function public.get_quiz_for_edit(uuid) from public, anon, authenticated;
revoke all on function public.save_quiz(uuid, text, text, boolean, jsonb) from public, anon, authenticated;

grant execute on function public.create_quiz(text, text) to service_role;
grant execute on function public.get_quiz_for_edit(uuid) to service_role;
grant execute on function public.save_quiz(uuid, text, text, boolean, jsonb) to service_role;
