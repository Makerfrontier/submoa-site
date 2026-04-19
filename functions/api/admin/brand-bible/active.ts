import { json } from '../../_utils';
import { ensureSeeded, DEFAULT_BRAND_BIBLE } from './_shared';

// GET /api/admin/brand-bible/active — public (no auth needed for tokens).
// Returns the active locked brand bible config. Seeds v1 on first call.
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  try {
    await ensureSeeded(context.env);
    const row: any = await context.env.submoacontent_db
      .prepare(`SELECT id, version_number, config_json, locked_at FROM brand_bible_versions WHERE status = 'locked' ORDER BY version_number DESC LIMIT 1`)
      .first();
    if (!row) return json({ config: DEFAULT_BRAND_BIBLE, version_number: 1, locked_at: null });
    return json({
      id: row.id,
      version_number: row.version_number,
      locked_at: row.locked_at,
      config: JSON.parse(row.config_json),
    });
  } catch (e: any) {
    return json({ config: DEFAULT_BRAND_BIBLE, version_number: 1, locked_at: null, error: e.message });
  }
}
