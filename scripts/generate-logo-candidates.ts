// One-shot generator: 4 PodDemand logo candidates via OpenRouter Nano Banana.
// Writes each to R2 under defaults/logo-candidates/{slug}.png.
// Triggered via the admin endpoint at /api/admin/generate-logo-candidates.
//
// Uses google/gemini-2.5-flash-image (no -preview — that slug 404s today;
// verified in cover-art-fal-to-openrouter-v1).

interface GenEnv {
  OPENROUTER_API_KEY: string;
  SUBMOA_IMAGES: R2Bucket;
}

interface CandidateSpec {
  slug: string;
  label: string;
  prompt: string;
}

interface CandidateSuccess { slug: string; label: string; size: number; url: string; }
interface CandidateFailure { slug: string; label: string; error: string; }
type CandidateResult = CandidateSuccess | CandidateFailure;

export const CANDIDATES: CandidateSpec[] = [
  {
    slug: 'v1-literal',
    label: 'Direction 1: Literal + iconic',
    prompt: `Minimalist podcast logo for a product called "PodDemand". Central icon: stylized microphone with soft radiating sound waves OR a single clean podcast icon shape. Warm earthy color palette — cream background (#EDE8DF), deep forest green (#2B4030), leather brown (#3A2410), amber accents (#B8872E). Clean modern design, instantly recognizable as a podcast product, confident and professional. Square 1:1 aspect. No text or wordmark in the image. Simple enough to read at small sizes in a podcast app library.`,
  },
  {
    slug: 'v2-conceptual',
    label: 'Direction 2: Editorial / conceptual',
    prompt: `Editorial illustration logo for a podcast product called "PodDemand". Abstract visual concept evoking on-demand curiosity and conversation. Suggested motifs: a speech bubble with something unexpected inside, a tap/faucet pouring sound waves, a book that's also a microphone, an antenna receiving ideas. Warm earthy color palette — cream background (#EDE8DF), deep forest green (#2B4030), leather brown (#3A2410), amber accents (#B8872E). Sophisticated, slightly playful, magazine-cover feel. Square 1:1 aspect. No text. Memorable and evocative rather than literal.`,
  },
  {
    slug: 'v3-wordmark',
    label: 'Direction 3: Wordmark-first',
    prompt: `Wordmark-first logo for a podcast product called "PodDemand". The word "PodDemand" rendered as custom typography — confident, modern, maybe slightly condensed sans-serif, or a distinctive serif with personality. The type IS the logo. Small supporting icon or mark optional but secondary. Warm earthy color palette — cream background (#EDE8DF), deep forest green (#2B4030) for the type, leather brown (#3A2410) for accents, amber (#B8872E) for a single accent element. Square 1:1 aspect. The typography should feel intentional and branded, not default.`,
  },
  {
    slug: 'v4-symbol',
    label: 'Direction 4: Bold symbol',
    prompt: `Bold graphic symbol logo for a podcast product called "PodDemand". Think of logos like Spotify's green circle with waves, or a simple distinctive shape that becomes instantly recognizable. For PodDemand, explore: a monogram of "P" and "D" intertwined, a circular badge with a wave form inside, a stylized abstract "play button" that's been reimagined, or a geometric shape with sound-wave lines. Warm earthy color palette — use cream background (#EDE8DF) with a solid dark forest green (#2B4030) symbol that has amber (#B8872E) highlights. Square 1:1 aspect. No text. Designed to work as a tiny favicon AND a large podcast cover. Bold, confident, ownable.`,
  },
];

async function generateOne(env: GenEnv, candidate: CandidateSpec, baseUrl: string): Promise<CandidateResult> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://submoacontent.com',
        'X-Title': 'PodDemand Logo Candidates',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        messages: [{ role: 'user', content: candidate.prompt }],
        modalities: ['image', 'text'],
        image_config: { aspect_ratio: '1:1' },
      }),
    });
    if (!res.ok) {
      return { slug: candidate.slug, label: candidate.label, error: `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}` };
    }
    const data: any = await res.json();
    const imageUrl: string | null =
      data?.choices?.[0]?.message?.images?.[0]?.image_url?.url ??
      (Array.isArray(data?.choices?.[0]?.message?.content)
        ? data.choices[0].message.content.find((c: any) => c?.type === 'image_url')?.image_url?.url
        : null) ??
      null;
    if (!imageUrl) return { slug: candidate.slug, label: candidate.label, error: `No image in response: ${JSON.stringify(data).slice(0, 400)}` };

    let imageBuffer: ArrayBuffer;
    let contentType = 'image/png';
    if (imageUrl.startsWith('data:')) {
      const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return { slug: candidate.slug, label: candidate.label, error: 'Unparseable data URL' };
      contentType = match[1];
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      imageBuffer = bytes.buffer;
    } else {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) return { slug: candidate.slug, label: candidate.label, error: `Fetch image failed ${imgRes.status}` };
      imageBuffer = await imgRes.arrayBuffer();
      contentType = imgRes.headers.get('content-type') ?? 'image/png';
    }

    const key = `defaults/logo-candidates/${candidate.slug}.png`;
    await env.SUBMOA_IMAGES.put(key, imageBuffer, {
      httpMetadata: { contentType },
      customMetadata: { label: candidate.label, prompt: candidate.prompt.slice(0, 500) },
    });

    return {
      slug: candidate.slug,
      label: candidate.label,
      size: imageBuffer.byteLength,
      url: `${baseUrl}/api/admin/logo-candidate/${candidate.slug}.png`,
    };
  } catch (err: any) {
    return { slug: candidate.slug, label: candidate.label, error: err?.message ?? String(err) };
  }
}

export async function generateAll(env: GenEnv, baseUrl: string) {
  const results = await Promise.all(CANDIDATES.map(c => generateOne(env, c, baseUrl)));
  return { candidates: results };
}
