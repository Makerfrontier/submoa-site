// GET /api/planner/:id/pdf — streams the generated PDF back to the browser.

import { json, getSessionUser } from '../../_utils';

function parseId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('planner');
  return idx >= 0 ? parts[idx + 1] ?? null : null;
}

export async function onRequest(context: any) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const id = parseId(url.pathname);
  if (!id) return json({ error: 'Missing id' }, 400);
  const account_id = user.account_id || 'makerfrontier';

  const row: any = await env.submoacontent_db.prepare(
    'SELECT pdf_r2_key FROM itinerary_submissions WHERE id = ? AND account_id = ?'
  ).bind(id, account_id).first();
  if (!row) return json({ error: 'Not found' }, 404);
  if (!row.pdf_r2_key) return json({ error: 'pdf_not_ready' }, 404);

  const obj = await env.SUBMOA_IMAGES.get(row.pdf_r2_key);
  if (!obj) return json({ error: 'pdf_missing' }, 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="itinerary.pdf"',
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
