import { deleteSessionCookie } from '../_utils';

export async function onRequestPost(context: any) {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': deleteSessionCookie(),
    }
  });
}