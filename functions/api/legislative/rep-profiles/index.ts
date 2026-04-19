// GET /api/legislative/rep-profiles — list all profiles
// POST /api/legislative/rep-profiles — create new profile
import { getSessionUser, json, generateId } from '../../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../../src/auth-utils';

function safeParse<T>(v: any, d: T): T {
  if (typeof v !== 'string') return (v ?? d) as T;
  try { return JSON.parse(v); } catch { return d; }
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  if (request.method === 'GET') {
    try { await requirePageAccess(user, env, 'legislative-intelligence', 'view'); }
    catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

    const { results } = await env.submoacontent_db
      .prepare('SELECT * FROM rep_profiles ORDER BY name ASC')
      .all();
    return json({
      profiles: (results || []).map((r: any) => ({
        ...r,
        tone_tags: safeParse(r.tone_tags, []),
        sample_phrases: safeParse(r.sample_phrases, []),
        policy_positions: safeParse(r.policy_positions, {}),
        voting_record_json: safeParse(r.voting_record_json, {}),
        donor_profile_json: safeParse(r.donor_profile_json, {}),
        district_profile_json: safeParse(r.district_profile_json, {}),
        sponsored_legislation: safeParse(r.sponsored_legislation, []),
        committee_memberships: safeParse(r.committee_memberships, []),
      })),
    });
  }

  if (request.method === 'POST') {
    try { await requirePageAccess(user, env, 'legislative-intelligence', 'manage-rep-profiles'); }
    catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const name = String(body.name || '').trim();
    if (!name) return json({ error: 'name required' }, 400);

    const id = generateId();
    await env.submoacontent_db.prepare(
      `INSERT INTO rep_profiles (id, name, title, party, state, district, bioguide_id, rss_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`
    ).bind(
      id, name,
      body.title || null, body.party || null, body.state || null,
      body.district || null, body.bioguide_id || null, body.rss_url || null,
    ).run();

    await writeAudit(env, request, user.id, { action: 'rep-profile-created', rep_profile_id: id, details: { name } });
    const row = await env.submoacontent_db.prepare('SELECT * FROM rep_profiles WHERE id = ?').bind(id).first();
    return json({ profile: row });
  }

  return json({ error: 'Method not allowed' }, 405);
}
