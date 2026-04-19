// POST /api/brief-builder/generate  { id? OR brief_type + title + field_data + author_id? }
// Drafts if no id, runs OpenRouter, sanitizes, persists generated_content.
import { json, getSessionUser, generateId } from '../_utils';
import { sanitizeContent, EM_DASH_GUARD } from '../../../src/content-utils';

const TYPE_LABEL: Record<string, string> = {
  creative: 'Creative Brief',
  strategy: 'Strategy Brief',
  content: 'Content Brief',
  project: 'Project Brief',
  brand: 'Brand Brief',
  rfp: 'RFP Response Brief',
};

function sys(briefType: string, voiceGuide: string) {
  return `You are a senior strategist and communications expert. Write a complete, professional ${TYPE_LABEL[briefType] || 'brief'} based on the provided information. The brief must be clear, specific, and immediately actionable — something a professional could hand to a team or agency and they would know exactly what to do. Use the author voice guide if provided. Format with clear section headers. Every section must contain substantive content — no placeholders, no "TBD", no vague language. ${EM_DASH_GUARD}${voiceGuide ? `\n\nAUTHOR VOICE GUIDE:\n${voiceGuide}` : ''}`;
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  let id = String(body.id || '').trim();
  let row: any;
  if (!id) {
    const briefType = String(body.brief_type || '').toLowerCase();
    if (!TYPE_LABEL[briefType]) return json({ error: 'Invalid brief_type' }, 400);
    id = generateId();
    await env.submoacontent_db.prepare(
      `INSERT INTO briefs (id, account_id, brief_type, title, field_data, status, author_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'generating', ?, unixepoch(), unixepoch())`
    ).bind(id, accountId, briefType, String(body.title || '').slice(0, 200), JSON.stringify(body.field_data || {}), body.author_id || null).run();
  } else {
    await env.submoacontent_db.prepare(`UPDATE briefs SET status = 'generating', updated_at = unixepoch() WHERE id = ? AND account_id = ?`).bind(id, accountId).run();
  }
  row = await env.submoacontent_db.prepare('SELECT * FROM briefs WHERE id = ? AND account_id = ?').bind(id, accountId).first();
  if (!row) return json({ error: 'Brief not found' }, 404);

  let voiceGuide = '';
  if (row.author_id) {
    try {
      const a: any = await env.submoacontent_db.prepare('SELECT style_guide FROM author_profiles WHERE slug = ?').bind(row.author_id).first();
      if (a?.style_guide) voiceGuide = a.style_guide;
    } catch {}
  }

  let fd: any = {};
  try { fd = row.field_data ? JSON.parse(row.field_data) : {}; } catch {}
  const userPrompt = Object.entries(fd)
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .map(([k, v]) => `${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: ${v}`)
    .join('\n\n');

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Brief Builder',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 2800,
        messages: [
          { role: 'system', content: sys(row.brief_type, voiceGuide) },
          { role: 'user', content: userPrompt || '(no fields provided)' },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      await env.submoacontent_db.prepare(`UPDATE briefs SET status='failed', updated_at=unixepoch() WHERE id=?`).bind(id).run();
      return json({ error: `OpenRouter HTTP ${res.status}`, detail: err.slice(0, 300) }, 502);
    }
    const data: any = await res.json();
    const raw = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!raw) {
      await env.submoacontent_db.prepare(`UPDATE briefs SET status='failed', updated_at=unixepoch() WHERE id=?`).bind(id).run();
      return json({ error: 'Empty model output' }, 502);
    }
    const sanitized = sanitizeContent(raw);
    await env.submoacontent_db.prepare(
      `UPDATE briefs SET generated_content = ?, status = 'ready', updated_at = unixepoch() WHERE id = ?`
    ).bind(sanitized, id).run();
    const updated = await env.submoacontent_db.prepare('SELECT * FROM briefs WHERE id = ?').bind(id).first();
    return json({ brief: updated });
  } catch (e: any) {
    await env.submoacontent_db.prepare(`UPDATE briefs SET status='failed', updated_at=unixepoch() WHERE id=?`).bind(id).run();
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
