// GET  /api/legislative/intel-config — returns the caller's user_intel_config row.
// PUT  /api/legislative/intel-config — upserts the row.
import { getSessionUser, json, generateId } from '../_utils';
import { requirePageAccess, AccessError } from '../../../src/auth-utils';

function safeParse<T>(v: any, d: T): T {
  if (typeof v !== 'string') return (v ?? d) as T;
  try { return JSON.parse(v); } catch { return d; }
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'view'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  if (request.method === 'GET') {
    const row: any = await env.submoacontent_db
      .prepare('SELECT * FROM user_intel_config WHERE user_id = ?')
      .bind(user.id).first();
    if (!row) return json({ config: null });
    return json({
      config: {
        ...row,
        watched_bills: safeParse(row.watched_bills, []),
        watched_topics: safeParse(row.watched_topics, []),
        watched_reps: safeParse(row.watched_reps, []),
        watched_committees: safeParse(row.watched_committees, []),
        watched_donor_categories: safeParse(row.watched_donor_categories, []),
      },
    });
  }

  if (request.method === 'PUT') {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const existing: any = await env.submoacontent_db
      .prepare('SELECT id FROM user_intel_config WHERE user_id = ?')
      .bind(user.id).first();

    const payload = {
      watched_bills: JSON.stringify(Array.isArray(body.watched_bills) ? body.watched_bills : []),
      watched_topics: JSON.stringify(Array.isArray(body.watched_topics) ? body.watched_topics : []),
      watched_reps: JSON.stringify(Array.isArray(body.watched_reps) ? body.watched_reps : []),
      watched_committees: JSON.stringify(Array.isArray(body.watched_committees) ? body.watched_committees : []),
      watched_donor_categories: JSON.stringify(Array.isArray(body.watched_donor_categories) ? body.watched_donor_categories : []),
      default_rep_profile_id: body.default_rep_profile_id || null,
      default_party: body.default_party || null,
      default_mode: body.default_mode || 'dashboard',
      brief_frequency: body.brief_frequency || 'daily',
    };

    if (existing) {
      await env.submoacontent_db.prepare(
        `UPDATE user_intel_config SET watched_bills = ?, watched_topics = ?, watched_reps = ?,
          watched_committees = ?, watched_donor_categories = ?, default_rep_profile_id = ?,
          default_party = ?, default_mode = ?, brief_frequency = ?, updated_at = unixepoch()
         WHERE user_id = ?`
      ).bind(
        payload.watched_bills, payload.watched_topics, payload.watched_reps,
        payload.watched_committees, payload.watched_donor_categories,
        payload.default_rep_profile_id, payload.default_party, payload.default_mode,
        payload.brief_frequency, user.id,
      ).run();
    } else {
      await env.submoacontent_db.prepare(
        `INSERT INTO user_intel_config
          (id, user_id, watched_bills, watched_topics, watched_reps, watched_committees,
           watched_donor_categories, default_rep_profile_id, default_party, default_mode, brief_frequency)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        generateId(), user.id,
        payload.watched_bills, payload.watched_topics, payload.watched_reps,
        payload.watched_committees, payload.watched_donor_categories,
        payload.default_rep_profile_id, payload.default_party, payload.default_mode,
        payload.brief_frequency,
      ).run();
    }
    return json({ success: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
