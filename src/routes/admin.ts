// src/routes/admin.ts
// Admin API routes — all protected by role = 'admin' middleware
// Mount at /api/admin/*

interface Env {
  DB: D1Database;
  DISCORD_BOT_TOKEN: string;
  GENERATION_QUEUE: Queue;
  APP_URL?: string;
}

// ---------------------------------------------------------------------------
// Auth guard — call at top of every admin route
// ---------------------------------------------------------------------------
async function requireAdmin(request: Request, env: Env): Promise<{ id: string; role: string } | Response> {
  const cookie = request.headers.get('Cookie') ?? '';
  const session = cookie.match(/submoa_session=([^;]+)/)?.[1];
  if (!session) return new Response('Unauthorized', { status: 401 });

  const user = await env.submoacontent_db.prepare(
    `SELECT id, role FROM users WHERE id = (
      SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?
    )`
  ).bind(session, Date.now()).first<{ id: string; role: string }>();

  if (!user || !['admin', 'super_admin'].includes(user.role)) return new Response('Forbidden', { status: 403 });
  return user;
}

async function requireSuperAdmin(request: Request, env: Env): Promise<{ id: string; role: string } | Response> {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;
  if ((auth as any).role !== 'super_admin') return new Response('Forbidden — super admin required', { status: 403 });
  return auth;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function timeAgo(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// GET /api/admin/submissions
// ---------------------------------------------------------------------------
export async function handleGetSubmissions(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  // Admins see all submissions EXCEPT super_admin-owned ones.
  // Super admins see everything.
  const isSuperAdmin = (auth as any).role === 'super_admin';

  const baseSelect = `SELECT s.*, s.topic as title,
            ap.name as author_display_name,
            g.grammar_score, g.readability_score, g.ai_detection_score,
            g.plagiarism_score, g.seo_score, g.overall_score,
            g.rewrite_attempts, g.status as grade_result_status
     FROM submissions s
     LEFT JOIN author_profiles ap ON s.author = ap.slug
     LEFT JOIN grades g ON g.id = (
       SELECT id FROM grades
       WHERE submission_id = s.id
       ORDER BY COALESCE(graded_at, created_at) DESC
       LIMIT 1
     )`;

  const stmt = isSuperAdmin
    ? env.submoacontent_db.prepare(`${baseSelect} ORDER BY s.created_at DESC`)
    : env.submoacontent_db.prepare(
        `${baseSelect}
         WHERE s.user_id NOT IN (SELECT id FROM users WHERE role = 'super_admin')
         ORDER BY s.created_at DESC`
      );

  const { results } = await stmt.all();

  // Shape grade data nested
  const submissions = results.map((row: any) => ({
    ...row,
    grade: row.overall_score !== null ? {
      grammar_score: row.grammar_score,
      readability_score: row.readability_score,
      ai_detection_score: row.ai_detection_score,
      plagiarism_score: row.plagiarism_score,
      seo_score: row.seo_score,
      overall_score: row.overall_score,
      rewrite_attempts: row.rewrite_attempts,
    } : null,
  }));

  return json({ submissions });
}

// ---------------------------------------------------------------------------
// GET /api/admin/stats
// ---------------------------------------------------------------------------
export async function handleGetStats(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  // Admins exclude super_admin-owned content from stat counts.
  const isSuperAdmin = (auth as any).role === 'super_admin';
  const exclude = isSuperAdmin ? '' : ` AND user_id NOT IN (SELECT id FROM users WHERE role = 'super_admin')`;

  const rows = await Promise.all([
    env.submoacontent_db.prepare(`SELECT COUNT(*) as n FROM submissions WHERE 1=1${exclude}`).first<{ n: number }>(),
    env.submoacontent_db.prepare(`SELECT COUNT(*) as n FROM submissions WHERE status IN ('queued','generating')${exclude}`).first<{ n: number }>(),
    env.submoacontent_db.prepare(`SELECT COUNT(*) as n FROM submissions WHERE status = 'article_done' AND grade_status IN ('graded', 'passed')${exclude}`).first<{ n: number }>(),
    env.submoacontent_db.prepare(`SELECT COUNT(*) as n FROM submissions WHERE grade_status = 'needs_review'${exclude}`).first<{ n: number }>(),
    env.submoacontent_db.prepare(`SELECT COUNT(*) as n FROM submissions WHERE status = 'failed'${exclude}`).first<{ n: number }>(),
  ]);

  return json({
    total: rows[0]?.n ?? 0,
    in_progress: rows[1]?.n ?? 0,
    done: rows[2]?.n ?? 0,
    needs_review: rows[3]?.n ?? 0,
    failed: rows[4]?.n ?? 0,
  });
}

// ---------------------------------------------------------------------------
// POST /api/admin/articles/:id/approve (needs_review → passed)
// ---------------------------------------------------------------------------
export async function handleApproveArticle(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireSuperAdmin(request, env);
  if (auth instanceof Response) return auth;

  await env.submoacontent_db.prepare(
    `UPDATE submissions SET grade_status = 'passed', updated_at = ? WHERE id = ?`
  ).bind(Date.now(), id).run();

  await env.submoacontent_db.prepare(
    `UPDATE grades SET status = 'passed' WHERE submission_id = ?`
  ).bind(id).run();

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// POST /api/admin/articles/upload-for-grading
// ---------------------------------------------------------------------------
export async function handleUploadForGrading(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperAdmin(request, env);
  if (auth instanceof Response) return auth;

  const body = await request.json() as { content: string; filename: string };
  const id = crypto.randomUUID();
  const now = Date.now();

  await env.submoacontent_db.prepare(
    `INSERT INTO submissions (id, title, article_content, status, grade_status, author, created_at, updated_at)
     VALUES (?, ?, ?, 'article_done', 'ungraded', 'admin-upload', ?, ?)`
  ).bind(id, body.filename || 'Uploaded Article', body.content, now, now).run();

  return json({ ok: true, submission_id: id });
}

// ---------------------------------------------------------------------------
// GET /api/admin/queue
// ---------------------------------------------------------------------------
export async function handleGetQueue(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  const STALE_MS = 30 * 60 * 1000;
  const cutoff = Date.now() - STALE_MS;
  const isSuperAdmin = (auth as any).role === 'super_admin';
  const exclude = isSuperAdmin ? '' : ` AND s.user_id NOT IN (SELECT id FROM users WHERE role = 'super_admin')`;

  const [generating, queued, stuck] = await Promise.all([
    env.submoacontent_db.prepare(
      `SELECT s.id, s.topic as title, s.updated_at, ap.name as author_display_name, s.article_format
       FROM submissions s
       LEFT JOIN author_profiles ap ON s.author = ap.slug
       WHERE s.status = 'generating'${exclude}`
    ).all<any>(),
    env.submoacontent_db.prepare(
      `SELECT s.id, s.topic as title, s.created_at, ap.name as author_display_name, s.article_format
       FROM submissions s
       LEFT JOIN author_profiles ap ON s.author = ap.slug
       WHERE s.status = 'queued'${exclude}
       ORDER BY s.created_at ASC`
    ).all<any>(),
    env.submoacontent_db.prepare(
      `SELECT s.id, s.topic as title, s.updated_at, ap.name as author_display_name
       FROM submissions s
       LEFT JOIN author_profiles ap ON s.author = ap.slug
       WHERE s.status = 'generating' AND s.updated_at < ?${exclude}`,
    ).bind(cutoff).all<any>(),
  ]);

  return json({
    queued_count: queued.results.length,
    generating_count: generating.results.length,
    stuck_count: stuck.results.length,
    dlq_count: 0, // TODO: wire to Cloudflare Queue DLQ API when available
    generating: generating.results.map((r: any) => ({
      ...r,
      started_ago: timeAgo(r.updated_at),
    })),
    queued: queued.results.map((r: any) => ({
      ...r,
      queued_ago: timeAgo(r.created_at),
    })),
    stuck: stuck.results.map((r: any) => ({
      ...r,
      stuck_for: timeAgo(r.updated_at),
    })),
    dead_letter: [],
  });
}

// ---------------------------------------------------------------------------
// POST /api/admin/queue/requeue/:id
// ---------------------------------------------------------------------------
export async function handleRequeue(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireSuperAdmin(request, env);
  if (auth instanceof Response) return auth;

  await env.submoacontent_db.prepare(
    `UPDATE submissions SET status = 'queued', grade_status = 'ungraded', updated_at = ? WHERE id = ?`
  ).bind(Date.now(), id).run();

  await env.GENERATION_QUEUE.send({ submission_id: id, queued_at: Date.now() });

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// POST /api/admin/queue/cancel/:id
// ---------------------------------------------------------------------------
export async function handleCancelQueue(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireSuperAdmin(request, env);
  if (auth instanceof Response) return auth;

  await env.submoacontent_db.prepare(
    `UPDATE submissions SET status = 'draft', updated_at = ? WHERE id = ? AND status = 'queued'`
  ).bind(Date.now(), id).run();

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// GET /api/admin/health
// ---------------------------------------------------------------------------
export async function handleGetHealth(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  const STALE_MS = 30 * 60 * 1000;
  const cutoff = Date.now() - STALE_MS;

  const apis = [
    { name: 'Claude (Anthropic)', status: 'ok', latency: null, note: 'Via OpenRouter' },
    { name: 'DataforSEO', status: 'ok', latency: null, note: null },
    { name: 'Copyleaks', status: 'ok', latency: null, note: null },
    { name: 'Resend', status: 'ok', latency: null, note: null },
    { name: 'OpenRouter (TTS)', status: 'ok', latency: null, note: null },
    { name: 'LanguageTool', status: 'ok', latency: null, note: null },
  ];

  const [stuck, lastGen, stats] = await Promise.all([
    env.submoacontent_db.prepare(
      `SELECT s.id, s.topic as title, s.updated_at, s.status, ap.name as author_display_name
       FROM submissions s
       LEFT JOIN author_profiles ap ON s.author = ap.slug
       WHERE s.status = 'generating' AND s.updated_at < ?`
    ).bind(cutoff).all<any>(),
    env.submoacontent_db.prepare(
      `SELECT s.id, s.topic as title, s.word_count, s.updated_at, g.overall_score,
              CASE WHEN g.status = 'passed' THEN 1 ELSE 0 END as grade_passed
       FROM submissions s
       LEFT JOIN grades g ON g.id = (SELECT id FROM grades WHERE submission_id = s.id ORDER BY COALESCE(graded_at, created_at) DESC LIMIT 1)
       WHERE s.status = 'article_done'
       ORDER BY s.updated_at DESC LIMIT 1`
    ).first<any>(),
    env.submoacontent_db.prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN DATE(created_at/1000, 'unixepoch') = DATE('now') THEN 1 ELSE 0 END) as today,
         SUM(CASE WHEN grade_status = 'passed' THEN 1 ELSE 0 END) as passed
       FROM submissions WHERE status = 'article_done'`
    ).first<any>(),
  ]);

  return json({
    apis,
    stuck: (stuck.results || []).map((r: any) => ({
      ...r,
      stuck_for: timeAgo(r.updated_at),
    })),
    generated_today: stats?.today ?? 0,
    pass_rate: stats?.total ? Math.round((stats.passed / stats.total) * 100) : 0,
    last_generation: lastGen ? {
      title: lastGen.title,
      word_count: lastGen.word_count,
      completed_ago: timeAgo(lastGen.updated_at),
      overall_score: lastGen.overall_score,
      grade_passed: lastGen.grade_passed === 1,
    } : null,
    cron_last_fired: 'Check Cloudflare dashboard',
    cron_next: 'Every 10 minutes',
    dlq_depth: 0,
  });
}

// ---------------------------------------------------------------------------
// GET /api/admin/usage?period=month|week|today
// ---------------------------------------------------------------------------
export async function handleGetUsage(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const period = url.searchParams.get('period') || 'month';

  const cutoff = period === 'today'
    ? new Date().setHours(0, 0, 0, 0)
    : period === 'week'
      ? Date.now() - 7 * 24 * 60 * 60 * 1000
      : Date.now() - 30 * 24 * 60 * 60 * 1000;

  const { results: log } = await env.submoacontent_db.prepare(
    `SELECT api_name, input_tokens, output_tokens, cost, submission_id,
            title, created_at
     FROM api_usage_log
     WHERE created_at > ?
     ORDER BY created_at DESC
     LIMIT 100`
  ).bind(cutoff).all<any>();

  // Aggregate by API
  const agg: Record<string, { cost: number; requests: number; input: number; output: number }> = {};
  for (const row of log) {
    if (!agg[row.api_name]) agg[row.api_name] = { cost: 0, requests: 0, input: 0, output: 0 };
    agg[row.api_name].cost += row.cost || 0;
    agg[row.api_name].requests += 1;
    agg[row.api_name].input += row.input_tokens || 0;
    agg[row.api_name].output += row.output_tokens || 0;
  }

  const totalCost = Object.values(agg).reduce((s, a) => s + a.cost, 0);
  const totalRequests = Object.values(agg).reduce((s, a) => s + a.requests, 0);

  const apis = Object.entries(agg).map(([name, data]) => ({
    name,
    cost: data.cost,
    details: [
      { label: 'Requests', value: data.requests.toLocaleString() },
      data.input ? { label: 'Input tokens', value: data.input.toLocaleString() } : null,
      data.output ? { label: 'Output tokens', value: data.output.toLocaleString() } : null,
      { label: 'Avg cost/req', value: `$${(data.cost / Math.max(data.requests, 1)).toFixed(4)}` },
    ].filter(Boolean),
  }));

  apis.push({
    name: 'Total Cost',
    cost: totalCost,
    is_total: true,
    details: [
      { label: 'All APIs', value: `${totalRequests.toLocaleString()} requests` },
      { label: 'Avg per article', value: `$${totalRequests > 0 ? (totalCost / totalRequests).toFixed(4) : '0.00'}` },
    ],
  } as any);

  const recent_log = log.slice(0, 20).map((r: any) => ({
    time: new Date(r.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    article: r.title || r.submission_id?.slice(0, 8),
    api: r.api_name,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
    cost: r.cost,
  }));

  return json({ apis, recent_log });
}

// ---------------------------------------------------------------------------
// GET /api/admin/authors
// ---------------------------------------------------------------------------
export async function handleGetAuthors(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  const { results } = await env.submoacontent_db.prepare(
    `SELECT ap.*,
       COUNT(s.id) as article_count,
       ROUND(AVG(CASE WHEN g.status = 'passed' THEN 100.0 ELSE 0 END), 0) as pass_rate
     FROM author_profiles ap
     LEFT JOIN submissions s ON s.author = ap.slug
     LEFT JOIN grades g ON g.submission_id = s.id
     GROUP BY ap.slug
     ORDER BY ap.name ASC`
  ).all();

  return json({ authors: results });
}

// ---------------------------------------------------------------------------
// PUT /api/admin/authors/:slug
// ---------------------------------------------------------------------------
export async function handleUpdateAuthor(request: Request, env: Env, slug: string): Promise<Response> {
  const auth = await requireSuperAdmin(request, env);
  if (auth instanceof Response) return auth;

  const body = await request.json() as { name: string; style_guide?: string };
  await env.submoacontent_db.prepare(
    `UPDATE author_profiles SET name = ?, style_guide = ?, updated_at = ? WHERE slug = ?`
  ).bind(body.name, body.style_guide ?? null, Date.now(), slug).run();

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// POST /api/admin/authors/:slug/toggle
// ---------------------------------------------------------------------------
export async function handleToggleAuthor(request: Request, env: Env, slug: string): Promise<Response> {
  const auth = await requireSuperAdmin(request, env);
  if (auth instanceof Response) return auth;

  const body = await request.json() as { is_active: boolean };
  await env.submoacontent_db.prepare(
    `UPDATE author_profiles SET is_active = ?, updated_at = ? WHERE slug = ?`
  ).bind(body.is_active ? 1 : 0, Date.now(), slug).run();

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// GET /api/admin/skills
// ---------------------------------------------------------------------------
export async function handleGetSkills(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  const { results } = await env.submoacontent_db.prepare(
    `SELECT id, name, version, active, updated_at,
            SUBSTR(content, 1, 100) as preview
     FROM agent_skills
     ORDER BY updated_at DESC`
  ).all();

  // Full content on demand
  const skills = await Promise.all(
    results.map(async (row: any) => {
      const full = await env.submoacontent_db.prepare(
        `SELECT content FROM agent_skills WHERE id = ?`
      ).bind(row.id).first<{ content: string }>();
      return { ...row, content: full?.content ?? '' };
    })
  );

  return json({ skills });
}

// ---------------------------------------------------------------------------
// GET /api/admin/users
// ---------------------------------------------------------------------------
export async function handleGetUsers(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  const isSuperAdmin = (auth as any).role === 'super_admin';
  const stmt = isSuperAdmin
    ? env.submoacontent_db.prepare(`SELECT id, name, email, role, account_id, created_at FROM users ORDER BY created_at DESC`)
    : env.submoacontent_db.prepare(`SELECT id, name, email, role, account_id, created_at FROM users WHERE role != 'super_admin' ORDER BY created_at DESC`);

  const { results } = await stmt.all();
  return json({ users: results });
}

// ---------------------------------------------------------------------------
// PUT /api/admin/users/:id/role
// ---------------------------------------------------------------------------
export async function handleUpdateUserRole(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireSuperAdmin(request, env);
  if (auth instanceof Response) return auth;

  const body = await request.json() as { role: string };
  if (!['user', 'admin', 'super_admin'].includes(body.role)) {
    return json({ error: 'Invalid role' }, 400);
  }

  // Enforce: max 1 super_admin
  if (body.role === 'super_admin') {
    const existing = await env.submoacontent_db.prepare(
      `SELECT COUNT(*) as n FROM users WHERE role = 'super_admin' AND id != ?`
    ).bind(id).first<{ n: number }>();
    if ((existing?.n ?? 0) >= 1) return json({ error: 'Only one super admin allowed' }, 400);
  }

  // Enforce: max 3 total admins (admin + super_admin)
  if (body.role === 'admin' || body.role === 'super_admin') {
    const existing = await env.submoacontent_db.prepare(
      `SELECT COUNT(*) as n FROM users WHERE role IN ('admin', 'super_admin') AND id != ?`
    ).bind(id).first<{ n: number }>();
    if ((existing?.n ?? 0) >= 3) return json({ error: 'Maximum 3 admins allowed' }, 400);
  }

  await env.submoacontent_db.prepare(
    `UPDATE users SET role = ?, updated_at = ? WHERE id = ?`
  ).bind(body.role, Date.now(), id).run();

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/users/:id — delete user, reassign content
// ---------------------------------------------------------------------------
export async function handleDeleteUser(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireSuperAdmin(request, env);
  if (auth instanceof Response) return auth;

  if (id === (auth as any).id) {
    return json({ error: 'Cannot delete your own account' }, 400);
  }

  const target = await env.submoacontent_db.prepare(
    `SELECT role, account_id, name FROM users WHERE id = ?`
  ).bind(id).first<{ role: string; account_id: string; name: string }>();

  if (!target) return json({ error: 'User not found' }, 404);
  if (target.role === 'super_admin') return json({ error: 'Cannot delete a super admin' }, 403);

  const deletedLabel = `deleted-user-${id.slice(0, 8)}`;

  // Reassign submissions by user_id — never touch other users' submissions
  await env.submoacontent_db.prepare(
    `UPDATE submissions SET account_id = ?, updated_at = ? WHERE user_id = ?`
  ).bind(deletedLabel, Date.now(), id).run();

  // Reassign only author profiles that are exclusively used by this user's submissions
  // (i.e. not referenced by any other user's submissions) — never rename them
  await env.submoacontent_db.prepare(
    `UPDATE author_profiles SET account_id = ?, updated_at = ?
     WHERE slug IN (
       SELECT DISTINCT author FROM submissions WHERE user_id = ?
     )
     AND slug NOT IN (
       SELECT DISTINCT author FROM submissions WHERE user_id != ? AND account_id != ?
     )`
  ).bind(deletedLabel, Date.now(), id, id, deletedLabel).run();

  await env.submoacontent_db.prepare(
    `DELETE FROM sessions WHERE user_id = ?`
  ).bind(id).run();

  await env.submoacontent_db.prepare(
    `DELETE FROM users WHERE id = ?`
  ).bind(id).run();

  return json({ ok: true, reassigned_to: deletedLabel });
}

// ---------------------------------------------------------------------------
// GET /api/admin/badge-counts
// ---------------------------------------------------------------------------
export async function handleGetBadgeCounts(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  const STALE_MS = 30 * 60 * 1000;
  const cutoff = Date.now() - STALE_MS;
  const isSuperAdmin = (auth as any).role === 'super_admin';
  const exclude = isSuperAdmin ? '' : ` AND user_id NOT IN (SELECT id FROM users WHERE role = 'super_admin')`;

  const [queueRow, stuckRow, reviewRow] = await Promise.all([
    env.submoacontent_db.prepare(`SELECT COUNT(*) as n FROM submissions WHERE status IN ('queued','generating')${exclude}`).first<{ n: number }>(),
    env.submoacontent_db.prepare(`SELECT COUNT(*) as n FROM submissions WHERE status = 'generating' AND updated_at < ?${exclude}`).bind(cutoff).first<{ n: number }>(),
    env.submoacontent_db.prepare(`SELECT COUNT(*) as n FROM submissions WHERE grade_status = 'needs_review'${exclude}`).first<{ n: number }>(),
  ]);

  return json({
    queue: queueRow?.n ?? 0,
    health: (stuckRow?.n ?? 0) + (reviewRow?.n ?? 0),
  });
}