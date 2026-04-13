import { json, getSessionUser, Env } from '../../_utils';
import { handleGradeArticle, handleGetGrade } from '../../routes/grade';

export async function onRequest(context: { request: Request, env: Env, waitUntil: (p: Promise<any>) => void }) {
  // Admin only
  const user = await getSessionUser(context.request, context.env);
  if (!user || user.role !== 'admin') {
    return json({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(context.request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // /api/admin/grading/:id → pathParts = ['api', 'admin', 'grading', ':id']
  const id = pathParts[pathParts.length - 1];

  if (context.request.method === 'POST') {
    return handleGradeArticle(context.request, context.env as any, id);
  } else if (context.request.method === 'GET') {
    return handleGetGrade(context.request, context.env as any, id);
  }

  return json({ error: 'Method not allowed' }, 405);
}
