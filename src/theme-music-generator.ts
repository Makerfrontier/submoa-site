// Per-user theme music via Lyria 3 Clip + strategic prompting + MP3 frame-cut.
// Uses OpenRouter's streaming audio API — Lyria requires stream: true.
// Audio chunks arrive as SSE events; we collect and concatenate them into the final MP3.

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

// Try in order — first success wins. Slugs validated against OpenRouter as of April 2026.
const LYRIA_MODEL_CANDIDATES = [
  'google/lyria-3-clip-preview',   // known-good slug per curl test
  'google/lyria-3-pro-preview',    // full-length alternative (3min, $0.08)
  'google/lyria-3-clip',           // legacy slug, may 404
  'google/lyria-3',                // legacy slug, may 404
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
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          modalities: ['audio'],
          stream: true,   // REQUIRED for audio output per OpenRouter
        }),
      });

      if (!res.ok) {
        const errText = (await res.text().catch(() => '')).slice(0, 500);
        lastError = `Model ${model} HTTP ${res.status}: ${errText}`;
        continue;
      }

      if (!res.body) {
        lastError = `Model ${model} returned no response body`;
        continue;
      }

      // Parse SSE stream — collect all base64 audio chunks
      const audioChunks: string[] = [];
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by \n\n; each frame has one or more lines.
        let frameEnd: number;
        while ((frameEnd = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, frameEnd);
          buffer = buffer.slice(frameEnd + 2);

          // Each frame may contain multiple lines; we care about data: lines
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            // OpenRouter sometimes sends keep-alive comments starting with :
            if (payload.startsWith(':')) continue;

            try {
              const chunk = JSON.parse(payload);
              // Audio chunks can arrive in multiple shapes depending on provider:
              //   chunk.choices[0].delta.audio.data             (streaming delta)
              //   chunk.choices[0].delta.content[].audio.data   (array content)
              //   chunk.choices[0].message.audio.data           (final non-stream shape, in case)
              const delta = chunk?.choices?.[0]?.delta;
              const message = chunk?.choices?.[0]?.message;

              const candidates = [
                delta?.audio?.data,
                message?.audio?.data,
                ...(Array.isArray(delta?.content)
                  ? delta.content.map((c: any) => c?.audio?.data).filter(Boolean)
                  : []),
                ...(Array.isArray(message?.content)
                  ? message.content.map((c: any) => c?.audio?.data).filter(Boolean)
                  : []),
              ].filter((x: any) => typeof x === 'string' && x.length > 0);

              for (const b64 of candidates) {
                audioChunks.push(b64);
              }
            } catch {
              // ignore malformed frames
            }
          }
        }
      }

      // Flush any remaining buffered frame
      if (buffer.trim()) {
        for (const line of buffer.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const chunk = JSON.parse(payload);
            const delta = chunk?.choices?.[0]?.delta;
            const b64 = delta?.audio?.data;
            if (typeof b64 === 'string' && b64.length > 0) audioChunks.push(b64);
          } catch {}
        }
      }

      if (audioChunks.length === 0) {
        lastError = `Model ${model} stream had no audio chunks (stream completed empty)`;
        continue;
      }

      // Concatenate all base64 chunks into one buffer
      // Strategy: decode each chunk separately then concat the raw bytes.
      // (Concatenating base64 strings before decoding can break if chunks
      // aren't on 3-byte boundaries.)
      const byteChunks: Uint8Array[] = audioChunks.map(base64ToBytes);
      const totalBytes = byteChunks.reduce((sum, c) => sum + c.length, 0);
      const combined = new Uint8Array(totalBytes);
      let offset = 0;
      for (const c of byteChunks) {
        combined.set(c, offset);
        offset += c.length;
      }
      sourceBuffer = combined.buffer;

      modelUsed = model;
      console.log(`[theme-music] Lyria success with ${model}: ${audioChunks.length} chunks, ${totalBytes} bytes total`);
      break;
    } catch (err: any) {
      lastError = `Model ${model} threw: ${err?.message || String(err)}`;
      console.warn(`[theme-music] ${lastError}`);
    }
  }

  if (!sourceBuffer) {
    throw new Error(`All Lyria model candidates failed. Last: ${lastError}`);
  }

  const introResult = cutMp3AtTime(sourceBuffer, 10000);
  const outroResult = cutMp3Range(sourceBuffer, 20000, 30000);

  console.log(
    `[theme-music] cuts: intro=${introResult.actualDurationMs}ms (${introResult.frameCount} frames), ` +
    `outro=~${outroResult.actualDurationMs}ms`,
  );

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

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
