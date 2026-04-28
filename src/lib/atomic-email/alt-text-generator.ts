// Alt-text generator — fetches an image, base64s it, asks Claude Sonnet 4.5
// (via OpenRouter — same alias mapping the rest of the codebase uses) to
// produce a concise accessible alt-text suitable for an email newsletter.

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'anthropic/claude-sonnet-4-5';
const FETCH_TIMEOUT_MS = 10_000;

const SYSTEM_PROMPT =
  "You generate alt text for images embedded in email newsletters. Describe what is shown literally — subject, action, setting. Do not describe artistic style or speculate about meaning. Maximum 125 characters. Do not start with 'Image of...' or 'Picture of...'. Do not include quotes around the output. Return only the alt text, nothing else.";

interface AltTextResult {
  alt_text: string;
  fetched_bytes: number;
  mime: string;
}

export async function generateAltText(env: { OPENROUTER_API_KEY: string }, imageUrl: string): Promise<AltTextResult> {
  if (!/^https?:\/\//i.test(imageUrl)) {
    throw new Error('image_url must be HTTP(S)');
  }

  // Fetch with a short timeout — long-running fetches starve the worker.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  let imageRes: Response;
  try {
    imageRes = await fetch(imageUrl, { signal: ac.signal });
  } catch (err: any) {
    clearTimeout(timer);
    throw new Error(`fetch image failed: ${err?.message || err}`);
  }
  clearTimeout(timer);
  if (!imageRes.ok) throw new Error(`image url returned ${imageRes.status}`);
  const mime = imageRes.headers.get('Content-Type') || 'image/jpeg';
  if (!/^image\//i.test(mime)) throw new Error(`fetched url is not an image (Content-Type: ${mime})`);
  const buf = await imageRes.arrayBuffer();
  if (buf.byteLength > 8 * 1024 * 1024) throw new Error('image >8MB; not supported');
  const b64 = arrayBufferToBase64(buf);
  const dataUri = `data:${mime};base64,${b64}`;

  // OpenRouter's chat-completions endpoint accepts the OpenAI vision schema.
  const res = await fetch(OPENROUTER_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://www.submoacontent.com',
      'X-Title': 'SubMoa Atomic Email',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Generate alt text for this image.' },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data: any = await res.json();
  const raw = data?.choices?.[0]?.message?.content || '';
  const alt = String(raw).trim().replace(/^["'`]+|["'`]+$/g, '').slice(0, 125);
  if (!alt) throw new Error('model returned empty alt text');
  return { alt_text: alt, fetched_bytes: buf.byteLength, mime };
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
