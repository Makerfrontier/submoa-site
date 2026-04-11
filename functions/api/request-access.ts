import { json, generateId, Env } from './_utils';

export async function onRequest(context: { request: Request; env: Env }) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const { name, email } = await context.request.json();

    if (!name || !email) {
      return json({ error: 'Name and email are required' }, 400);
    }

    // Store the access request in D1
    const id = generateId();
    const now = Date.now();

    try {
      await context.env.submoacontent_db
        .prepare('INSERT INTO access_requests (id, name, email, status, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(id, name, email.toLowerCase(), 'pending', now)
        .run();
    } catch (_) {
      // Table might not exist yet — non-fatal
    }

    // Notify Ben via Discord
    try {
      const discordPayload = {
        embeds: [{
          title: `Access Request`,
          color: 0xb8922e,
          fields: [
            { name: 'Name', value: name, inline: true },
            { name: 'Email', value: email, inline: true },
          ],
          description: `Someone is requesting access to SubMoa Content. Generate an invite link and send it to them.`,
          footer: { text: 'SubMoa Content — Access Request' },
          timestamp: new Date().toISOString(),
        }],
      };

      await fetch(context.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload),
      });
    } catch (_) {
      // Discord notification is non-blocking
    }

    return json({ ok: true }, 201);
  } catch (err: any) {
    return json({ error: err.message || 'Server error' }, 500);
  }
}
