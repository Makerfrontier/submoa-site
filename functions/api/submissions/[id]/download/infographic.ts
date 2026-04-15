// GET /api/submissions/:id/download/infographic — stream the infographic file from R2.

import { json, getSessionUser, isAdmin } from '../../../_utils';

function parseSubmissionId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('submissions');
  return idx >= 0 ? parts[idx + 1] ?? null : null;
}

function filenameFromTopic(topic: string | null | undefined, suffix: string): string {
  const base = (topic || 'infographic').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80) || 'infographic';
  return `${base}-${suffix}`;
}

export async function onRequest(context: any) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const id = parseSubmissionId(url.pathname);
  if (!id) return json({ error: 'Missing id' }, 400);

  const row: any = isAdmin(user)
    ? await env.submoacontent_db.prepare('SELECT id, topic, infographic_r2_key FROM submissions WHERE id = ?').bind(id).first()
    : await env.submoacontent_db.prepare('SELECT id, topic, infographic_r2_key FROM submissions WHERE id = ? AND account_id = ?').bind(id, user.account_id || 'makerfrontier').first();
  if (!row) return json({ error: 'Not found' }, 404);

  let key: string | null = row.infographic_r2_key || null;
  let ext = 'svg';
  let contentType = 'image/svg+xml';
  let obj: any = null;

  if (key) {
    obj = await env.SUBMOA_IMAGES.get(key);
    ext = key.endsWith('.png') ? 'png' : key.endsWith('.jpg') || key.endsWith('.jpeg') ? 'jpg' : 'svg';
    contentType = ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'image/svg+xml';
  }
  if (!obj) {
    obj = await env.SUBMOA_IMAGES.get(`projects/${id}/infographic/infographic.svg`);
    if (obj) { ext = 'svg'; contentType = 'image/svg+xml'; }
  }
  if (!obj) {
    obj = await env.SUBMOA_IMAGES.get(`projects/${id}/infographic/infographic.png`);
    if (obj) { ext = 'png'; contentType = 'image/png'; }
  }
  if (!obj) return json({ error: 'Infographic not found' }, 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filenameFromTopic(row.topic, `infographic.${ext}`)}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
