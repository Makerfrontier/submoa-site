// GET /api/legislative/bills/:id/text — fetches full bill text, caches in R2
// at legislation/{bill_id}/full-text.txt and the legislation.full_text column.
import { getSessionUser, json } from '../../../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../../../src/auth-utils';

export async function onRequest(context: { request: Request; env: any; params: { id?: string } }) {
  const { request, env, params } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'view'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  const billId = String(params.id || '');
  const row: any = await env.submoacontent_db
    .prepare('SELECT * FROM legislation WHERE bill_id = ? OR id = ? LIMIT 1')
    .bind(billId, billId).first();
  if (!row) return json({ error: 'Bill not found' }, 404);

  if (row.full_text && row.full_text.length > 0) {
    return json({ bill_id: row.bill_id, full_text: row.full_text, source: 'cache' });
  }

  // Try R2
  if (row.full_text_r2_key) {
    try {
      const obj = await env.SUBMOA_IMAGES.get(row.full_text_r2_key);
      if (obj) {
        const text = await obj.text();
        if (text) return json({ bill_id: row.bill_id, full_text: text, source: 'r2' });
      }
    } catch {}
  }

  // Fetch from Congress.gov
  const apiKey = env.CONGRESS_API_KEY;
  if (!apiKey) return json({ error: 'CONGRESS_API_KEY not configured' }, 500);

  try {
    const idxUrl = `https://api.congress.gov/v3/bill/${row.congress}/${String(row.bill_type).toLowerCase()}/${row.bill_number}/text?api_key=${apiKey}&format=json`;
    const idxRes = await fetch(idxUrl);
    if (!idxRes.ok) return json({ error: `Congress.gov text index HTTP ${idxRes.status}` }, 502);
    const idx: any = await idxRes.json();
    const versions = idx.textVersions || [];
    const latest = versions[0];
    const formats = latest?.formats || [];
    const txtFormat = formats.find((f: any) => /Formatted Text|XML/.test(f.type)) || formats[0];
    if (!txtFormat?.url) return json({ error: 'No text URL available' }, 404);

    const txtRes = await fetch(txtFormat.url);
    if (!txtRes.ok) return json({ error: `Text fetch HTTP ${txtRes.status}` }, 502);
    let rawText = await txtRes.text();
    // Strip HTML tags if we got HTML instead of plaintext.
    rawText = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const r2Key = `legislation/${row.bill_id}/full-text.txt`;
    try { await env.SUBMOA_IMAGES.put(r2Key, rawText, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } }); } catch {}
    await env.submoacontent_db
      .prepare('UPDATE legislation SET full_text = ?, full_text_r2_key = ?, updated_at = unixepoch() WHERE id = ?')
      .bind(rawText, r2Key, row.id).run();

    await writeAudit(env, request, user.id, { action: 'bill-text-fetched', legislation_id: row.id, details: { bill_id: row.bill_id } });
    return json({ bill_id: row.bill_id, full_text: rawText, source: 'congress' });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
