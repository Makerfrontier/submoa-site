import { getSessionUser, json } from '../../../_utils';
import type { Env } from '../../../_utils';

// POST /api/atomic/comp/:id/export — HTML/PDF export. Phase 4 implements
// the real render; Phase 1 returns 501 so callers can discover the endpoint
// exists and wire buttons.
export async function onRequestPost(context: { request: Request; env: Env; params: { id?: string } }) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  return json({
    error: 'Export not yet implemented',
    code: 'phase_4_pending',
    note: 'Block renderers ship in Phase 2; the HTML exporter composes them in Phase 4.',
  }, 501);
}
