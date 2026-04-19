// GET /api/legislative/bills/search
// Always calls Congress.gov live (congress defaults to 119, limit 20) and
// caches results into `legislation`. Falls back to local cache only when
// the API key is missing.
import { getSessionUser, json, generateId } from '../../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../../src/auth-utils';

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'view'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const chamber = url.searchParams.get('chamber') || '';
  const congress = url.searchParams.get('congress') || '119';
  const partyFilter = (url.searchParams.get('party') || '').trim();
  // Accept friendly aliases from the client and normalize to what
  // Congress.gov accepts. Unknown values fall through to the API as-is.
  const rawSort = url.searchParams.get('sort') || 'updateDate+desc';
  const sort =
    rawSort === 'latest_action' ? 'latestAction+desc'
    : rawSort === 'latestAction' ? 'latestAction+desc'
    : rawSort;
  const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '20', 10));
  const apiKey = env.CONGRESS_API_KEY;

  if (!apiKey) {
    console.log('[bills/search] CONGRESS_API_KEY not set — serving cache fallback');
    const { results } = await env.submoacontent_db
      .prepare(
        `SELECT bill_id, congress, bill_type, bill_number, title, sponsor_name, sponsor_party, sponsor_state, status, introduced_date, last_action_date
         FROM legislation
         WHERE (? = '' OR LOWER(title) LIKE '%' || LOWER(?) || '%')
         ORDER BY updated_at DESC LIMIT ?`
      )
      .bind(q, q, limit).all();
    return json({ bills: results || [], source: 'cache' });
  }

  try {
    const cgUrl = new URL(`https://api.congress.gov/v3/bill/${encodeURIComponent(congress)}`);
    cgUrl.searchParams.set('api_key', apiKey);
    cgUrl.searchParams.set('format', 'json');
    cgUrl.searchParams.set('limit', String(limit));
    cgUrl.searchParams.set('sort', sort);
    if (q) cgUrl.searchParams.set('q', q);

    const res = await fetch(cgUrl.toString());
    const rawBody = await res.text();
    console.log(`[bills/search] status=${res.status} body_prefix="${rawBody.slice(0, 500)}"`);
    if (!res.ok) {
      return json({ error: `Congress.gov HTTP ${res.status}`, detail: rawBody.slice(0, 300) }, 502);
    }
    let data: any = null;
    try { data = JSON.parse(rawBody); } catch (e) { return json({ error: 'Congress.gov JSON parse failed' }, 502); }

    const rawBills = Array.isArray(data?.bills) ? data.bills : [];
    const bills = rawBills.map((b: any) => ({
      bill_id: `${b.congress}-${String(b.type || '').toLowerCase()}-${b.number}`,
      congress: b.congress,
      bill_type: b.type,
      bill_number: String(b.number),
      title: b.title || '(untitled)',
      sponsor_name: b.sponsors?.[0]?.fullName || null,
      sponsor_party: b.sponsors?.[0]?.party || null,
      sponsor_state: b.sponsors?.[0]?.state || null,
      sponsor_bioguide_id: b.sponsors?.[0]?.bioguideId || null,
      status: b.latestAction?.text || null,
      introduced_date: b.introducedDate || null,
      last_action_date: b.latestAction?.actionDate || null,
    }));

    for (const b of bills) {
      try {
        await env.submoacontent_db
          .prepare(
            `INSERT INTO legislation
              (id, bill_id, congress, bill_type, bill_number, title, sponsor_name, sponsor_party, sponsor_state, sponsor_bioguide_id, status, introduced_date, last_action_date, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
             ON CONFLICT(bill_id) DO UPDATE SET
               title = excluded.title,
               status = excluded.status,
               last_action_date = excluded.last_action_date,
               sponsor_name = excluded.sponsor_name,
               sponsor_party = excluded.sponsor_party,
               updated_at = unixepoch()`
          )
          .bind(
            generateId(), b.bill_id, b.congress, b.bill_type, b.bill_number, b.title,
            b.sponsor_name, b.sponsor_party, b.sponsor_state, b.sponsor_bioguide_id,
            b.status, b.introduced_date, b.last_action_date,
          )
          .run();
      } catch (e) {
        console.error('[bills/search] cache upsert failed:', e);
      }
    }

    // Chamber filter is reliable — `bill_type` comes from the URL path of the
    // source item and is always present. Party filter is best-effort: the
    // /bill list endpoint on Congress.gov frequently omits `sponsors`, which
    // would leave sponsor_party null on every row. When that happens,
    // zero-out-then-return-empty would hide the whole mode. Instead we drop
    // the party filter and flag the response so the UI can show a notice.
    let filtered = bills;
    if (chamber) {
      const houseTypes = ['hr', 'hjres'];
      const senateTypes = ['s', 'sjres'];
      const allowed = chamber.toLowerCase() === 'house' ? houseTypes : senateTypes;
      filtered = filtered.filter((b: any) => allowed.includes(String(b.bill_type || '').toLowerCase()));
    }

    let partyFilterSkipped = false;
    if (partyFilter) {
      const prefix = partyFilter.slice(0, 1).toUpperCase();
      const withParty = filtered.filter((b: any) => !!b.sponsor_party);
      if (withParty.length === 0) {
        // Source payload has no sponsor data — skip the filter and flag it.
        partyFilterSkipped = true;
      } else {
        const maybeFiltered = filtered.filter((b: any) => String(b.sponsor_party || '').startsWith(prefix));
        if (maybeFiltered.length === 0) {
          // Sponsor data is present but nothing matched — honour the filter
          // (caller gets an empty list with no skipped flag).
          filtered = maybeFiltered;
        } else {
          filtered = maybeFiltered;
        }
      }
    }

    await writeAudit(env, request, user.id, {
      action: 'bill-searched',
      details: { q, limit, source: 'congress', returned: filtered.length, party: partyFilter || null, party_filter_skipped: partyFilterSkipped },
    });
    return json({
      bills: filtered,
      source: 'congress',
      total_fetched: bills.length,
      party_filter_skipped: partyFilterSkipped,
    });
  } catch (e: any) {
    console.error('[bills/search] threw:', e);
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
