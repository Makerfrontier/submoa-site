import { json, getSessionUser, Env } from '../_utils';
import { articleDeliveryEmail, sendEmail } from '../_email-templates';

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
    const { submission_id, email, name, topic } = await context.request.json();

    if (!submission_id || !email || !topic) {
      return json({ error: 'Missing required fields' }, 400);
    }

    // Build dashboard URL - user views/downloads article from dashboard
    const dashboardUrl = `${new URL(context.request.url).origin}/dashboard`;

    const { subject, html } = articleDeliveryEmail({
      name: name || 'there',
      topic,
      downloadUrl: dashboardUrl, // dashboard has view + download
      dashboardUrl,
    });

    await sendEmail(context.env, { to: email, subject, html });

    return json({ ok: true });
  } catch (err: any) {
    console.error('Delivery notification failed:', err.message);
    return json({ error: err.message || 'Server error' }, 500);
  }
}
