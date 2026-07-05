-- Keep the curated demo aligned with the static assets shipped in /public.
-- Some production rows still pointed at removed JPG paths such as /demo/coffee.jpg.

do $$
declare
  v_demo uuid;
  v_choices jsonb := '[
    {"key":"a","label":"ティラミス","image_url":"/desserts/tiramisu.webp"},
    {"key":"b","label":"プリン","image_url":"/desserts/pudding.webp"},
    {"key":"c","label":"ロールケーキ","image_url":"/desserts/shortcake.webp"},
    {"key":"d","label":"パンケーキ","image_url":"/desserts/pancake.webp"}
  ]'::jsonb;
begin
  select id into v_demo
    from public.quizzes
    where is_demo and is_published
    order by created_at
    limit 1;

  if v_demo is null then
    raise notice 'no published curated demo quiz found; skipping demo asset refresh';
    return;
  end if;

  update public.quizzes
    set title = 'desserts',
        description = '写真を見て答えるスイーツ早押しクイズ',
        is_published = true,
        is_demo = true,
        updated_at = now()
    where id = v_demo;

  update public.questions
    set choices = v_choices,
        media_url = case position
          when 0 then '/desserts/tiramisu.webp'
          when 1 then '/desserts/pudding.webp'
          when 2 then '/desserts/shortcake.webp'
          else media_url
        end
    where quiz_id = v_demo;
end $$;
