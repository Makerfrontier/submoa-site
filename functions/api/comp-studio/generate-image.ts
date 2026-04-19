import { getSessionUser, json, generateId } from '../_utils';
import type { Env } from '../_utils';
import { PROMPT_WRAPPERS } from '../../../src/comp-utils';

// POST /api/comp-studio/generate-image
// Two-step: wrap user style direction via imagePromptWrapper → call OpenRouter
// (google/gemini-2.5-flash) for a fal.ai-ready prompt string; then call
// fal.ai fal-ai/flux/schnell with that prompt. Store output at
// projects/comp-studio/{account_id}/generated/{uuid}.jpg and return a URL
// served by /api/comp-studio/image/[filename].
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

  if (!env.FALAI_API_KEY) {
    return json({ error: 'FALAI_API_KEY not configured' }, 500);
  }

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const category = String(body.category || 'general').slice(0, 80);
  const adSize = String(body.adSize || '').slice(0, 20);
  const adLabel = String(body.adLabel || 'Custom').slice(0, 80);
  const userDirection = String(body.userDirection || '').slice(0, 2000);

  const sizeMatch = adSize.match(/^(\d{2,4})x(\d{2,4})$/i);
  if (!sizeMatch) return json({ error: 'adSize must be WxH, e.g. 728x90' }, 400);
  const width = parseInt(sizeMatch[1], 10);
  const height = parseInt(sizeMatch[2], 10);

  if (!env.OPENROUTER_API_KEY) {
    console.error('[generate-image] OPENROUTER_API_KEY missing');
    return json({ error: 'OPENROUTER_API_KEY not configured on this deployment' }, 500);
  }

  console.log(`[generate-image] request adSize=${adSize} adLabel=${adLabel} category=${category} direction_chars=${userDirection.length}`);

  const account_id = user.account_id || 'makerfrontier';

  // Step 1 — wrap + generate the fal prompt string.
  const messages = PROMPT_WRAPPERS.imagePromptWrapper({ category, adSize, adLabel, userDirection });
  let promptUsed = '';
  try {
    const promptRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Comp Studio',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 500,
        messages,
      }),
    });
    if (!promptRes.ok) {
      const errBody = await promptRes.text().catch(() => '');
      console.error(`[generate-image] OpenRouter HTTP ${promptRes.status}:`, errBody.slice(0, 800));
      return json({ error: `Prompt wrapper failed: OpenRouter HTTP ${promptRes.status}`, detail: errBody.slice(0, 300) }, 502);
    }
    const data: any = await promptRes.json();
    promptUsed = (data?.choices?.[0]?.message?.content ?? '').trim();
    if (!promptUsed) {
      console.error('[generate-image] OpenRouter returned empty prompt, data:', JSON.stringify(data).slice(0, 500));
      return json({ error: 'OpenRouter returned an empty prompt' }, 502);
    }
    console.log(`[generate-image] prompt generated (${promptUsed.length} chars)`);
  } catch (err: any) {
    console.error('[generate-image] prompt step threw:', err?.stack || err);
    return json({ error: `Prompt generation failed: ${err?.message || err}` }, 500);
  }

  // Step 2 — call fal.ai fal-ai/flux/schnell synchronously (sync endpoint).
  let imageBuffer: ArrayBuffer;
  let contentType = 'image/jpeg';
  try {
    const falRes = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${env.FALAI_API_KEY}`,
      },
      body: JSON.stringify({
        prompt: promptUsed,
        image_size: { width, height },
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: true,
      }),
    });
    if (!falRes.ok) {
      const errBody = await falRes.text().catch(() => '');
      console.error(`[generate-image] fal.ai HTTP ${falRes.status}:`, errBody.slice(0, 800));
      return json({ error: `fal.ai HTTP ${falRes.status}`, detail: errBody.slice(0, 300) }, 502);
    }
    const falData: any = await falRes.json();
    const imgUrl = falData?.images?.[0]?.url;
    if (!imgUrl) {
      console.error('[generate-image] fal.ai missing images[0].url, response:', JSON.stringify(falData).slice(0, 500));
      return json({ error: 'fal.ai response missing images[0].url', detail: JSON.stringify(falData).slice(0, 300) }, 502);
    }
    console.log(`[generate-image] fal.ai returned URL, fetching ${imgUrl.slice(0, 100)}…`);

    const imgRes = await fetch(imgUrl);
    if (!imgRes.ok) {
      console.error(`[generate-image] image fetch from fal.ai CDN failed: ${imgRes.status}`);
      return json({ error: `Image fetch HTTP ${imgRes.status}` }, 502);
    }
    imageBuffer = await imgRes.arrayBuffer();
    contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    console.log(`[generate-image] image fetched ${imageBuffer.byteLength} bytes, contentType=${contentType}`);
  } catch (err: any) {
    console.error('[generate-image] fal.ai step threw:', err?.stack || err);
    return json({ error: `fal.ai generation failed: ${err?.message || err}` }, 500);
  }

  // Step 3 — store in R2 under account-scoped namespace.
  const uuid = generateId();
  const filename = `${uuid}.jpg`;
  const r2Key = `projects/comp-studio/${account_id}/generated/${filename}`;
  try {
    // Await the R2 put fully before returning the URL so the frontend never
    // hits a 404 on the image_url it just received.
    await env.SUBMOA_IMAGES.put(r2Key, imageBuffer, {
      httpMetadata: { contentType },
      customMetadata: {
        account_id,
        user_id: user.id,
        prompt: promptUsed.slice(0, 2000),
        ad_size: adSize,
        ad_label: adLabel,
        created_at: String(Date.now()),
      },
    });
    console.log(`[generate-image] R2 write complete: ${r2Key}`);
  } catch (err: any) {
    console.error('[generate-image] R2 write threw:', err?.stack || err);
    return json({ error: `R2 write failed: ${err?.message || err}` }, 500);
  }

  return json({
    image_url: `/api/comp-studio/image/${filename}`,
    prompt_used: promptUsed,
    size_bytes: imageBuffer.byteLength,
  });
}
