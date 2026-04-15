// GET  /api/email-templates  → list templates for current account
// POST /api/email-templates  → save a new template

import { getSessionUser, generateId, json } from "../_utils";

export async function onRequestGet(context: any) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { results } = await context.env.submoacontent_db.prepare(
    `SELECT * FROM email_templates WHERE account_id = ? ORDER BY updated_at DESC`
  ).bind(user.account_id || "makerfrontier").all();

  return json({ templates: results || [] });
}

export async function onRequestPost(context: any) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const t = await context.request.json();
  if (!t?.template_name || !t?.template_type) {
    return json({ error: "template_name and template_type are required" }, 400);
  }

  const id = generateId();
  const now = Date.now();
  await context.env.submoacontent_db.prepare(
    `INSERT INTO email_templates
      (id, account_id, template_name, template_type, subject_line, preheader_text,
       brand_name, primary_color, secondary_color, brand_voice, logo_url,
       cta_text, cta_url, unsubscribe_url, company_address, sections,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    user.account_id || "makerfrontier",
    t.template_name,
    t.template_type,
    t.subject_line || null,
    t.preheader_text || null,
    t.brand_name || null,
    t.primary_color || null,
    t.secondary_color || null,
    t.brand_voice || null,
    t.logo_url || null,
    t.cta_text || null,
    t.cta_url || null,
    t.unsubscribe_url || null,
    t.company_address || null,
    t.sections ? (typeof t.sections === "string" ? t.sections : JSON.stringify(t.sections)) : null,
    now, now
  ).run();

  return json({ ok: true, id }, 201);
}
