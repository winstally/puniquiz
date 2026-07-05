-- Normalize every curated desserts/demo quiz, not just the oldest demo row.
-- Some live games still referenced old JPG paths such as /desserts/tiramisu.jpg
-- and /demo/tiramisu-wide.jpg even though the deployed assets are the WebP files
-- under /public/desserts.

do $$
declare
  v_choices jsonb := '[
    {"key":"a","label":"ティラミス","image_url":"/desserts/tiramisu.webp"},
    {"key":"b","label":"プリン","image_url":"/desserts/pudding.webp"},
    {"key":"c","label":"ロールケーキ","image_url":"/desserts/shortcake.webp"},
    {"key":"d","label":"パンケーキ","image_url":"/desserts/pancake.webp"}
  ]'::jsonb;
begin
  update public.quizzes
    set title = 'desserts',
        description = '写真を見て答えるスイーツ早押しクイズ',
        is_published = true,
        is_demo = true,
        updated_at = now()
  where is_demo = true
     or title = 'desserts';

  update public.questions q
    set choices = v_choices,
        media_url = case q.position
          when 0 then '/desserts/tiramisu.webp'
          when 1 then '/desserts/pudding.webp'
          when 2 then '/desserts/shortcake.webp'
          else q.media_url
        end
  from public.quizzes quiz
  where q.quiz_id = quiz.id
    and (quiz.is_demo = true or quiz.title = 'desserts');
end $$;
