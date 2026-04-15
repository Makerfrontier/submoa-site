import type { Env } from './_utils';

export async function onRequest(context: { request: Request; env: Env }) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const { results } = await context.env.submoacontent_db.prepare(
    `SELECT id, label, layout_preference FROM infographic_styles WHERE active = 1 ORDER BY label ASC`
  ).all();

  return Response.json(results);
}
