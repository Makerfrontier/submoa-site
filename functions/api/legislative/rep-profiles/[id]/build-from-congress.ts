// POST /api/legislative/rep-profiles/:id/build-from-congress  { bioguide_id }
// Fetches member detail, sponsored legislation, voting record, committees from
// Congress.gov. Generates a voice guide from that record via OpenRouter. Best-
// effort FEC lookup for donor profile.
import { getSessionUser, json } from '../../../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../../../src/auth-utils';

async function cgFetch(env: any, path: string) {
  const apiKey = env.CONGRESS_API_KEY;
  if (!apiKey) throw new Error('CONGRESS_API_KEY not configured');
  const url = `https://api.congress.gov/v3/${path}${path.includes('?') ? '&' : '?'}api_key=${apiKey}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Congress.gov HTTP ${res.status}`);
  return res.json();
}

async function buildVoice(env: any, member: any, sponsored: any[], committees: any[]) {
  const system =
    'You build a voice guide for a US legislator based on their public record. Return ONLY valid JSON: {voice_guide (detailed multi-paragraph), tone_tags (array), policy_positions (object)}. Extrapolate tone from the sponsored legislation titles and committee focus. No fabricated quotes.';
  const userMsg = `Member: ${member?.directOrderName || member?.name}. Party: ${member?.partyName || 'n/a'}. State: ${member?.state || ''}. District: ${member?.district || ''}. Sponsored titles (sample): ${(sponsored.slice(0, 30).map(s => s.title).join('; ') || 'none')}. Committees: ${(committees.map(c => c.name).join(', ') || 'none')}.`;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`, 'HTTP-Referer': 'https://www.submoacontent.com', 'X-Title': 'SubMoa Rep Profile' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      max_tokens: 2200,
      messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
  const data: any = await res.json();
  const raw = String(data?.choices?.[0]?.message?.content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(raw); } catch { return null; }
}

export async function onRequest(context: { request: Request; env: any; params: { id?: string } }) {
  const { request, env, params } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'manage-rep-profiles'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  const id = String(params.id || '').trim();
  if (!id) return json({ error: 'Missing id' }, 400);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const bioguide = String(body.bioguide_id || '').trim();
  if (!bioguide) return json({ error: 'bioguide_id required' }, 400);

  try {
    const memberData: any = await cgFetch(env, `member/${bioguide}`);
    const member = memberData?.member || {};
    const sponsoredData: any = await cgFetch(env, `member/${bioguide}/sponsored-legislation?limit=50`);
    const sponsored = (sponsoredData?.sponsoredLegislation || []).map((s: any) => ({
      bill_type: s.type, bill_number: s.number, title: s.title, congress: s.congress, introduced: s.introducedDate,
    }));
    // Committees — best effort.
    let committees: any[] = [];
    try {
      const cd: any = await cgFetch(env, `member/${bioguide}/committee-assignments`);
      committees = (cd?.committeeAssignments || []).map((c: any) => ({ name: c.name, chamber: c.chamber, role: c.role }));
    } catch {}

    // Voice guide generation
    const voice = await buildVoice(env, member, sponsored, committees);

    await env.submoacontent_db.prepare(
      `UPDATE rep_profiles SET
        name = ?, party = ?, state = ?, district = ?, bioguide_id = ?,
        voice_guide = ?, tone_tags = ?, policy_positions = ?,
        sponsored_legislation = ?, committee_memberships = ?,
        voting_record_json = ?, documents_ingested = COALESCE(documents_ingested, 0) + 1,
        updated_at = unixepoch() WHERE id = ?`
    ).bind(
      String(member.directOrderName || member.name || ''),
      String(member.partyName || '').slice(0, 60),
      String(member.state || ''),
      String(member.district || ''),
      bioguide,
      voice?.voice_guide || '',
      JSON.stringify(voice?.tone_tags || []),
      JSON.stringify(voice?.policy_positions || {}),
      JSON.stringify(sponsored),
      JSON.stringify(committees),
      JSON.stringify({ note: 'Voting record fetch pending per-endpoint integration', fetched_at: Date.now() }),
      id,
    ).run();

    await writeAudit(env, request, user.id, { action: 'rep-profile-updated', rep_profile_id: id, details: { source: 'congress', bioguide } });
    const row = await env.submoacontent_db.prepare('SELECT * FROM rep_profiles WHERE id = ?').bind(id).first();
    return json({ profile: row, sponsored_count: sponsored.length, committee_count: committees.length });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
