-- 0012_fixed_four_choices.sql : quizzes are always exactly 4 choices

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_choices_four_count'
      and conrelid = 'public.questions'::regclass
  ) then
    alter table public.questions
      add constraint questions_choices_four_count
      check (
        jsonb_typeof(choices) = 'array'
        and jsonb_array_length(choices) = 4
      );
  end if;
end;
$$;

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
    coalesce((elem ->> 'time_limit_seconds')::int, 20),
    coalesce((elem ->> 'points_base')::int, 1000),
    nullif(elem ->> 'media_url', '')
  from jsonb_array_elements(p_questions) elem;
end;
$$;

grant execute on function public.save_quiz(uuid, uuid, text, text, boolean, jsonb) to anon, authenticated;
