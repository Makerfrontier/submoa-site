import { json } from '../../_utils';
import { requireAdmin } from './_shared';

// POST /api/admin/brand-bible/lock — locks the current draft as a new version
// and archives any prior locked version.
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const draft: any = await context.env.submoacontent_db
    .prepare(`SELECT id, version_number, config_json FROM brand_bible_versions WHERE status = 'draft' ORDER BY created_at DESC LIMIT 1`)
    .first();
  if (!draft) return json({ error: 'No draft to lock' }, 400);

  const now = Math.floor(Date.now() / 1000);
  await context.env.submoacontent_db
    .prepare(`UPDATE brand_bible_versions SET status = 'archived' WHERE status = 'locked'`)
    .run();
  await context.env.submoacontent_db
    .prepare(`UPDATE brand_bible_versions SET status = 'locked', locked_at = ?, locked_by = ? WHERE id = ?`)
    .bind(now, auth.user.email, draft.id)
    .run();

  return json({ ok: true, id: draft.id, version_number: draft.version_number, locked_at: now });
}
