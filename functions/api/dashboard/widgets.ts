// GET /api/dashboard/widgets — returns the user's widget config, or the
// default 6-widget arrangement if they've never customized.
// PUT /api/dashboard/widgets — replaces the user's config wholesale.
//
// The config JSON is opaque to the server — the widget registry lives
// client-side, and invalid ids just become non-renders. This keeps adding
// new widget types a pure front-end change.

import { getSessionUser, json } from '../_utils';

const DEFAULT_CONFIG = {
  widgets: [
    { id: 'stat-strip',       enabled: true, order: 0, size: 'col-12 h-auto' },
    { id: 'quick-generate',   enabled: true, order: 1, size: 'col-12 h-auto' },
    { id: 'recent-articles',  enabled: true, order: 2, size: 'col-6 h-340'  },
    { id: 'quark-cast',       enabled: true, order: 3, size: 'col-6 h-340'  },
    { id: 'atomic-flash',     enabled: true, order: 4, size: 'col-4 h-280'  },
    { id: 'morning-brief',    enabled: true, order: 5, size: 'col-4 h-280'  },
    { id: 'activity',         enabled: true, order: 6, size: 'col-4 h-280'  },
  ],
};

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  if (request.method === 'GET') {
    const row: any = await env.submoacontent_db
      .prepare(`SELECT config FROM dashboard_widget_configs WHERE user_id = ?`)
      .bind(user.id).first();
    if (!row) return json(DEFAULT_CONFIG);
    try {
      const parsed = JSON.parse(row.config);
      if (!parsed || !Array.isArray(parsed.widgets)) return json(DEFAULT_CONFIG);
      return json(parsed);
    } catch {
      return json(DEFAULT_CONFIG);
    }
  }

  if (request.method === 'PUT') {
    const body: any = await request.json().catch(() => ({}));
    if (!body || !Array.isArray(body.widgets)) return json({ error: 'widgets array required' }, 400);
    const json_str = JSON.stringify({ widgets: body.widgets });
    const now = Math.floor(Date.now() / 1000);
    const existing: any = await env.submoacontent_db
      .prepare(`SELECT user_id FROM dashboard_widget_configs WHERE user_id = ?`)
      .bind(user.id).first();
    if (existing) {
      await env.submoacontent_db.prepare(
        `UPDATE dashboard_widget_configs SET config = ?, updated_at = ? WHERE user_id = ?`
      ).bind(json_str, now, user.id).run();
    } else {
      await env.submoacontent_db.prepare(
        `INSERT INTO dashboard_widget_configs (user_id, config, updated_at) VALUES (?, ?, ?)`
      ).bind(user.id, json_str, now).run();
    }
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
