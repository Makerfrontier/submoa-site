import { json, requireWritebackAuth } from '../../_utils';

const JSON_FIELDS = ['pending', 'source_files', 'db_tables', 'r2_paths', 'endpoints', 'external_apis'];

function rowToFeature(row: any) {
  if (!row) return null;
  const out: any = { ...row };
  for (const f of JSON_FIELDS) {
    try { out[f] = row[f] ? JSON.parse(row[f]) : []; } catch { out[f] = []; }
  }
  return out;
}

// GET   /api/admin/features/:slug — detail + joined open bugs
// PATCH /api/admin/features/:slug — update spec
export async function onRequest(context: any) {
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;
  const slug = context.params.slug;

  if (context.request.method === 'GET') {
    const row: any = await context.env.submoacontent_db
      .prepare(`SELECT * FROM features WHERE slug = ?`)
      .bind(slug)
      .first();
    if (!row) return json({ error: 'Not found' }, 404);
    const bugs = await context.env.submoacontent_db
      .prepare(`SELECT id, title, severity, status, opened_at, logged_from_url FROM bug_reports WHERE feature_slug = ? ORDER BY opened_at DESC`)
      .bind(slug)
      .all();
    return json({ feature: rowToFeature(row), bugs: bugs.results || [] });
  }

  if (context.request.method === 'PATCH') {
    const body: any = await context.request.json();
    const allowed = ['name', 'status', 'what_it_does', 'how_its_built', 'behavior', 'pending', 'source_files', 'db_tables', 'r2_paths', 'endpoints', 'external_apis', 'seeded'];
    const sets: string[] = [];
    const vals: any[] = [];
    for (const k of allowed) {
      if (body[k] === undefined) continue;
      sets.push(`${k} = ?`);
      if (JSON_FIELDS.includes(k)) vals.push(JSON.stringify(body[k]));
      else vals.push(body[k]);
    }
    if (sets.length === 0) return json({ error: 'No fields to update' }, 400);
    sets.push('last_updated = ?', 'last_updated_by = ?');
    vals.push(Math.floor(Date.now() / 1000));
    vals.push(auth.via === 'bearer' ? 'claude_code' : (auth.user?.email || 'admin'));
    vals.push(slug);
    const res = await context.env.submoacontent_db
      .prepare(`UPDATE features SET ${sets.join(', ')} WHERE slug = ?`)
      .bind(...vals)
      .run();
    if (!res.meta?.changes) return json({ error: 'Feature not found' }, 404);
    return json({ ok: true, slug });
  }

  return json({ error: 'Method not allowed' }, 405);
}
