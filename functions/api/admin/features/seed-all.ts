import { json } from '../../_utils';
import { requireAdmin } from '../brand-bible/_shared';
import { FEATURE_SEEDS } from './_seed-data';

// POST /api/admin/features/seed-all — idempotent seed of feature rows.
// Existing rows are left intact (won't overwrite user edits). Missing rows
// are created with the scaffold from _seed-data.ts.
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  let inserted = 0, skipped = 0;
  for (const s of FEATURE_SEEDS) {
    const existing = await context.env.submoacontent_db
      .prepare(`SELECT slug FROM features WHERE slug = ?`)
      .bind(s.slug)
      .first();
    if (existing) { skipped++; continue; }
    const now = Math.floor(Date.now() / 1000);
    await context.env.submoacontent_db
      .prepare(`
        INSERT INTO features (slug, name, status, pending, source_files, last_updated, last_updated_by, seeded)
        VALUES (?, ?, ?, ?, ?, ?, 'system-seed', 0)
      `)
      .bind(
        s.slug,
        s.name,
        s.status,
        JSON.stringify(s.pending),
        JSON.stringify(s.source_files),
        now,
      )
      .run();
    inserted++;
  }
  return json({ ok: true, inserted, skipped, total: FEATURE_SEEDS.length });
}
