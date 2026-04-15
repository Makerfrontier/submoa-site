// functions/api/articles/[id]/feedback.ts
// POST /api/articles/:id/feedback — submit admin feedback on an article
// Admin and super_admin only.

import { json, getSessionUser, isAdmin } from '../../_utils';

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user || !isAdmin(user)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(context.request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // /api/articles/:id/feedback → parts = ['api', 'articles', ':id', 'feedback']
  const articleId = parts[parts.length - 2];
  if (!articleId) return json({ error: 'Missing article ID' }, 400);

  let body: {
    star_rating?: number;
    notes?: string;
    answers?: { q1?: boolean | null; q2?: boolean | null; q3?: boolean | null; q4?: boolean | null; q5?: boolean | null };
  } = {};

  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { star_rating, notes, answers = {} } = body;

  if (star_rating == null || star_rating < 1 || star_rating > 10) {
    return json({ error: 'star_rating must be 1–10' }, 400);
  }

  const toInt = (v: boolean | null | undefined): number | null =>
    v === true ? 1 : v === false ? 0 : null;

  const q1 = toInt(answers.q1);
  const q2 = toInt(answers.q2);
  const q3 = toInt(answers.q3);
  const q4 = toInt(answers.q4);
  const q5 = toInt(answers.q5);

  const now = Date.now();
  const id = crypto.randomUUID();

  try {
    // Upsert: one feedback row per (submission_id, user_id).
    // INSERT OR REPLACE keeps the latest feedback per reviewer.
    await context.env.submoacontent_db.prepare(`
      INSERT INTO article_feedback
        (id, submission_id, user_id, star_rating, notes,
         q1_author_voice, q2_factual_accuracy, q3_optimization_met,
         q4_no_ai_patterns, q5_publish_ready, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(submission_id) DO UPDATE SET
        user_id           = excluded.user_id,
        star_rating       = excluded.star_rating,
        notes             = excluded.notes,
        q1_author_voice   = excluded.q1_author_voice,
        q2_factual_accuracy = excluded.q2_factual_accuracy,
        q3_optimization_met = excluded.q3_optimization_met,
        q4_no_ai_patterns = excluded.q4_no_ai_patterns,
        q5_publish_ready  = excluded.q5_publish_ready,
        updated_at        = excluded.updated_at
    `).bind(
      id, articleId, user.id,
      Math.round(star_rating), notes || null,
      q1, q2, q3, q4, q5,
      now, now
    ).run();
  } catch (e: any) {
    // ON CONFLICT requires a unique constraint. Fallback: plain insert.
    // This keeps the endpoint working even if the constraint doesn't exist yet.
    console.error('Feedback upsert failed, falling back to insert:', e.message);
    try {
      await context.env.submoacontent_db.prepare(`
        INSERT INTO article_feedback
          (id, submission_id, user_id, star_rating, notes,
           q1_author_voice, q2_factual_accuracy, q3_optimization_met,
           q4_no_ai_patterns, q5_publish_ready, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, articleId, user.id,
        Math.round(star_rating), notes || null,
        q1, q2, q3, q4, q5,
        now, now
      ).run();
    } catch (e2: any) {
      console.error('Feedback insert also failed:', e2.message);
      return json({ error: 'Failed to save feedback' }, 500);
    }
  }

  // Propagate the five sentiment answers + overall rating to any existing
  // flag_analytics rows so feedback is joinable to per-flag training data.
  try {
    await context.env.submoacontent_db.prepare(`
      UPDATE flag_analytics SET
        overall_rating = ?,
        sounds_like_author = ?,
        factually_accurate = ?,
        meets_optimization = ?,
        free_of_ai_patterns = ?,
        would_publish = ?,
        notes = COALESCE(?, notes)
      WHERE submission_id = ?
    `).bind(
      Math.round(star_rating), q1, q2, q3, q4, q5, notes || null, articleId
    ).run();
  } catch (e: any) {
    console.error('flag_analytics propagation skipped:', e.message);
  }

  return json({ ok: true });
}
