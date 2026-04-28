import { Env, requireAuth, json } from '../_utils';
import { generateAltText } from '../../../src/lib/atomic-email/alt-text-generator';

interface Body { image_url?: string; project_id?: string; field_id?: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  if (!env.OPENROUTER_API_KEY) return json({ error: 'OPENROUTER_API_KEY not set' }, 500);

  const body = (await request.json().catch(() => ({}))) as Body;
  const url = String(body.image_url || '').trim();
  if (!url) return json({ error: 'image_url required' }, 400);
  if (/^data:/i.test(url)) return json({ error: 'data URIs not supported — paste a public URL' }, 400);

  // TODO(credits-system): when the credits ledger lands, deduct 1 credit ($0.10)
  // here. Refund on thrown error below.
  try {
    const result = await generateAltText({ OPENROUTER_API_KEY: env.OPENROUTER_API_KEY }, url);
    return json({ alt_text: result.alt_text, cost_cents: 10, fetched_bytes: result.fetched_bytes });
  } catch (e: any) {
    return json({ error: e?.message || 'generation failed' }, 502);
  }
};
