export default {
  async fetch() {
    return new Response('NEW endpoint in submissions-moved!', { headers: { 'Content-Type': 'text/plain' } });
  }
};
