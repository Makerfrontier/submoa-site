// POST /api/admin/templates/:id/capture  { url }
// Admin-only. Headless browser renders the target URL AS THE CURRENT ADMIN
// (submoa_session cookie is forwarded to the Puppeteer page), waits for the
// app shell to settle, pulls page.content(), runs stripAndClean, writes the
// cleaned HTML back to the template's r2_key.
import { getSessionUser, isAdmin, json } from '../../../_utils';
import { stripAndClean } from '../../../../../src/comp-utils';
import puppeteer from '@cloudflare/puppeteer';

// Extract the submoa_session cookie value off the incoming request so we can
// forward it to the headless browser.
function getSubmoaSession(request: Request): string | null {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/submoa_session=([^;]+)/);
  return m ? m[1] : null;
}

export async function onRequest(context: { request: Request; env: any; params: { id?: string } }) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (!isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  if (!env.BROWSER) return json({ error: 'BROWSER binding not configured' }, 500);

  const id = String(params.id || '').trim();
  if (!id) return json({ error: 'Missing template id' }, 400);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const url = String(body.url || '').trim();
  if (!url) return json({ error: 'url required' }, 400);
  if (!/^https?:\/\//.test(url)) return json({ error: 'url must start with http:// or https://' }, 400);

  const row: any = await env.submoacontent_db
    .prepare('SELECT id, r2_key FROM html_templates WHERE id = ?')
    .bind(id).first();
  if (!row) return json({ error: 'Template not found' }, 404);

  const sessionToken = getSubmoaSession(request);
  if (!sessionToken) console.warn('[capture] no submoa_session on incoming request — capture may hit login gate');

  let browser: any = null;
  let capturedHtml = '';
  try {
    browser = await puppeteer.launch(env.BROWSER as any);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Forward the admin's session cookie to the headless browser so the
    // navigation lands on the authenticated page, not the login gate.
    if (sessionToken) {
      let targetHost = '';
      try { targetHost = new URL(url).hostname; } catch {}
      if (targetHost) {
        await page.setCookie({
          name: 'submoa_session',
          value: sessionToken,
          domain: targetHost,
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
        });
      }
    }

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait for the React app shell to settle before scraping content. Prefer
    // a specific selector; fall back to a 2-second pause if the selector
    // never appears (some pages don't use any of these wrappers).
    try {
      await page.waitForSelector('main, .main-content, #root > div', { timeout: 5000 });
    } catch {
      // swallow — we'll still wait 2s below
    }
    try {
      // @cloudflare/puppeteer exposes waitForTimeout in older builds; fall
      // back to a plain promise if it's unavailable.
      if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(2000);
      else await new Promise((r) => setTimeout(r, 2000));
    } catch {}

    capturedHtml = await page.content();
    await browser.close();
    browser = null;
  } catch (e: any) {
    try { if (browser) await browser.close(); } catch {}
    return json({ error: `Browser render failed: ${e?.message || e}` }, 502);
  }

  let cleaned = capturedHtml;
  try { cleaned = stripAndClean(capturedHtml); } catch (e) { console.error('[capture] stripAndClean threw:', e); }

  try {
    await env.SUBMOA_IMAGES.put(row.r2_key, cleaned, {
      httpMetadata: { contentType: 'text/html; charset=utf-8' },
    });
  } catch (e: any) {
    return json({ error: `R2 write failed: ${e?.message || e}` }, 500);
  }

  try {
    await env.submoacontent_db
      .prepare('UPDATE html_templates SET stripped_at = ?, updated_at = unixepoch() WHERE id = ?')
      .bind(Math.floor(Date.now() / 1000), id).run();
  } catch {}

  return json({ success: true, html_content: cleaned, length: cleaned.length, used_session: !!sessionToken });
}
