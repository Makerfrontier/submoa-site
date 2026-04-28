import { Env, requireAuth, generateId, json } from '../../_utils';
import { parseEmail } from '../../../../src/lib/atomic-email/parser';

interface CreateBody {
  source_html: string;
  source_filename?: string;
  name?: string;
}

const MAX_HTML_SIZE = 2 * 1024 * 1024; // 2MB raw HTML — comfortable for any newsletter

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const html = String(body.source_html || '');
  if (!html.trim()) return json({ error: 'source_html required' }, 400);
  if (html.length > MAX_HTML_SIZE) return json({ error: `source_html exceeds ${MAX_HTML_SIZE} bytes` }, 413);

  let parsed;
  try {
    parsed = parseEmail(html);
  } catch (e: any) {
    return json({ error: `parse failed: ${e?.message || e}` }, 422);
  }

  const id = generateId();
  const now = Date.now();
  const name = (body.name?.trim()) || (body.source_filename?.replace(/\.html?$/i, '')) || 'Untitled';

  await env.submoacontent_db.prepare(
    `INSERT INTO atomic_email_projects (
      id, user_id, name, source_html, current_html, parsed_fields_json, source_filename, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    user.id,
    name,
    html,
    parsed.source_html_template,
    JSON.stringify(parsed.fields),
    body.source_filename || null,
    now,
    now,
  ).run();

  return json({
    id,
    name,
    fields: parsed.fields,
    current_html: parsed.source_html_template,
    field_count: parsed.fields.length,
  });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '24'), 60);

  const rows = await env.submoacontent_db.prepare(
    `SELECT id, name, source_filename, created_at, updated_at,
            length(parsed_fields_json) AS fields_size
     FROM atomic_email_projects
     WHERE user_id = ?
     ORDER BY updated_at DESC
     LIMIT ?`
  ).bind(user.id, limit).all();

  return json({ projects: rows.results || [] });
};
