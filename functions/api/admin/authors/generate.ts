// POST /api/admin/authors/generate
// Takes a freeform description, returns one or three LLM-generated author
// profiles ready for admin review.
import { getSessionUser, isAdmin, json } from '../../_utils';
import type { Env } from '../../_utils';

interface Profile {
  name: string;
  bio: string;
  voice_guide: string;
  tone_tags: string[];
  sample_phrases: string[];
}

function tryParseJson(raw: string): any | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch { return null; }
}

function coerceProfile(p: any): Profile | null {
  if (!p || typeof p !== 'object') return null;
  const name = String(p.name || '').trim().slice(0, 120);
  if (!name) return null;
  return {
    name,
    bio: String(p.bio || '').trim().slice(0, 1200),
    voice_guide: String(p.voice_guide || '').trim().slice(0, 4000),
    tone_tags: Array.isArray(p.tone_tags) ? p.tone_tags.map((t: any) => String(t).slice(0, 40)).slice(0, 8) : [],
    sample_phrases: Array.isArray(p.sample_phrases) ? p.sample_phrases.map((t: any) => String(t).slice(0, 240)).slice(0, 6) : [],
  };
}

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (!isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const description = String(body.description || '').trim().slice(0, 4000);
  const variations = !!body.variations;
  if (!description) return json({ error: 'description is required' }, 400);

  const baseSystem =
    "You are creating a professional author profile for a content management system. Generate a realistic, detailed author persona based on the description. Return ONLY valid JSON.";
  const singleSchema =
    '{"name": "Full Name", "bio": "2-3 sentence bio", "voice_guide": "detailed writing style guide including tone, sentence structure, vocabulary level, perspective, things this author says and avoids", "tone_tags": ["tag1", "tag2"], "sample_phrases": ["phrase1", "phrase2", "phrase3"]}';
  const variantSchema = `[${singleSchema}, ${singleSchema}, ${singleSchema}]`;

  const system = baseSystem + ' Schema: ' + (variations ? variantSchema : singleSchema);
  const userPrompt = variations
    ? `Create THREE distinct author profile variations for the description below. Each should be a plausible but meaningfully different persona. Description: ${description}`
    : `Create one author profile for the description below. Description: ${description}`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Author Generator',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 2400,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return json({ error: `OpenRouter HTTP ${res.status}`, detail: errBody.slice(0, 300) }, 502);
    }
    const data: any = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? '';
    const parsed = tryParseJson(raw);
    if (!parsed) return json({ error: 'Model returned unparseable output', raw: String(raw).slice(0, 800) }, 502);

    if (variations) {
      const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.profiles) ? parsed.profiles : null);
      if (!arr) return json({ error: 'Expected an array of profiles', raw: String(raw).slice(0, 800) }, 502);
      const profiles = arr.map(coerceProfile).filter(Boolean) as Profile[];
      if (profiles.length === 0) return json({ error: 'No valid profiles in output', raw: String(raw).slice(0, 800) }, 502);
      return json({ profiles });
    } else {
      const profile = coerceProfile(parsed);
      if (!profile) return json({ error: 'Profile missing required fields', raw: String(raw).slice(0, 800) }, 502);
      return json({ profile });
    }
  } catch (err: any) {
    return json({ error: err?.message || 'Server error' }, 500);
  }
}
