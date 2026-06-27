-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0001_init.sql : schema + RLS + SECURITY DEFINER RPC + realtime broadcast + seed
-- -----------------------------------------------------------------------------
-- Source of truth: /Users/nao/.claude/plans/iridescent-bubbling-backus.md
-- Authority lives in SECURITY DEFINER RPCs guarded by auth.uid()/host_secret.
-- All policies are written `TO authenticated` + ownership/membership predicates
-- (never auth.role()). Anonymous sign-in users are still the `authenticated`
-- Postgres role, so membership predicates — not the role — gate access.
-- Idempotent where reasonable (create ... if not exists / drop ... if exists).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;   -- gen_random_uuid()
-- pg_cron is optional (only used by the tick() scheduler at the end). Create it
-- if the platform allows; swallow the error so the migration stays idempotent.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  null;
end $$;

-- =============================================================================
-- TABLES
-- =============================================================================

-- quizzes ---------------------------------------------------------------------
create table if not exists public.quizzes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  description  text,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists quizzes_owner_idx on public.quizzes(owner_id);

-- questions -------------------------------------------------------------------
-- choices is JSONB = [{key,label}]; presentational theme (color/shape/art) is
-- re-hydrated client-side by index (see src/lib/quiz.ts CHOICE_THEME).
-- correct_key is SECRET: column-level revoke + questions_public view exclude it.
create table if not exists public.questions (
  id                 uuid primary key default gen_random_uuid(),
  quiz_id            uuid not null references public.quizzes(id) on delete cascade,
  position           int  not null,
  eyebrow            text,
  text               text not null,
  choices            jsonb not null,                 -- [{key:text,label:text}]
  correct_key        text not null,                  -- SECRET, never exposed
  time_limit_seconds int  not null default 20,
  points_base        int  not null default 1000,
  created_at         timestamptz not null default now(),
  unique (quiz_id, position)
);
create index if not exists questions_quiz_idx on public.questions(quiz_id, position);

