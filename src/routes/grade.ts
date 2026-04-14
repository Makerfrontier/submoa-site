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
  notifyGradingPassed,
  notifyNeedsReview,
  emailArticleReady,
} from "../notifications";

// ---------------------------------------------------------------------------
// Types — adjust to match your Env binding names
// ---------------------------------------------------------------------------
interface Env {
  submoacontent_db: D1Database;
  COPYLEAKS_API_KEY?: string;
  LANGUAGETOOL_API_KEY?: string;
  DISCORD_BOT_TOKEN?: string;
  AI: Ai; // Cloudflare Workers AI binding for rewrites
}

// ---------------------------------------------------------------------------
// Helper: generate a simple ID
// ---------------------------------------------------------------------------
function newId(): string {
  return crypto.randomUUID();
}

export async function runGradingPipeline(
  env: Env,
  submissionId: string,
  attempt: number = 0
): Promise<{
  grade: {
    id: string;
    submission_id: string;
    grammar_score: number;
    readability_score: number;
    ai_detection_score: number;
    plagiarism_score: number;
    seo_score: number;
    overall_score: number;
    rewrite_attempts: number;
    status: string;
    graded_at: number;
  };
}> {
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
  if (submission.target_keywords) {
    try {
      keywords = JSON.parse(submission.target_keywords);
    } catch {
      keywords = [];
    }
  }

  const text = submission.article_content;
  const firstParagraph = text.split(/\n\n/)[0] ?? text.slice(0, 300);

  // Run all scoring in parallel
  const [grammar, readability, ai_detection, plagiarism, seo] =
    await Promise.all([
      scoreGrammar(text, env.LANGUAGETOOL_API_KEY),
      Promise.resolve(scoreReadability(text)),
      scoreAiDetection(text, env.COPYLEAKS_API_KEY),
      scorePlagiarism(text, env.COPYLEAKS_API_KEY, submission.title),
      Promise.resolve(scoreSeo(text, keywords, submission.title, firstParagraph)),
    ]);

  const scores: GradeScores = { grammar, readability, ai_detection, plagiarism, seo, overall: null };
  scores.overall = calcOverall(scores);

  const now = Date.now();
  const gradeId = newId();

  // All articles are simply graded — scores are informational, no pass/fail gate
  let gradeStatus = "graded";
  let submissionGradeStatus = "graded";

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

  // No rewrite trigger — every article is graded and moves forward

  return { grade, status: 200 };
}

<<<<<<< Updated upstream
// ---------------------------------------------------------------------------
// Auto-rewrite
// ---------------------------------------------------------------------------
async function triggerRewrite(
  env: Env,
  submission: {
    id: string;
    title: string;
    article_content: string;
    human_observation: string;
    style_guide: string | null;
  },
  scores: GradeScores,
  keywords: string[],
  attempt: number
): Promise<void> {
  const instructions = buildRewriteInstructions(scores, keywords);

  const prompt = `AUTHOR VOICE:
${submission.style_guide ?? "Write in a clear, natural, engaging style."}

ORIGINAL BRIEF:
${submission.human_observation ?? ""}

REWRITE INSTRUCTIONS:
${instructions}

Rewrite the following article addressing all listed issues while preserving the author's voice and all factual content:

${submission.article_content}`;

  // Use Cloudflare Workers AI — swap model as needed
  const result = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 4096,
  }) as { response: string };

  const newContent = result?.response?.trim();
  if (!newContent) {
    console.error("Rewrite returned empty content for submission", submission.id);
    return;
  }

  await env.submoacontent_db.prepare(
    `UPDATE submissions SET article_content = ? WHERE id = ?`
  )
    .bind(newContent, submission.id)
    .run();

  console.log(
    `Rewrite attempt ${attempt + 1} complete for submission ${submission.id}`
  );
}

// ---------------------------------------------------------------------------
=======
>>>>>>> Stashed changes
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
    `SELECT id, title FROM submissions
     WHERE status = 'article_done' AND grade_status = 'ungraded'
     ORDER BY created_at ASC`
  ).all<{ id: string; title: string }>();

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
