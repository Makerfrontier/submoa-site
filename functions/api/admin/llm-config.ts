import { json, getSessionUser, isAdmin } from '../_utils';

// GET  /api/admin/llm-config — return all three slots
// POST /api/admin/llm-config — update all three slots atomically
export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (!isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  if (context.request.method === 'GET') {
    try {
      const result = await context.env.submoacontent_db
        .prepare(`SELECT slot, model_string, display_name, descriptor, warning_badge, is_active, updated_at
                  FROM llm_config ORDER BY slot ASC`)
        .all();
      return json({ slots: result.results || [] });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  if (context.request.method === 'POST') {
    try {
      const body = await context.request.json();
      const slots = Array.isArray(body?.slots) ? body.slots : body;

      if (!Array.isArray(slots) || slots.length !== 3) {
        return json({ error: 'Must provide exactly three slots' }, 400);
      }

      const slotNums = new Set();
      for (const s of slots) {
        const slotNum = Number(s?.slot);
        if (![1, 2, 3].includes(slotNum)) {
          return json({ error: `Invalid slot number: ${s?.slot}` }, 400);
        }
        if (slotNums.has(slotNum)) {
          return json({ error: `Duplicate slot: ${slotNum}` }, 400);
        }
        slotNums.add(slotNum);
        if (!s.model_string || !String(s.model_string).trim()) {
          return json({ error: `Slot ${slotNum}: model_string required` }, 400);
        }
        // display_name is optional — falls back to model_string in the UI
      }

      const stmts = slots.map(s =>
        context.env.submoacontent_db
          .prepare(`UPDATE llm_config
                    SET model_string = ?, display_name = ?, descriptor = ?, warning_badge = ?, updated_at = unixepoch()
                    WHERE slot = ?`)
          .bind(
            String(s.model_string).trim(),
            s.display_name ? String(s.display_name).trim() : '',
            String(s.descriptor ?? '').trim(),
            s.warning_badge ? String(s.warning_badge).trim() : null,
            Number(s.slot),
          )
      );
      await context.env.submoacontent_db.batch(stmts);

      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}
