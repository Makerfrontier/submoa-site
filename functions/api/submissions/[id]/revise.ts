// functions/api/submissions/[id]/revise.ts
// POST /api/submissions/:id/revise — reset and requeue for regeneration

import { notifyBriefSubmitted } from '../../discord-notifications';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getCookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function onRequestPost({ request, env, params }) {
  const session = getCookieValue(request, 'submoa_session');
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const user = await env.submoacontent_db.prepare(
    `SELECT u.id, u.role FROM users u
     JOIN sessions s ON s.user_id = u.id
     WHERE s.id = ? AND s.expires_at > ?
     LIMIT 1`
  ).bind(session, Date.now()).first<{ id: string; role: string }>();

  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { id } = params;

  try {
    const sub = await env.submoacontent_db.prepare(
      `SELECT s.*, ap.name as author_display_name
       FROM submissions s
       LEFT JOIN author_profiles ap ON s.author = ap.slug
       WHERE s.id = ?`
    ).bind(id).first<any>();

    if (!sub) return json({ error: 'Not found' }, 404);
    if (sub.user_id !== user.id && user.role !== 'admin' && user.role !== 'super_admin') {
      return json({ error: 'Forbidden' }, 403);
    }

    // Parse optional override fields from request body
    let body: Record<string, any> = {};
    try {
      const text = await request.text();
      if (text) body = JSON.parse(text);
    } catch {
      // No body or invalid JSON — use current values
    }

    const {
      optimization_target,
      tone_stance,
      vocal_tone,
      min_word_count,
      target_keywords,
      revision_notes,
    } = body;

    // Build COALESCE updates — only overwrite fields that were explicitly provided
    const updates: string[] = [
      'status = \'queued\'',
      'grade_status = \'ungraded\'',
      'article_content = NULL',
      'word_count = NULL',
      'package_status = NULL',
      'zip_url = \'\'',
      'live_url = NULL',
      `updated_at = ${Date.now()}`,
    ];

    const binds: (string | number | null)[] = [];

    if (optimization_target !== undefined) { updates.push('optimization_target = ?'); binds.push(optimization_target); }
    if (tone_stance !== undefined)         { updates.push('tone_stance = ?');          binds.push(tone_stance); }
    if (vocal_tone !== undefined)          { updates.push('vocal_tone = ?');           binds.push(vocal_tone); }
    if (min_word_count !== undefined)      { updates.push('min_word_count = ?');       binds.push(Number(min_word_count)); }
    if (target_keywords !== undefined)     { updates.push('target_keywords = ?');      binds.push(typeof target_keywords === 'string' ? target_keywords : JSON.stringify(target_keywords)); }
    if (revision_notes !== undefined)      { updates.push('revision_notes = ?');       binds.push(revision_notes || null); }

    binds.push(id);

    await env.submoacontent_db.prepare(
      `UPDATE submissions SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...binds).run();

    // Delete grade records
    await env.submoacontent_db.prepare(
      `DELETE FROM grades WHERE submission_id = ?`
    ).bind(id).run();

    // Enqueue regeneration
    const { enqueueGenerationJob } = await import('../../queue-producer');
    await (enqueueGenerationJob as any)(env, id);

    // Discord notification — fire and forget
    notifyBriefSubmitted(env, {
      id: sub.id,
      title: sub.topic,
      author_display_name: sub.author_display_name || sub.author,
      article_format: sub.article_format,
      optimization_target: optimization_target || sub.optimization_target,
    }).catch(err => console.error('Discord notification failed on revise:', err));

    return json({ ok: true });

  } catch (e: any) {
    return json({ error: e.message || 'Server error' }, 500);
  }
}