-- games -----------------------------------------------------------------------
-- host_secret is the bearer token for host authority; never broadcast.
-- Clients may NOT UPDATE games — all transitions go through RPC.
create table if not exists public.games (
  id               uuid primary key default gen_random_uuid(),
  quiz_id          uuid not null references public.quizzes(id) on delete cascade,
  pin              text not null,
  host_id          uuid not null references auth.users(id) on delete cascade,
  host_secret      uuid not null default gen_random_uuid(),  -- host bearer
  state            text not null default 'lobby'
                     check (state in ('lobby','question_open','locked','reveal','scoreboard','ended')),
  current_position int  not null default 0,
  phase_deadline   timestamptz,                      -- authoritative timer
  phase_started_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- Partial unique PIN: only one active (non-ended) game can hold a PIN.
create unique index if not exists games_active_pin_idx on public.games(pin) where state <> 'ended';
create index if not exists games_quiz_idx on public.games(quiz_id);

-- players ---------------------------------------------------------------------
-- UNIQUE(game_id,user_id) prevents double-join + makes join idempotent.
create table if not exists public.players (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references public.games(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  nickname       text not null,
  avatar_color   text,
  avatar_initial text,
  is_connected   boolean not null default true,
  last_seen_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (game_id, user_id)
);
create index if not exists players_game_idx on public.players(game_id);

-- rounds ----------------------------------------------------------------------
create table if not exists public.rounds (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  position    int  not null,
  opened_at   timestamptz not null default now(),
  deadline    timestamptz not null,
  revealed_at timestamptz,
  unique (game_id, position)
);
create index if not exists rounds_game_idx on public.rounds(game_id, position);

-- answers ---------------------------------------------------------------------
-- UNIQUE(round_id,player_id) prevents double-answer & serializes tallies.
-- is_correct / awarded_points stay NULL until reveal (no early leak).
create table if not exists public.answers (
  id             uuid primary key default gen_random_uuid(),
  round_id       uuid not null references public.rounds(id) on delete cascade,
  player_id      uuid not null references public.players(id) on delete cascade,
  choice_key     text not null,
  answered_at    timestamptz not null default now(),
  response_ms    int  not null,        -- server-computed
  is_correct     boolean,             -- NULL until reveal
  awarded_points int,                 -- NULL until reveal
  unique (round_id, player_id)
);
create index if not exists answers_round_idx on public.answers(round_id);

-- scores ----------------------------------------------------------------------
create table if not exists public.scores (
  game_id      uuid not null references public.games(id) on delete cascade,
  player_id    uuid not null references public.players(id) on delete cascade,
  total_points int  not null default 0,
  correct_count int not null default 0,
  streak       int  not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (game_id, player_id)
);
create index if not exists scores_leaderboard_idx on public.scores(game_id, total_points desc);

-- =============================================================================
-- correct_key secrecy: revoke column from client roles + public view
-- =============================================================================
revoke select (correct_key) on public.questions from anon, authenticated;

-- questions_public : security_invoker view that EXCLUDES correct_key.
create or replace view public.questions_public
  with (security_invoker = true) as
  select id, quiz_id, position, eyebrow, text, choices, time_limit_seconds, points_base, created_at
  from public.questions;

-- =============================================================================
-- ENABLE RLS on all tables
-- =============================================================================
alter table public.quizzes  enable row level security;
alter table public.questions enable row level security;
alter table public.games    enable row level security;
alter table public.players  enable row level security;
alter table public.rounds   enable row level security;
alter table public.answers  enable row level security;
alter table public.scores   enable row level security;

-- helper: is the current user a member (player) of a game? --------------------
create or replace function public.is_game_member(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.players p
    where p.game_id = p_game_id and p.user_id = auth.uid()
  ) or exists (
    select 1 from public.games g
    where g.id = p_game_id and g.host_id = auth.uid()
  );
$$;

-- =============================================================================
-- RLS POLICIES (all TO authenticated; unauthenticated => denied by default)
-- =============================================================================

-- quizzes ---------------------------------------------------------------------
drop policy if exists quizzes_select on public.quizzes;
create policy quizzes_select on public.quizzes
  for select to authenticated
  using (is_published or owner_id = auth.uid());

drop policy if exists quizzes_insert on public.quizzes;
create policy quizzes_insert on public.quizzes
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists quizzes_update on public.quizzes;
create policy quizzes_update on public.quizzes
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());   -- prevents owner reassignment

drop policy if exists quizzes_delete on public.quizzes;
create policy quizzes_delete on public.quizzes
  for delete to authenticated
  using (owner_id = auth.uid());

-- questions -------------------------------------------------------------------
-- SELECT allowed when the quiz is visible (published or owned). correct_key is
-- already revoked at the column level, so live games read via questions_public.
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions
  for select to authenticated
  using (exists (
    select 1 from public.quizzes q
    where q.id = quiz_id and (q.is_published or q.owner_id = auth.uid())
  ));

drop policy if exists questions_insert on public.questions;
create policy questions_insert on public.questions
  for insert to authenticated
  with check (exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = auth.uid()
  ));

drop policy if exists questions_update on public.questions;
create policy questions_update on public.questions
  for update to authenticated
  using (exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = auth.uid()
  ));

drop policy if exists questions_delete on public.questions;
create policy questions_delete on public.questions
  for delete to authenticated
  using (exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = auth.uid()
  ));

-- games -----------------------------------------------------------------------
-- SELECT for members + host. NO client INSERT/UPDATE/DELETE (RPC only).
drop policy if exists games_select on public.games;
create policy games_select on public.games
  for select to authenticated
  using (host_id = auth.uid() or public.is_game_member(id));

-- players ---------------------------------------------------------------------
-- SELECT for co-members of the same game. INSERT only via join_game RPC.
-- UPDATE (e.g. nickname / connection) only by the owning user on their row.
drop policy if exists players_select on public.players;
create policy players_select on public.players
  for select to authenticated
  using (public.is_game_member(game_id));

drop policy if exists players_update on public.players;
create policy players_update on public.players
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- rounds ----------------------------------------------------------------------
drop policy if exists rounds_select on public.rounds;
create policy rounds_select on public.rounds
  for select to authenticated
  using (public.is_game_member(game_id));

-- answers ---------------------------------------------------------------------
-- No direct INSERT (submit_answer RPC only). SELECT only own rows.
drop policy if exists answers_select on public.answers;
create policy answers_select on public.answers
  for select to authenticated
  using (exists (
    select 1 from public.players p
    where p.id = player_id and p.user_id = auth.uid()
  ));

