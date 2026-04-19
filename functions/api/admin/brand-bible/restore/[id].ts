import { json, generateId } from '../../../_utils';
import { requireAdmin } from '../_shared';

// POST /api/admin/brand-bible/restore/:id — clones a locked version to a new draft
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const srcId = context.params.id;
  const src: any = await context.env.submoacontent_db
    .prepare(`SELECT config_json FROM brand_bible_versions WHERE id = ?`)
    .bind(srcId)
    .first();
  if (!src) return json({ error: 'Version not found' }, 404);

  // Remove any existing draft — only one draft at a time
  await context.env.submoacontent_db
    .prepare(`DELETE FROM brand_bible_versions WHERE status = 'draft'`)
    .run();

  const locked: any = await context.env.submoacontent_db
    .prepare(`SELECT version_number FROM brand_bible_versions WHERE status = 'locked' ORDER BY version_number DESC LIMIT 1`)
    .first();
  const nextVersion = (locked?.version_number || 0) + 1;
  const id = generateId();
  await context.env.submoacontent_db
    .prepare(`INSERT INTO brand_bible_versions (id, version_number, status, config_json) VALUES (?, ?, 'draft', ?)`)
    .bind(id, nextVersion, src.config_json)
    .run();
  return json({ ok: true, id, version_number: nextVersion });
}
