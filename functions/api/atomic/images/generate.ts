import { getSessionUser, json } from '../../_utils';

// POST /api/atomic/images/generate — super_admin only.
// Image mode → OpenRouter (Gemini 2.5 Flash Image), aspect ratio configurable
// and multimodal remix supported (source image attached to the user message).
// Brand mode → Ideogram V_2, always 1:1. Returns raw image bytes on success,
// JSON error on failure. Caller turns the binary response into a blob URL.

export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  if (!((user as any).super_admin || user.role === 'super_admin')) return json({ error: 'Forbidden' }, 403);

  const body: any = await context.request.json().catch(() => ({}));
  const prompt = String(body?.prompt || '').trim();
  if (!prompt) return json({ error: 'prompt required' }, 400);
  const mode = body?.mode === 'brand' ? 'brand' : 'image';
  const aspectRatio = String(body?.aspectRatio || '1:1').slice(0, 16);
  // Optional remix source: when present, the generation runs as an image-to-
  // image iteration (Gemini multimodal input for image mode, Ideogram remix
  // endpoint for brand mode). Strip any data: prefix the client happens to
  // include so base64 decoding downstream is uniform.
  const remixImageBase64 = typeof body?.remixImageBase64 === 'string' && body.remixImageBase64.length > 0
    ? body.remixImageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '')
    : null;
  // Refine mode: caller sends only what they want changed plus the iteration's
  // original prompt (as `prompt`). Server composes the final prompt so the
  // template is consistent across clients.
  const refineInstruction = typeof body?.refineInstruction === 'string' && body.refineInstruction.trim()
    ? String(body.refineInstruction).trim().slice(0, 2000)
    : null;
  const effectivePrompt = refineInstruction
    ? `Modify the following image prompt based on this instruction:\nInstruction: ${refineInstruction}\nOriginal prompt: ${prompt}`
    : prompt;

  try {
    let result: { buffer: ArrayBuffer; contentType: string };
    if (mode === 'brand') {
      result = remixImageBase64
        ? await remixViaIdeogram(context.env, effectivePrompt, remixImageBase64)
        : await generateViaIdeogram(context.env, effectivePrompt);
    } else {
      result = await generateViaOpenRouter(context.env, effectivePrompt, aspectRatio, remixImageBase64);
    }

    return new Response(result.buffer, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return json({ error: e?.message || 'Generation failed' }, 500);
  }
}

// Mirror of src/cover-art-generator.ts generateCoverArt with a dynamic
// aspect_ratio so the same Gemini endpoint can produce any of the 6 ratios.
// When remixBase64 is supplied, the user message carries both the prompt
// text and the source image using the OpenAI-compatible multimodal shape
// — Gemini treats the supplied image as a starting point to iterate on
// rather than producing an independent image.
async function generateViaOpenRouter(env: any, prompt: string, aspectRatio: string, remixBase64: string | null): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');

  const userContent: any = remixBase64
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${remixBase64}` } },
      ]
    : prompt;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://submoacontent.com',
      'X-Title': 'SubMoa Atomic Flash Images',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image',
      messages: [{ role: 'user', content: userContent }],
      modalities: ['image', 'text'],
      image_config: { aspect_ratio: aspectRatio },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText);
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 240)}`);
  }

  const data: any = await res.json();
  const imageUrl: string | null =
    data?.choices?.[0]?.message?.images?.[0]?.image_url?.url ??
    (Array.isArray(data?.choices?.[0]?.message?.content)
      ? data.choices[0].message.content.find((c: any) => c?.type === 'image_url')?.image_url?.url
      : null) ??
    null;
  if (!imageUrl) throw new Error(`OpenRouter response had no image`);

  if (imageUrl.startsWith('data:')) {
    const m = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error('Malformed data URL from Gemini');
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { buffer: bytes.buffer, contentType: m[1] };
  }
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Image fetch ${imgRes.status}`);
  return {
    buffer: await imgRes.arrayBuffer(),
    contentType: imgRes.headers.get('content-type') || 'image/png',
  };
}

async function generateViaIdeogram(env: any, prompt: string): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  if (!env.IDEOGRAM_API_KEY) throw new Error('IDEOGRAM_API_KEY not configured');

  const res = await fetch('https://api.ideogram.ai/generate', {
    method: 'POST',
    headers: {
      'Api-Key': env.IDEOGRAM_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_request: {
        prompt,
        aspect_ratio: 'ASPECT_1_1',
        model: 'V_2',
        magic_prompt_option: 'OFF',
        style_type: 'DESIGN',
      },
    }),
  });

  if (res.status === 402 || res.status === 429) {
    throw new Error('Ideogram API limit reached');
  }
  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText);
    throw new Error(`Ideogram ${res.status}: ${t.slice(0, 240)}`);
  }

  const data: any = await res.json();
  const imageUrl = data?.data?.[0]?.url;
  if (!imageUrl) throw new Error('Ideogram response had no image URL');

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Ideogram image fetch ${imgRes.status}`);
  return {
    buffer: await imgRes.arrayBuffer(),
    contentType: imgRes.headers.get('content-type') || 'image/png',
  };
}

// Ideogram's remix endpoint is multipart/form-data, but unlike a typical
// form upload the generation parameters live inside a single JSON-stringified
// `image_request` field rather than as separate fields. `image_file` is the
// source binary. image_weight=50 is a moderate starting point: below ~30 the
// output drifts far from the source, above ~70 it barely changes at all.
async function remixViaIdeogram(env: any, prompt: string, remixBase64: string): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  if (!env.IDEOGRAM_API_KEY) throw new Error('IDEOGRAM_API_KEY not configured');

  let bytes: Uint8Array;
  try {
    const bin = atob(remixBase64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    throw new Error('Invalid remix image base64');
  }
  const sourceBlob = new Blob([bytes], { type: 'image/png' });

  const form = new FormData();
  form.append('image_request', JSON.stringify({
    prompt,
    aspect_ratio: 'ASPECT_1_1',
    image_weight: 50,
    magic_prompt_option: 'OFF',
    model: 'V_2',
  }));
  form.append('image_file', sourceBlob, 'source.png');

  const res = await fetch('https://api.ideogram.ai/remix', {
    method: 'POST',
    headers: { 'Api-Key': env.IDEOGRAM_API_KEY },
    body: form,
  });

  if (res.status === 402 || res.status === 429) {
    throw new Error('Ideogram API limit reached');
  }
  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText);
    throw new Error(`Ideogram remix ${res.status}: ${t.slice(0, 240)}`);
  }

  const data: any = await res.json();
  const imageUrl = data?.data?.[0]?.url;
  if (!imageUrl) throw new Error('Ideogram remix response had no image URL');

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Ideogram remix image fetch ${imgRes.status}`);
  return {
    buffer: await imgRes.arrayBuffer(),
    contentType: imgRes.headers.get('content-type') || 'image/png',
  };
}
