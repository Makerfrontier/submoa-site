// GET /api/submissions/:id/download/docx — stream the packaged article DOCX from R2.

import { json, getSessionUser, isAdmin } from '../../../_utils';

function parseSubmissionId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('submissions');
  return idx >= 0 ? parts[idx + 1] ?? null : null;
}

function filenameFromTopic(topic: string | null | undefined, ext: string): string {
  const base = (topic || 'article').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80) || 'article';
  return `${base}.${ext}`;
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
    ? await env.submoacontent_db.prepare('SELECT id, topic FROM submissions WHERE id = ?').bind(id).first()
    : await env.submoacontent_db.prepare('SELECT id, topic FROM submissions WHERE id = ? AND account_id = ?').bind(id, user.account_id || 'makerfrontier').first();
  if (!row) return json({ error: 'Not found' }, 404);

  const obj = await env.SUBMOA_IMAGES.get(`projects/${id}/article/article.docx`);
  if (!obj) return json({ error: 'DOCX not found' }, 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filenameFromTopic(row.topic, 'docx')}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
