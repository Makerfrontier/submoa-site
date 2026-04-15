import { json, getSessionUser, isAdmin } from '../_utils';

// 5-minute TTL cache — module-level, shared across requests on the same isolate
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { at: number; models: Array<{ id: string; name: string; description: string }> } | null = null;

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (context.request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (!isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return json({ models: cached.models, cached: true });
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${context.env.OPENROUTER_API_KEY}`,
      },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return json({ error: `OpenRouter error ${res.status}: ${txt.slice(0, 200)}` }, 502);
    }
    const data = await res.json() as { data?: Array<{ id: string; name?: string; description?: string }> };
    const models = (data.data || [])
      .map(m => ({
        id: m.id,
        name: m.name || m.id,
        description: m.description || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    cached = { at: Date.now(), models };
    return json({ models, cached: false });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
