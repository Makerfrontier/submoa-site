// src/routes/grade.ts
// Grading endpoints — all admin only
//
// POST /api/admin/articles/:id/grade     — grade a single article
// GET  /api/admin/articles/:id/grade     — fetch latest grade for an article
// POST /api/admin/articles/grade-all     — grade all ungraded article_done submissions

import {
  scoreGrammar,
  scoreReadability,
  scoreAiDetection,
  scorePlagiarism,
  scoreSeo,
  calcOverall,
  THRESHOLDS,
  type GradeScores,
} from "../grading";
import {
  notifyGradingComplete,
  emailArticleReady,
} from "../discord-notifications";

// ---------------------------------------------------------------------------
// Types — adjust to match your Env binding names
// ---------------------------------------------------------------------------
interface Env {
  submoacontent_db: D1Database;
  COPYLEAKS_API_KEY?: string;
  LANGUAGETOOL_API_KEY?: string;
  DISCORD_WEBHOOK_URL?: string;
  OPENROUTER_API_KEY: string;
}

// ---------------------------------------------------------------------------
// Helper: generate a simple ID
// ---------------------------------------------------------------------------
function newId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Core grading pipeline — runs scoring, saves to DB, handles rewrite loop
// ---------------------------------------------------------------------------
async function runGradingPipeline(
  env: Env,
  submissionId: string,
  attempt = 0
): Promise<{ grade: Record<string, unknown>; status: number }> {
  // Fetch submission
  const submission = await env.submoacontent_db.prepare(
    `SELECT s.*, ap.name as author_display_name, ap.style_guide, u.email as author_email
     FROM submissions s
     LEFT JOIN author_profiles ap ON s.author = ap.slug
     LEFT JOIN users u ON ap.account_id = u.account_id
     WHERE s.id = ?`
  )
    .bind(submissionId)
    .first<{
      id: string;
      title: string;
      article_content: string;
      human_observation: string;
      target_keywords: string;
      author: string;
      author_display_name: string | null;
      style_guide: string | null;
      author_email: string | null;
    }>();

  if (!submission) return { grade: { error: "Submission not found" }, status: 404 };
  if (!submission.article_content?.trim()) {
    return { grade: { error: "article_content is empty" }, status: 400 };
  }

  // Mark as grading
  await env.submoacontent_db.prepare(
    `UPDATE submissions SET grade_status = 'grading' WHERE id = ?`
  )
    .bind(submissionId)
    .run();

  let keywords: string[] = [];
  try {
    keywords = submission.target_keywords
      ? JSON.parse(submission.target_keywords)
      : [];
  } catch (e) {
    console.error("Failed to parse target_keywords:", e);
  }

  const text = submission.article_content;
  const firstParagraph = text.split(/\n\n/)[0] ?? text.slice(0, 300);

  let grammar: number | null = null;
  let readability: number | null = null;
  let ai_detection: number | null = null;
  let plagiarism: number | null = null;
  let seo: number | null = null;

  try {
    // Run all scoring in parallel
    [grammar, readability, ai_detection, plagiarism, seo] =
      await Promise.all([
        scoreGrammar(text, env.LANGUAGETOOL_API_KEY),
        Promise.resolve(scoreReadability(text)),
        scoreAiDetection(text, env.COPYLEAKS_API_KEY),
        scorePlagiarism(text, env.COPYLEAKS_API_KEY, submission.topic),
        Promise.resolve(scoreSeo(text, keywords, submission.topic, firstParagraph)),
      ]);
  } catch (err) {
    console.error("Scoring error:", err);
    // Continue with null values — null coalescing will apply defaults below
  }

  // Fallback scores if external APIs fail
  const safeGrammar = grammar ?? 75;
  const safeReadability = readability ?? 70;
  const safeAiDetection = ai_detection ?? 70;
  const safePlagiarism = plagiarism ?? 85;
  const safeSeo = seo ?? 65;


  const scores: GradeScores = {
    grammar: safeGrammar,
    readability: safeReadability,
    ai_detection: safeAiDetection,
    plagiarism: safePlagiarism,
    seo: safeSeo,
    overall: null,
  };
  scores.overall = calcOverall(scores);

  const now = Date.now();
  const gradeId = newId();

  // Every article gets graded — no pass/fail gate, no rewrites
  const gradeStatus = "graded";
  const submissionGradeStatus = "graded";

  // Upsert grade row
  await env.submoacontent_db.prepare(
    `INSERT INTO grades (id, submission_id, grammar_score, readability_score,
       ai_detection_score, plagiarism_score, seo_score, overall_score,
       rewrite_attempts, status, graded_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      gradeId,
      submissionId,
      grammar,
      readability,
      ai_detection,
      plagiarism,
      seo,
      scores.overall,
      attempt,
      gradeStatus,
      now,
      now
    )
    .run();

  // Update submission grade_status
  await env.submoacontent_db.prepare(
    `UPDATE submissions SET grade_status = ? WHERE id = ?`
  )
    .bind(submissionGradeStatus, submissionId)
    .run();

  const grade = {
    id: gradeId,
    submission_id: submissionId,
    grammar_score: grammar,
    readability_score: readability,
    ai_detection_score: ai_detection,
    plagiarism_score: plagiarism,
    seo_score: seo,
    overall_score: scores.overall,
    rewrite_attempts: attempt,
    status: gradeStatus,
    graded_at: now,
  };

  // Notify — every article graded, user sees their score on the dashboard
  const authorName = (submission as any).author_display_name ?? submission.author;
  await notifyGradingComplete(env as any, {
    id: submissionId,
    title: submission.topic,
    author_display_name: authorName,
    overall_score: scores.overall,
  });
  if (submission.author_email) {
    await emailArticleReady(env as any, submission.author_email, {
      id: submissionId,
      title: submission.topic,
      overall_score: scores.overall,
    });
  }

  return { grade, status: 200 };
}

// Route handlers
// ---------------------------------------------------------------------------

// POST /api/admin/articles/:id/grade
export async function handleGradeArticle(
  request: Request,
  env: Env,
  submissionId: string
): Promise<Response> {
  const { grade, status } = await runGradingPipeline(env, submissionId);
  return Response.json(grade, { status });
}

// GET /api/admin/articles/:id/grade
export async function handleGetGrade(
  _request: Request,
  env: Env,
  submissionId: string
): Promise<Response> {
  const grade = await env.submoacontent_db.prepare(
    `SELECT * FROM grades WHERE submission_id = ? ORDER BY graded_at DESC LIMIT 1`
  )
    .bind(submissionId)
    .first();

  if (!grade) {
    return Response.json({ error: "No grade found for this submission" }, { status: 404 });
  }

  return Response.json(grade);
}

// POST /api/admin/articles/grade-all
export async function handleGradeAll(
  _request: Request,
  env: Env
): Promise<Response> {
  const { results } = await env.submoacontent_db.prepare(
    `SELECT id, topic FROM submissions
     WHERE status = 'article_done' AND grade_status = 'ungraded'
     ORDER BY created_at ASC`
  ).all<{ id: string; topic: string }>();

  const summary = {
    total: results.length,
    graded: 0,
    errors: 0,
  };

  // Run sequentially to avoid rate-limiting external APIs
  for (const sub of results) {
    try {
      await runGradingPipeline(env, sub.id);
      summary.graded++;
    } catch (err) {
      console.error(`Error grading ${sub.id}:`, err);
      summary.errors++;
    }
  }

  return Response.json(summary);
}
