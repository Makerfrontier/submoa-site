import { json, getSessionUser } from '../../_utils';

// GET /api/dashboard/sync
// Returns everything the dashboard needs in one request
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

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  let submissions = { recent: [], in_progress: [], failed: [] };
  let notifications = { items: [], unread_count: 0 };
  let queue = { pending: 0, generating: 0, failed: 0 };

  // Recent submissions
  try {
    const result = await context.env.submoacontent_db
      .prepare('SELECT id, topic, status, created_at, author FROM submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10')
      .bind(user.id)
      .all();
    submissions.recent = result.results || [];
  } catch (e) {
    console.error('Recent submissions query failed:', e.message);
  }

  // In-progress submissions
  try {
    const result = await context.env.submoacontent_db
      .prepare("SELECT id, topic, status, created_at, author FROM submissions WHERE user_id = ? AND status = 'generating' ORDER BY created_at DESC")
      .bind(user.id)
      .all();
    submissions.in_progress = result.results || [];
  } catch (e) {
    console.error('In-progress submissions query failed:', e.message);
  }

  // Failed submissions
  try {
    const result = await context.env.submoacontent_db
      .prepare("SELECT id, topic, status, created_at, author FROM submissions WHERE user_id = ? AND status = 'generation_failed' ORDER BY created_at DESC")
      .bind(user.id)
      .all();
    submissions.failed = result.results || [];
  } catch (e) {
    console.error('Failed submissions query failed:', e.message);
  }

  // Notifications
  try {
    const result = await context.env.submoacontent_db
      .prepare('SELECT id, message, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10')
      .bind(user.id)
      .all();
    notifications.items = result.results || [];
  } catch (e) {
    console.error('Notifications query failed:', e.message);
  }

  // Unread count
  try {
    const row = await context.env.submoacontent_db
      .prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0')
      .bind(user.id)
      .first();
    notifications.unread_count = row?.count ?? 0;
  } catch (e) {
    console.error('Unread count query failed:', e.message);
  }

  // Queue counts
  try {
    const pending = await context.env.submoacontent_db
      .prepare("SELECT COUNT(*) as count FROM submissions WHERE user_id = ? AND status = 'draft'")
      .bind(user.id)
      .first();
    queue.pending = pending?.count ?? 0;
  } catch (e) {
    console.error('Pending queue query failed:', e.message);
  }

  try {
    const gen = await context.env.submoacontent_db
      .prepare("SELECT COUNT(*) as count FROM submissions WHERE user_id = ? AND status = 'generating'")
      .bind(user.id)
      .first();
    queue.generating = gen?.count ?? 0;
  } catch (e) {
    console.error('Generating queue query failed:', e.message);
  }

  try {
    const fail = await context.env.submoacontent_db
      .prepare("SELECT COUNT(*) as count FROM submissions WHERE user_id = ? AND status = 'generation_failed'")
      .bind(user.id)
      .first();
    queue.failed = fail?.count ?? 0;
  } catch (e) {
    console.error('Failed queue query failed:', e.message);
  }

  // Fetch user quality threshold
  let userQualityThreshold = 85;
  try {
    const thresholdRow = await context.env.submoacontent_db
      .prepare('SELECT user_quality_threshold FROM users WHERE id = ?')
      .bind(user.id)
      .first();
    if (thresholdRow?.user_quality_threshold) {
      userQualityThreshold = thresholdRow.user_quality_threshold;
    }
  } catch (e) {
    console.error('Threshold fetch failed:', e.message);
  }

  return json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      user_quality_threshold: userQualityThreshold
    },
    submissions,
    notifications,
    queue,
    health: {
      db: true,
      last_sync: Date.now()
    }
  });
}
