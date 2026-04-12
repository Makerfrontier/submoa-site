export default {
  async fetch() {
    return new Response('submissions-test works!', { headers: { 'Content-Type': 'text/plain' } });
  }
};
