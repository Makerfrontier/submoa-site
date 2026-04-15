// DELETE /api/email-templates/:id

import { getSessionUser, json } from "../_utils";

export async function onRequestDelete(context: any) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const id = context.params.id;
  const row = await context.env.submoacontent_db
    .prepare("SELECT id FROM email_templates WHERE id = ? AND account_id = ?")
    .bind(id, user.account_id || "makerfrontier")
    .first<{ id: string }>();
  if (!row) return json({ error: "Not found" }, 404);

  await context.env.submoacontent_db
    .prepare("DELETE FROM email_templates WHERE id = ?")
    .bind(id)
    .run();

  return json({ ok: true });
}
