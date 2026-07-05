-- New quiz questions should start at the minimum configured score: 100pt.
-- Existing saved quiz questions keep their current points_base.

alter table public.questions
  alter column points_base set default 100;

create or replace function public.create_quiz(
  p_title text,
  p_description text
)
returns table (quiz_id uuid)
language plpgsql
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

  insert into public.quizzes (owner_id, title, description, is_published)
  values (v_uid, coalesce(btrim(p_title), ''), p_description, true)
  returning * into v_quiz;

  insert into public.questions (quiz_id, position, eyebrow, text, choices, correct_key, time_limit_seconds, points_base)
  values (
    v_quiz.id, 0, null, '',
    '[{"key":"a","label":""},{"key":"b","label":""},{"key":"c","label":""},{"key":"d","label":""}]'::jsonb,
    'a', 20, 100
  );

  return query select v_quiz.id;
end;
$$;

revoke all on function public.create_quiz(text, text) from public, anon, authenticated, service_role;
grant execute on function public.create_quiz(text, text) to authenticated;

notify pgrst, 'reload schema';
