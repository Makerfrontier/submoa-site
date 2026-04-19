// GET /api/legislative/latest-snapshot — returns the caller's most recent
// morning_brief snapshot or null.
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
  const scope = url.searchParams.get('scope') || 'federal';

  // When called with ?all=1 return the latest snapshot for EVERY scope the
  // caller has pulled. This powers the scope pill status dots.
  if (url.searchParams.get('all') === '1') {
    const { results } = await env.submoacontent_db.prepare(
      `SELECT s.* FROM legislative_intel_snapshots s
        INNER JOIN (
          SELECT scope, MAX(pulled_at) AS mx
          FROM legislative_intel_snapshots
          WHERE user_id = ?
          GROUP BY scope
        ) latest ON latest.scope = s.scope AND latest.mx = s.pulled_at
        WHERE s.user_id = ?`
    ).bind(user.id, user.id).all();
    return json({
      snapshots: (results || []).map((r: any) => ({
        ...r,
        party_focus_data: safeParse(r.party_focus_data, {}),
        hot_bills_data: safeParse(r.hot_bills_data, []),
        anomaly_alerts: safeParse(r.anomaly_alerts, []),
        crossover_votes: safeParse(r.crossover_votes, []),
      })),
    });
  }

  const row: any = await env.submoacontent_db
    .prepare('SELECT * FROM legislative_intel_snapshots WHERE user_id = ? AND scope = ? ORDER BY pulled_at DESC LIMIT 1')
    .bind(user.id, scope).first();
  if (!row) return json({ snapshot: null });
  return json({
    snapshot: {
      ...row,
      party_focus_data: safeParse(row.party_focus_data, {}),
      hot_bills_data: safeParse(row.hot_bills_data, []),
      anomaly_alerts: safeParse(row.anomaly_alerts, []),
      crossover_votes: safeParse(row.crossover_votes, []),
    },
  });
}
