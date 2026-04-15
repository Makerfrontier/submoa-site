// GET    /api/email-assets/:id  → stream asset (private, owner-only)
// DELETE /api/email-assets/:id  → delete asset (R2 + DB)

import { getSessionUser, json } from "../_utils";

export async function onRequestGet({ request, env, params }: any) {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const row = await env.submoacontent_db
    .prepare("SELECT r2_key, content_type, filename FROM email_assets WHERE id = ? AND account_id = ?")
    .bind(params.id, user.account_id || "makerfrontier")
    .first<{ r2_key: string; content_type: string | null; filename: string }>();
  if (!row) return new Response("Not found", { status: 404 });

  const obj = await env.SUBMOA_IMAGES.get(row.r2_key);
  if (!obj) return new Response("Not found in storage", { status: 404 });

  return new Response(obj.body, {
    status: 200,
    headers: {
      "Content-Type": row.content_type || obj.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "private, max-age=86400",
    },
  });
}

export async function onRequestDelete(context: any) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const row = await context.env.submoacontent_db
    .prepare("SELECT r2_key FROM email_assets WHERE id = ? AND account_id = ?")
    .bind(context.params.id, user.account_id || "makerfrontier")
    .first<{ r2_key: string }>();
  if (!row) return json({ error: "Not found" }, 404);

  await context.env.SUBMOA_IMAGES.delete(row.r2_key).catch(() => {});
  await context.env.submoacontent_db
    .prepare("DELETE FROM email_assets WHERE id = ?")
    .bind(context.params.id)
    .run();

  return json({ ok: true });
}
