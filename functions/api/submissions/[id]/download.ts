// functions/api/submissions/[id]/download.ts
// GET /api/submissions/:id/download
// Builds zip from unified project folder (real files + placeholders).
// Always available — project folder is created on submission.

import JSZip from 'jszip';
import { listProjectFiles } from '../../../../src/project-template';

export async function onRequestGet({ request, env, params }) {
  // Auth
  const session = getCookieValue(request, 'submoa_session');
  if (!session) return jsonResp({ error: 'Unauthorized' }, 401);

  const user = await env.submoacontent_db.prepare(
    `SELECT id, account_id FROM users
     WHERE id = (SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?)
     LIMIT 1`
  ).bind(session, Date.now()).first();

  if (!user) return jsonResp({ error: 'Unauthorized' }, 401);

  const { id } = params;

  // Verify ownership
  const sub = await env.submoacontent_db.prepare(
    `SELECT id, topic FROM submissions WHERE id = ? AND account_id = ?`
  ).bind(id, user.account_id).first<{ id: string; topic: string }>();

  if (!sub) return jsonResp({ error: 'Not found' }, 404);

  // Try unified project folder first (new), fall back to legacy packages/ path
  const files = await listProjectFiles(env, id);
  const zip = new JSZip();

  if (files.length > 0) {
    // New path: projects/{id}/folder/file
    const fetchPromises = files.map(async (file) => {
      const obj = await env.SUBMOA_IMAGES.get(file.key);
      if (!obj) return;
      const buffer = await obj.arrayBuffer();
      zip.file(`${file.folder}/${file.filename}`, buffer);
    });
    await Promise.all(fetchPromises);
  } else {
    // Legacy path: packages/{id}/article.html + article.docx + meta.json
    const basePath = `packages/${id}`;
    const [htmlObj, docxObj, metaObj, audioObj] = await Promise.all([
      env.SUBMOA_IMAGES.get(`${basePath}/article.html`),
      env.SUBMOA_IMAGES.get(`${basePath}/article.docx`),
      env.SUBMOA_IMAGES.get(`${basePath}/meta.json`),
      env.SUBMOA_IMAGES.get(`${basePath}/audio.mp3`),
    ]);
    if (!htmlObj) return jsonResp({ error: 'Package files not found in storage' }, 404);
    zip.file('article/article.html', await htmlObj.arrayBuffer());
    if (docxObj) zip.file('article/article.docx', await docxObj.arrayBuffer());
    if (metaObj) zip.file('seo/meta.json', await metaObj.arrayBuffer());
    if (audioObj) zip.file('audio/audio.mp3', await audioObj.arrayBuffer());
  }

  const zipBuffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const safeTopic = (sub.topic ?? id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  return new Response(zipBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeTopic}-${id.slice(0, 8)}.zip"`,
      'Content-Length': String(zipBuffer.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}

function jsonResp(data: unknown, status = 200) {
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
