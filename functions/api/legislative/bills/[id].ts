// GET /api/legislative/bills/:id — fetches one bill. Returns cached row if
// present, otherwise hits Congress.gov and stores the enriched detail.
import { getSessionUser, json, generateId } from '../../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../../src/auth-utils';

export async function onRequest(context: { request: Request; env: any; params: { id?: string } }) {
  const { request, env, params } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'view'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  const billId = String(params.id || '');
  if (!billId) return json({ error: 'Missing id' }, 400);

  let row: any = await env.submoacontent_db
    .prepare('SELECT * FROM legislation WHERE bill_id = ? OR id = ? LIMIT 1')
    .bind(billId, billId).first();

  const apiKey = env.CONGRESS_API_KEY;
  if (!row && apiKey) {
    // Expect format: {congress}-{type}-{number}
    const m = billId.match(/^(\d+)-([a-z]+)-(\d+)$/i);
    if (m) {
      const [, congress, bill_type, bill_number] = m;
      try {
        const url = `https://api.congress.gov/v3/bill/${congress}/${bill_type.toLowerCase()}/${bill_number}?api_key=${apiKey}&format=json`;
        const res = await fetch(url);
        if (res.ok) {
          const data: any = await res.json();
          const b = data.bill || {};
          const id = generateId();
          await env.submoacontent_db.prepare(
            `INSERT INTO legislation (id, bill_id, congress, bill_type, bill_number, title, summary,
              sponsor_bioguide_id, sponsor_name, sponsor_party, sponsor_state, status, introduced_date, last_action, last_action_date,
              subjects, committees, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
             ON CONFLICT(bill_id) DO NOTHING`
          ).bind(
            id, billId, Number(congress), bill_type.toUpperCase(), bill_number,
            b.title || '(untitled)', b.summaries?.[0]?.text || null,
            b.sponsors?.[0]?.bioguideId || null, b.sponsors?.[0]?.fullName || null,
            b.sponsors?.[0]?.party || null, b.sponsors?.[0]?.state || null,
            b.latestAction?.text || null, b.introducedDate || null,
            b.latestAction?.text || null, b.latestAction?.actionDate || null,
            JSON.stringify(b.subjects?.legislativeSubjects?.map((s: any) => s.name) || []),
            JSON.stringify(b.committees?.items?.map((c: any) => c.name) || []),
          ).run();
          row = await env.submoacontent_db.prepare('SELECT * FROM legislation WHERE bill_id = ?').bind(billId).first();
        }
      } catch (e) {
        console.error('[bills/:id] congress fetch failed:', e);
      }
    }
  }

  if (!row) return json({ error: 'Bill not found' }, 404);

  await writeAudit(env, request, user.id, { action: 'bill-viewed', legislation_id: row.id, details: { bill_id: row.bill_id } });

  // Parse JSON fields
  const safeParse = (v: any, d: any) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
  return json({
    ...row,
    subjects: safeParse(row.subjects, []),
    committees: safeParse(row.committees, []),
    cosponsors_json: safeParse(row.cosponsors_json, []),
    votes_json: safeParse(row.votes_json, []),
    amendments_json: safeParse(row.amendments_json, []),
    related_bills: safeParse(row.related_bills, []),
    fec_funding_map: safeParse(row.fec_funding_map, {}),
  });
}
