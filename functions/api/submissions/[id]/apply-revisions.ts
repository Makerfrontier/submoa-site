// POST /api/submissions/:id/apply-revisions
// Applies user-chosen resolutions to the article body and records analytics.

import { json, getSessionUser, isAdmin, generateId } from '../../_utils';

function parseSubmissionId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('submissions');
  return idx >= 0 ? parts[idx + 1] ?? null : null;
}

function escapeHtml(str: string): string {
  return (str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function onRequest(context: any) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const submissionId = parseSubmissionId(url.pathname);
  if (!submissionId) return json({ error: 'Missing submission id' }, 400);

  const sub: any = await env.submoacontent_db.prepare(
    'SELECT id, user_id, topic, article_content, content_rating, article_format, author FROM submissions WHERE id = ?'
  ).bind(submissionId).first();
  if (!sub) return json({ error: 'Submission not found' }, 404);
  if (sub.user_id !== user.id && !isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const selections: Array<{ flag_id: string; chosen_option: 'remove' | 'option_a' | 'option_b' }> = body.selections || [];
  if (!Array.isArray(selections) || selections.length === 0) return json({ error: 'selections array required' }, 400);

  let articleContent: string = sub.article_content || '';

  // Fetch each review row and apply in reverse order of offsets to avoid position drift.
  const reviewRows: any[] = [];
  for (const sel of selections) {
    const row: any = await env.submoacontent_db.prepare(
      `SELECT rr.*, af.char_offset_start, af.char_offset_end, af.flag_type, af.fact_check_verdict
       FROM revision_reviews rr
       LEFT JOIN article_flags af ON af.id = rr.flag_id
       WHERE rr.submission_id = ? AND rr.flag_id = ?`
    ).bind(submissionId, sel.flag_id).first();
    if (row) reviewRows.push({ ...row, chosen_option: sel.chosen_option });
  }

  // Apply longest original_text first to avoid partial collision; fall back to offset-ordered.
  reviewRows.sort((a, b) => Number(b.char_offset_start || 0) - Number(a.char_offset_start || 0));

  for (const row of reviewRows) {
    const original = row.original_text as string;
    const chosen: string = row.chosen_option === 'remove'
      ? ''
      : row.chosen_option === 'option_b'
        ? String(row.option_b || '')
        : String(row.option_a || '');

    if (original && articleContent.includes(original)) {
      articleContent = articleContent.replace(original, chosen);
    } else {
      // Best-effort: try HTML-escaped form
      const escaped = escapeHtml(original);
      if (escaped && articleContent.includes(escaped)) {
        articleContent = articleContent.replace(escaped, escapeHtml(chosen));
      } else {
        console.warn(`[apply-revisions] Could not locate original_text for flag ${row.flag_id}`);
      }
    }

    await env.submoacontent_db.prepare(
      'UPDATE revision_reviews SET chosen_option = ? WHERE id = ?'
    ).bind(row.chosen_option, row.id).run();

    await env.submoacontent_db.prepare(
      "UPDATE article_flags SET status = 'resolved' WHERE id = ?"
    ).bind(row.flag_id).run();

    // Write analytics row
    await env.submoacontent_db.prepare(
      `INSERT INTO flag_analytics
         (id, submission_id, flag_type, original_text, chosen_resolution,
          llm_slot, author_profile, article_format, fact_check_verdict, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      generateId(),
      submissionId,
      row.flag_type,
      original,
      row.chosen_option,
      Number(sub.content_rating) || 1,
      sub.author,
      sub.article_format,
      row.fact_check_verdict ?? null,
      Math.floor(Date.now() / 1000)
    ).run();
  }

  // Write updated article to DB + R2
  await env.submoacontent_db.prepare(
    "UPDATE submissions SET article_content = ?, status = 'revision_applied', updated_at = ? WHERE id = ?"
  ).bind(articleContent, Date.now(), submissionId).run();

  try {
    const htmlWrapped = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${escapeHtml(sub.topic || 'Article')}</title></head><body>${articleContent}</body></html>`;
    await env.SUBMOA_IMAGES.put(`projects/${submissionId}/article/article.html`, htmlWrapped, {
      httpMetadata: { contentType: 'text/html' },
    });
  } catch (e: any) {
    console.error('[apply-revisions] R2 write failed:', e?.message ?? e);
  }

  return json({ ok: true, applied: reviewRows.length });
}
