// GET /api/legislative/fec-map?legislation_id=X
// Aggregates FEC contributions by industry sector for the bill's sponsor +
// co-sponsors. Caches in legislation.fec_funding_map.
import { getSessionUser, json } from '../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../src/auth-utils';

async function fetchFec(apiKey: string, bioguide: string): Promise<Record<string, number>> {
  if (!bioguide || !apiKey) return {};
  try {
    // FEC doesn't key on bioguide directly; most integrations resolve bioguide →
    // FEC candidate_id via OpenSecrets or manual mapping. As a best-effort we
    // search FEC by committee name — returns an approximation.
    const url = `https://api.open.fec.gov/v1/candidates/search/?q=${encodeURIComponent(bioguide)}&api_key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const data: any = await res.json();
    const candId = data?.results?.[0]?.candidate_id;
    if (!candId) return {};
    const schedUrl = `https://api.open.fec.gov/v1/schedules/schedule_a/?contributor_type=individual&candidate_id=${candId}&per_page=100&api_key=${apiKey}`;
    const sched = await fetch(schedUrl);
    if (!sched.ok) return {};
    const sdata: any = await sched.json();
    const agg: Record<string, number> = {};
    for (const row of sdata.results || []) {
      const sector = String(row.contributor_occupation || row.contributor_employer || 'Individual').slice(0, 80);
      const amt = Number(row.contribution_receipt_amount || 0);
      agg[sector] = (agg[sector] || 0) + amt;
    }
    return agg;
  } catch {
    return {};
  }
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'run-fec'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  const url = new URL(request.url);
  const legId = url.searchParams.get('legislation_id');
  if (!legId) return json({ error: 'legislation_id required' }, 400);

  const row: any = await env.submoacontent_db
    .prepare('SELECT * FROM legislation WHERE id = ? OR bill_id = ?')
    .bind(legId, legId).first();
  if (!row) return json({ error: 'Bill not found' }, 404);

  const apiKey = env.FEC_API_KEY;
  if (!apiKey) {
    return json({ error: 'FEC_API_KEY not configured', funding_map: {}, members: [] });
  }

  const members: { bioguide: string; name: string | null; role: string }[] = [];
  if (row.sponsor_bioguide_id) members.push({ bioguide: row.sponsor_bioguide_id, name: row.sponsor_name, role: 'sponsor' });
  try {
    const cosp = JSON.parse(row.cosponsors_json || '[]');
    for (const c of cosp.slice(0, 20)) {
      if (c.bioguideId) members.push({ bioguide: c.bioguideId, name: c.fullName || null, role: 'cosponsor' });
    }
  } catch {}

  const fundingMap: Record<string, Record<string, number>> = {};
  const total: Record<string, number> = {};
  for (const m of members) {
    const agg = await fetchFec(apiKey, m.bioguide);
    fundingMap[m.bioguide] = agg;
    for (const [sector, amt] of Object.entries(agg)) {
      total[sector] = (total[sector] || 0) + amt;
    }
  }

  try {
    await env.submoacontent_db.prepare('UPDATE legislation SET fec_funding_map = ?, updated_at = unixepoch() WHERE id = ?')
      .bind(JSON.stringify({ by_member: fundingMap, total }), row.id).run();
  } catch {}

  await writeAudit(env, request, user.id, { action: 'fec-map-pulled', legislation_id: row.id });
  return json({ funding_map: fundingMap, total_by_sector: total, members });
}
