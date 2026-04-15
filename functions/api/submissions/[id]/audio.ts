// functions/api/submissions/[id]/audio.ts
// GET /api/submissions/:id/audio
// Streams audio.mp3 from R2. User must own submission.

function getCookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function onRequestGet({ request, env, params }) {
  const session = getCookieValue(request, 'submoa_session');
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = await env.submoacontent_db.prepare(
    `SELECT id, account_id FROM users
     WHERE id = (SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?)
     LIMIT 1`
  ).bind(session, Date.now()).first<{ id: string; account_id: string }>();

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = params;

  // Confirm ownership
  const sub = await env.submoacontent_db.prepare(
    `SELECT id, account_id FROM submissions WHERE id = ? AND account_id = ? LIMIT 1`
  ).bind(id, user.account_id).first<{ id: string; account_id: string }>();

  if (!sub) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Canonical path; legacy `packages/{id}/audio.mp3` kept as fallback for unmigrated rows.
  let obj = await env.SUBMOA_IMAGES.get(`projects/${id}/audio/audio.mp3`);
  if (!obj) {
    obj = await env.SUBMOA_IMAGES.get(`packages/${id}/audio.mp3`);
  }
  if (!obj) {
    return new Response(JSON.stringify({ error: 'Audio not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, max-age=3600',
      'Content-Length': String(obj.size),
    },
  });
}
