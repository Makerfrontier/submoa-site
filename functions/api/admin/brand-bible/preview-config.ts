import { json } from '../../_utils';
import { DEFAULT_BRAND_BIBLE } from './_shared';

// GET /api/admin/brand-bible/preview-config?draft=1
// Returns the draft config (draft=1) or the locked config (draft=0).
// Used by the Live Site Preview iframe.
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const url = new URL(context.request.url);
  const wantDraft = url.searchParams.get('draft') === '1';

  if (wantDraft) {
    const row: any = await context.env.submoacontent_db
      .prepare(`SELECT id, version_number, config_json FROM brand_bible_versions WHERE status = 'draft' ORDER BY created_at DESC LIMIT 1`)
      .first();
    if (row) return json({ version_number: row.version_number, mode: 'draft', config: JSON.parse(row.config_json) });
    // Fall through to locked if no draft
  }

  const locked: any = await context.env.submoacontent_db
    .prepare(`SELECT version_number, config_json, locked_at FROM brand_bible_versions WHERE status = 'locked' ORDER BY version_number DESC LIMIT 1`)
    .first();
  if (locked) {
    return json({ version_number: locked.version_number, mode: 'locked', locked_at: locked.locked_at, config: JSON.parse(locked.config_json) });
  }
  return json({ version_number: 0, mode: 'default', config: DEFAULT_BRAND_BIBLE });
}
