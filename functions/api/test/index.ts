export default {
  async fetch(request: Request) {
    return new Response('API test function working!', {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
