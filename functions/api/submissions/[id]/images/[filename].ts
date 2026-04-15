// GET /api/submissions/:id/images/:filename
// Streams an image from R2 with ownership check.
// Tries projects/{id}/images/{filename} first (post-processing renamed assets),
// falls back to submissions/{id}/images/{filename} (legacy raw uploads).

export async function onRequestGet({ request, env, params }: any) {
  const session = getCookieValue(request, "submoa_session");
  if (!session) return new Response("Unauthorized", { status: 401 });

  const user = await env.submoacontent_db
    .prepare(
      `SELECT id, account_id FROM users
       WHERE id = (SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?)
       LIMIT 1`
    )
    .bind(session, Date.now())
    .first<{ id: string; account_id: string }>();

  if (!user) return new Response("Unauthorized", { status: 401 });

  const id = params.id;
  const filename = params.filename;
  if (!id || !filename) return new Response("Bad request", { status: 400 });

  // Ownership check
  const sub = await env.submoacontent_db
    .prepare(`SELECT id FROM submissions WHERE id = ? AND account_id = ?`)
    .bind(id, user.account_id)
    .first<{ id: string }>();
  if (!sub) return new Response("Not found", { status: 404 });

  const candidates = [
    `projects/${id}/images/${filename}`,
    `submissions/${id}/images/${filename}`,
    `images/${id}/${filename}`, // legacy upload path
  ];

  for (const key of candidates) {
    const obj = await env.SUBMOA_IMAGES.get(key);
    if (!obj) continue;
    const headers = new Headers();
    const ct = obj.httpMetadata?.contentType || guessContentType(filename);
    headers.set("Content-Type", ct);
    headers.set("Cache-Control", "private, max-age=86400");
    if (obj.size != null) headers.set("Content-Length", String(obj.size));
    return new Response(obj.body, { status: 200, headers });
  }

  return new Response("Not found", { status: 404 });
}

function getCookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function guessContentType(filename: string): string {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  switch (ext) {
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "svg": return "image/svg+xml";
    default: return "image/jpeg";
  }
}
