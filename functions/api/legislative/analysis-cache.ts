// GET /api/legislative/analysis-cache?bill_id=XXX
// Returns the most recent bill_analysis_cache entry for the given bill_id,
// scoped to the current user. Used by Narrative Craft to pre-load context
// from a prior Analyze Bill run without re-invoking the 5-pass analyzer.
import { getSessionUser, json } from '../_utils';
import { requirePageAccess, AccessError } from '../../../src/auth-utils';

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'analysis-cache'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  const url = new URL(request.url);
  const billId = String(url.searchParams.get('bill_id') || '').trim();
  if (!billId) return json({ error: 'bill_id required' }, 400);

  const row: any = await env.submoacontent_db
    .prepare(
      `SELECT id, bill_id, user_id, analysis_data, created_at
       FROM bill_analysis_cache
       WHERE bill_id = ? AND user_id = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(billId, user.id).first();

  if (!row) return json({ cached: false });

  let analysis: any = null;
  try { analysis = JSON.parse(row.analysis_data); } catch { analysis = null; }
  if (!analysis) return json({ cached: false });

  return json({
    cached: true,
    id: row.id,
    bill_id: row.bill_id,
    created_at: row.created_at,
    analysis,
  });
}
