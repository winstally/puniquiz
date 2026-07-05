-- 0006_quiz_media.sql
-- Image support for quizzes: a public Storage bucket for question/answer images,
-- and a media_url column on questions. Per-answer images live inside the existing
-- questions.choices jsonb as an `image_url` field (no column needed there).
--
-- The app is login-free (quizzes are edited by holding the secret edit link), so
-- uploads are done by anon. We allow anon read/write scoped to this one bucket —
-- consistent with the existing "anyone with the link can edit" model.

insert into storage.buckets (id, name, public)
values ('quiz-media', 'quiz-media', true)
on conflict (id) do nothing;

drop policy if exists quiz_media_read on storage.objects;
create policy quiz_media_read on storage.objects
  for select using (bucket_id = 'quiz-media');

drop policy if exists quiz_media_insert on storage.objects;
create policy quiz_media_insert on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'quiz-media');

drop policy if exists quiz_media_update on storage.objects;
create policy quiz_media_update on storage.objects
  for update to anon, authenticated using (bucket_id = 'quiz-media');

drop policy if exists quiz_media_delete on storage.objects;
create policy quiz_media_delete on storage.objects
  for delete to anon, authenticated using (bucket_id = 'quiz-media');

alter table public.questions add column if not exists media_url text;
