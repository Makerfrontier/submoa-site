// GET /api/submissions/:id/email-txt → stream plain-text email

import { getSessionUser } from "../../_utils";

export async function onRequestGet({ request, env, params }: any) {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const id = params.id;
  if (!id) return new Response("Bad request", { status: 400 });

  const sub = await env.submoacontent_db
    .prepare("SELECT id FROM submissions WHERE id = ? AND account_id = ?")
    .bind(id, user.account_id || "makerfrontier")
    .first<{ id: string }>();
  if (!sub) return new Response("Not found", { status: 404 });

  const row = await env.submoacontent_db
    .prepare("SELECT txt_r2_key FROM email_submissions WHERE submission_id = ?")
    .bind(id)
    .first<{ txt_r2_key: string | null }>();
  if (!row?.txt_r2_key) return new Response("Email not yet built", { status: 404 });

  const obj = await env.SUBMOA_IMAGES.get(row.txt_r2_key);
  if (!obj) return new Response("Not found in storage", { status: 404 });

  return new Response(obj.body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
