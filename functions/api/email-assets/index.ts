// GET  /api/email-assets       → list assets for current account
// POST /api/email-assets       → upload a brand asset (multipart, field "file")

import { getSessionUser, generateId, json } from "../_utils";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
const MAX = 5 * 1024 * 1024;

export async function onRequestGet(context: any) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { results } = await context.env.submoacontent_db.prepare(
    `SELECT id, filename, content_type, created_at FROM email_assets
      WHERE account_id = ? ORDER BY created_at DESC`
  ).bind(user.account_id || "makerfrontier").all();

  const assets = (results || []).map((r: any) => ({
    id: r.id,
    filename: r.filename,
    content_type: r.content_type,
    created_at: r.created_at,
    url: `/api/email-assets/${r.id}`,
  }));

  return json({ assets });
}

export async function onRequestPost(context: any) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let formData: FormData;
  try {
    formData = await context.request.formData();
  } catch {
    return json({ error: "Invalid form data" }, 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return json({ error: "No file provided (field name: file)" }, 400);
  if (!ALLOWED.includes(file.type)) return json({ error: `Unsupported type: ${file.type}` }, 400);
  if (file.size > MAX) return json({ error: "File exceeds 5 MB limit" }, 400);

  const id = generateId();
  const accountId = user.account_id || "makerfrontier";
  const safeName = sanitize(file.name);
  const r2Key = `assets/${accountId}/email-assets/${id}-${safeName}`;

  await context.env.SUBMOA_IMAGES.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  await context.env.submoacontent_db.prepare(
    `INSERT INTO email_assets (id, account_id, filename, r2_key, content_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, accountId, safeName, r2Key, file.type, Date.now()).run();

  return json({ id, filename: safeName, url: `/api/email-assets/${id}` }, 201);
}

function sanitize(name: string): string {
  return (name || "asset")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "asset";
}
