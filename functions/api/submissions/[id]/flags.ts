// GET / POST / DELETE /api/submissions/:id/flags
// Article flags for the reader's flag-for-revision workflow.

import { json, getSessionUser, isAdmin, generateId } from '../../_utils';

async function getSubmission(env: any, id: string) {
  return env.submoacontent_db.prepare('SELECT id, user_id FROM submissions WHERE id = ?').bind(id).first();
}

function parseSubmissionId(pathname: string): string | null {
  // /api/submissions/:id/flags
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('submissions');
  return idx >= 0 ? parts[idx + 1] ?? null : null;
}

export async function onRequest(context: any) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const submissionId = parseSubmissionId(url.pathname);
  if (!submissionId) return json({ error: 'Missing submission id' }, 400);

  const sub = await getSubmission(env, submissionId);
  if (!sub) return json({ error: 'Submission not found' }, 404);
  if (sub.user_id !== user.id && !isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  if (request.method === 'GET') {
    const { results } = await env.submoacontent_db.prepare(
      `SELECT id, submission_id, selected_text, comment, flag_type,
              char_offset_start, char_offset_end, status,
              fact_check_result, fact_check_verdict, created_at
       FROM article_flags WHERE submission_id = ? ORDER BY char_offset_start ASC`
    ).bind(submissionId).all();
    return json({ flags: results ?? [] });
  }

  if (request.method === 'POST') {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const {
      selected_text,
      comment = '',
      flag_type,
      char_offset_start,
      char_offset_end,
    } = body;

    if (!selected_text || typeof selected_text !== 'string') return json({ error: 'selected_text required' }, 400);
    if (!flag_type || !['revision', 'fact-check', 'not-sure', 'fabricated'].includes(flag_type)) {
      return json({ error: 'Invalid flag_type' }, 400);
    }
    const start = Number.isFinite(char_offset_start) ? char_offset_start : 0;
    const end = Number.isFinite(char_offset_end) ? char_offset_end : start + selected_text.length;

    const id = generateId();
    await env.submoacontent_db.prepare(
      `INSERT INTO article_flags
         (id, submission_id, selected_text, comment, flag_type,
          char_offset_start, char_offset_end, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`
    ).bind(id, submissionId, selected_text, comment || '', flag_type, start, end, Math.floor(Date.now() / 1000)).run();

    const flag = await env.submoacontent_db.prepare(
      'SELECT * FROM article_flags WHERE id = ?'
    ).bind(id).first();

    return json({ flag });
  }

  if (request.method === 'DELETE') {
    const flagId = url.searchParams.get('flag_id');
    if (!flagId) return json({ error: 'flag_id required' }, 400);
    await env.submoacontent_db.prepare(
      'DELETE FROM article_flags WHERE id = ? AND submission_id = ?'
    ).bind(flagId, submissionId).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
