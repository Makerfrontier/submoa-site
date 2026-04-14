// src/packager.ts
// Article package generation — runs in the cron worker after grading passes
// Generates HTML, DOCX, and meta.json, stores in R2, updates package_status

import { generateDocx } from './docx_generator';

interface Env {
  DB: D1Database;
  SUBMOA_IMAGES: R2Bucket;
  OPENROUTER_API_KEY: string;
}

// ---------------------------------------------------------------------------
// Main packager — called from cron.ts after grading passes
// ---------------------------------------------------------------------------
export async function packageArticle(env: Env, submissionId: string): Promise<void> {
  // Mark as packaging
  await env.DB.prepare(
    `UPDATE submissions SET package_status = 'packaging', updated_at = ? WHERE id = ?`
  ).bind(Date.now(), submissionId).run();

  try {
    // Fetch submission + author + grade
    const sub = await env.DB.prepare(
      `SELECT s.*,
              ap.name as author_display_name,
              g.grammar_score, g.readability_score, g.ai_detection_score,
              g.plagiarism_score, g.seo_score, g.overall_score
       FROM submissions s
       LEFT JOIN author_profiles ap ON s.author = ap.slug
       LEFT JOIN grades g ON g.submission_id = s.id
       WHERE s.id = ?`
    ).bind(submissionId).first<any>();

    if (!sub || !sub.article_content) {
      throw new Error(`No article content for submission ${submissionId}`);
    }

    const basePath = `packages/${submissionId}`;
    const files: { key: string; content: string | Uint8Array; contentType: string }[] = [];

    // ── 1. HTML ──────────────────────────────────────────────────────────
    const html = buildArticleHtml(sub);
    files.push({
      key: `${basePath}/article.html`,
      content: html,
      contentType: 'text/html',
    });

    // ── 2. DOCX ──────────────────────────────────────────────────────────
    const grade = sub.overall_score !== null ? {
      grammar_score:      sub.grammar_score,
      readability_score:  sub.readability_score,
      ai_detection_score: sub.ai_detection_score,
      plagiarism_score:   sub.plagiarism_score,
      seo_score:          sub.seo_score,
      overall_score:      sub.overall_score,
    } : null;

    const docxBuffer = await generateDocx(
      sub.article_content,
      sub.topic,
      sub.author_display_name ?? sub.author,
      sub.word_count ?? 0,
      grade,
      sub.article_format ?? 'Article',
      sub.created_at,
    );

    files.push({
      key: `${basePath}/article.docx`,
      content: docxBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    // ── 3. Meta JSON ─────────────────────────────────────────────────────
    const meta = {
      id:                  sub.id,
      topic:               sub.topic,
      article_format:      sub.article_format,
      optimization_target: sub.optimization_target,
      author:              sub.author_display_name ?? sub.author,
      word_count:          sub.word_count,
      created_at:          sub.created_at,
      grade: grade ?? null,
      packaged_at:         Date.now(),
      files: ['article.html', 'article.docx', 'meta.json'],
    };

    files.push({
      key: `${basePath}/meta.json`,
      content: JSON.stringify(meta, null, 2),
      contentType: 'application/json',
    });

    // ── 4. Upload all files to R2 ────────────────────────────────────────
    await Promise.all(
      files.map(f =>
        env.SUBMOA_IMAGES.put(f.key, f.content, {
          httpMetadata: { contentType: f.contentType },
        })
      )
    );

    // ── 5. Store manifest path and mark ready ────────────────────────────
    await env.DB.prepare(
      `UPDATE submissions
       SET package_status = 'ready',
           zip_url = ?,
           updated_at = ?
       WHERE id = ?`
    ).bind(`${basePath}/manifest.json`, Date.now(), submissionId).run();

    // Store manifest
    await env.SUBMOA_IMAGES.put(`${basePath}/manifest.json`, JSON.stringify({
      ...meta,
      base_path: basePath,
    }), {
      httpMetadata: { contentType: 'application/json' },
    });

    console.log(`Package ready for submission ${submissionId}`);

  } catch (err) {
    console.error(`Packaging failed for submission ${submissionId}:`, err);
    await env.DB.prepare(
      `UPDATE submissions SET package_status = 'failed', updated_at = ? WHERE id = ?`
    ).bind(Date.now(), submissionId).run();
  }
}

// ---------------------------------------------------------------------------
// Build clean HTML for the article
// ---------------------------------------------------------------------------
function buildArticleHtml(sub: any): string {
  const date = new Date(sub.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(sub.topic)}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.7; }
    h1 { font-size: 2rem; margin-bottom: 8px; }
    h2 { font-size: 1.4rem; margin-top: 2rem; }
    h3 { font-size: 1.2rem; margin-top: 1.5rem; }
    .byline { color: #888; font-size: 0.9rem; margin-bottom: 2rem; border-bottom: 1px solid #eee; padding-bottom: 1rem; }
    .grade-bar { background: #f5f5f5; border-radius: 6px; padding: 12px 16px; margin-bottom: 2rem; font-size: 0.85rem; color: #555; }
    p { margin-bottom: 1rem; }
    img { max-width: 100%; height: auto; border-radius: 4px; margin: 1rem 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(sub.topic)}</h1>
  <div class="byline">
    By ${escapeHtml(sub.author_display_name ?? sub.author)}
    &nbsp;·&nbsp; ${date}
    ${sub.word_count ? `&nbsp;·&nbsp; ${sub.word_count.toLocaleString()} words` : ''}
  </div>
  ${sub.overall_score !== null ? `
  <div class="grade-bar">
    Grade: ${sub.overall_score}/100
    &nbsp;·&nbsp; Grammar: ${sub.grammar_score ?? '—'}
    &nbsp;·&nbsp; Readability: ${sub.readability_score ?? '—'}
    &nbsp;·&nbsp; SEO: ${sub.seo_score ?? '—'}
  </div>` : ''}
  <div class="article-body">
    ${sub.article_content}
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return (str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Find all passed articles that haven't been packaged yet
// ---------------------------------------------------------------------------
export async function findUnpackagedArticles(env: Env): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT id FROM submissions
     WHERE grade_status IN ('passed', 'graded')
     AND (package_status IS NULL OR package_status = 'failed')
     ORDER BY created_at ASC`
  ).all<{ id: string }>();

  return results.map(r => r.id);
}
