import { Env, requireAuth, json } from '../../../_utils';
import { stripInjections } from '../../../../../src/lib/atomic-email/templater';

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const id = String(params.id || '');
  if (!id) return json({ error: 'id required' }, 400);

  const row: any = await env.submoacontent_db.prepare(
    `SELECT name, current_html FROM atomic_email_projects WHERE id = ? AND user_id = ?`
  ).bind(id, user.id).first();
  if (!row) return json({ error: 'not found' }, 404);

  const cleanHtml = stripInjections(row.current_html);
  const fname = (String(row.name || 'atomic-email').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'atomic-email') + '.html';

  return new Response(cleanHtml, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fname}"`,
      'Cache-Control': 'no-store',
    },
  });
};
