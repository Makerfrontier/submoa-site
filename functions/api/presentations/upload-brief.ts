// POST /api/presentations/upload-brief  (multipart, PDF/DOCX)
// Stores the uploaded brand-brief in R2 and returns { r2_key, filename }.
// Called by the PowerPoint and Brief Builder forms before submission.
import { getSessionUser, generateId, json } from '../_utils';

const MAX = 25 * 1024 * 1024;
const ALLOWED = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';

  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: 'Multipart form data required' }, 400); }
  const file = form.get('file') || form.get('document') || form.get('brand_brief');
  if (!(file instanceof File)) return json({ error: 'file required' }, 400);

  // Accept by extension too (.pdf/.docx) since some browsers send generic
  // application/octet-stream for drag-dropped files.
  const name = (file.name || '').toLowerCase();
  const ext = name.endsWith('.pdf') ? 'pdf' : name.endsWith('.docx') ? 'docx' : '';
  if (!ext && !ALLOWED.has(file.type)) return json({ error: 'Only .pdf and .docx accepted' }, 400);
  if (file.size > MAX) return json({ error: 'File exceeds 25 MB' }, 400);

  const uuid = generateId();
  const finalExt = ext || (file.type === 'application/pdf' ? 'pdf' : 'docx');
  const r2Key = `presentations/${accountId}/brand-brief-${uuid}.${finalExt}`;
  try {
    const buf = await file.arrayBuffer();
    await env.SUBMOA_IMAGES.put(r2Key, buf, {
      httpMetadata: { contentType: file.type || (finalExt === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') },
      customMetadata: { uploaded_by: user.id, account_id: accountId, filename: file.name, size: String(file.size) },
    });
  } catch (e: any) {
    return json({ error: `R2 write failed: ${e?.message || e}` }, 500);
  }
  return json({ r2_key: r2Key, filename: file.name });
}
