export default {
  async fetch() {
    return new Response('NEW TEST 123 - completely fresh endpoint!', { 
      headers: { 'Content-Type': 'text/plain' } 
    });
  }
};
