// GET /api/submissions/:id/presentation → stream the assembled .pptx as a download

import { getSessionUser } from "../../_utils";

export async function onRequestGet({ request, env, params }: any) {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const id = params.id;
  if (!id) return new Response("Bad request", { status: 400 });

  const sub = await env.submoacontent_db
    .prepare("SELECT id, topic FROM submissions WHERE id = ? AND account_id = ?")
    .bind(id, user.account_id || "makerfrontier")
    .first<{ id: string; topic: string }>();
  if (!sub) return new Response("Not found", { status: 404 });

  const row = await env.submoacontent_db
    .prepare("SELECT pptx_r2_key FROM presentation_submissions WHERE submission_id = ?")
    .bind(id)
    .first<{ pptx_r2_key: string | null }>();
  if (!row?.pptx_r2_key) return new Response("Presentation not yet built", { status: 404 });

  const obj = await env.SUBMOA_IMAGES.get(row.pptx_r2_key);
  if (!obj) return new Response("Not found in storage", { status: 404 });

  const filename = sanitize(sub.topic || "presentation") + ".pptx";

  return new Response(obj.body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

function sanitize(s: string): string {
  return (s || "presentation")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "presentation";
}
