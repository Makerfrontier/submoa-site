// fal.ai cover art generation for podcast episodes and feeds.
// flux-schnell: ~$0.003/image, ~1-3s at 4 inference steps, 1024-1400 square.
// Output is fetched as ArrayBuffer so the caller can store directly to R2.

interface GenEnv {
  FALAI_API_KEY?: string;
}

export async function generateCoverArt(
  env: GenEnv,
  prompt: string,
  options: { width?: number; height?: number } = {},
): Promise<{ imageBuffer: ArrayBuffer; contentType: string }> {
  if (!env.FALAI_API_KEY) throw new Error('FALAI_API_KEY not configured');
  const width = options.width ?? 1400;
  const height = options.height ?? 1400;

  const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${env.FALAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: { width, height },
      num_inference_steps: 4,
      enable_safety_checker: true,
      num_images: 1,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`fal.ai cover gen failed ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data: any = await res.json();
  const imageUrl = data?.images?.[0]?.url;
  if (!imageUrl) throw new Error('fal.ai returned no image URL');

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch generated image: ${imgRes.status}`);
  const imageBuffer = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get('content-type') ?? 'image/png';
  return { imageBuffer, contentType };
}

export function episodeCoverPrompt(topic: string): string {
  const safeTopic = String(topic || '').slice(0, 300).replace(/"/g, "'");
  return `Editorial illustration for a podcast episode titled "${safeTopic}". Minimalist composition, warm earthy color palette (cream, deep forest green, leather brown, amber accents). Clean modern design, magazine-style, no text or words in the image. Square 1:1 aspect, professional editorial style, evocative and conceptual rather than literal.`;
}

export function feedCoverPrompt(_displayName?: string): string {
  return `Abstract editorial illustration representing curiosity, knowledge, and conversation. Minimalist composition, warm earthy palette (cream background, deep forest green, leather brown, golden amber accents). Clean modern design suitable for a personal podcast cover. Square 1:1 aspect, no text or words in the image. Calm, sophisticated, inviting.`;
}
