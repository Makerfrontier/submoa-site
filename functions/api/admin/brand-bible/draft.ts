import { json, generateId } from '../../_utils';
import { requireAdmin, DEFAULT_BRAND_BIBLE } from './_shared';

// GET /api/admin/brand-bible/draft — returns (or creates) the current draft
// PATCH /api/admin/brand-bible/draft — saves draft changes (full config replace)
export async function onRequest(context: any) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  if (context.request.method === 'GET') {
    const row: any = await context.env.submoacontent_db
      .prepare(`SELECT id, version_number, config_json FROM brand_bible_versions WHERE status = 'draft' ORDER BY created_at DESC LIMIT 1`)
      .first();
    if (row) {
      return json({ id: row.id, version_number: row.version_number, config: JSON.parse(row.config_json) });
    }
    // No draft — clone active locked as a new draft
    const locked: any = await context.env.submoacontent_db
      .prepare(`SELECT version_number, config_json FROM brand_bible_versions WHERE status = 'locked' ORDER BY version_number DESC LIMIT 1`)
      .first();
    const base = locked ? JSON.parse(locked.config_json) : DEFAULT_BRAND_BIBLE;
    const nextVersion = (locked?.version_number || 0) + 1;
    const id = generateId();
    await context.env.submoacontent_db
      .prepare(`INSERT INTO brand_bible_versions (id, version_number, status, config_json) VALUES (?, ?, 'draft', ?)`)
      .bind(id, nextVersion, JSON.stringify(base))
      .run();
    return json({ id, version_number: nextVersion, config: base });
  }

  if (context.request.method === 'PATCH') {
    const body: any = await context.request.json();
    if (!body?.config) return json({ error: 'config required' }, 400);
    // Find or create draft
    const row: any = await context.env.submoacontent_db
      .prepare(`SELECT id FROM brand_bible_versions WHERE status = 'draft' ORDER BY created_at DESC LIMIT 1`)
      .first();
    if (row) {
      await context.env.submoacontent_db
        .prepare(`UPDATE brand_bible_versions SET config_json = ? WHERE id = ?`)
        .bind(JSON.stringify(body.config), row.id)
        .run();
      return json({ ok: true, id: row.id });
    }
    const locked: any = await context.env.submoacontent_db
      .prepare(`SELECT version_number FROM brand_bible_versions WHERE status = 'locked' ORDER BY version_number DESC LIMIT 1`)
      .first();
    const nextVersion = (locked?.version_number || 0) + 1;
    const id = generateId();
    await context.env.submoacontent_db
      .prepare(`INSERT INTO brand_bible_versions (id, version_number, status, config_json) VALUES (?, ?, 'draft', ?)`)
      .bind(id, nextVersion, JSON.stringify(body.config))
      .run();
    return json({ ok: true, id });
  }

  return json({ error: 'Method not allowed' }, 405);
}
