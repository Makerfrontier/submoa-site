import { json } from '../../../_utils';
import type { Env } from '../../../_utils';

// GET /api/atomic/comp/share/:token — public; returns the comp payload the
// share page needs to render. No auth. Only serves rows with
// share_enabled = 1.
export async function onRequestGet(context: { request: Request; env: Env; params: { token?: string } }) {
  const token = String(context.params.token || '').trim();
  if (!token) return json({ error: 'Missing token' }, 400);

  const row: any = await context.env.submoacontent_db
    .prepare(`SELECT id, name, blocks_json, brand_json, source_url, share_enabled, updated_at
              FROM atomic_comp_drafts WHERE share_token = ? LIMIT 1`)
    .bind(token).first();

  if (!row || !Number(row.share_enabled)) return json({ error: 'Not available' }, 404);

  return json({
    comp: {
      id: row.id,
      name: row.name,
      blocks_json: row.blocks_json,
      brand_json: row.brand_json,
      source_url: row.source_url,
      updated_at: row.updated_at,
    },
  });
}
