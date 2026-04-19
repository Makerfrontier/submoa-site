import { json } from '../../_utils';
import { requireAdmin, ensureSeeded } from './_shared';

// POST /api/admin/brand-bible/seed — idempotent seed of v1 locked config.
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;
  await ensureSeeded(context.env);
  return json({ ok: true });
}
