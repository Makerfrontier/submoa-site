// Cover art generation via OpenRouter (Google Nano Banana / Gemini 2.5 Flash
// Image Preview). Replaces prior fal.ai flux-schnell implementation.
// Signature preserved — callers (queue consumer, regenerate/upload endpoints)
// remain unchanged.

interface GenEnv {
  OPENROUTER_API_KEY?: string;
}

export async function generateCoverArt(
  env: GenEnv,
  prompt: string,
  options: { width?: number; height?: number } = {},
): Promise<{ imageBuffer: ArrayBuffer; contentType: string }> {
  if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');
  // options.width/height reserved for future sizing hints; Nano Banana accepts
  // aspect_ratio only and always outputs 1024px. Square podcast covers only.
  void options;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://submoacontent.com',
      'X-Title': 'SubMoa Quick Podcast - Cover Art',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image',
      messages: [{ role: 'user', content: prompt }],
      modalities: ['image', 'text'],
      image_config: { aspect_ratio: '1:1' },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`OpenRouter cover gen failed ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data: any = await res.json();
  const imageUrl: string | null =
    data?.choices?.[0]?.message?.images?.[0]?.image_url?.url ??
    (Array.isArray(data?.choices?.[0]?.message?.content)
      ? data.choices[0].message.content.find((c: any) => c?.type === 'image_url')?.image_url?.url
      : null) ??
    null;
  if (!imageUrl) {
    throw new Error(`OpenRouter response had no image. Body: ${JSON.stringify(data).slice(0, 500)}`);
  }

  let imageBuffer: ArrayBuffer;
  let contentType = 'image/png';
  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Could not parse data URL from Nano Banana response');
    contentType = match[1];
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    imageBuffer = bytes.buffer;
  } else {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch generated image: ${imgRes.status}`);
    imageBuffer = await imgRes.arrayBuffer();
    contentType = imgRes.headers.get('content-type') ?? 'image/png';
  }
  return { imageBuffer, contentType };
}

export function episodeCoverPrompt(topic: string): string {
  const safeTopic = String(topic || '').slice(0, 300).replace(/"/g, "'");
  return `Editorial illustration for a podcast episode titled "${safeTopic}". Minimalist composition, warm earthy color palette (cream, deep forest green, leather brown, amber accents). Clean modern design, magazine-style, no text or words in the image. Square 1:1 aspect, professional editorial style, evocative and conceptual rather than literal.`;
}

export function feedCoverPrompt(_displayName?: string): string {
  return `Abstract editorial illustration representing curiosity, knowledge, and conversation. Minimalist composition, warm earthy palette (cream background, deep forest green, leather brown, golden amber accents). Clean modern design suitable for a personal podcast cover. Square 1:1 aspect, no text or words in the image. Calm, sophisticated, inviting.`;
}
