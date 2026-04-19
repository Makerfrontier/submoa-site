// GET /api/legislative/briefs?id=X  or  ?legislation_id=X
// Returns stored brief rows (parsed JSON). Used to hydrate the brief display.
import { getSessionUser, json } from '../_utils';
import { requirePageAccess, AccessError } from '../../../src/auth-utils';

function safeParse<T>(v: any, d: T): T {
  if (typeof v !== 'string') return (v ?? d) as T;
  try { return JSON.parse(v); } catch { return d; }
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'view'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const legId = url.searchParams.get('legislation_id');

  let rows: any[] = [];
  if (id) {
    const row: any = await env.submoacontent_db.prepare('SELECT * FROM legislative_briefs WHERE id = ?').bind(id).first();
    if (row) rows = [row];
  } else if (legId) {
    const { results } = await env.submoacontent_db
      .prepare('SELECT * FROM legislative_briefs WHERE legislation_id = ? ORDER BY created_at DESC LIMIT 10')
      .bind(legId).all();
    rows = results || [];
  }

  const mapped = rows.map(r => ({
    ...r,
    pork_analysis: safeParse(r.pork_analysis, []),
    talking_points_pro: safeParse(r.talking_points_pro, []),
    talking_points_opposed: safeParse(r.talking_points_opposed, []),
    verbatim_extracts: safeParse(r.verbatim_extracts, []),
    historical_parallels: safeParse(r.historical_parallels, []),
    opposition_alignment: safeParse(r.opposition_alignment, []),
    fec_context: safeParse(r.fec_context, {}),
    news_cycle: safeParse(r.news_cycle, {}),
  }));
  return json({ briefs: mapped });
}
