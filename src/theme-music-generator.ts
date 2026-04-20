// Per-user theme music via Lyria 3 Clip + strategic prompting + MP3 frame-cut.
// Lyria is prompted to PRODUCE music with natural resolution at 10s and 20-30s
// phrase boundaries — cuts at those frame boundaries land on silence and the
// boundary click is near-inaudible. This sidesteps the Workers runtime
// limitation on MP3 decoding (no AudioContext/AudioDecoder/OfflineAudioContext).

import { cutMp3AtTime, cutMp3Range } from './mp3-frame-cutter';

interface GenEnv {
  OPENROUTER_API_KEY?: string;
}

export interface ThemeMusicResult {
  introBuffer: ArrayBuffer;
  outroBuffer: ArrayBuffer;
  sourceBuffer: ArrayBuffer;
  contentType: string;
  modelUsed: string;
  introActualMs: number;
  outroActualMs: number;
}

export const DEFAULT_THEME_MUSIC_PROMPT = `30-second instrumental podcast theme music in three distinct phrases of 10 seconds each.

PHRASE 1 (0-10s): A warm, inviting opening phrase that builds gentle anticipation, ending with a clear musical resolution and a soft sustained note that fades to near-silence at exactly the 10-second mark. This will be used as a podcast intro that fades into a host's voice.

PHRASE 2 (10-20s): A brief instrumental bridge — same key and instrumentation, slightly more developed.

PHRASE 3 (20-30s): A satisfying outro phrase that resolves the musical idea, ending with a clear musical conclusion and a soft sustained final note that fades to near-silence at exactly the 30-second mark. This will be used as a podcast outro that fades in from a host's voice.

Style: warm earthy palette, sophisticated but approachable, modern podcast theme. Acoustic and electronic blend. NO vocals. No lyrics. Memorable but not distracting. Cinematic restraint.`;

// OpenRouter has renamed Lyria variants. Try in order — first success wins.
const LYRIA_MODEL_CANDIDATES = [
  'google/lyria-3-clip',
  'google/lyria-3-clip-preview',
  'google/lyria-3-pro-preview',
  'google/lyria-3',
];

export async function generateThemeMusic(
  env: GenEnv,
  prompt: string = DEFAULT_THEME_MUSIC_PROMPT,
): Promise<ThemeMusicResult> {
  if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');

  let lastError: string | null = null;
  let sourceBuffer: ArrayBuffer | null = null;
  let modelUsed = '';

  for (const model of LYRIA_MODEL_CANDIDATES) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://submoacontent.com',
          'X-Title': 'SubMoa Quick Podcast - Theme Music',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          modalities: ['audio'],
        }),
      });
      if (!res.ok) {
        lastError = `Model ${model} HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`;
        continue;
      }
      const data: any = await res.json();
      const audioBase64: string | null =
        data?.choices?.[0]?.message?.audio?.data ??
        (Array.isArray(data?.choices?.[0]?.message?.content)
          ? data.choices[0].message.content.find((c: any) => c?.type === 'audio' || c?.type === 'output_audio')?.audio?.data
              ?? data.choices[0].message.content[0]?.audio?.data
          : null) ??
        null;
      if (!audioBase64) {
        lastError = `Model ${model} returned no audio data. Body: ${JSON.stringify(data).slice(0, 400)}`;
        continue;
      }
      sourceBuffer = base64ToArrayBuffer(audioBase64);
      modelUsed = model;
      break;
    } catch (err: any) {
      lastError = `Model ${model} threw: ${err?.message || err}`;
    }
  }

  if (!sourceBuffer) {
    throw new Error(`All Lyria model candidates failed. Last: ${lastError}`);
  }

  const introResult = cutMp3AtTime(sourceBuffer, 10000);
  const outroResult = cutMp3Range(sourceBuffer, 20000, 30000);

  return {
    introBuffer: introResult.buffer,
    outroBuffer: outroResult.buffer,
    sourceBuffer,
    contentType: 'audio/mpeg',
    modelUsed,
    introActualMs: introResult.actualDurationMs,
    outroActualMs: outroResult.actualDurationMs,
  };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
