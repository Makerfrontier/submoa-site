import { json, getSessionUser, Env } from '../../_utils';
import { handleGradeAll } from '../../routes/grade';

export async function onRequest(context: { request: Request, env: Env, waitUntil: (p: Promise<any>) => void }) {
  // Admin only — but also allow cron trigger via CRON_SECRET header
  const user = await getSessionUser(context.request, context.env);
  const cronSecret = context.request.headers.get('x-cron-secret');
  const validCronSecret = context.env.CRON_SECRET && cronSecret === context.env.CRON_SECRET;
  
  if (!user && !validCronSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (context.request.method === 'POST') {
    return handleGradeAll(context.request, context.env as any);
  }

  return json({ error: 'Method not allowed' }, 405);
}
