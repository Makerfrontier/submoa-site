// functions/api/submissions/[id]/download.ts
// GET /api/submissions/:id/download
// Streams pre-packaged zip from R2.
// If package isn't ready yet, returns 202 with status.

export async function onRequestGet({ request, env, params }) {
  // Auth
  const session = getCookieValue(request, 'submoa_session');
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const user = await env.submoacontent_db.prepare(
    `SELECT id, account_id FROM users
     WHERE id = (SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?)
     LIMIT 1`
  ).bind(session, Date.now()).first();

  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { id } = params;

  // Fetch submission — confirm ownership and package status
  const sub = await env.submoacontent_db.prepare(
    `SELECT id, topic, package_status, zip_url, account_id
     FROM submissions
     WHERE id = ? AND account_id = ?`
  ).bind(id, user.account_id).first();

  if (!sub) return json({ error: 'Not found' }, 404);

  // Package not ready yet
  if (sub.package_status !== 'ready') {
    return json({
      error: 'Package not ready',
      package_status: sub.package_status ?? 'pending',
      message: sub.package_status === 'packaging'
        ? 'Your package is being prepared. Check back in a moment.'
        : 'Your article has not been packaged yet.',
    }, 202);
  }

  // Fetch files from R2 and build zip on the fly
  // (zip is small — HTML + DOCX + JSON, typically <500KB)
  const basePath = `packages/${id}`;

  const [htmlObj, docxObj, metaObj] = await Promise.all([
    env.SUBMOA_IMAGES.get(`${basePath}/article.html`),
    env.SUBMOA_IMAGES.get(`${basePath}/article.docx`),
    env.SUBMOA_IMAGES.get(`${basePath}/meta.json`),
  ]);

  if (!htmlObj) {
    return json({ error: 'Package files not found in storage' }, 404);
  }

  // Build zip from R2 objects
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  zip.file('article.html', await htmlObj.arrayBuffer());
  if (docxObj) zip.file('article.docx', await docxObj.arrayBuffer());
  if (metaObj) zip.file('meta.json', await metaObj.text());

  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });

  // Slug the filename from the topic
  const slug = (sub.topic ?? 'article')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  return new Response(zipBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${slug}.zip"`,
      'Content-Length': String(zipBuffer.byteLength),
    },
  });
}

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
