// cleanup-media — sweep orphaned quiz-media objects.
//
// Storage objects don't cascade when their DB rows are deleted (the 3-month
// retention cron / user deletes leave images behind). This function lists every
// object in the `quiz-media` bucket, computes which are no longer referenced by
// any `questions.media_url`, and removes them via the Storage API (the correct
// way — a SQL delete on storage.objects would leave the real file behind).
//
// Protected by a shared secret (CLEANUP_SECRET) rather than a user JWT, so the
// scheduler (pg_cron + pg_net) can invoke it. Deploy with --no-verify-jwt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "quiz-media";

function objectName(mediaUrl: string): string | null {
  // public URL: .../storage/v1/object/public/quiz-media/<name>[?...]
  const after = mediaUrl.split(`/${BUCKET}/`)[1];
  if (!after) return null;
  return decodeURIComponent(after.split("?")[0]);
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CLEANUP_SECRET");
  if (secret && req.headers.get("x-cleanup-secret") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) referenced object names (from questions.media_url)
  const { data: qs, error: qErr } = await supabase
    .from("questions")
    .select("media_url")
    .not("media_url", "is", null);
  if (qErr) return Response.json({ error: qErr.message }, { status: 500 });
  const referenced = new Set<string>();
  for (const q of qs ?? []) {
    const n = q.media_url ? objectName(q.media_url as string) : null;
    if (n) referenced.add(n);
  }

  // 2) list bucket objects (flat — uploads are <uuid>.<ext> at the root)
  const { data: objs, error: listErr } = await supabase.storage
    .from(BUCKET)
    .list("", { limit: 10000 });
  if (listErr) return Response.json({ error: listErr.message }, { status: 500 });

  // 3) orphans = objects not referenced by any question
  const orphans = (objs ?? [])
    .map((o) => o.name)
    .filter((name) => name && !referenced.has(name));

  // 4) remove (batched to be safe)
  let removed = 0;
  for (let i = 0; i < orphans.length; i += 100) {
    const batch = orphans.slice(i, i + 100);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (!error) removed += batch.length;
  }

  return Response.json({ scanned: objs?.length ?? 0, referenced: referenced.size, removed });
});
