// Shared notification helper — called from queue-consumer and endpoints.
// Silent-fail by design: a notification write must never break the main
// pipeline. The notifications table carries both legacy columns
// (user_id, message, is_read) and the new spec columns (title, body, read),
// so we dual-write where possible to keep the old NotificationBell working.

export async function createNotification(
  env: any,
  accountId: string,
  type: string,
  title: string,
  body?: string,
  link?: string,
): Promise<any> {
  try {
    const id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');

    // Legacy schema requires user_id (not null) + message (not null). We fill
    // user_id with the account_id so old queries still resolve, and compose
    // `message` from title + body so the legacy bell keeps rendering.
    const message = body ? `${title} — ${body}` : title;

    await env.submoacontent_db.prepare(
      `INSERT INTO notifications (id, user_id, account_id, type, title, body, message, link, read, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, unixepoch())`
    ).bind(id, accountId, accountId, type, title, body || null, message, link || null).run();

    return { id, account_id: accountId, type, title, body, link, read: 0 };
  } catch (e) {
    console.error('[notifications] createNotification failed:', e);
    return null;
  }
}
