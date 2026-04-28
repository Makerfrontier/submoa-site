import { Env, requireAuth, json } from '../../_utils';
import type { Field } from '../../../../src/lib/atomic-email/field-types';
import { renderTemplate } from '../../../../src/lib/atomic-email/templater';

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const id = String(params.id || '');
  if (!id) return json({ error: 'id required' }, 400);

  const row: any = await env.submoacontent_db.prepare(
    `SELECT id, name, source_html, current_html, parsed_fields_json, source_filename, created_at, updated_at
     FROM atomic_email_projects WHERE id = ? AND user_id = ?`
  ).bind(id, user.id).first();
  if (!row) return json({ error: 'not found' }, 404);

  let fields: Field[] = [];
  try { fields = JSON.parse(row.parsed_fields_json || '[]'); } catch {}
  return json({
    id: row.id,
    name: row.name,
    source_filename: row.source_filename,
    fields,
    current_html: row.current_html,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
};

interface PatchBody {
  fields?: Field[];
  name?: string;
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const id = String(params.id || '');
  if (!id) return json({ error: 'id required' }, 400);

  const body = (await request.json().catch(() => ({}))) as PatchBody;

  const row: any = await env.submoacontent_db.prepare(
    `SELECT current_html, parsed_fields_json FROM atomic_email_projects WHERE id = ? AND user_id = ?`
  ).bind(id, user.id).first();
  if (!row) return json({ error: 'not found' }, 404);

  // The DB's current_html column stores the parser-emitted TEMPLATE (with
  // ae:open/close markers + data-ae-* attrs). Re-render against incoming
  // fields, persist the rendered template + new field list. Markers stay in
  // place so subsequent edits don't compound.
  let updatedHtml: string = row.current_html;
  let updatedFields: Field[] | null = null;
  if (Array.isArray(body.fields)) {
    updatedHtml = renderTemplate(row.current_html, body.fields);
    updatedFields = body.fields;
  }

  const sets: string[] = [];
  const vals: any[] = [];
  if (updatedFields) {
    sets.push('parsed_fields_json = ?');
    vals.push(JSON.stringify(updatedFields));
    sets.push('current_html = ?');
    vals.push(updatedHtml);
  }
  if (typeof body.name === 'string') {
    sets.push('name = ?');
    vals.push(body.name.slice(0, 200));
  }
  sets.push('updated_at = ?');
  vals.push(Date.now());
  vals.push(id);
  vals.push(user.id);

  if (sets.length === 1) return json({ error: 'no updates' }, 400);

  await env.submoacontent_db.prepare(
    `UPDATE atomic_email_projects SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`
  ).bind(...vals).run();

  return json({
    id,
    current_html: updatedHtml,
    fields: updatedFields,
  });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const id = String(params.id || '');
  if (!id) return json({ error: 'id required' }, 400);
  await env.submoacontent_db.prepare(
    `DELETE FROM atomic_email_projects WHERE id = ? AND user_id = ?`
  ).bind(id, user.id).run();
  return json({ ok: true });
};
