// GET /api/images/serve?path=articles/[submissionId]/[filename]
// Serves image from R2 bucket
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

  if (context.request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(context.request.url);
  const path = url.searchParams.get('path');
  if (!path) return new Response('path parameter required', { status: 400 });

  const key = path.startsWith('articles/') ? path : `articles/${path}`;

  try {
    const object = await context.env.SUBMOA_IMAGES.get(key);
    if (!object) return new Response('Not found', { status: 404 });

    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=31536000');
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(object.body, { headers });
  } catch (e) {
    return new Response('Error fetching image', { status: 500 });
  }
}
