import { json, requireWritebackAuth, generateId } from '../../_utils';

// GET  /api/admin/bugs — list (filterable via feature_slug, severity, status, q)
// POST /api/admin/bugs — create new
export async function onRequest(context: any) {
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;

  if (context.request.method === 'GET') {
    const url = new URL(context.request.url);
    const feature = url.searchParams.get('feature_slug');
    const severity = url.searchParams.get('severity');
    const status = url.searchParams.get('status');
    const q = url.searchParams.get('q');
    const where: string[] = [];
    const vals: any[] = [];
    if (feature) { where.push('feature_slug = ?'); vals.push(feature); }
    if (severity) { where.push('severity = ?'); vals.push(severity); }
    if (status) { where.push('status = ?'); vals.push(status); }
    if (q) { where.push('(title LIKE ? OR description LIKE ?)'); vals.push(`%${q}%`, `%${q}%`); }
    const sql = `SELECT * FROM bug_reports ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY (status = 'closed'), severity, opened_at DESC LIMIT 500`;
    const result = await context.env.submoacontent_db.prepare(sql).bind(...vals).all();
    return json({ bugs: result.results || [] });
  }

  if (context.request.method === 'POST') {
    const body: any = await context.request.json();
    if (!body?.feature_slug || !body?.title) return json({ error: 'feature_slug and title required' }, 400);
    const id = generateId();
    const loggedBy = auth.via === 'bearer' ? 'claude_code' : (auth.user?.email || 'admin');
    await context.env.submoacontent_db
      .prepare(`
        INSERT INTO bug_reports (id, feature_slug, title, description, expected, severity, status, logged_from_url, logged_by)
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
      `)
      .bind(
        id,
        body.feature_slug,
        body.title,
        body.description || '',
        body.expected || '',
        body.severity || 'minor',
        body.logged_from_url || null,
        loggedBy,
      )
      .run();
    return json({ ok: true, id });
  }

  return json({ error: 'Method not allowed' }, 405);
}
