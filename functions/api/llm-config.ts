import { json, getSessionUser } from './_utils';

// GET /api/llm-config — public (authenticated) endpoint returning all three slots
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

  try {
    const result = await context.env.submoacontent_db
      .prepare(`SELECT slot, model_string, display_name, descriptor, warning_badge, is_active, updated_at
                FROM llm_config ORDER BY slot ASC`)
      .all();
    return json({ slots: result.results || [] });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
