export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const file = url.searchParams.get('file') || 'test';
    return new Response(`DL function working! File: ${file}`, {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
