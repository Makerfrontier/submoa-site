import { json, getSessionUser } from '../_utils';

// POST /api/images/upload
// Accepts multipart form data with file and submission_id fields
// Uploads to R2 with key: articles/[submission_id]/[filename]
// Returns { url: "/api/images/[submission_id]/[filename]" }
export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  try {
    const formData = await context.request.formData();
    const file = formData.get('file');
    const submissionId = formData.get('submission_id');

    if (!file || !(file instanceof File)) {
      return json({ error: 'No file provided' }, 400);
    }
    if (!submissionId || typeof submissionId !== 'string') {
      return json({ error: 'submission_id is required' }, 400);
    }

    const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `articles/${submissionId}/${filename}`;

    const arrayBuffer = await file.arrayBuffer();

    await context.env.SUBMOA_IMAGES.put(key, arrayBuffer, {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream',
      },
    });

    const url = `/api/images/serve?path=${key}`;
    return json({ success: true, url });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
