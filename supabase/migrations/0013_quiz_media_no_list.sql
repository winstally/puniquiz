-- Storage security hardening for the public quiz-media bucket.
--
-- Background: the app's ONLY storage operations are upload() (INSERT) + the purely
-- client-side getPublicUrl(). Object names are random UUIDs with upsert:false, so
-- it never updates an object; it never deletes from the client (orphans are swept
-- by the cleanup-media Edge Function, which runs as the service role and bypasses
-- RLS); and it never list()s. The broad read/update/delete policies were therefore
-- unused by the app but exposed the whole bucket to any anon client.
--
-- 1. Drop the SELECT policy — its only effect was letting clients ENUMERATE every
--    file ("Clients can list all files in this bucket" advisor). Public image reads
--    go through the public CDN URL and don't consult this policy, so rendering is
--    unaffected.
drop policy if exists quiz_media_read on storage.objects;

-- 2. Drop UPDATE/DELETE — open to anon, they let any client overwrite or delete
--    anyone's images. The app needs neither (unique UUID paths; service-role
--    cleanup). Removing them closes that hole while uploads keep working.
drop policy if exists quiz_media_update on storage.objects;
drop policy if exists quiz_media_delete on storage.objects;

-- 3. quiz_media_insert stays (login-free uploads are intentional), but harden the
--    bucket itself: cap object size to the client's 5MB limit and allow only safe
--    raster image types — notably NOT image/svg+xml, so a crafted SVG can't be
--    served inline as an XSS vector.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg', 'image/gif']
where id = 'quiz-media';
