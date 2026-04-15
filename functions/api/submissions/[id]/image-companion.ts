// GET /api/submissions/:id/image-companion → stream image-seo-companion.txt as a download

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

  const obj = await env.SUBMOA_IMAGES.get(`projects/${id}/images/image-seo-companion.txt`);
  if (!obj) return new Response("Image SEO doc not available for this submission", { status: 404 });

  return new Response(obj.body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="image-seo-companion.txt"',
      "Cache-Control": "private, max-age=3600",
    },
  });
}
