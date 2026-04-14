import { getSessionUser, isAdmin } from '../_utils';

export async function onRequestGet(context) {
  const user = await getSessionUser(context.request, context.env);
  if (!isAdmin(user)) return new Response('Forbidden', { status: 403 });

  return Response.json({
    hasOpenRouter: !!context.env.OPENROUTER_API_KEY,
    keyLength: context.env.OPENROUTER_API_KEY?.length ?? 0,
    hasDataForSEO: !!context.env.DATAFORSEO_LOGIN,
  });
}