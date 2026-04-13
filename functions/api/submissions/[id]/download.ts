import { json, getSessionUser } from '../../_utils';
import { generateDocx } from '../../../../src/docx_generator';

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

  // Construct grade object from flat sub fields for generateDocx
  const grade = sub.grammar_score !== null ? {
    grammar_score: sub.grammar_score,
    readability_score: sub.readability_score,
    ai_detection_score: sub.ai_detection_score,
    plagiarism_score: sub.plagiarism_score,
    seo_score: sub.seo_score,
    overall_score: sub.overall_score,
  } : null;

  // Generate DOCX
  let docxBuffer = null;
  try {
    docxBuffer = await generateDocx(
      sub.article_content,
      sub.topic,
      sub.author_display_name ?? sub.author,
      sub.word_count ?? 0,
      grade,
      sub.article_format ?? 'Article',
      sub.created_at,
    );
  } catch (err) {
    console.error('DOCX generation failed:', err);
    // Continue without DOCX — zip will still have HTML and meta
  }

  if (docxBuffer) {
    zip.file('article.docx', docxBuffer);
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
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${slug}.zip"`,
      'Content-Length': String(zipBuffer.byteLength),
    },
  });
}
