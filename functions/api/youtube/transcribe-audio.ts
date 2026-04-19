// POST /api/youtube/transcribe-audio  (multipart)
// Accepts MP3/MP4 audio → OpenAI Whisper → returns { transcript }.
import { json, getSessionUser } from '../_utils';

const MAX = 25 * 1024 * 1024; // Whisper's own 25MB limit.

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY not configured' }, 500);

  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: 'Multipart form data required' }, 400); }
  const file = form.get('file') || form.get('audio');
  if (!(file instanceof File)) return json({ error: 'file required' }, 400);
  if (file.size > MAX) return json({ error: 'File exceeds 25MB (Whisper limit)' }, 400);

  const out = new FormData();
  out.append('file', file, file.name || 'audio.mp3');
  out.append('model', 'whisper-1');
  out.append('response_format', 'json');

  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: out,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      return json({ error: `Whisper HTTP ${res.status}`, detail: err.slice(0, 300) }, 502);
    }
    const data: any = await res.json();
    const transcript = String(data?.text || '').trim();
    if (!transcript) return json({ error: 'Whisper returned empty transcript' }, 502);
    return json({ transcript });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
