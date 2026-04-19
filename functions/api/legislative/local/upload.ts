// POST /api/legislative/local/upload  (multipart, PDF only)
// Extracts text from the PDF (best-effort, via a regex on PDF streams), stores
// both the PDF and extracted text in R2, and creates a legislation row with
// bill_type='local' so it surfaces in local morning briefs and the analyzer.
import { getSessionUser, json, generateId } from '../../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../../src/auth-utils';

const MAX_SIZE = 15 * 1024 * 1024;

// Workers can't run pdfjs, but most government PDFs ship with extractable
// text streams. Pull every `(...)Tj` and `[...]TJ` operator we can find.
// Good-enough pipeline; the caller can append text manually if extraction
// returns nothing usable.
async function extractPdfText(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  // Latin-1 decode so PDF byte escapes round-trip.
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  const out: string[] = [];
  const paren = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = paren.exec(text))) out.push(m[1]);
  const arr = /\[((?:\\.|[^\]])*)\]\s*TJ/g;
  while ((m = arr.exec(text))) {
    const inner = m[1].match(/\(((?:\\.|[^\\()])*)\)/g) || [];
    for (const s of inner) out.push(s.slice(1, -1));
  }
  // unescape \( \) \\ and octal escapes; collapse whitespace
  return out.join(' ')
    .replace(/\\\)/g, ')')
    .replace(/\\\(/g, '(')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{1,3})/g, (_, d) => String.fromCharCode(parseInt(d, 8)))
    .replace(/\s+/g, ' ')
    .trim();
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'view'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: 'Multipart form data required' }, 400); }
  const file = form.get('document');
  if (!(file instanceof File)) return json({ error: 'document file required' }, 400);
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    return json({ error: 'Only PDF files accepted' }, 400);
  }
  if (file.size > MAX_SIZE) return json({ error: 'File exceeds 15 MB limit' }, 400);

  const titleHint = String(form.get('title') || '').trim() || file.name.replace(/\.pdf$/i, '');
  const jurisdiction = String(form.get('jurisdiction') || '').trim().slice(0, 80);

  const uuid = generateId();
  const billId = `local-${uuid.slice(0, 8)}`;
  const buf = await file.arrayBuffer();

  // Store the raw PDF + extracted text in R2.
  try {
    await env.SUBMOA_IMAGES.put(`legislation/local/${uuid}/source.pdf`, buf, {
      httpMetadata: { contentType: 'application/pdf' },
    });
  } catch (e: any) {
    return json({ error: `R2 PDF write failed: ${e?.message || e}` }, 500);
  }

  const extractedText = await extractPdfText(buf).catch(() => '');
  const r2TextKey = `legislation/local/${uuid}/full-text.txt`;
  try {
    await env.SUBMOA_IMAGES.put(r2TextKey, extractedText || `(no text extractable from ${file.name})`, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    });
  } catch (e) { console.error('[local/upload] text write failed:', e); }

  const legId = generateId();
  try {
    await env.submoacontent_db.prepare(
      `INSERT INTO legislation (id, bill_id, congress, bill_type, bill_number, title,
        full_text, full_text_r2_key, sponsor_state, status, introduced_date, last_action, last_action_date,
        created_at, updated_at)
       VALUES (?, ?, 0, 'local', ?, ?, ?, ?, ?, 'uploaded', ?, 'Uploaded by user', ?, unixepoch(), unixepoch())`
    ).bind(
      legId, billId, uuid.slice(0, 10), titleHint,
      extractedText || null, r2TextKey, jurisdiction || null,
      new Date().toISOString().slice(0, 10),
      new Date().toISOString().slice(0, 10),
    ).run();
  } catch (e: any) {
    return json({ error: `DB insert failed: ${e?.message || e}` }, 500);
  }

  await writeAudit(env, request, user.id, { action: 'local-legislation-uploaded', legislation_id: legId, details: { bill_id: billId, extracted_chars: extractedText.length } });
  return json({ success: true, bill_id: billId, legislation_id: legId, extracted_chars: extractedText.length });
}
