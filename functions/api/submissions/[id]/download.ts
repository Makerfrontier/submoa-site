import { json, getSessionUser } from '../../_utils';

export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(context.request.url);
  const id = url.pathname.split('/')[3]; // /api/submissions/:id/download
  if (!id) return json({ error: 'Missing submission id' }, 400);

  // Fetch submission with author profile and grade
  const sub = await context.env.submoacontent_db.prepare(`
    SELECT s.*, ap.name as author_display_name,
           g.grammar_score, g.readability_score, g.ai_detection_score,
           g.plagiarism_score, g.seo_score, g.overall_score
    FROM submissions s
    LEFT JOIN author_profiles ap ON s.author = ap.slug
    LEFT JOIN grades g ON g.id = (
      SELECT id FROM grades WHERE submission_id = s.id ORDER BY graded_at DESC LIMIT 1
    )
    WHERE s.id = ?
  `).bind(id).first();

  if (!sub) return json({ error: 'Not found' }, 404);
  if (sub.user_id !== user.id && user.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  // Build slug for filename
  const slug = (sub.topic || 'article')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  // Import JSZip
  const JSZip = (await import('jszip')).default;

  const zip = new JSZip();

  // article.html — rendered article content
  if (sub.article_content) {
    zip.file('article.html', sub.article_content);
  }

  // article.md — raw markdown if stored separately (fallback to content if not)
  if (sub.article_content) {
    // Strip HTML tags for a rough markdown version
    const md = sub.article_content
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    zip.file('article.md', md);
  }

  // meta.json — metadata
  const meta = {
    title: sub.topic,
    author: sub.author_display_name || sub.author || null,
    articleFormat: sub.article_format,
    optimizationTarget: sub.optimization_target,
    wordCount: sub.word_count || null,
    status: sub.status,
    gradeStatus: sub.grade_status,
    createdAt: sub.created_at ? new Date(sub.created_at).toISOString() : null,
    updatedAt: sub.updated_at ? new Date(sub.updated_at).toISOString() : null,
    grades: sub.grammar_score ? {
      grammar: sub.grammar_score,
      readability: sub.readability_score,
      aiDetection: sub.ai_detection_score,
      plagiarism: sub.plagiarism_score,
      seo: sub.seo_score,
      overall: sub.overall_score,
    } : null,
  };
  zip.file('meta.json', JSON.stringify(meta, null, 2));

  // images/ — product images if stored
  if (sub.article_images) {
    try {
      const images = JSON.parse(sub.article_images);
      for (const img of images) {
        if (img.url) {
          try {
            const res = await fetch(img.url);
            if (res.ok) {
              const buffer = await res.arrayBuffer();
              const filename = img.alt
                ? `${img.alt.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.jpg`
                : `image-${img.url.split('/').pop()}`;
              zip.file(`images/${filename}`, buffer);
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${slug}.zip"`,
      'Content-Length': String(zipBuffer.length),
    },
  });
}
