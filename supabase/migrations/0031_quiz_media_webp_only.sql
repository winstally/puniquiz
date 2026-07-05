-- Quiz media is normalized client-side to WebP before upload. Keep Storage as
-- the final guard so all newly uploaded quiz images have one compact format.

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/webp']
where id = 'quiz-media';
