import { json } from '../../_utils';
import { requireAdmin } from './_shared';

// GET /api/admin/brand-bible/versions — list all versions
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const result = await context.env.submoacontent_db
    .prepare(`SELECT id, version_number, status, locked_at, locked_by, created_at FROM brand_bible_versions ORDER BY version_number DESC`)
    .all();
  return json({ versions: result.results || [] });
}
