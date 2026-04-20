import { getSessionUser, json } from '../_utils';
import type { Env } from '../_utils';
import puppeteer from '@cloudflare/puppeteer';

// POST /api/comp-studio/export-jpg
// Renders the supplied HTML via Cloudflare Browser Rendering and returns
// a JPEG screenshot. export_type selects the viewport.
const VIEWPORTS: Record<string, { width: number; height: number }> = {
  full:   { width: 1440, height: 900 },
  mobile: { width: 390,  height: 844 },
  social: { width: 1200, height: 630 },
  hero:   { width: 1200, height: 400 },
};
// Retina-equivalent render so comps look sharp on high-DPI displays.
// Doubles the pixel output without changing the CSS viewport.
const DEVICE_SCALE_FACTOR = 2;

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  if (!env.BROWSER) return json({ error: 'BROWSER binding not configured' }, 500);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const html = String(body.html_content || '');
  const exportType = String(body.export_type || 'full');
  if (!html) return json({ error: 'html_content is required' }, 400);

  const viewport = VIEWPORTS[exportType];
  if (!viewport) return json({ error: `Unknown export_type: ${exportType}` }, 400);

  let browser: any;
  try {
    browser = await puppeteer.launch(env.BROWSER as any);
    const page = await browser.newPage();
    await page.setViewport({ ...viewport, deviceScaleFactor: DEVICE_SCALE_FACTOR });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 95, fullPage: exportType === 'full' });
    await browser.close();

    return new Response(screenshot as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="comp-${exportType}.jpg"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    try { if (browser) await browser.close(); } catch {}
    return json({ error: `Browser Rendering failed: ${err?.message || err}` }, 500);
  }
}
