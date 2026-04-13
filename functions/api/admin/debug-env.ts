export async function onRequestGet(context) {
  return Response.json({
    hasOpenRouter: !!context.env.OPENROUTER_API_KEY,
    keyLength: context.env.OPENROUTER_API_KEY?.length ?? 0,
    hasDataForSEO: !!context.env.DATAFORSEO_LOGIN,
  });
}