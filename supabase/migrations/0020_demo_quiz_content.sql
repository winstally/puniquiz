-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0016_demo_quiz_content.sql : curated demo content
-- -----------------------------------------------------------------------------
-- Mirrors src/lib/demo-quiz.ts. Existing migrations are history; this migration
-- makes the live curated demo coherent and marks it is_demo=true.
-- =============================================================================

do $$
declare
  v_owner uuid;
  v_quiz uuid;
  v_choices jsonb := '[
    {"key":"a","label":"ティラミス","image_url":"/desserts/tiramisu.jpg"},
    {"key":"b","label":"プリン","image_url":"/desserts/pudding.jpg"},
    {"key":"c","label":"ロールケーキ","image_url":"/desserts/shortcake.jpg"},
    {"key":"d","label":"パンケーキ","image_url":"/desserts/pancake.jpg"}
  ]'::jsonb;
begin
  select id into v_owner from auth.users order by created_at limit 1;
  if v_owner is null then
    raise notice 'no auth.users yet; skipping curated demo seed';
    return;
  end if;

  select id into v_quiz
    from public.quizzes
    where is_demo
    order by created_at
    limit 1;

  if v_quiz is null then
    insert into public.quizzes (owner_id, title, description, is_published, is_demo)
    values (v_owner, 'desserts', '写真を見て答えるスイーツ早押しクイズ', true, true)
    returning id into v_quiz;
  else
    update public.quizzes
      set title = 'desserts',
          description = '写真を見て答えるスイーツ早押しクイズ',
          is_published = true,
          is_demo = true,
          updated_at = now()
      where id = v_quiz;
  end if;

  delete from public.questions where quiz_id = v_quiz;

  insert into public.questions
    (quiz_id, position, eyebrow, text, choices, correct_key, time_limit_seconds, points_base, media_url)
  values
    (v_quiz, 0, null, '写真と同じスイーツはどれ？', v_choices, 'a', 20, 1000, '/demo/tiramisu-wide.jpg'),
    (v_quiz, 1, null, '写真と同じスイーツはどれ？', v_choices, 'b', 20, 1000, '/demo/pudding-wide.jpg'),
    (v_quiz, 2, null, '写真と同じスイーツはどれ？', v_choices, 'c', 20, 1000, '/demo/rollcake-wide.jpg');
end $$;

-- end 0016_demo_quiz_content.sql
