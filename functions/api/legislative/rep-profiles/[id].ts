// GET    /api/legislative/rep-profiles/:id
// PUT    /api/legislative/rep-profiles/:id
// DELETE /api/legislative/rep-profiles/:id
import { getSessionUser, json } from '../../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../../src/auth-utils';

function safeParse<T>(v: any, d: T): T {
  if (typeof v !== 'string') return (v ?? d) as T;
  try { return JSON.parse(v); } catch { return d; }
}

export async function onRequest(context: { request: Request; env: any; params: { id?: string } }) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const id = String(params.id || '').trim();
  if (!id) return json({ error: 'Missing id' }, 400);

  const row: any = await env.submoacontent_db.prepare('SELECT * FROM rep_profiles WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'Profile not found' }, 404);

  if (request.method === 'GET') {
    try { await requirePageAccess(user, env, 'legislative-intelligence', 'view'); }
    catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }
    return json({
      profile: {
        ...row,
        tone_tags: safeParse(row.tone_tags, []),
        sample_phrases: safeParse(row.sample_phrases, []),
        policy_positions: safeParse(row.policy_positions, {}),
        voting_record_json: safeParse(row.voting_record_json, {}),
        donor_profile_json: safeParse(row.donor_profile_json, {}),
        district_profile_json: safeParse(row.district_profile_json, {}),
        sponsored_legislation: safeParse(row.sponsored_legislation, []),
        committee_memberships: safeParse(row.committee_memberships, []),
      },
    });
  }

  try { await requirePageAccess(user, env, 'legislative-intelligence', 'manage-rep-profiles'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  if (request.method === 'PUT') {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const updates: string[] = [];
    const args: any[] = [];
    const str = (k: string) => { if (typeof body[k] === 'string') { updates.push(`${k} = ?`); args.push(body[k]); } };
    const obj = (k: string) => { if (body[k] && typeof body[k] === 'object') { updates.push(`${k} = ?`); args.push(JSON.stringify(body[k])); } };
    ['name', 'title', 'party', 'state', 'district', 'bioguide_id', 'voice_guide', 'rss_url'].forEach(str);
    ['tone_tags', 'sample_phrases', 'policy_positions', 'voting_record_json', 'donor_profile_json', 'district_profile_json', 'sponsored_legislation', 'committee_memberships'].forEach(obj);
    if (updates.length === 0) return json({ error: 'No fields to update' }, 400);
    updates.push('updated_at = unixepoch()');
    try {
      await env.submoacontent_db.prepare(`UPDATE rep_profiles SET ${updates.join(', ')} WHERE id = ?`).bind(...args, id).run();
    } catch (e: any) { return json({ error: e?.message }, 500); }

    await writeAudit(env, request, user.id, { action: 'rep-profile-updated', rep_profile_id: id });
    const updated = await env.submoacontent_db.prepare('SELECT * FROM rep_profiles WHERE id = ?').bind(id).first();
    return json({ profile: updated });
  }

  if (request.method === 'DELETE') {
    await env.submoacontent_db.prepare('DELETE FROM legislative_briefs WHERE rep_profile_id = ?').bind(id).run();
    await env.submoacontent_db.prepare('DELETE FROM rep_profiles WHERE id = ?').bind(id).run();
    await writeAudit(env, request, user.id, { action: 'rep-profile-deleted', rep_profile_id: id });
    return json({ success: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
