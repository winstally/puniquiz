-- Blank-slate new quizzes. Previously create_quiz seeded a dummy title and two
-- questions full of placeholder text the author had to delete first. Now it makes
-- one empty question (no text, empty choice labels) and allows an empty title —
-- the editor renders placeholders, and save_quiz still requires a real title.

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
  v_quiz public.quizzes;
begin
  -- No title check here: a fresh quiz is untitled until the author names it.
  insert into public.quizzes (owner_id, title, description, is_published)
  values (null, coalesce(btrim(p_title), ''), p_description, true)
  returning * into v_quiz;

  -- One empty question: blank text + four empty a/b/c/d choices, first marked
  -- correct (a quiz always needs one correct answer).
  insert into public.questions (quiz_id, position, eyebrow, text, choices, correct_key, time_limit_seconds, points_base)
  values (
    v_quiz.id, 0, null, '',
    '[{"key":"a","label":""},{"key":"b","label":""},{"key":"c","label":""},{"key":"d","label":""}]'::jsonb,
    'a', 20, 1000
  );

  return query select v_quiz.id;
end;
$$;

-- Privileges are unchanged by create-or-replace, but re-assert them so the
-- authoring RPC stays service-role-only.
revoke all on function public.create_quiz(text, text) from public, anon, authenticated;
grant execute on function public.create_quiz(text, text) to service_role;

notify pgrst, 'reload schema';
