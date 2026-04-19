import { json, requireWritebackAuth } from '../../_utils';

// GET  /api/admin/features — list all
// POST /api/admin/features — create new
export async function onRequest(context: any) {
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;

  if (context.request.method === 'GET') {
    const rows = await context.env.submoacontent_db
      .prepare(`
        SELECT f.slug, f.name, f.status, f.last_updated, f.last_updated_by, f.seeded,
               (SELECT COUNT(*) FROM bug_reports WHERE feature_slug = f.slug AND status = 'open') AS open_bugs
        FROM features f
        ORDER BY f.name
      `)
      .all();
    return json({ features: rows.results || [] });
  }

  if (context.request.method === 'POST') {
    const body: any = await context.request.json();
    if (!body?.slug || !body?.name) return json({ error: 'slug and name required' }, 400);
    const now = Math.floor(Date.now() / 1000);
    try {
      await context.env.submoacontent_db
        .prepare(`
          INSERT INTO features (slug, name, status, what_it_does, how_its_built, behavior, pending, source_files, db_tables, r2_paths, endpoints, external_apis, last_updated, last_updated_by, seeded)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `)
        .bind(
          body.slug,
          body.name,
          body.status || 'active',
          body.what_it_does || '',
          body.how_its_built || '',
          body.behavior || '',
          JSON.stringify(body.pending || []),
          JSON.stringify(body.source_files || []),
          JSON.stringify(body.db_tables || []),
          JSON.stringify(body.r2_paths || []),
          JSON.stringify(body.endpoints || []),
          JSON.stringify(body.external_apis || []),
          now,
          auth.via === 'bearer' ? 'claude_code' : (auth.user?.email || 'admin'),
        )
        .run();
      return json({ ok: true, slug: body.slug });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}