-- scores ----------------------------------------------------------------------
drop policy if exists scores_select on public.scores;
create policy scores_select on public.scores
  for select to authenticated
  using (public.is_game_member(game_id));

-- =============================================================================
-- RPC (game engine) — all SECURITY DEFINER, guarded by auth.uid()/host_secret
-- =============================================================================

-- create_game(quiz_id) -> {game_id,pin,host_secret} --------------------------
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
  -- Must own the quiz (and it should have at least one question).
  if not exists (select 1 from public.quizzes q where q.id = p_quiz_id and q.owner_id = v_uid) then
    raise exception 'not quiz owner';
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

-- join_game(pin,nickname,avatar_color,avatar_initial) -> player_id -----------
-- Idempotent: re-join returns the existing player row (UNIQUE game_id,user_id).
create or replace function public.join_game(
  p_pin text,
  p_nickname text,
  p_avatar_color text default null,
  p_avatar_initial text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_game    public.games;
  v_player_id uuid;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;

  select * into v_game from public.games
  where pin = p_pin and state <> 'ended'
  limit 1;
  if v_game.id is null then
    raise exception 'game not found';
  end if;

  insert into public.players (game_id, user_id, nickname, avatar_color, avatar_initial, is_connected, last_seen_at)
  values (v_game.id, v_uid, p_nickname, p_avatar_color, p_avatar_initial, true, now())
  on conflict (game_id, user_id) do update
    set nickname     = excluded.nickname,
        avatar_color = coalesce(excluded.avatar_color, public.players.avatar_color),
        avatar_initial = coalesce(excluded.avatar_initial, public.players.avatar_initial),
        is_connected = true,
        last_seen_at = now()
  returning id into v_player_id;

  -- ensure a scores row exists for the leaderboard
  insert into public.scores (game_id, player_id) values (v_game.id, v_player_id)
  on conflict (game_id, player_id) do nothing;

  return v_player_id;
end;
$$;

-- internal: build the public question payload for a position -------------------
create or replace function public._question_public(p_quiz_id uuid, p_position int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(t) from (
    select q.position, q.eyebrow, q.text, q.choices, q.time_limit_seconds
    from public.questions q
    where q.quiz_id = p_quiz_id and q.position = p_position
  ) t;
$$;

-- internal: current live vote tally for a round -------------------------------
create or replace function public._vote_payload(p_round_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'counts', coalesce((
      select jsonb_object_agg(choice_key, c)
      from (select choice_key, count(*)::int c from public.answers where round_id = p_round_id group by choice_key) s
    ), '{}'::jsonb),
    'total', (select count(*)::int from public.answers where round_id = p_round_id)
  );
$$;

-- internal: leaderboard for a game (ordered) ----------------------------------
create or replace function public._leaderboard(p_game_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by total_points desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'player_id', s.player_id,
      'nickname', p.nickname,
      'avatar_color', p.avatar_color,
      'avatar_initial', p.avatar_initial,
      'total_points', s.total_points,
      'correct_count', s.correct_count,
      'streak', s.streak
    ) as row, s.total_points
    from public.scores s
    join public.players p on p.id = s.player_id
    where s.game_id = p_game_id
  ) ranked;
$$;

-- host_advance(game_id,host_secret) ------------------------------------------
-- Single state-machine step. Opens the next round (with phase_deadline) or
-- moves lobby->question_open / scoreboard->next question / ->ended.
create or replace function public.host_advance(p_game_id uuid, p_host_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game     public.games;
  v_next_pos int;
  v_q        public.questions;
  v_round    public.rounds;
  v_deadline timestamptz;
  v_total    int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.host_secret <> p_host_secret then raise exception 'not host'; end if;

  select count(*) into v_total from public.questions where quiz_id = v_game.quiz_id;

  if v_game.state in ('lobby','scoreboard') then
    -- advance to the next question position
    if v_game.state = 'lobby' then
      v_next_pos := 0;
    else
      v_next_pos := v_game.current_position + 1;
    end if;

    if v_next_pos >= v_total then
      update public.games set state = 'ended', phase_deadline = null, updated_at = now()
      where id = p_game_id;
      perform realtime.send(
        jsonb_build_object('state','ended','deadline',null,'server_now',now()),
        'phase', 'game:'||p_game_id::text, true);
      return;
    end if;

    select * into v_q from public.questions where quiz_id = v_game.quiz_id and position = v_next_pos;
    v_deadline := now() + make_interval(secs => v_q.time_limit_seconds);

    insert into public.rounds (game_id, question_id, position, opened_at, deadline)
    values (p_game_id, v_q.id, v_next_pos, now(), v_deadline)
    on conflict (game_id, position) do update set deadline = excluded.deadline, opened_at = now(), revealed_at = null
    returning * into v_round;

    update public.games
      set state = 'question_open', current_position = v_next_pos,
          phase_started_at = now(), phase_deadline = v_deadline, updated_at = now()
    where id = p_game_id;

    -- broadcast phase + question (public, no correct_key)
    perform realtime.send(
      jsonb_build_object(
        'state','question_open','position',v_next_pos,
        'deadline',v_deadline,'server_now',now()),
      'phase', 'game:'||p_game_id::text, true);
    perform realtime.send(
      public._question_public(v_game.quiz_id, v_next_pos),
      'question', 'game:'||p_game_id::text, true);

  elsif v_game.state = 'question_open' then
    -- lock answering early
    update public.games set state = 'locked', updated_at = now() where id = p_game_id;
    perform realtime.send(
      jsonb_build_object('state','locked','position',v_game.current_position,'server_now',now()),
      'phase', 'game:'||p_game_id::text, true);

  elsif v_game.state = 'reveal' then
    -- move to scoreboard
    update public.games set state = 'scoreboard', phase_deadline = null, updated_at = now()
    where id = p_game_id;
    perform realtime.send(
      jsonb_build_object('state','scoreboard','position',v_game.current_position,'deadline',null,'server_now',now()),
      'phase', 'game:'||p_game_id::text, true);
    perform realtime.send(
      jsonb_build_object('leaderboard', public._leaderboard(p_game_id)),
      'scoreboard', 'game:'||p_game_id::text, true);
  else
    raise exception 'cannot advance from state %', v_game.state;
  end if;
end;
$$;

-- submit_answer(game_id,choice_key) ------------------------------------------
-- Resolves player from auth.uid(), checks open round + deadline + state,
-- computes response_ms, INSERTs (UNIQUE swallows re-answers), broadcasts tally.
create or replace function public.submit_answer(p_game_id uuid, p_choice_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_game      public.games;
  v_player_id uuid;
  v_round     public.rounds;
  v_resp_ms   int;
  v_inserted  boolean := false;
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
  if now() > v_round.deadline then raise exception 'deadline passed'; end if;

  v_resp_ms := greatest(0, (extract(epoch from (now() - v_round.opened_at)) * 1000)::int);

  begin
    insert into public.answers (round_id, player_id, choice_key, answered_at, response_ms)
    values (v_round.id, v_player_id, p_choice_key, now(), v_resp_ms);
    v_inserted := true;
  exception when unique_violation then
    v_inserted := false;  -- already answered: idempotent no-op
  end;

  if v_inserted then
    -- broadcast aggregate tally only (never who voted for what)
    perform realtime.send(
      public._vote_payload(v_round.id),
      'vote', 'game:'||p_game_id::text, true);
  end if;

  return jsonb_build_object('accepted', v_inserted, 'choice_key', p_choice_key, 'response_ms', v_resp_ms);
end;
$$;

-- reveal_round(game_id,host_secret) ------------------------------------------
-- Confirms is_correct, computes Kahoot speed-weighted score, upserts scores,
-- sets state='reveal', broadcasts the ONLY message containing correct_key.
create or replace function public.reveal_round(p_game_id uuid, p_host_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game        public.games;
  v_round       public.rounds;
  v_q           public.questions;
  r             record;
  v_ratio       numeric;
  v_speed       numeric;
  v_awarded     int;
  v_new_streak  int;
  v_bonus       int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.host_secret <> p_host_secret then raise exception 'not host'; end if;
  -- Atomically claim the reveal so a concurrent host/tick call can't double-score.
  update public.games set state = 'reveal', phase_deadline = null, updated_at = now()
    where id = p_game_id and state in ('question_open','locked');
  if not found then
    raise exception 'cannot reveal from state %', v_game.state;
  end if;

  select * into v_round from public.rounds where game_id = p_game_id and position = v_game.current_position;
  if v_round.id is null then raise exception 'no round'; end if;
  select * into v_q from public.questions where id = v_round.question_id;

  -- score each answer + upsert scores (Kahoot speed-weighted)
  for r in
    select a.*, p.id as pid from public.answers a
    join public.players p on p.id = a.player_id
    where a.round_id = v_round.id
  loop
    if r.choice_key = v_q.correct_key then
      v_ratio   := least(greatest(r.response_ms::numeric / (v_q.time_limit_seconds * 1000), 0), 1);
      v_speed   := 1 - v_ratio / 2;                         -- instant=full, last=half
      v_awarded := least(round(v_q.points_base * v_speed)::int, v_q.points_base);

      update public.scores set streak = streak + 1 where game_id = p_game_id and player_id = r.pid
        returning streak into v_new_streak;
      v_bonus   := least(v_new_streak * 100, 500);

      update public.scores
        set total_points  = total_points + v_awarded + v_bonus,
            correct_count = correct_count + 1,
            updated_at    = now()
      where game_id = p_game_id and player_id = r.pid;

      update public.answers set is_correct = true, awarded_points = v_awarded + v_bonus where id = r.id;
    else
      update public.scores set streak = 0, updated_at = now()
        where game_id = p_game_id and player_id = r.pid;
      update public.answers set is_correct = false, awarded_points = 0 where id = r.id;
    end if;
  end loop;

  update public.rounds set revealed_at = now() where id = v_round.id;
  -- (games.state was already claimed to 'reveal' atomically above)

  -- reveal broadcast: the ONLY message that carries correct_key
  perform realtime.send(
    jsonb_build_object('state','reveal','position',v_game.current_position,'deadline',null,'server_now',now()),
    'phase', 'game:'||p_game_id::text, true);
  perform realtime.send(
    jsonb_build_object(
      'correct_key', v_q.correct_key,
      'counts', (public._vote_payload(v_round.id) -> 'counts'),
      'total',  (public._vote_payload(v_round.id) -> 'total'),
      'correct_count', (select count(*)::int from public.answers where round_id = v_round.id and is_correct),
      'leaderboard', public._leaderboard(p_game_id)),
    'reveal', 'game:'||p_game_id::text, true);
end;
$$;

-- get_game_snapshot(game_id) -> jsonb ----------------------------------------
-- Authoritative recovery for reconnect/late-join/missed messages.
-- correct_key only included when the current round is revealed.
create or replace function public.get_game_snapshot(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_game   public.games;
  v_round  public.rounds;
  v_q      public.questions;
  v_me     uuid;
  v_my     jsonb := null;
  v_question jsonb := null;
  v_correct text := null;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception 'game not found'; end if;
  if not public.is_game_member(p_game_id) then raise exception 'not a member'; end if;

  -- current question (public payload, no correct_key)
  if v_game.state <> 'lobby' then
    v_question := public._question_public(v_game.quiz_id, v_game.current_position);
    select * into v_round from public.rounds where game_id = p_game_id and position = v_game.current_position;
    if v_round.id is not null and v_round.revealed_at is not null then
      select correct_key into v_correct from public.questions where id = v_round.question_id;
    end if;
  end if;

  -- my answer (only revealed scoring once round is revealed)
  select id into v_me from public.players where game_id = p_game_id and user_id = v_uid;
  if v_me is not null and v_round.id is not null then
    select jsonb_build_object(
      'choice_key', a.choice_key,
      'is_correct', case when v_round.revealed_at is not null then a.is_correct else null end,
      'awarded_points', case when v_round.revealed_at is not null then a.awarded_points else null end
    ) into v_my
    from public.answers a where a.round_id = v_round.id and a.player_id = v_me;
  end if;

  return jsonb_build_object(
    'state', v_game.state,
    'current_position', v_game.current_position,
    'current_question', v_question,
    'phase_deadline', v_game.phase_deadline,
    'server_now', now(),
    'correct_key', v_correct,
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
$$;

-- tick() — pg_cron autoadvance fallback --------------------------------------
-- For each game whose phase_deadline has passed, auto-transition with a
-- state-guarded UPDATE (prevents double-fire vs. host action).
create or replace function public.tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games;
begin
  for g in
    select * from public.games
    where state = 'question_open' and phase_deadline is not null and phase_deadline < now()
    for update skip locked
  loop
    -- auto-reveal via host authority
    perform public.reveal_round(g.id, g.host_secret);
  end loop;
end;
$$;

-- =============================================================================
-- GRANTS — RPCs callable by authenticated (incl. anonymous sign-in) clients
-- =============================================================================
grant execute on function public.create_game(uuid) to authenticated;
grant execute on function public.join_game(text,text,text,text) to authenticated;
grant execute on function public.host_advance(uuid,uuid) to authenticated;
grant execute on function public.submit_answer(uuid,text) to authenticated;
grant execute on function public.reveal_round(uuid,uuid) to authenticated;
grant execute on function public.get_game_snapshot(uuid) to authenticated;
-- tick() and internal helpers are NOT granted to clients (server/cron only).
grant select on public.questions_public to authenticated;

-- =============================================================================
-- REALTIME — publication + private channel Authorization
-- =============================================================================
-- Add low-frequency persistent truth tables to the realtime publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- alter publication is idempotent only if table not already a member; guard.
    begin alter publication supabase_realtime add table public.games; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.players; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.scores; exception when duplicate_object then null; end;
    -- answers/questions are intentionally NOT published (leak + cost).
  end if;
end $$;

-- Realtime Authorization: gate channel 'game:{id}' to members of that game.
-- realtime.messages carries `topic` = the channel name; we parse the game id.
alter table if exists realtime.messages enable row level security;

drop policy if exists game_channel_read on realtime.messages;
create policy game_channel_read on realtime.messages
  for select to authenticated
  using (
    realtime.topic() like 'game:%'
    and public.is_game_member((substring(realtime.topic() from 6))::uuid)
  );

drop policy if exists game_channel_write on realtime.messages;
create policy game_channel_write on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'game:%'
    and public.is_game_member((substring(realtime.topic() from 6))::uuid)
  );

-- =============================================================================
-- pg_cron — schedule tick() every few seconds (guarded: no-op if unavailable)
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- unschedule prior copy if present, then (re)schedule.
    perform cron.unschedule(jobid) from cron.job where jobname = 'puni_tick';
    -- pg_cron min granularity is 1 minute via cron syntax; use seconds form.
    perform cron.schedule('puni_tick', '5 seconds', 'select public.tick();');
  end if;
exception when others then
  -- pg_cron not installed or seconds-form unsupported: tick() falls back to
  -- host_advance/reveal_round driven by the host. Safe no-op.
  null;
end $$;

-- =============================================================================
-- SEED — 1 published quiz "desserts" with 3 questions (tiramisu first)
-- =============================================================================
-- Seed requires an owner in auth.users. Pick the first existing user if any;
-- otherwise skip seeding (no-op so the migration stays applicable on a fresh DB).
do $$
declare
  v_owner uuid;
  v_quiz  uuid;
begin
  select id into v_owner from auth.users order by created_at limit 1;
  if v_owner is null then
    raise notice 'no auth.users yet; skipping seed';
    return;
  end if;

  insert into public.quizzes (owner_id, title, description, is_published)
  values (v_owner, 'desserts', 'かわいいスイーツ早押しクイズ', true)
  returning id into v_quiz;

  insert into public.questions (quiz_id, position, eyebrow, text, choices, correct_key, time_limit_seconds, points_base)
  values
    (v_quiz, 0, 'Q1 / 3', '次のうち、ティラミスはどれ？',
      '[{"key":"a","label":"ティラミス"},{"key":"b","label":"プリン"},{"key":"c","label":"ショートケーキ"},{"key":"d","label":"パンケーキ"}]'::jsonb,
      'a', 20, 1000),
    (v_quiz, 1, 'Q2 / 3', 'カラメルソースがかかっているのは？',
      '[{"key":"a","label":"ティラミス"},{"key":"b","label":"プリン"},{"key":"c","label":"ショートケーキ"},{"key":"d","label":"パンケーキ"}]'::jsonb,
      'b', 20, 1000),
    (v_quiz, 2, 'Q3 / 3', 'いちごがのっているのは？',
      '[{"key":"a","label":"ティラミス"},{"key":"b","label":"プリン"},{"key":"c","label":"ショートケーキ"},{"key":"d","label":"パンケーキ"}]'::jsonb,
      'c', 20, 1000);
end $$;

-- end 0001_init.sql
