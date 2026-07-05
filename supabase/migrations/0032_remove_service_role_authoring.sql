-- Move invite-gated authoring off the Supabase service-role key.
--
-- The Next Server Actions still require the admin invite cookie before calling
-- these RPCs. The database authority is the caller's Supabase auth.uid() plus an
-- admin registration created by accept_admin_invite().
--
-- Seed the token hash once per environment, using the same ADMIN_INVITE_TOKEN
-- value configured in Next:
--
--   insert into public.admin_invite_tokens (token_hash)
--   values (encode(extensions.digest('replace-with-token', 'sha256'), 'hex'));

create table if not exists public.admin_invite_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.admin_invite_tokens enable row level security;
revoke all on table public.admin_invite_tokens from public, anon, authenticated;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from public, anon, authenticated;

create or replace function public.is_admin_user(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.admin_users au
      where au.user_id = p_user_id
    );
$$;

create or replace function public.accept_admin_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if p_token is null or length(btrim(p_token)) = 0 then
    raise exception 'invalid admin invite';
  end if;

  v_hash := encode(extensions.digest(btrim(p_token), 'sha256'), 'hex');
  if not exists (
    select 1
    from public.admin_invite_tokens t
    where t.token_hash = v_hash
  ) then
    raise exception 'invalid admin invite';
  end if;

  insert into public.admin_users (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.is_admin_user(uuid) from public, anon, authenticated, service_role;
revoke all on function public.accept_admin_invite(text) from public, anon, authenticated, service_role;

grant execute on function public.is_admin_user(uuid) to authenticated;
grant execute on function public.accept_admin_invite(text) to authenticated;

-- Direct table writes are admin-only. Public gameplay hosts published quizzes
-- through create_game; it no longer needs to create private quiz copies.
drop policy if exists quizzes_insert on public.quizzes;
create policy quizzes_insert on public.quizzes
  for insert to authenticated
  with check (
    public.is_admin_user((select auth.uid()))
    and owner_id = (select auth.uid())
  );

drop policy if exists quizzes_update on public.quizzes;
create policy quizzes_update on public.quizzes
  for update to authenticated
  using (
    public.is_admin_user((select auth.uid()))
    and owner_id = (select auth.uid())
  )
  with check (
    public.is_admin_user((select auth.uid()))
    and owner_id = (select auth.uid())
  );

drop policy if exists quizzes_delete on public.quizzes;
create policy quizzes_delete on public.quizzes
  for delete to authenticated
  using (
    public.is_admin_user((select auth.uid()))
    and owner_id = (select auth.uid())
  );

drop policy if exists questions_insert on public.questions;
create policy questions_insert on public.questions
  for insert to authenticated
  with check (
    public.is_admin_user((select auth.uid()))
    and exists (
      select 1 from public.quizzes q
      where q.id = quiz_id and q.owner_id = (select auth.uid())
    )
  );

drop policy if exists questions_update on public.questions;
create policy questions_update on public.questions
  for update to authenticated
  using (
    public.is_admin_user((select auth.uid()))
    and exists (
      select 1 from public.quizzes q
      where q.id = quiz_id and q.owner_id = (select auth.uid())
    )
  )
  with check (
    public.is_admin_user((select auth.uid()))
    and exists (
      select 1 from public.quizzes q
      where q.id = quiz_id and q.owner_id = (select auth.uid())
    )
  );

drop policy if exists questions_delete on public.questions;
create policy questions_delete on public.questions
  for delete to authenticated
  using (
    public.is_admin_user((select auth.uid()))
    and exists (
      select 1 from public.quizzes q
      where q.id = quiz_id and q.owner_id = (select auth.uid())
    )
  );

drop policy if exists quiz_media_insert on storage.objects;
create policy quiz_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'quiz-media'
    and public.is_admin_user((select auth.uid()))
  );

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

  -- No title check here: a fresh quiz is untitled until the author names it.
  insert into public.quizzes (owner_id, title, description, is_published)
  values (v_uid, coalesce(btrim(p_title), ''), p_description, true)
  returning * into v_quiz;

  insert into public.questions (quiz_id, position, eyebrow, text, choices, correct_key, time_limit_seconds, points_base)
  values (
    v_quiz.id, 0, null, '',
    '[{"key":"a","label":""},{"key":"b","label":""},{"key":"c","label":""},{"key":"d","label":""}]'::jsonb,
    'a', 20, 1000
  );

  return query select v_quiz.id;
end;
$$;

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
  where id = p_quiz_id
    and owner_id = v_uid;

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
    and owner_id = v_uid;

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
  where id = p_quiz_id
    and owner_id = v_uid;

  delete from public.questions
  where quiz_id = p_quiz_id
    and exists (
      select 1
      from public.quizzes q
      where q.id = p_quiz_id
        and q.owner_id = v_uid
    );

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

revoke all on function public.create_quiz(text, text) from public, anon, authenticated, service_role;
revoke all on function public.get_quiz_for_edit(uuid) from public, anon, authenticated, service_role;
revoke all on function public.save_quiz(uuid, text, text, boolean, jsonb) from public, anon, authenticated, service_role;

grant execute on function public.create_quiz(text, text) to authenticated;
grant execute on function public.get_quiz_for_edit(uuid) to authenticated;
grant execute on function public.save_quiz(uuid, text, text, boolean, jsonb) to authenticated;

notify pgrst, 'reload schema';
