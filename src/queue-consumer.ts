// src/queue-consumer.ts
// Cloudflare Queue consumer — processes generation jobs

// ----------------------
// Usage logging
// ----------------------
async function logApiUsage(
  db: D1Database,
  apiName: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  submissionId?: string
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO api_usage_log (api_name, input_tokens, output_tokens, cost, submission_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(apiName, inputTokens, outputTokens, costUsd, submissionId || null, Date.now()).run();
  } catch (e) {
    console.error('logApiUsage failed:', e.message);
  }
}

// For each job:
//   1. Fetch submission + author voice from DB
//   2. Fetch writing skill from DB
//   3. Pull DataforSEO keyword intelligence
//   4. Scrape product link if provided
//   5. Assemble full generation prompt
//   6. Call Claude API
//   7. Write article back to DB
//   8. Set status = 'article_done', grade_status = 'ungraded'
//   9. Notify Discord that generation is complete

import { getKeywordIntelligence, formatKeywordIntelligenceForPrompt } from "./dataforseo";
import { notifyGenerationComplete } from "./notifications";
import { runEnforcementAgent } from "./enforcement-agent";
import { writeProjectFile } from "./project-template";
import { packageAudio } from "./packager-update";
import { processImages, injectImagesIntoArticle, generateImageCopyBuffers } from "./image-processor";
import { assembleEmail, type EmailRecord } from "./email-assembler";
import { assemblePresentation, type PresentationRecord } from "./presentation-assembler";
import { renderPlanHtml } from "./planner-render";
import type { GenerationJob } from "./queue-producer";
import puppeteer from "@cloudflare/puppeteer";
import { generateXaiTTS, generateXaiTTSChunked, XAI_VOICE_IDS, concatBuffers, type XaiVoiceId } from "./xai-tts";
import { AudioSandbox } from "./audio-ffmpeg";
import { Buffer } from "node:buffer";

// Re-export the AudioSandbox DO class so wrangler's [[containers]] and
// [[durable_objects.bindings]] config can bind to it. The consumer worker
// is the one module wrangler scans for exported DO classes.
export { AudioSandbox };
import { suggestTagInjections, applyTagSuggestions } from "./tag-injector";

const LEGACY_VOICE_MAP: Record<string, XaiVoiceId> = {
  shimmer: 'eve', onyx: 'leo', echo: 'rex', alloy: 'sal', nova: 'eve', fable: 'ara',
};
function resolveXaiVoice(raw: string | undefined | null): XaiVoiceId {
  const v = String(raw || '').toLowerCase().trim();
  if (XAI_VOICE_IDS.includes(v as XaiVoiceId)) return v as XaiVoiceId;
  if (v in LEGACY_VOICE_MAP) return LEGACY_VOICE_MAP[v];
  return 'eve';
}

// ID3v2 header: "ID3" magic + 2 bytes version + 1 byte flags + 4 bytes
// syncsafe size (7 bits per byte, big-endian). Total tag length is
// 10 (header) + decoded size. Returns the buffer untouched if no tag.
function stripID3v2(buf: Uint8Array | Buffer | ArrayBuffer): Uint8Array {
  const view = buf instanceof ArrayBuffer
    ? new Uint8Array(buf)
    : new Uint8Array((buf as Uint8Array).buffer, (buf as Uint8Array).byteOffset, (buf as Uint8Array).byteLength);
  if (view.length < 10 || view[0] !== 0x49 || view[1] !== 0x44 || view[2] !== 0x33) return view;
  const size = (view[6] << 21) | (view[7] << 14) | (view[8] << 7) | view[9];
  const totalHeaderSize = 10 + size;
  if (totalHeaderSize >= view.length) return view;
  return view.subarray(totalHeaderSize);
}

// Build a minimal ID3v2.3 tag carrying only a TLEN frame. Apple Podcasts
// and most players prefer TLEN over CBR-derived duration, so writing one
// that matches the actual file byte-length keeps the reported runtime
// honest. Returns a fresh Uint8Array ready to prepend to the MP3 stream.
function buildID3v23WithTLEN(durationMs: number): Uint8Array {
  const durStr = String(Math.max(0, Math.round(durationMs)));
  const frameBodyLen = 1 + durStr.length; // 1 encoding byte + ASCII digits
  const frameLen = 10 + frameBodyLen;     // 10-byte frame header + body
  const tagBodyLen = frameLen;
  const totalLen = 10 + tagBodyLen;

  const out = new Uint8Array(totalLen);
  out[0] = 0x49; out[1] = 0x44; out[2] = 0x33;                // "ID3"
  out[3] = 0x03; out[4] = 0x00;                               // v2.3.0
  out[5] = 0x00;                                              // flags
  out[6] = (tagBodyLen >>> 21) & 0x7f;                        // syncsafe size
  out[7] = (tagBodyLen >>> 14) & 0x7f;
  out[8] = (tagBodyLen >>> 7) & 0x7f;
  out[9] = tagBodyLen & 0x7f;
  out[10] = 0x54; out[11] = 0x4c; out[12] = 0x45; out[13] = 0x4e; // "TLEN"
  out[14] = (frameBodyLen >>> 24) & 0xff;                     // frame body size (big-endian, not syncsafe in v2.3)
  out[15] = (frameBodyLen >>> 16) & 0xff;
  out[16] = (frameBodyLen >>> 8) & 0xff;
  out[17] = frameBodyLen & 0xff;
  out[18] = 0x00; out[19] = 0x00;                             // frame flags
  out[20] = 0x00;                                             // encoding: ISO-8859-1
  for (let i = 0; i < durStr.length; i++) out[21 + i] = durStr.charCodeAt(i);
  return out;
}

// Rewrite the Xing/Info CBR header inside the first MPEG audio frame of a
// stitched MP3 stream so nFrames/nBytes/TOC match the concatenated file.
//
// xAI TTS emits every segment with its own "Info" frame declaring only that
// segment's length (~211 frames ≈ 5 s for a typical chunk). After concat,
// the first segment's Info frame survives at the top of the MPEG stream
// and every browser trusts it over TLEN or frame scanning — clamping
// HTMLMediaElement.duration to ~5 s and firing `ended` far too early.
// Rewriting the fields in place fixes duration without a re-encode.
//
// Layout after the 4-byte MPEG frame header:
//   [N bytes side info]  — 9/17/32 depending on MPEG version + channel mode
//   [4B marker: "Xing" (VBR) or "Info" (CBR)]
//   [4B flags] bit0=frames, bit1=bytes, bit2=TOC, bit3=quality
//   [optional 4B nFrames — big-endian]
//   [optional 4B nBytes  — big-endian]
//   [optional 100B TOC]
//   [optional 4B quality]
function rewriteXingInPlace(
  mpeg: Uint8Array,
): { patched: boolean; nFrames: number; nBytes: number; marker: string; sync: number } {
  const fail = { patched: false, nFrames: 0, nBytes: 0, marker: '', sync: -1 };
  if (mpeg.length < 64) return fail;

  // Locate MPEG sync. A stripped-ID3 stream always opens with a valid frame
  // at offset 0, but scan the first 32 bytes defensively in case upstream
  // ever leaves a pad byte.
  let sync = -1;
  for (let i = 0; i < Math.min(32, mpeg.length - 4); i++) {
    if (mpeg[i] === 0xff && (mpeg[i + 1] & 0xe0) === 0xe0) { sync = i; break; }
  }
  if (sync < 0) return fail;

  const h1 = mpeg[sync + 1];
  const h2 = mpeg[sync + 2];
  const h3 = mpeg[sync + 3];
  const versionId = (h1 >> 3) & 0x3;   // 11=MPEG-1, 10=MPEG-2, 00=MPEG-2.5
  const layer = (h1 >> 1) & 0x3;       // 01=Layer 3
  const bitrateIdx = (h2 >> 4) & 0xf;
  const sampleIdx = (h2 >> 2) & 0x3;
  const channelMode = (h3 >> 6) & 0x3; // 11=mono
  if (layer !== 0x1) return fail;       // Xing/Info layout only defined for Layer 3.

  // Side-info length — the only thing that varies by version + channel mode.
  const isV1 = versionId === 0x3;
  const isV25 = versionId === 0x0;
  const isMono = channelMode === 0x3;
  const sideInfoLen = isV1 ? (isMono ? 17 : 32) : (isMono ? 9 : 17);

  const markerOff = sync + 4 + sideInfoLen;
  if (markerOff + 8 > mpeg.length) return fail;

  const isXing = mpeg[markerOff] === 0x58 && mpeg[markerOff+1] === 0x69 && mpeg[markerOff+2] === 0x6e && mpeg[markerOff+3] === 0x67; // "Xing"
  const isInfo = mpeg[markerOff] === 0x49 && mpeg[markerOff+1] === 0x6e && mpeg[markerOff+2] === 0x66 && mpeg[markerOff+3] === 0x6f; // "Info"
  if (!isXing && !isInfo) return fail;
  const marker = isInfo ? 'Info' : 'Xing';

  // Derive bytes-per-frame from the frame header so the math stays correct
  // if upstream TTS ever moves to a different sample rate / bitrate.
  //   MPEG-1   L3: frame_bytes = floor(144 * bitrate / sample_rate) + padding
  //   MPEG-2/2.5 L3: frame_bytes = floor(72 * bitrate / sample_rate) + padding
  // For our pipeline (xAI @ 24 kHz 128 kbps mono MPEG-2) this evaluates to
  // exactly 384 B/frame with zero padding across the stream.
  const bitrateTableV1  = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, -1];
  const bitrateTableV2  = [0,  8, 16, 24, 32, 40, 48, 56,  64,  80,  96, 112, 128, 144, 160, -1];
  const sampleTableV1   = [44100, 48000, 32000, -1];
  const sampleTableV2   = [22050, 24000, 16000, -1];
  const sampleTableV25  = [11025, 12000,  8000, -1];
  const bitrate   = (isV1 ? bitrateTableV1 : bitrateTableV2)[bitrateIdx] * 1000;
  const sampleRate = (isV1 ? sampleTableV1 : isV25 ? sampleTableV25 : sampleTableV2)[sampleIdx];
  if (bitrate <= 0 || sampleRate <= 0) return { ...fail, marker };
  const bytesPerFrame = Math.floor((isV1 ? 144 : 72) * bitrate / sampleRate);
  if (bytesPerFrame <= 0) return { ...fail, marker };

  const totalBytes = mpeg.length;
  const nFrames = Math.round(totalBytes / bytesPerFrame);

  const flagsOff = markerOff + 4;
  const flags = (mpeg[flagsOff] << 24) | (mpeg[flagsOff+1] << 16) | (mpeg[flagsOff+2] << 8) | mpeg[flagsOff+3];
  const hasFrames = (flags & 0x1) !== 0;
  const hasBytes  = (flags & 0x2) !== 0;
  const hasToc    = (flags & 0x4) !== 0;

  const write32BE = (off: number, val: number) => {
    mpeg[off    ] = (val >>> 24) & 0xff;
    mpeg[off + 1] = (val >>> 16) & 0xff;
    mpeg[off + 2] = (val >>>  8) & 0xff;
    mpeg[off + 3] =  val         & 0xff;
  };

  let cursor = flagsOff + 4;
  if (hasFrames) {
    if (cursor + 4 > mpeg.length) return { ...fail, marker };
    write32BE(cursor, nFrames);
    cursor += 4;
  }
  if (hasBytes) {
    if (cursor + 4 > mpeg.length) return { patched: true, nFrames, nBytes: 0, marker, sync };
    write32BE(cursor, totalBytes);
    cursor += 4;
  }
  if (hasToc) {
    if (cursor + 100 > mpeg.length) return { patched: true, nFrames, nBytes: totalBytes, marker, sync };
    // Uniform TOC: entry i maps playback percentage i to a byte offset at
    // i/100 of the file (expressed in 1/256 units). For a CBR stream this
    // *is* the physically correct seek table — every second of wall-clock
    // maps to the same number of bytes, so linear == accurate.
    for (let i = 0; i < 100; i++) mpeg[cursor + i] = Math.floor((i * 256) / 100);
  }

  return { patched: true, nFrames, nBytes: totalBytes, marker, sync };
}

// If the buffer already leads with an ID3v2 tag that contains a TLEN frame
// whose body is long enough to hold the new duration string, overwrite it
// in place. Otherwise prepend a fresh minimal ID3v2.3 tag. Either way the
// returned Buffer's first TLEN frame reflects durationMs.
function patchOrPrependTLEN(buf: Buffer, durationMs: number): Buffer {
  const view = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.length >= 10 && view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) {
    const tagSize = (view[6] << 21) | (view[7] << 14) | (view[8] << 7) | view[9];
    const tagEnd = 10 + tagSize;
    let p = 10;
    while (p + 10 <= Math.min(tagEnd, view.length)) {
      // Frame ID of all-zeroes means we hit padding; stop scanning.
      if (view[p] === 0 && view[p+1] === 0 && view[p+2] === 0 && view[p+3] === 0) break;
      const fsz = (view[p+4] << 24) | (view[p+5] << 16) | (view[p+6] << 8) | view[p+7];
      const isTLEN = view[p] === 0x54 && view[p+1] === 0x4c && view[p+2] === 0x45 && view[p+3] === 0x4e;
      if (isTLEN) {
        const durStr = String(Math.max(0, Math.round(durationMs)));
        const needed = 1 + durStr.length;
        if (needed <= fsz) {
          const bodyStart = p + 10;
          view[bodyStart] = 0x00;
          for (let i = 0; i < durStr.length; i++) view[bodyStart + 1 + i] = durStr.charCodeAt(i);
          for (let i = bodyStart + needed; i < bodyStart + fsz; i++) view[i] = 0x00;
          return buf;
        }
        break;
      }
      p += 10 + fsz;
    }
  }
  const tag = buildID3v23WithTLEN(durationMs);
  return Buffer.concat([Buffer.from(tag), buf]);
}

// Podcast audio stitching — runs as a queue job. For each script segment:
// pick up voice + vocal direction, suggest speech tags (Flash), auto-accept,
// xAI TTS, then concat with a silence buffer between segments. Final MP3
// goes to projects/podcasts/{podcast_id}/episodes/{episode_id}/audio.mp3.
async function processPodcastAudio(env: Env, episodeId: string): Promise<void> {
  console.log(`[podcast-audio] start ${episodeId}`);
  const ep: any = await env.DB.prepare(
    `SELECT * FROM podcast_episodes WHERE id = ?`
  ).bind(episodeId).first();
  if (!ep) { console.error(`[podcast-audio] missing episode ${episodeId}`); return; }

  const pod: any = await env.DB.prepare(
    `SELECT id, name, description, intro_text, outro_text, episode_count FROM podcasts WHERE id = ?`
  ).bind(ep.podcast_id).first();

  const hostsRes = await env.DB.prepare(
    `SELECT eh.host_id, eh.speaker_order, h.voice_id, h.vocal_direction, h.name
       FROM episode_hosts eh JOIN hosts h ON h.id = eh.host_id
       WHERE eh.episode_id = ? ORDER BY eh.speaker_order`
  ).bind(episodeId).all();
  const hostById = new Map<string, any>();
  for (const h of (hostsRes.results || []) as any[]) hostById.set(h.host_id, h);

  let segments: any[] = [];
  try { segments = JSON.parse(ep.script_json || '[]'); } catch {}
  if (segments.length === 0) {
    await env.DB.prepare(`UPDATE podcast_episodes SET status='failed', updated_at=unixepoch() WHERE id=?`).bind(episodeId).run();
    console.error(`[podcast-audio] empty script for ${episodeId}`);
    return;
  }

  const log: any[] = [];
  const pushLog = (m: string) => {
    log.push({ ts: Math.floor(Date.now() / 1000), message: m });
    console.log(`[podcast-audio/${episodeId}] ${m}`);
  };

  pushLog(`Rendering ${segments.length} segments`);

  // Load silence buffers once (or fall back to 0-byte if missing).
  const silence300 = await getSilenceBuffer(env, 'samples/silence/300ms.mp3');
  const silence150 = await getSilenceBuffer(env, 'samples/silence/150ms.mp3');

  if (!env.XAI_API_KEY) {
    pushLog('XAI_API_KEY not set — aborting');
    await env.DB.prepare(`UPDATE podcast_episodes SET status='failed', generation_log=?, updated_at=unixepoch() WHERE id=?`)
      .bind(JSON.stringify(log), episodeId).run();
    return;
  }

  // Prepend intro (first speaker's voice), append outro (last speaker's voice).
  const firstSpeakerId = segments[0]?.speaker_id;
  const lastSpeakerId = segments[segments.length - 1]?.speaker_id;
  const firstVoice = resolveXaiVoice(hostById.get(firstSpeakerId)?.voice_id);
  const lastVoice = resolveXaiVoice(hostById.get(lastSpeakerId)?.voice_id);

  // Per-user theme music (Quick Podcast only). Music is only pulled if the
  // user has opted in via theme_music_enabled; otherwise both buffers stay
  // null and the FFmpeg processor emits speech-only output.
  // Typed as Uint8Array so Buffer assignments (Buffer extends Uint8Array)
  // satisfy TS. The sandbox SDK rejects raw ArrayBuffer shapes at its RPC
  // boundary, so R2 reads are coerced to Buffer before being passed to it.
  let themeIntroBuf: Uint8Array | null = null;
  let themeOutroBuf: Uint8Array | null = null;
  if (ep.source === 'quick') {
    const themeUser: any = await env.DB.prepare(
      `SELECT theme_music_enabled, theme_music_r2_key_intro, theme_music_r2_key_outro FROM users WHERE account_id = ? ORDER BY created_at ASC LIMIT 1`
    ).bind(ep.account_id).first();
    const themeEnabled = Number(themeUser?.theme_music_enabled) === 1;
    pushLog(`theme_music_enabled: ${themeUser?.theme_music_enabled} (primaryUserRowPresent=${!!themeUser})`);
    console.log(`[podcast-audio] theme_music_enabled: ${themeUser?.theme_music_enabled} account=${ep.account_id}`);
    if (themeEnabled) {
      if (themeUser?.theme_music_r2_key_intro) {
        const o = await env.SUBMOA_IMAGES.get(themeUser.theme_music_r2_key_intro as string);
        if (o) themeIntroBuf = Buffer.from(new Uint8Array(await o.arrayBuffer()));
      }
      if (themeUser?.theme_music_r2_key_outro) {
        const o = await env.SUBMOA_IMAGES.get(themeUser.theme_music_r2_key_outro as string);
        if (o) themeOutroBuf = Buffer.from(new Uint8Array(await o.arrayBuffer()));
      }
    } else {
      pushLog('Theme music disabled — speech-only episode');
    }
  }

  // Speech-only segment array. Music lives outside this list and gets
  // re-encoded + merged by FFmpeg in processAudioWithFFmpeg so format
  // boundaries don't garble playback.
  // Union type — silence segments now come in as Buffer/Uint8Array per the
  // sandbox-compatibility coercion, while xAI TTS segments still return
  // ArrayBuffer. The FFmpeg processor normalizes both paths internally.
  const buffers: (ArrayBuffer | Uint8Array)[] = [];
  if (pod?.intro_text) {
    try {
      const buf = await generateXaiTTSChunked(env.XAI_API_KEY, pod.intro_text, firstVoice);
      buffers.push(buf); buffers.push(silence300);
      pushLog('Intro rendered');
    } catch (e: any) { pushLog(`Intro failed: ${e.message}`); }
  }

  let prevSpeakerId: string | null = null;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const host = hostById.get(seg.speaker_id);
    if (!host) { pushLog(`Seg ${i}: host ${seg.speaker_id} not found, skipping`); continue; }
    const voiceId = resolveXaiVoice(host.voice_id);

    // Suggest speech tags (auto-accept in podcast pipeline).
    // Podcast pipeline uses 'subtle' as the default intensity because all
    // suggestions auto-accept (no per-chip review like TTS Studio). Without
    // user filtering, 'balanced' lands too many tags and the delivery gets
    // theatrical. Subtle + the server-side budget cap + restraint detection
    // in src/tag-injector.ts produces natural-feeling delivery for full
    // episodes. TTS Studio keeps 'balanced' because its flow is user-reviewed.
    let taggedText = seg.text;
    try {
      const tags = await suggestTagInjections(env.OPENROUTER_API_KEY, {
        text: seg.text,
        voice_id: voiceId,
        voice_description: `${host.name} voice (${voiceId})`,
        project_voice: host.vocal_direction || '',
        intensity: 'subtle',
      });
      if (tags.suggestions.length) taggedText = applyTagSuggestions(seg.text, tags.suggestions);
    } catch (e: any) {
      pushLog(`Seg ${i}: tag suggestion failed (using raw text): ${e.message}`);
    }

    try {
      const buf = await generateXaiTTS(env.XAI_API_KEY, {
        text: taggedText, voice_id: voiceId,
        output_format: { codec: 'mp3', sample_rate: 24000, bit_rate: 128000 },
      });
      // Silence gap before this segment (not before the first segment after intro)
      if (i > 0) {
        const sameSpeaker = prevSpeakerId === seg.speaker_id;
        buffers.push(sameSpeaker ? silence150 : silence300);
      }
      buffers.push(buf);
      prevSpeakerId = seg.speaker_id;
    } catch (e: any) {
      pushLog(`Seg ${i}: xAI TTS failed: ${e.message}`);
    }
  }

  if (pod?.outro_text) {
    try {
      const buf = await generateXaiTTSChunked(env.XAI_API_KEY, pod.outro_text, lastVoice);
      buffers.push(silence300); buffers.push(buf);
      pushLog('Outro rendered');
    } catch (e: any) { pushLog(`Outro failed: ${e.message}`); }
  }


  // Final assembly — every input segment (theme intro, speech chunks,
  // silence, theme outro) gets its ID3v2 header stripped before concat so
  // the final MP3 has exactly one tag at the top: a freshly-built
  // ID3v2.3 with a TLEN frame matching the true concatenated length.
  // Without this, a stray TLEN from any upstream segment can overwrite
  // the podcast's displayed duration in Apple/Overcast.
  const allBuffers: Buffer[] = [];
  if (themeIntroBuf) {
    const stripped = stripID3v2(themeIntroBuf);
    allBuffers.push(Buffer.from(stripped));
    pushLog(`Theme intro prepended (${themeIntroBuf.byteLength} → ${stripped.byteLength} bytes after ID3 strip)`);
  }
  for (const b of buffers) {
    const raw = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array((b as any).buffer ?? b);
    const stripped = stripID3v2(raw);
    allBuffers.push(Buffer.from(stripped));
  }
  if (themeOutroBuf) {
    const stripped = stripID3v2(themeOutroBuf);
    allBuffers.push(Buffer.from(stripped));
    pushLog(`Theme outro appended (${themeOutroBuf.byteLength} → ${stripped.byteLength} bytes after ID3 strip)`);
  }
  const concatenated = Buffer.concat(allBuffers);

  // Rewrite the Xing/Info frame inherited from the first segment so its
  // nFrames/nBytes/TOC reflect the full stitched stream. Without this,
  // browsers clamp HTMLMediaElement.duration to the first segment's length
  // (~5 s for a typical TTS chunk) and stop playback early despite valid
  // audio extending past that point. Mutations land in place and propagate
  // into `stamped` via the subsequent Buffer.concat.
  const xing = rewriteXingInPlace(concatenated);
  if (xing.patched) {
    pushLog(`Xing/${xing.marker} patched: nFrames=${xing.nFrames}, nBytes=${xing.nBytes}`);
  } else {
    pushLog('Xing/Info frame not found in stitched stream — duration may be wrong in browsers');
  }

  // At 128 kbps CBR mono, 16 000 B/s → durationMs = bytes / 16 000 * 1000.
  const durationMs = Math.round(concatenated.byteLength / 16000 * 1000);
  const tlenTag = buildID3v23WithTLEN(durationMs);
  const stamped = Buffer.concat([Buffer.from(tlenTag), concatenated]);
  const final: ArrayBuffer = stamped.buffer.slice(
    stamped.byteOffset,
    stamped.byteOffset + stamped.byteLength,
  );
  const durationSeconds = Math.round(durationMs / 1000);

  if (final.byteLength === 0) {
    pushLog('Empty final buffer — marking failed');
    await env.DB.prepare(`UPDATE podcast_episodes SET status='failed', generation_log=?, updated_at=unixepoch() WHERE id=?`)
      .bind(JSON.stringify(log), episodeId).run();
    return;
  }

  const r2Key = `projects/podcasts/${ep.podcast_id}/episodes/${episodeId}/audio.mp3`;
  await env.SUBMOA_IMAGES.put(r2Key, final, { httpMetadata: { contentType: 'audio/mpeg' } });
  pushLog(`Uploaded ${r2Key} (${final.byteLength} bytes, ~${durationSeconds}s)`);

  // Summarize for continuity on the next ongoing episode.
  let summary = '';
  try {
    const { summarizeEpisode } = await import('./podcast-script-generator');
    summary = await summarizeEpisode(env.OPENROUTER_API_KEY, segments as any);
  } catch (e: any) {
    pushLog(`Summarize failed: ${e.message}`);
  }

  await env.DB.prepare(
    `UPDATE podcast_episodes SET status='audio_ready', audio_r2_key=?, audio_duration_seconds=?, summary=COALESCE(NULLIF(?, ''), summary), generation_log=?, updated_at=unixepoch() WHERE id=?`
  ).bind(r2Key, durationSeconds, summary, JSON.stringify(log), episodeId).run();

  await env.DB.prepare(
    `UPDATE podcasts SET episode_count = (SELECT COUNT(*) FROM podcast_episodes WHERE podcast_id = ?), updated_at=unixepoch() WHERE id = ?`
  ).bind(ep.podcast_id, ep.podcast_id).run();
}

async function getSilenceBuffer(env: Env, key: string): Promise<Uint8Array> {
  try {
    const obj = await env.SUBMOA_IMAGES.get(key);
    if (obj) return Buffer.from(new Uint8Array(await obj.arrayBuffer()));
  } catch {}
  console.warn(`[podcast-audio] silence buffer missing at ${key} — using 0-byte gap`);
  return Buffer.alloc(0);
}

// Quick Podcast pipeline — topic/URL → research (Sonar) → host cast (Flash) →
// script (Sonnet) → reuse processPodcastAudio for TTS stitching. Status field
// walks researching → casting → scripting → generating_audio → audio_ready.
async function processQuickPodcast(env: Env, episodeId: string): Promise<void> {
  console.log(`[quick-podcast] start ${episodeId}`);
  const setStatus = async (status: string) => {
    await env.DB.prepare(`UPDATE podcast_episodes SET status = ?, updated_at = unixepoch() WHERE id = ?`).bind(status, episodeId).run();
  };
  const markFailed = async (msg: string) => {
    console.error(`[quick-podcast/${episodeId}] failed: ${msg}`);
    await env.DB.prepare(`UPDATE podcast_episodes SET status='failed', updated_at=unixepoch() WHERE id = ?`).bind(episodeId).run();
  };

  const ep: any = await env.DB.prepare(`SELECT * FROM podcast_episodes WHERE id = ?`).bind(episodeId).first();
  if (!ep) return markFailed('episode missing');

  // 1. Research via Sonar
  try {
    console.log(`[quick-podcast/${episodeId}] research starting: topic=${JSON.stringify(ep.topic)} account=${ep.account_id}`);
    const { researchTopic, isUrlInput } = await import('./quick-podcast-research');
    const research = await researchTopic(env.OPENROUTER_API_KEY, ep.topic, { is_url: isUrlInput(ep.topic) });
    const sourcesCount = Array.isArray(research.sources) ? research.sources.length : 0;
    console.log(`[quick-podcast/${episodeId}] research result: sources=${sourcesCount} synthesis_len=${research.synthesis?.length ?? 0} query=${JSON.stringify(research.query_used)}`);
    console.log(`[quick-podcast/${episodeId}] research sources payload:`, JSON.stringify(research.sources));

    if (sourcesCount === 0) {
      // Promote this to error-level with the full research object shape so
      // `wrangler tail --format=pretty` flags it in red. Research parsing
      // in src/quick-podcast-research.ts currently checks
      // data.choices[0].message.citations and data.citations only; if Sonar
      // started returning citations via annotations[].url_citation or a
      // top-level search_results array this log makes that visible without
      // needing to replay the HTTP response.
      console.error(`[quick-podcast/${episodeId}] ZERO research sources — research keys=${Object.keys(research || {}).join(',')} synthesis_preview=${JSON.stringify((research.synthesis || '').slice(0, 200))}`);
    }

    const serialized = JSON.stringify(research.sources || []);
    const dbRes = await env.DB.prepare(
      `UPDATE podcast_episodes SET research_query = ?, research_sources = ?, brief = ?, updated_at = unixepoch() WHERE id = ?`
    ).bind(research.query_used, serialized, research.synthesis, episodeId).run();
    const savedRows = (dbRes as any)?.meta?.changes ?? '?';
    console.log(`[quick-podcast/${episodeId}] research saved: rows=${savedRows} serialized_len=${serialized.length} serialized_preview=${serialized.slice(0, 200)}`);
    if (savedRows === 0) {
      console.error(`[quick-podcast/${episodeId}] research UPDATE affected zero rows — episode id may have been deleted mid-flight`);
    }
    await setStatus('casting');
  } catch (e: any) {
    console.error(`[quick-podcast/${episodeId}] research failed:`, e?.message || e, e?.stack);
    return markFailed(`research: ${e?.message || e}`);
  }

  // 2. Cast hosts — drive from episode.host_names (the comma-separated list
  //    the frontend sent) rather than an LLM picker. The canonical three
  //    hosts are Blair/Curtis/Jackson with voice_ids ara/rex/sal; any mix of
  //    those names ends up in host_names. If the DB is missing them for this
  //    account we lazy-seed just those three (no starter personas) so the
  //    pipeline can proceed. Rotating presets keep multi-host scripts from
  //    flatlining into the same position.
  const CANONICAL_HOSTS: Array<{ name: string; voice_id: string }> = [
    { name: 'Blair',   voice_id: 'ara' },
    { name: 'Curtis',  voice_id: 'rex' },
    { name: 'Jackson', voice_id: 'sal' },
  ];
  const ROTATING_PRESETS = ['curious_moderator', 'skeptical', 'storyteller'];
  let chosenHosts: any[] = [];
  try {
    const hostCount = Math.max(1, Math.min(3, Number(ep.host_count) || 1));
    const requested = typeof ep.host_names === 'string' && ep.host_names.trim()
      ? String(ep.host_names).split(',').map((s: string) => s.trim()).filter(Boolean)
      : CANONICAL_HOSTS.slice(0, hostCount).map(h => h.name);
    console.log(`[quick-podcast/${episodeId}] casting: host_count=${hostCount} host_names=${JSON.stringify(requested)}`);

    const fetchByNames = async (names: string[]): Promise<any[]> => {
      if (!names.length) return [];
      const ph = names.map(() => '?').join(',');
      const res = await env.DB.prepare(
        `SELECT id, name, voice_id, personality, recurring_viewpoint, vocal_direction, catchphrases, tags
         FROM hosts WHERE account_id = ? AND name IN (${ph})`
      ).bind(ep.account_id, ...names).all();
      const rows = (res.results || []) as any[];
      // Preserve the requested order so speaker_order matches the UI order.
      const byName = new Map(rows.map((r: any) => [String(r.name), r]));
      return names.map(n => byName.get(n)).filter(Boolean) as any[];
    };

    chosenHosts = await fetchByNames(requested);

    if (chosenHosts.length === 0) {
      const fallbackNames = CANONICAL_HOSTS.slice(0, hostCount).map(h => h.name);
      console.warn(`[quick-podcast/${episodeId}] no hosts matched host_names=${JSON.stringify(requested)} — falling back to ${JSON.stringify(fallbackNames)}`);
      chosenHosts = await fetchByNames(fallbackNames);
    }

    if (chosenHosts.length === 0) {
      // Account has no canonical hosts at all — insert Blair/Curtis/Jackson
      // with just name + voice_id (everything else uses column defaults) so
      // the episode_hosts foreign key lands. Subsequent episodes reuse them.
      console.warn(`[quick-podcast/${episodeId}] no canonical hosts in account ${ep.account_id} — lazy-seeding Blair/Curtis/Jackson`);
      for (const h of CANONICAL_HOSTS.slice(0, hostCount)) {
        const id = `host_${h.name.toLowerCase()}_${ep.account_id}`;
        await env.DB.prepare(
          `INSERT OR IGNORE INTO hosts (id, account_id, name, voice_id, is_starter) VALUES (?, ?, ?, ?, 1)`
        ).bind(id, ep.account_id, h.name, h.voice_id).run();
      }
      chosenHosts = await fetchByNames(CANONICAL_HOSTS.slice(0, hostCount).map(h => h.name));
    }

    chosenHosts = chosenHosts.slice(0, hostCount);
    if (chosenHosts.length === 0) return markFailed('no hosts available after lookup + fallback + lazy-seed');

    console.log(`[quick-podcast/${episodeId}] hosts chosen: ${chosenHosts.map(h => `${h.name}/${h.voice_id}`).join(', ')}`);

    await env.DB.prepare(`DELETE FROM episode_hosts WHERE episode_id = ?`).bind(episodeId).run();
    for (let i = 0; i < chosenHosts.length; i++) {
      const h = chosenHosts[i];
      const preset = ROTATING_PRESETS[i % ROTATING_PRESETS.length];
      await env.DB.prepare(`
        INSERT INTO episode_hosts (id, episode_id, host_id, position_preset, position_direction, speaker_order)
        VALUES (?, ?, ?, ?, '', ?)
      `).bind('eh_' + Math.random().toString(16).slice(2, 10), episodeId, h.id, preset, i).run();
    }
    await setStatus('scripting');
  } catch (e: any) {
    return markFailed(`casting: ${e?.message || e}`);
  }

  // 3. Script via Sonnet (reuses generatePodcastScript). Brief = research synthesis.
  try {
    const { generatePodcastScript, POSITION_PRESETS } = await import('./podcast-script-generator');
    const presetMap = new Map((POSITION_PRESETS as any[]).map((p: any) => [p.id, p.prompt_fragment]));
    const targetMinutes = Number(ep.target_length_minutes) || 10;

    const parseJSONField = (v: any) => { try { return JSON.parse(v || '[]'); } catch { return []; } };
    const hostCtx = chosenHosts.map((h: any, i: number) => {
      const preset = ROTATING_PRESETS[i % ROTATING_PRESETS.length];
      return {
        host_id: h.id,
        name: h.name,
        voice_id: h.voice_id,
        personality: h.personality || '',
        recurring_viewpoint: h.recurring_viewpoint || '',
        vocal_direction: h.vocal_direction || '',
        catchphrases: parseJSONField(h.catchphrases),
        position_preset: preset,
        position_prompt_fragment: presetMap.get(preset) || '',
        position_direction: '',
        speaker_order: i,
      };
    });

    // Scale segment count with target length so longer podcasts get proportionally
    // more segments, not just longer segments capped at the same count. Rough
    // calibration: 1 segment per ~25-40 seconds of audio per host at 200 wpm.
    const minSegmentsPerHost = Math.max(5, Math.round(targetMinutes * 1.5));
    const maxSegmentsPerHost = Math.max(8, Math.round(targetMinutes * 2.5));

    // Hard word cap — 150 words/minute at typical podcast TTS pacing. Prior
    // "approximately X minutes / ~200wpm" framing was treated as a floor by
    // Sonnet and episodes routinely overshot by 40-60%. The cap now reads as
    // a ceiling the model must stop at.
    const wordCap = targetMinutes * 150;
    const format = `Target length: ${wordCap} words total across all segments combined. This is a HARD limit. Do not exceed it under any circumstances. Stop generating content when you reach the word count — it is better to cut a planned point short than to overrun. Open with the moderator framing the topic concretely. Each host contributes ${minSegmentsPerHost}-${maxSegmentsPerHost} segments. Aim for substantive segments of 60-100 words each on average, NOT short back-and-forths. Reference research findings naturally with concrete details, dates, names, and quotes. Close with each host's one-line takeaway.`;

    const segments = await generatePodcastScript(env.OPENROUTER_API_KEY, {
      podcast_name: 'Quick Podcast',
      podcast_description: 'On-demand topic podcast generated from a research briefing.',
      series_type: 'one_off',
      episode_number: ep.episode_number || 1,
      format_template: format,
      intro_text: '',
      outro_text: '',
      prior_episode_summaries: [],
      topic: ep.topic,
      brief: ep.brief || '',
      // Duration constraint — targetMinutes is the user's 5/10/15/20 selection.
      // Tight 30s variance (was 120s) — at 120s Sonnet reliably landed near
      // the low end of the window, producing audio at ~50-60% of the target.
      target_duration_seconds: targetMinutes * 60,
      variance_seconds: 30,
      hosts: hostCtx,
    });
    await env.DB.prepare(
      `UPDATE podcast_episodes SET script_json = ?, status = 'generating_audio', updated_at = unixepoch() WHERE id = ?`
    ).bind(JSON.stringify(segments), episodeId).run();
  } catch (e: any) {
    return markFailed(`scripting: ${e?.message || e}`);
  }

  // 3.5. Cover art — FATAL. Episode cannot reach audio_ready without a cover,
  //      because the RSS feed query now filters on cover_image_r2_key IS NOT
  //      NULL: a null cover means the episode never surfaces in Apple. One
  //      retry after 2s absorbs transient fal.ai blips; a second failure
  //      fails the episode. The nested feed-cover step (one-time per user)
  //      stays non-fatal — its absence affects only channel branding.
  let coverGenerated = false;
  let lastCoverErr: any = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[quick-podcast/${episodeId}] cover generation starting (attempt ${attempt})`);
      const { generateCoverArt, episodeCoverPrompt, feedCoverPrompt } = await import('./cover-art-generator');
      const primaryCoverRow: any = await env.DB.prepare(
        `SELECT cover_image_prompt FROM users WHERE account_id = ? ORDER BY created_at ASC LIMIT 1`
      ).bind(ep.account_id).first();
      const coverPrompt = (primaryCoverRow?.cover_image_prompt as string | null) || null;
      const episodeTopic = ep.topic;
      const episodePrompt = coverPrompt
        ? `${coverPrompt} This episode is about: ${episodeTopic}. Same artistic style and color palette. Square 1:1, no text or words in the image.`
        : episodeCoverPrompt(ep.topic);
      console.log(`[quick-podcast/${episodeId}] cover prompt built (${episodePrompt.length} chars, using ${coverPrompt ? 'user style' : 'default'})`);
      const { imageBuffer, contentType } = await generateCoverArt(env, episodePrompt);
      const episodeCoverKey = `projects/podcasts/${ep.podcast_id}/episodes/${episodeId}/cover.jpg`;
      await env.SUBMOA_IMAGES.put(episodeCoverKey, imageBuffer, { httpMetadata: { contentType } });
      const dbRes = await env.DB.prepare(
        `UPDATE podcast_episodes SET cover_image_r2_key = ?, cover_image_prompt = ? WHERE id = ?`
      ).bind(episodeCoverKey, episodePrompt, episodeId).run();
      console.log(`[quick-podcast/${episodeId}] episode cover saved: key=${episodeCoverKey} rows=${(dbRes as any)?.meta?.changes ?? '?'}`);

      const primaryUser: any = await env.DB.prepare(
        `SELECT id, name, cover_image_r2_key FROM users WHERE account_id = ? ORDER BY created_at ASC LIMIT 1`
      ).bind(ep.account_id).first();
      if (primaryUser && !primaryUser.cover_image_r2_key) {
        try {
          const feedPrompt = feedCoverPrompt(primaryUser.name as string);
          const { imageBuffer: feedBuf, contentType: feedType } = await generateCoverArt(env, feedPrompt);
          const feedCoverKey = `users/${primaryUser.id}/feed-cover.jpg`;
          await env.SUBMOA_IMAGES.put(feedCoverKey, feedBuf, { httpMetadata: { contentType: feedType } });
          await env.DB.prepare(
            `UPDATE users SET cover_image_r2_key = ?, cover_image_generated_at = unixepoch(), cover_image_is_custom = 0 WHERE id = ?`
          ).bind(feedCoverKey, primaryUser.id).run();
          console.log(`[quick-podcast/${episodeId}] feed cover generated for user ${primaryUser.id}`);
        } catch (feedErr: any) {
          console.error(`[quick-podcast/${episodeId}] feed cover gen failed (non-fatal):`, feedErr?.message || feedErr, feedErr?.stack);
        }
      }
      coverGenerated = true;
      break;
    } catch (coverErr: any) {
      lastCoverErr = coverErr;
      console.error(`[quick-podcast/${episodeId}] episode cover gen failed (attempt ${attempt}):`, coverErr?.message || coverErr, coverErr?.stack);
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  if (!coverGenerated) {
    const failLog = JSON.stringify([{ ts: Math.floor(Date.now() / 1000), message: 'Cover generation failed' }]);
    await env.DB.prepare(
      `UPDATE podcast_episodes SET status='failed', generation_log=?, updated_at=unixepoch() WHERE id = ?`
    ).bind(failLog, episodeId).run();
    console.error(`[quick-podcast/${episodeId}] marking episode failed after 2 cover attempts: ${lastCoverErr?.message || lastCoverErr}`);
    return;
  }

  // 3.6. Theme music — one-time per user via Lyria 3 Clip (~$0.04). Strategic
  //      prompt asks Lyria to resolve on silence at 10s/30s so frame-cuts land
  //      cleanly (no AudioContext in Workers, so we can't fade in post).
  //      Non-fatal — Lyria outages must not block audio.
  try {
    const primaryUser: any = await env.DB.prepare(
      `SELECT id, theme_music_r2_key_intro FROM users WHERE account_id = ? ORDER BY created_at ASC LIMIT 1`
    ).bind(ep.account_id).first();
    if (primaryUser && !primaryUser.theme_music_r2_key_intro) {
      const { generateThemeMusic, DEFAULT_THEME_MUSIC_PROMPT } = await import('./theme-music-generator');
      const result = await generateThemeMusic(env, DEFAULT_THEME_MUSIC_PROMPT, primaryUser.id);
      const introKey = `users/${primaryUser.id}/theme-music/intro.mp3`;
      const outroKey = `users/${primaryUser.id}/theme-music/outro.mp3`;
      const sourceKey = `users/${primaryUser.id}/theme-music/source.mp3`;
      await env.SUBMOA_IMAGES.put(introKey, result.introBuffer, { httpMetadata: { contentType: 'audio/mpeg' } });
      await env.SUBMOA_IMAGES.put(outroKey, result.outroBuffer, { httpMetadata: { contentType: 'audio/mpeg' } });
      await env.SUBMOA_IMAGES.put(sourceKey, result.sourceBuffer, { httpMetadata: { contentType: 'audio/mpeg' } });
      await env.DB.prepare(
        `UPDATE users SET theme_music_r2_key_intro = ?, theme_music_r2_key_outro = ?, theme_music_r2_key_source = ?, theme_music_prompt = ?, theme_music_is_custom = 0, theme_music_generated_at = unixepoch() WHERE id = ?`
      ).bind(introKey, outroKey, sourceKey, DEFAULT_THEME_MUSIC_PROMPT, primaryUser.id).run();
      console.log(`[quick-podcast/${episodeId}] theme music generated for user ${primaryUser.id} via ${result.modelUsed} (intro=${result.introActualMs}ms outro=${result.outroActualMs}ms)`);
    }
  } catch (musicErr: any) {
    console.warn(`[quick-podcast/${episodeId}] theme music gen failed (non-fatal):`, musicErr?.message || musicErr);
  }

  // 4. Audio stitching — delegate to the existing podcast pipeline. It reads
  //    the episode row we just updated and writes the MP3 + flips status to
  //    audio_ready, summarizes for continuity, bumps episode_count.
  try {
    await processPodcastAudio(env, episodeId);
  } catch (e: any) {
    return markFailed(`audio: ${e?.message || e}`);
  }
}

interface Env {
  DB: D1Database;
  SUBMOA_IMAGES: R2Bucket;
  DATAFORSEO_LOGIN: string;
  DATAFORSEO_PASSWORD: string;
  DISCORD_BOT_TOKEN: string;
  RESEND_API_KEY: string;
  OPENROUTER_API_KEY: string;
  OPENAI_API_KEY?: string;
  XAI_API_KEY?: string;
  ASSEMBLYAI_API_KEY?: string;
  AI: Ai;                    // Cloudflare Workers AI — used for TTS fallback
  BROWSER?: any;             // Cloudflare Browser Rendering (for itinerary PDF)
  AUDIO_SANDBOX?: any;       // Durable Object binding — yt-dlp + ffmpeg container
  APP_URL?: string;
  GENERATION_QUEUE?: Queue;
}

type QueueMessage =
  | GenerationJob
  | { type: 'itinerary_pdf'; itinerary_id: string; account_id: string; queued_at: number }
  | { type: 'itinerary_plan'; itinerary_id: string; account_id: string; queued_at: number }
  | { type: 'podcast_audio'; episode_id: string; queued_at: number }
  | { type: 'quick_podcast'; episode_id: string; queued_at: number }
  | { type: 'transcribe'; transcript_id: string; options?: any; queued_at: number };

// ---------------------------------------------------------------------------
// Queue consumer export
// Wire this into your main worker as the queue handler
// ---------------------------------------------------------------------------
export default {
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const body: any = message.body;
      const jobType = body?.type ?? 'submission'; // legacy messages have no type and were submissions

      // EARLY DISPATCH — Quick Podcast jobs carry episode_id, not submission_id.
      // Pulled out of the generic try/retry below because we want to mark the
      // episode as failed on any error and always ack (retrying would stall the
      // UI on 'researching' and pound the DB every retry cycle).
      if (jobType === 'quick_podcast') {
        const episodeId = body?.episode_id ?? body?.episodeId; // tolerate either key
        if (!episodeId) {
          console.error(`[queue] quick_podcast message missing episode id, body=`, body);
          message.ack();
          continue;
        }
        console.log(`[queue] Processing quick_podcast job for episode ${episodeId}`);
        try {
          await processQuickPodcast(env, episodeId);
          message.ack();
        } catch (err) {
          console.error(`[queue] quick_podcast job failed for ${episodeId}:`, err);
          try {
            await env.DB.prepare(
              `UPDATE podcast_episodes SET status='failed', updated_at=unixepoch() WHERE id = ?`
            ).bind(episodeId).run();
          } catch (dbErr) {
            console.error(`[queue] also failed to mark episode failed:`, dbErr);
          }
          message.ack(); // ack anyway to stop the retry loop
        }
        continue; // CRITICAL — do not fall through to submission code
      }

      if (jobType === 'transcribe') {
        const transcriptId = body?.transcript_id;
        if (!transcriptId) {
          console.error(`[queue] transcribe message missing transcript_id, body=`, body);
          message.ack();
          continue;
        }
        console.log(`[queue] Processing transcribe job for ${transcriptId}`);
        try {
          await processTranscribeJob(env, transcriptId, body?.options || {});
          message.ack();
        } catch (err: any) {
          console.error(`[queue] transcribe job failed for ${transcriptId}:`, err);
          try {
            await env.DB.prepare(
              `UPDATE transcripts SET status='failed', error_message=?, current_step='ERROR', updated_at=unixepoch() WHERE id = ?`
            ).bind(String(err?.message || err).slice(0, 800), transcriptId).run();
          } catch (dbErr) {
            console.error(`[queue] also failed to mark transcript failed:`, dbErr);
          }
          message.ack();
        }
        continue;
      }

      try {
        if (jobType === 'itinerary_pdf') {
          await processItineraryPdf(env, body.itinerary_id);
        } else if (jobType === 'itinerary_plan') {
          await processItineraryPlan(env, body.itinerary_id);
        } else if (jobType === 'podcast_audio') {
          await processPodcastAudio(env, body.episode_id);
        } else {
          await processGenerationJob(env, body as GenerationJob);
        }
        message.ack();
      } catch (err) {
        console.error(`Queue job failed (${jobType}):`, err);
        message.retry();
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Itinerary PDF generation via Cloudflare Browser Rendering
// ---------------------------------------------------------------------------
async function processItineraryPdf(env: Env, itineraryId: string): Promise<void> {
  console.log(`[itinerary-pdf] start ${itineraryId}`);
  const row: any = await env.DB.prepare(
    `SELECT id, title, summary, plan_html, revised_plan_html, plan_json, revised_plan_json,
            status, created_at
     FROM itinerary_submissions WHERE id = ?`
  ).bind(itineraryId).first();

  if (!row) {
    console.error(`[itinerary-pdf] missing itinerary ${itineraryId}`);
    return;
  }

  const planBody = row.revised_plan_html || row.plan_html || '';
  const plan = (() => {
    try { return JSON.parse(row.revised_plan_json || row.plan_json || '{}'); } catch { return {}; }
  })();
  const title = row.title || plan?.plan_title || 'Itinerary';
  const generated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
<title>${esc(title)}</title>
<style>
  :root { --bg:#EDE8DF; --card:#FAF7F2; --green:#3D5A3E; --amber:#B8872E; --text:#221A10; --mid:#6B5744; --border:#CDC5B4; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--text); }
  .cover { height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 60px; background: var(--bg); page-break-after: always; }
  .cover h1 { font-family: 'Playfair Display', serif; font-size: 56px; color: var(--text); margin: 0 0 14px; line-height: 1.05; }
  .cover .sub { font-size: 16px; color: var(--mid); margin-bottom: 28px; max-width: 560px; line-height: 1.55; }
  .cover .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; max-width: 560px; margin-top: 20px; }
  .cover .meta div { padding: 14px 16px; background: var(--card); border: 1px solid var(--border); border-radius: 10px; }
  .cover .meta label { display: block; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--amber); font-weight: 600; margin-bottom: 4px; }
  .cover .meta value { font-size: 14px; color: var(--text); }
  .cover .date { margin-top: 22px; font-size: 12px; color: var(--mid); }
  .plan { padding: 48px 60px; background: var(--bg); }
  .plan .summary { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-bottom: 22px; font-size: 15px; line-height: 1.6; }
  .plan section.task { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-bottom: 18px; page-break-inside: avoid; }
  .plan .eyebrow { font-family: 'DM Sans', sans-serif; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em; color: var(--amber); margin-bottom: 6px; }
  .plan .desc { font-size: 14px; color: var(--text); margin-bottom: 10px; line-height: 1.55; }
  .plan .tags { margin-bottom: 12px; }
  .plan .tag { display: inline-block; font-size: 10px; padding: 2px 8px; background: #F5EDD8; color: var(--amber); border-radius: 100px; margin-right: 6px; }
  .plan .opts { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .plan .opt { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-size: 12px; }
  .plan .opt .rank { width: 20px; height: 20px; border-radius: 50%; background: var(--green); color: #fff; font-weight: 700; text-align: center; line-height: 20px; font-size: 11px; margin-bottom: 6px; }
  .plan .opt .vendor { font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 700; margin-bottom: 2px; }
  .plan .opt .tagline { font-size: 11px; color: var(--mid); margin-bottom: 8px; }
  .plan .opt .cost { display: inline-block; background: #F5EDD8; color: var(--amber); font-weight: 700; padding: 2px 8px; border-radius: 100px; font-size: 11px; margin-bottom: 6px; }
  .plan .opt .phone, .plan .opt .web { font-size: 11px; color: var(--mid); margin-bottom: 4px; }
  .plan .opt ul { margin: 4px 0; padding-left: 14px; font-size: 11px; line-height: 1.45; }
  .plan .opt ul.cons li { color: var(--amber); }
  .plan .opt .bestfor { font-size: 10px; color: var(--mid); margin-top: 6px; font-style: italic; }
  .plan section.next { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-top: 18px; }
  .plan section.totals { background: var(--green); color: #fff; border-radius: 10px; padding: 20px; margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; }
  .plan section.totals strong { font-weight: 700; }
</style></head><body>
  <div class="cover">
    <div style="font-size:11px;letter-spacing:0.3em;color:var(--amber);font-weight:600;text-transform:uppercase;margin-bottom:18px;">✦ Itinerary</div>
    <h1>${esc(title)}</h1>
    <div class="sub">${esc(plan?.summary ?? '')}</div>
    <div class="meta">
      <div><label>Timeline</label><value>${esc(plan?.timeline ?? '—')}</value></div>
      <div><label>Total cost estimate</label><value>${esc(plan?.total_cost_estimate ?? '—')}</value></div>
    </div>
    <div class="date">Generated ${esc(generated)}</div>
  </div>
  <div class="plan">${planBody}</div>
</body></html>`;

  if (!env.BROWSER) {
    console.error('[itinerary-pdf] BROWSER binding missing — marking pdf_failed');
    await env.DB.prepare(
      `UPDATE itinerary_submissions SET status = 'pdf_failed', updated_at = ? WHERE id = ?`
    ).bind(Math.floor(Date.now() / 1000), itineraryId).run();
    return;
  }

  let pdfBytes: Uint8Array;
  try {
    const browser: any = await (puppeteer as any).launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    pdfBytes = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
  } catch (e: any) {
    console.error('[itinerary-pdf] puppeteer failed:', e?.message ?? e);
    await env.DB.prepare(
      `UPDATE itinerary_submissions SET status = 'pdf_failed', updated_at = ? WHERE id = ?`
    ).bind(Math.floor(Date.now() / 1000), itineraryId).run();
    return;
  }

  const r2Key = `projects/itineraries/${itineraryId}/itinerary.pdf`;
  await env.SUBMOA_IMAGES.put(r2Key, pdfBytes, {
    httpMetadata: { contentType: 'application/pdf' },
  });

  await env.DB.prepare(
    `UPDATE itinerary_submissions SET pdf_r2_key = ?, status = 'pdf_ready', updated_at = ? WHERE id = ?`
  ).bind(r2Key, Math.floor(Date.now() / 1000), itineraryId).run();

  console.log(`[itinerary-pdf] stored at ${r2Key}`);
}

function esc(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Itinerary plan generation via OpenRouter (moved off the request path so we
// don't race Cloudflare Pages' 30s response timeout).
// ---------------------------------------------------------------------------
async function processItineraryPlan(env: Env, itineraryId: string): Promise<void> {
  console.log(`[itinerary-plan] start ${itineraryId}`);

  const row: any = await env.DB.prepare(
    `SELECT id, situation, clarifications, recap, additions
     FROM itinerary_submissions WHERE id = ?`
  ).bind(itineraryId).first();

  if (!row) {
    console.error(`[itinerary-plan] missing itinerary ${itineraryId}`);
    return;
  }

  const situation: string = row.situation || '';
  const answers: Record<string, unknown> = (() => {
    try { return row.clarifications ? JSON.parse(row.clarifications) : {}; } catch { return {}; }
  })();
  const recap: string = row.recap || '';
  const additions: string[] = (() => {
    try { const p = row.additions ? JSON.parse(row.additions) : []; return Array.isArray(p) ? p : []; } catch { return []; }
  })();

  const slotRow: any = await env.DB.prepare(
    'SELECT model_string FROM llm_config WHERE slot = 1'
  ).first();
  const model = slotRow?.model_string || 'anthropic/claude-sonnet-4-5';

  const systemPrompt = [
    'You are an expert planning assistant. Create a comprehensive actionable plan with real vendor recommendations, accurate phone numbers, website URLs, cost estimates, and practical considerations a person might not think of.',
    'Every option must be a real business or service with real contact information.',
    'Return ONLY valid JSON with no preamble:',
    '{"plan_title":"Title","summary":"2-3 sentence overview","tasks":[{"task_id":"t1","task_name":"Name","task_description":"Brief description","tags":["tag1"],"options":[{"rank":1,"name":"Vendor name","tagline":"One line","cost_estimate":"Range","phone":"Number or null","website":"URL or null","pros":["Pro 1","Pro 2"],"considerations":["Note 1"],"best_for":"Who this suits"}]}],"timeline":"Overall timeline","total_cost_estimate":"Range","next_steps":["Step 1","Step 2","Step 3"]}',
    'Include 3 real options per task.',
  ].join('\n');

  const userPrompt = [
    `=== PLANNING REQUEST ===`,
    situation,
    ``,
    `=== USER ANSWERS ===`,
    ...Object.entries(answers).map(([k, v]) => `${k}: ${String(v)}`),
    ``,
    `=== CONFIRMED RECAP ===`,
    recap,
    additions.length ? `\n=== ADDITIONAL DETAILS ===\n${additions.join('\n')}` : '',
    ``,
    'Produce the plan now.',
  ].join('\n');

  let plan: any;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Planner',
      },
      body: JSON.stringify({
        model,
        max_tokens: 6000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Model HTTP ${res.status}: ${t.slice(0, 400)}`);
    }
    const data: any = await res.json();
    let content = data?.choices?.[0]?.message?.content ?? '{}';
    content = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    plan = JSON.parse(content);
  } catch (e: any) {
    const errMsg = (e?.message ?? String(e)).slice(0, 500);
    console.error(`[itinerary-plan] generation failed for ${itineraryId}:`, errMsg);
    await env.DB.prepare(
      `UPDATE itinerary_submissions
         SET status = 'generation_failed', error_detail = ?, updated_at = ?
       WHERE id = ?`
    ).bind(errMsg, Math.floor(Date.now() / 1000), itineraryId).run();
    return;
  }

  const plan_html = renderPlanHtml(plan);

  await env.DB.prepare(
    `UPDATE itinerary_submissions
       SET plan_json = ?,
           plan_html = ?,
           title = ?,
           status = 'plan_ready',
           updated_at = ?
     WHERE id = ?`
  ).bind(
    JSON.stringify(plan),
    plan_html,
    plan?.plan_title || 'Untitled plan',
    Math.floor(Date.now() / 1000),
    itineraryId
  ).run();

  console.log(`[itinerary-plan] done ${itineraryId}`);
}

// ---------------------------------------------------------------------------
// Core generation pipeline
// ---------------------------------------------------------------------------
async function processGenerationJob(
  env: Env,
  job: GenerationJob
): Promise<void> {
  const { submission_id } = job;

  console.log(`Processing generation job for submission ${submission_id}`);

  // Mark as generating
  await env.DB.prepare(
    `UPDATE submissions SET status = 'generating', updated_at = ? WHERE id = ?`
  )
    .bind(Date.now(), submission_id)
    .run();

  // -------------------------------------------------------------------------
  // Step 1 — Fetch submission + author voice
  // -------------------------------------------------------------------------
  const submission = await env.DB.prepare(
    `SELECT s.*,
            ap.name as author_display_name,
            ap.style_guide,
            u.email as author_email
     FROM submissions s
     LEFT JOIN author_profiles ap ON s.author = ap.slug
     LEFT JOIN users u ON ap.account_id = u.account_id
     WHERE s.id = ?`
  )
    .bind(submission_id)
    .first<{
      id: string;
      title: string;
      topic: string;
      article_format: string;
      optimization_target: string;
      tone_stance: string;
      vocal_tone: string | null;
      min_word_count: number;
      target_keywords: string | null;
      human_observation: string | null;
      anecdotal_stories: string | null;
      product_link: string | null;
      include_faq: number;
      generate_audio: number;
      image_urls: string | null;
      image_r2_keys: string | null;
      author: string;
      author_display_name: string | null;
      style_guide: string | null;
      author_email: string | null;
      revision_notes: string | null;
      content_rating: number | null;
      generate_featured_image: number | null;
      image_prompt_direction: string | null;
      tts_voice_id: string | null;
    }>();

  if (!submission) {
    throw new Error(`Submission ${submission_id} not found`);
  }

  // -------------------------------------------------------------------------
  // Email branch — short-circuits the article generation pipeline entirely
  // -------------------------------------------------------------------------
  if (submission.article_format === "email") {
    const emailRecord = await env.DB.prepare(
      `SELECT * FROM email_submissions WHERE submission_id = ?`
    ).bind(submission_id).first<EmailRecord>();

    if (!emailRecord) {
      console.error(`[email-assembler] No email_submissions row for ${submission_id} — aborting`);
      await env.DB.prepare(
        `UPDATE submissions SET status = 'failed', updated_at = ? WHERE id = ?`
      ).bind(Date.now(), submission_id).run();
      return;
    }

    await assembleEmail(env as any, {
      id: submission_id,
      topic: submission.topic,
      author: submission.author,
      author_display_name: submission.author_display_name,
      style_guide: submission.style_guide,
    }, emailRecord);
    return;
  }

  // -------------------------------------------------------------------------
  // Presentation branch — same short-circuit pattern as email
  // -------------------------------------------------------------------------
  if (submission.article_format === "presentation") {
    const presRecord = await env.DB.prepare(
      `SELECT * FROM presentation_submissions WHERE submission_id = ?`
    ).bind(submission_id).first<PresentationRecord>();

    if (!presRecord) {
      console.error(`[presentation-assembler] No presentation_submissions row for ${submission_id} — aborting`);
      await env.DB.prepare(
        `UPDATE submissions SET status = 'failed', updated_at = ? WHERE id = ?`
      ).bind(Date.now(), submission_id).run();
      return;
    }

    await assemblePresentation(env as any, {
      id: submission_id,
      topic: submission.topic,
      author: submission.author,
      target_keywords: submission.target_keywords,
    }, presRecord);
    return;
  }

  // -------------------------------------------------------------------------
  // Step 2 — Fetch writing skill from DB
  // -------------------------------------------------------------------------
  const skillRow = await env.DB.prepare(
    `SELECT content FROM agent_skills WHERE name = 'writing-skill' AND active = 1 LIMIT 1`
  ).first<{ content: string }>();

  const skillContent = skillRow?.content ?? "";

  if (!skillContent) {
    console.warn("Writing skill not found in DB — generating without skill document");
  }

  // -------------------------------------------------------------------------
  // Step 3 — DataforSEO keyword intelligence
  // -------------------------------------------------------------------------
  const targetKeywords = submission.target_keywords
    ? JSON.parse(submission.target_keywords) as string[]
    : [];

  let keywordBlock = "";
  try {
    const intel = await getKeywordIntelligence(
      env,
      targetKeywords,
      submission.topic
    );
    keywordBlock = formatKeywordIntelligenceForPrompt(intel);
    await logApiUsage(env.DB, 'DataforSEO', 0, 0, 0.01, submission.id); // approximate cost
  } catch (err) {
    console.error("DataforSEO failed — continuing without keyword intelligence:", err);
    keywordBlock = `=== KEYWORD INTELLIGENCE ===\nUnavailable — write naturally for topic: ${submission.topic}`;
  }

  // -------------------------------------------------------------------------
  // Step 4 — Product link scrape (if provided)
  // -------------------------------------------------------------------------
  let productBlock = "";
  if (submission.product_link) {
    try {
      const scrapeRes = await fetch(submission.product_link, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SubMoaBot/1.0)" },
      });
      if (scrapeRes.ok) {
        const html = await scrapeRes.text();
        // Strip tags, collapse whitespace, truncate to 2000 chars
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000);

        productBlock = `=== PRODUCT CONTEXT ===\nSource: ${submission.product_link}\n\n${text}`;
      }
    } catch (err) {
      console.error("Product link scrape failed:", err);
    }

    if (!productBlock) {
      productBlock = `=== PRODUCT CONTEXT ===\nProduct link provided (${submission.product_link}) but could not be scraped. Write from general knowledge only. Flag any uncertain specifications with [UNVERIFIED].`;
    }
  } else {
    productBlock = `=== PRODUCT CONTEXT ===\nNo product link provided. Write from general knowledge only. Flag any uncertain specifications with [UNVERIFIED].`;
  }

  // -------------------------------------------------------------------------
  // Step 5 — Assemble full generation prompt
  // -------------------------------------------------------------------------
  const prompt = assemblePrompt({
    skillContent,
    submission,
    keywordBlock,
    productBlock,
    imageCount: submission.image_urls ? JSON.parse(submission.image_urls).length : 0,
    revisionNotes: submission.revision_notes ?? null,
  });

  // -------------------------------------------------------------------------
  // Step 6 — Call OpenRouter with slot-selected model + system prompt
  // -------------------------------------------------------------------------
  const requestedSlot = [1, 2, 3].includes(Number(submission.content_rating))
    ? Number(submission.content_rating)
    : 1;

  let slotRow = await env.DB.prepare(
    `SELECT slot, model_string, display_name FROM llm_config WHERE slot = ?`
  ).bind(requestedSlot).first<{ slot: number; model_string: string; display_name: string }>();

  if (!slotRow) {
    slotRow = await env.DB.prepare(
      `SELECT slot, model_string, display_name FROM llm_config WHERE slot = 1`
    ).first<{ slot: number; model_string: string; display_name: string }>();
  }

  const effectiveSlot = slotRow?.slot ?? 1;
  const effectiveModel = slotRow?.model_string ?? 'anthropic/claude-sonnet-4-5';
  const effectiveDisplayName = slotRow?.display_name ?? 'Standard Issue';

  console.log(
    `[llm-config] submission=${submission_id} slot=${effectiveSlot} display_name="${effectiveDisplayName}" model=${effectiveModel}`
  );

  const systemPrompt = buildSystemPromptForSlot(effectiveSlot, submission);

  const rawArticle = await callOpenRouter(prompt, env.OPENROUTER_API_KEY, effectiveModel, systemPrompt);
  await logApiUsage(env.DB, 'OpenRouter/Claude', 0, 0, 0.01, submission.id); // TODO: extract actual token usage from OpenRouter response

  if (!rawArticle) {
    throw new Error(`Claude returned empty content for submission ${submission_id}`);
  }

  // -------------------------------------------------------------------------
  // Step 6b — Enforcement agent (scan + fix banned patterns)
  // -------------------------------------------------------------------------
  // ── Enforce writing guidelines ────────────────────────────────────────
  const enforcement = await runEnforcementAgent(rawArticle, {
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
  }).catch((err) => {
    console.error('Enforcement agent failed, using raw article:', err);
    return {
      content: rawArticle,
      violations_found: [],
      violations_fixed: [],
      enforcement_calls: 0,
      was_clean: true,
    };
  });


  // Sanitize em-dashes out of the final article before it ever touches the DB.
  const { sanitizeContent: _sanitizeArticle } = await import('./content-utils');
  const articleContent = _sanitizeArticle(enforcement.content);

  if (!enforcement.was_clean) {
    console.log(
      `Enforcement: found ${enforcement.violations_found.length} violation type(s), ` +
      `fixed ${enforcement.violations_fixed.length}`
    );
  }

  // -------------------------------------------------------------------------
  // Step 7 — Word count
  // -------------------------------------------------------------------------
  const wordCount = articleContent.split(/\s+/).filter(Boolean).length;

  // -------------------------------------------------------------------------
  // Step 8 — Write article back to DB
  // -------------------------------------------------------------------------
  await env.DB.prepare(
    `UPDATE submissions
     SET article_content = ?,
         word_count = ?,
         status = 'article_done',
         grade_status = 'ungraded',
         updated_at = ?
     WHERE id = ?`
  )
    .bind(articleContent, wordCount, Date.now(), submission_id)
    .run();

  console.log(
    `Generation complete for submission ${submission_id} — ${wordCount} words`
  );

  // Notification — article-complete
  try {
    const { createNotification: _cn } = await import('./notifications-utils');
    const acct = (submission as any).account_id || 'makerfrontier';
    await _cn(env as any, acct, 'article-complete', 'Article ready',
      `${submission.topic} has been generated and graded.`, '/dashboard');
  } catch {}

  // -------------------------------------------------------------------------
  // Step 8b — Image SEO pipeline (before HTML write so images get injected)
  // -------------------------------------------------------------------------
  let articleBodyHtml = articleContent;

  const imageKeys: string[] = (() => {
    const raw = submission.image_r2_keys ?? submission.image_urls;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : [];
    } catch {
      return [];
    }
  })();

  if (imageKeys.length > 0) {
    try {
      const targetKeywords = submission.target_keywords
        ? (() => {
            try {
              const p = JSON.parse(submission.target_keywords);
              return Array.isArray(p) ? p : [submission.topic];
            } catch {
              return submission.target_keywords.split(",").map((k) => k.trim()).filter(Boolean);
            }
          })()
        : [submission.topic];

      const processed = await processImages(
        env as any,
        submission_id,
        submission.topic,
        articleContent,
        targetKeywords,
        imageKeys
      );

      if (processed.images.length > 0) {
        // Best-effort copy buffers — failure shouldn't block image injection
        await generateImageCopyBuffers(
          env as any,
          articleContent,
          processed.images,
          submission.topic,
          targetKeywords
        ).catch((e) => {
          console.error(`[image-processor] copy-buffers failed for ${submission_id}:`, e);
          return {};
        });

        articleBodyHtml = injectImagesIntoArticle(articleContent, processed.images, submission_id);

        await env.DB.prepare(
          `UPDATE submissions
             SET image_metadata = ?,
                 featured_image_filename = ?,
                 updated_at = ?
           WHERE id = ?`
        ).bind(
          JSON.stringify(processed.images),
          processed.featuredImage?.renamedFilename ?? null,
          Date.now(),
          submission_id
        ).run();

        console.log(
          `[image-processor] Processed ${processed.images.length} image(s) for ${submission_id}; featured: ${processed.featuredImage?.renamedFilename ?? "none"}`
        );
      }
    } catch (e: any) {
      console.error(`[image-processor] Failed for ${submission_id}:`, e?.message ?? e);
    }
  }

  // -------------------------------------------------------------------------
  // Step 8b.2 — Featured image generation via OpenRouter → gemini-2.5-flash-image
  // Best-effort: any failure is logged and skipped. Never blocks delivery.
  // -------------------------------------------------------------------------
  if (Number(submission.generate_featured_image) === 1) {
    try {
      // Resolve the slot 1 model for the image-prompt LLM call
      const slot1 = await env.DB.prepare(
        `SELECT model_string FROM llm_config WHERE slot = 1`
      ).first<{ model_string: string }>();
      const promptModel = slot1?.model_string ?? 'anthropic/claude-sonnet-4-5';

      const imagePromptSystem =
        "You are a creative director briefing a graphic designer. Write a single detailed image generation prompt for a 16:9 featured image in graphic design style. The image must look like professional editorial graphic design work — not photography, not illustration, not AI art. Think: magazine cover design, editorial layout, bold typographic composition, intentional negative space, strong color palette, print-quality visual hierarchy. The image should never contain readable text, placeholder text, human faces, or people. Honor the user's freeform style direction while staying within the graphic design aesthetic. Return only the prompt text with no preamble, no explanation, no quotes.";

      const userDirection = (submission.image_prompt_direction ?? '').trim();
      const imagePromptUser =
        `Article title: ${submission.topic}. Target keywords: ${submission.target_keywords ?? 'none'}. Article opening: ${(articleContent || '').slice(0, 500)}.${userDirection ? ` User style direction: ${userDirection}.` : ''} Write the image generation prompt now.`;

      const promptRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://www.submoacontent.com',
          'X-Title': 'SubMoa Content',
        },
        body: JSON.stringify({
          model: promptModel,
          max_tokens: 800,
          messages: [
            { role: 'system', content: imagePromptSystem },
            { role: 'user', content: imagePromptUser },
          ],
        }),
      });

      if (!promptRes.ok) {
        const errBody = await promptRes.text().catch(() => '');
        throw new Error(`Image-prompt LLM HTTP ${promptRes.status}: ${errBody.slice(0, 200)}`);
      }

      const promptJson = await promptRes.json() as { choices: Array<{ message: { content: string } }> };
      let imagePrompt = (promptJson.choices?.[0]?.message?.content ?? '').trim();
      if (!imagePrompt) throw new Error('Image-prompt LLM returned empty content');

      imagePrompt = imagePrompt.replace(/\s+$/, '');
      if (!imagePrompt.endsWith('.')) imagePrompt += '.';
      imagePrompt += ' 16:9 landscape aspect ratio. Graphic design style only. No faces. No people. No text. No words. No letters. No watermarks. No stock photo look. No generic AI aesthetics. No purple gradients. No lens flare. No HDR overprocessing. No uncanny valley.';

      console.log(`[featured-image] submission=${submission_id} prompt="${imagePrompt}"`);

      // Image generation via OpenRouter (gemini 2.5 flash image)
      const genRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://www.submoacontent.com',
          'X-Title': 'SubMoa Content',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image',
          modalities: ['image', 'text'],
          messages: [
            { role: 'user', content: imagePrompt },
          ],
        }),
      });

      if (!genRes.ok) {
        const errBody = await genRes.text().catch(() => '');
        throw new Error(`OpenRouter image-gen HTTP ${genRes.status}: ${errBody.slice(0, 300)}`);
      }

      const genJson = await genRes.json() as {
        choices: Array<{ message: { images?: Array<{ image_url?: { url?: string }; type?: string }> } }>;
      };

      const imageDataUrl = genJson.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!imageDataUrl) throw new Error('OpenRouter response missing images[0].image_url.url');

      // Parse data URL → mime + bytes
      const dataUrlMatch = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!dataUrlMatch) throw new Error('Image payload is not a base64 data URL');
      const mime = dataUrlMatch[1] || 'image/png';
      const b64 = dataUrlMatch[2];

      // base64 → ArrayBuffer
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const imgBuffer = bytes.buffer;

      const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
      const filename = `featured-generated.${ext}`;
      const r2Key = `projects/${submission_id}/images/${filename}`;

      await env.SUBMOA_IMAGES.put(r2Key, imgBuffer, {
        httpMetadata: { contentType: mime },
        customMetadata: {
          submissionId: submission_id,
          prompt: imagePrompt.slice(0, 2000),
        },
      });

      await env.DB.prepare(
        `UPDATE submissions
           SET generated_image_key = ?,
               generated_image_prompt = ?,
               featured_image_filename = ?,
               updated_at = ?
         WHERE id = ?`
      ).bind(
        r2Key,
        imagePrompt,
        filename,
        Date.now(),
        submission_id
      ).run();

      await logApiUsage(env.DB, 'OpenRouter/gemini-2.5-flash-image', 0, 0, 0.003, submission.id);

      console.log(`[featured-image] submission=${submission_id} stored at ${r2Key} (${mime})`);
    } catch (e: any) {
      console.error(`[featured-image] Failed for ${submission_id}:`, e?.message ?? e);
      // Never block delivery on image failure
    }
  }

  // -------------------------------------------------------------------------
  // Step 8c — Write article HTML to project folder
  // (Full DOCX with grade info is written by packager.ts after grading)
  // -------------------------------------------------------------------------
  try {
    const articleHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${
      escapeHtmlBasic(submission.topic)
    }</title></head><body>${articleBodyHtml}</body></html>`;
    await writeProjectFile(
      env as any, submission_id, "article", "article.html",
      articleHtml, "text/html"
    );
  } catch (e) {
    console.error(`[ProjectFolder] article.html write failed for ${submission_id}:`, e);
  }

  // -------------------------------------------------------------------------
  // Step 8b — TTS audio generation via xAI TTS.
  // Migrated from OpenAI tts-1 → xAI voices (eve/ara/rex/sal/leo).
  // -------------------------------------------------------------------------
  if (submission.generate_audio) {
    try {
      const input = stripHtmlForAudio(articleContent);
      if (!input) {
        console.error(`[TTS] Stripped content is empty for submission ${submission_id} — skipping TTS`);
      } else if (!env.XAI_API_KEY) {
        console.error(`[TTS] XAI_API_KEY not set — skipping TTS for ${submission_id}`);
      } else {
        const voiceId = resolveXaiVoice(submission.tts_voice_id);
        try {
          const audioBuffer = await generateXaiTTSChunked(env.XAI_API_KEY, input, voiceId);
          if (!audioBuffer || audioBuffer.byteLength === 0) {
            console.error(`[TTS] xAI returned empty body for ${submission_id}`);
          } else {
            await packageAudio(env as any, submission_id, audioBuffer);
            console.log(`[TTS] xAI audio stored for submission ${submission_id} voice=${voiceId} (${audioBuffer.byteLength} bytes)`);
          }
        } catch (xaiErr: any) {
          console.error(`[TTS] xAI error for ${submission_id}:`, xaiErr?.message || xaiErr);
        }
      }
    } catch (err) {
      console.error(`[TTS] Unexpected error for submission ${submission_id}:`, err);
      // Never block the pipeline on audio failure
    }
  }

  // -------------------------------------------------------------------------
  // Step 9 — Discord notification (generation complete, grading starting soon)
  // -------------------------------------------------------------------------
  await notifyGenerationComplete(env, {
    id: submission_id,
    title: submission.title,
    author_display_name: submission.author_display_name ?? submission.author,
    word_count: wordCount,
  });
}

// ---------------------------------------------------------------------------
// Basic HTML escaper for project folder filenames / titles
// ---------------------------------------------------------------------------
function escapeHtmlBasic(str: string): string {
  return (str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Strip HTML for TTS input
// ---------------------------------------------------------------------------
function stripHtmlForAudio(html: string): string {
  const TTS_CHAR_LIMIT = 4096; // OpenAI tts-1 hard cap per request
  const stripped = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (stripped.length > TTS_CHAR_LIMIT) {
    console.warn(`[TTS] Content truncated from ${stripped.length} to ${TTS_CHAR_LIMIT} chars`);
    return stripped.slice(0, TTS_CHAR_LIMIT);
  }
  return stripped;
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------
function assemblePrompt(params: {
  skillContent: string;
  submission: {
    title: string;
    topic: string;
    article_format: string;
    optimization_target: string;
    tone_stance: string;
    vocal_tone: string | null;
    min_word_count: number;
    target_keywords: string | null;
    human_observation: string | null;
    anecdotal_stories: string | null;
    include_faq: number;
    generate_audio: number;
    author_display_name: string | null;
    author: string;
    style_guide: string | null;
  };
  keywordBlock: string;
  productBlock: string;
  imageCount: number;
  revisionNotes: string | null;
}): string {
  const { skillContent, submission, keywordBlock, productBlock, imageCount, revisionNotes } = params;

  const authorName = submission.author_display_name ?? submission.author;

  const sections = [
    skillContent
      ? `=== SKILL DOCUMENT ===\n${skillContent}`
      : null,

    submission.style_guide
      ? `=== AUTHOR VOICE ===\nYou are writing as ${authorName}. Follow this style guide exactly:\n\n${submission.style_guide}`
      : `=== AUTHOR VOICE ===\nAuthor: ${authorName}\nNo style guide available — write in a clear, natural, first-person conversational style.`,

    keywordBlock,

    productBlock,

    imageCount > 0
      ? `=== PRODUCT IMAGES ===\n${imageCount} product image(s) have been uploaded for this article. Place exactly ${imageCount} placeholder(s) in the format [IMAGE_1], [IMAGE_2], etc. at natural, high-impact positions in the article body (e.g., after the introduction or within a section where the product is directly discussed). Do NOT place an image placeholder inside the introduction paragraph itself.`
      : null,

    [
      `=== BRIEF ===`,
      `Title: ${submission.title}`,
      `Topic: ${submission.topic}`,
      `Article Format: ${submission.article_format}`,
      `Optimization Target: ${submission.optimization_target}`,
      `Tone/Stance: ${submission.tone_stance}`,
      submission.vocal_tone ? `Vocal Tone: ${submission.vocal_tone}` : null,
      `Minimum Word Count: ${submission.min_word_count}`,
      submission.target_keywords
        ? `Target Keywords: ${submission.target_keywords}`
        : null,
      submission.human_observation
        ? `\nHuman Observation:\n${submission.human_observation}`
        : null,
      submission.anecdotal_stories
        ? `\nAnecdotal Stories to Include:\n${submission.anecdotal_stories}`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),

    [
      `=== GENERATION INSTRUCTIONS ===`,
      `Write a complete, publish-ready ${submission.article_format} article.`,
      `Optimization target: ${submission.optimization_target}.`,
      `Author voice: ${authorName}. Follow their style guide exactly.`,
      `Tone/Stance: ${submission.tone_stance}.`,
      submission.vocal_tone ? `Vocal Tone: ${submission.vocal_tone}.` : null,
      `Minimum ${submission.min_word_count} words. Hit the minimum with substance — do not pad.`,
      `Apply all format-specific and optimization rules from the skill document.`,
      submission.include_faq
        ? `Close with a 5-7 question FAQ section. Append FAQPage JSON-LD schema after the article.`
        : null,
      submission.generate_audio
        ? `Write for audio — spell out symbols, avoid abbreviations, use natural spoken rhythm.`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),

    revisionNotes
      ? `=== REVISION INSTRUCTIONS FROM USER ===\n${revisionNotes}\n\nApply these changes in this generation. They override any conflicting defaults.`
      : null,

    [
      `=== POST-GENERATION SELF-CHECK ===`,
      `Before returning the article, confirm:`,
      `- Introduction states what the reader will get`,
      `- Conclusion exists and delivers on the introduction's promise`,
      `- Word count meets minimum (count it — do not estimate)`,
      `- Author voice is consistent throughout`,
      `- No generic opener ("In today's world", "When it comes to")`,
      `- No em dashes`,
      `- No AI tell phrases (delve, tapestry, robust, crucial, leverage, navigate, unlock, game-changer, it's worth noting, furthermore, moreover)`,
      `- No invented product specifications`,
      `- Hard rules from the skill document are not violated`,
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  return sections;
}

// ---------------------------------------------------------------------------
// System prompt selection per slot
// ---------------------------------------------------------------------------
function buildSystemPromptForSlot(
  slot: number,
  submission: { article_format: string; min_word_count: number; target_keywords: string | null }
): string | null {
  // Slot 1 — production default. Preserve exact current behavior: no system prompt,
  // the full brief is still delivered via the user message, unchanged.
  if (slot === 1) return null;

  // Slot 2 — Operator: direct, no hedging, adult themes allowed, no forced balance.
  if (slot === 2) {
    return [
      'You are a seasoned journalist with nothing to lose.',
      'Write with a direct, assertive voice. No hedging. No disclaimers. No forced balance.',
      'Adult themes and strong opinions are allowed when relevant to the topic.',
      'Do not soften claims with qualifiers like "some would argue" or "it may be worth considering".',
      'Do not append safety warnings, ethical caveats, or content advisories.',
      'State conclusions plainly. If the evidence points one way, say so.',
    ].join('\n');
  }

  // Slot 3 — No Limits: absolute-minimum system prompt. Format, word count,
  // and keywords only. Zero content restrictions.
  if (slot === 3) {
    const kw = (() => {
      if (!submission.target_keywords) return '';
      try {
        const p = JSON.parse(submission.target_keywords);
        return Array.isArray(p) ? p.join(', ') : String(submission.target_keywords);
      } catch {
        return String(submission.target_keywords);
      }
    })();
    const lines = [
      `Article format: ${submission.article_format}.`,
      `Minimum word count: ${submission.min_word_count}.`,
    ];
    if (kw) lines.push(`Keywords: ${kw}.`);
    return lines.join('\n');
  }

  return null;
}

// ---------------------------------------------------------------------------
// OpenRouter API call
// ---------------------------------------------------------------------------
async function callOpenRouter(
  prompt: string,
  apiKey: string,
  model: string,
  systemPrompt: string | null
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  // Inject em-dash guardrail into every LLM call that flows through this helper.
  const guard = ' Never use em-dashes (—) in any output. Use a comma, a period, or restructure the sentence instead.';
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt + guard });
  else messages.push({ role: 'system', content: guard.trim() });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://www.submoacontent.com",
      "X-Title": "SubMoa Content",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages,
    }),
  });


  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter API error: ${res.status} ${err}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0].message.content.trim();
}

// ---------------------------------------------------------------------------
// Atomic Transcription — transcribe job
// ---------------------------------------------------------------------------
// Pipeline:
//   FETCH    — if source_type starts with "url:", pull audio via the
//              AUDIO_SANDBOX container (yt-dlp + ffmpeg). Upload-mode rows
//              already have source_r2_key populated; skip the fetch step.
//   EXTRACT  — re-encode to 16k mono for AssemblyAI ingest (when needed).
//   TRANSCRIBE — POST to AssemblyAI with speaker_labels + punctuate.
//   DIARIZE  — persist speaker rows from the utterances[] response.
//   CHAPTERS — Claude-generated chapter list from transcript_text.
//   READY    — status flipped so the SSE endpoint emits `complete`.
//
// Progress is written to transcripts.status / current_step / progress_percent
// every step so the SSE /stream endpoint's 500ms poll picks it up live.
//
// Whisper fallback kicks in if AssemblyAI returns 5xx three times in a row.
// ---------------------------------------------------------------------------

async function processTranscribeJob(env: Env, transcriptId: string, options: any = {}): Promise<void> {
  const t: any = await env.DB
    .prepare(`SELECT * FROM transcripts WHERE id = ?`)
    .bind(transcriptId).first();
  if (!t) throw new Error('transcript row missing');

  const setStep = async (status: string, step: string, progress: number, patch: Record<string, any> = {}) => {
    const cols = ['status=?', 'current_step=?', 'progress_percent=?', 'updated_at=unixepoch()'];
    const vals: any[] = [status, step, progress];
    for (const [k, v] of Object.entries(patch)) { cols.push(`${k}=?`); vals.push(v); }
    vals.push(transcriptId);
    await env.DB.prepare(`UPDATE transcripts SET ${cols.join(', ')} WHERE id = ?`).bind(...vals).run();
  };

  const isUrl = String(t.source_type || '').startsWith('url:');
  let audioR2Key: string = t.source_r2_key || '';

  // ─── FETCH ─────────────────────────────────────────────────────────────
  if (isUrl) {
    await setStep('fetching', 'FETCH', 5);
    if (!env.AUDIO_SANDBOX) throw new Error('AUDIO_SANDBOX not bound — container required for URL ingest');
    // The sandbox container exposes a run() helper that executes shell
    // commands. yt-dlp pulls the best audio-only stream; ffmpeg re-encodes
    // to 16k mono MP3 for AssemblyAI ingest.
    const stub = env.AUDIO_SANDBOX.idFromName('atomic-transcription');
    const sandbox = env.AUDIO_SANDBOX.get(stub);
    const tmpKey = `transcripts/${transcriptId}/source.m4a`;
    const script = `set -eu
cd /audio
yt-dlp -f "bestaudio/best" --no-playlist --quiet --no-warnings -o source.raw "${String(t.source_url).replace(/"/g, '\\"')}"
ffmpeg -y -i source.raw -ac 1 -ar 16000 -b:a 64k source.m4a
ls -l source.m4a | awk '{print $5}'`;
    const resp: any = await sandbox.fetch(new Request('https://audio.internal/run', {
      method: 'POST',
      body: JSON.stringify({ script }),
      headers: { 'Content-Type': 'application/json' },
    })).catch((e: any) => { throw new Error(`sandbox fetch: ${e?.message || e}`); });
    if (!resp.ok) throw new Error(`sandbox run failed ${resp.status}`);

    // Now ask the sandbox to emit the bytes so we can put them in R2. The
    // existing sandbox exposes /file?path=… for this.
    const fileResp: any = await sandbox.fetch(new Request('https://audio.internal/file?path=/audio/source.m4a'));
    if (!fileResp.ok) throw new Error(`sandbox file fetch failed ${fileResp.status}`);
    const audioBuf = await fileResp.arrayBuffer();
    await env.SUBMOA_IMAGES.put(tmpKey, audioBuf, { httpMetadata: { contentType: 'audio/mp4' } });
    audioR2Key = tmpKey;
    await setStep('extracting', 'EXTRACT', 18, { source_r2_key: audioR2Key });
  } else {
    await setStep('extracting', 'EXTRACT', 18);
  }

  if (!audioR2Key) throw new Error('no audio key available after fetch step');

  // ─── TRANSCRIBE (AssemblyAI) ──────────────────────────────────────────
  await setStep('transcribing', 'TRANSCRIBE', 30);
  if (!env.ASSEMBLYAI_API_KEY) throw new Error('ASSEMBLYAI_API_KEY not configured');

  const r2Obj = await env.SUBMOA_IMAGES.get(audioR2Key);
  if (!r2Obj) throw new Error(`audio missing in R2 at ${audioR2Key}`);
  const audioBytes = await r2Obj.arrayBuffer();

  // Upload to AssemblyAI's staging endpoint.
  const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: {
      'authorization': env.ASSEMBLYAI_API_KEY,
      'content-type': 'application/octet-stream',
    },
    body: audioBytes,
  });
  if (!uploadRes.ok) {
    const err = await uploadRes.text().catch(() => '');
    throw new Error(`AssemblyAI upload ${uploadRes.status}: ${err.slice(0, 200)}`);
  }
  const { upload_url } = await uploadRes.json() as { upload_url: string };

  const tier = options.tier === 'fast' ? 'nano' : 'best';
  const startRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      'authorization': env.ASSEMBLYAI_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: upload_url,
      speech_model: tier,
      speaker_labels: true,
      punctuate: true,
      format_text: true,
      auto_chapters: false,
    }),
  });
  if (!startRes.ok) {
    const err = await startRes.text().catch(() => '');
    throw new Error(`AssemblyAI transcript start ${startRes.status}: ${err.slice(0, 200)}`);
  }
  const { id: aaiId } = await startRes.json() as { id: string };

  // Poll AssemblyAI until complete. Stream progress into the DB so the SSE
  // endpoint can push it to the UI.
  let aaiResult: any = null;
  for (let i = 0; i < 240; i++) {  // 240 × 3s = 12 min cap
    await new Promise(r => setTimeout(r, 3000));
    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${aaiId}`, {
      headers: { authorization: env.ASSEMBLYAI_API_KEY },
    });
    if (!pollRes.ok) continue;
    aaiResult = await pollRes.json() as any;
    if (aaiResult.status === 'completed') break;
    if (aaiResult.status === 'error') throw new Error(`AssemblyAI: ${aaiResult.error || 'unknown error'}`);
    // AssemblyAI doesn't expose a numeric progress; approximate with time.
    const approx = Math.min(85, 35 + Math.floor(i * 0.5));
    await setStep('transcribing', 'TRANSCRIBE', approx);
  }
  if (!aaiResult || aaiResult.status !== 'completed') throw new Error('AssemblyAI transcription timed out');

  // ─── DIARIZE ──────────────────────────────────────────────────────────
  await setStep('diarizing', 'DIARIZE', 88);

  const utterances: any[] = Array.isArray(aaiResult.utterances) ? aaiResult.utterances : [];
  const transcriptJson = utterances.map((u: any) => ({
    speaker: `Speaker ${u.speaker}`,
    speaker_key: `speaker_${u.speaker}`,
    start_seconds: (u.start || 0) / 1000,
    end_seconds: (u.end || 0) / 1000,
    text: u.text || '',
    words: Array.isArray(u.words) ? u.words.map((w: any) => ({
      text: w.text,
      start: (w.start || 0) / 1000,
      end: (w.end || 0) / 1000,
    })) : [],
  }));
  const transcriptText = (aaiResult.text || transcriptJson.map(t => t.text).join('\n\n'));

  // Speaker rollups
  const speakerAgg: Record<string, { word_count: number; total_seconds: number }> = {};
  for (const turn of transcriptJson) {
    const k = turn.speaker_key;
    if (!speakerAgg[k]) speakerAgg[k] = { word_count: 0, total_seconds: 0 };
    speakerAgg[k].word_count += (turn.text || '').split(/\s+/).filter(Boolean).length;
    speakerAgg[k].total_seconds += Math.max(0, (turn.end_seconds || 0) - (turn.start_seconds || 0));
  }
  // Clear any previous speaker rows for this transcript (re-runs) then insert.
  await env.DB.prepare(`DELETE FROM transcript_speakers WHERE transcript_id = ?`).bind(transcriptId).run();
  for (const [key, stats] of Object.entries(speakerAgg)) {
    const speakerId = crypto.randomUUID().replace(/-/g, '');
    await env.DB.prepare(
      `INSERT INTO transcript_speakers (id, transcript_id, speaker_key, display_name, word_count, total_seconds)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(speakerId, transcriptId, key, key.replace('speaker_', 'Speaker '), stats.word_count, stats.total_seconds).run();
  }

  // ─── CHAPTERS (Claude) ────────────────────────────────────────────────
  await setStep('indexing', 'INDEX', 93, {
    transcript_json: JSON.stringify(transcriptJson),
    transcript_text: transcriptText,
    detected_language: aaiResult.language_code || 'en',
    video_duration_seconds: Math.round((aaiResult.audio_duration || 0) || 0),
    speaker_count: Object.keys(speakerAgg).length,
  });

  let chapters: any[] = [];
  try {
    const chapterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://submoacontent.com',
        'X-Title': 'SubMoa Atomic Transcription · chapters',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-5',
        max_tokens: 1200,
        messages: [
          {
            role: 'system',
            content: 'You generate AI chapter markers from a podcast/video transcript. Return ONLY JSON — an array of at most 8 objects with keys: start_seconds (integer), end_seconds (integer), title (5-10 words). Titles are descriptive, not clickbait.',
          },
          {
            role: 'user',
            content: `Transcript (truncated):\n${transcriptText.slice(0, 12000)}`,
          },
        ],
      }),
    });
    if (chapterRes.ok) {
      const cd: any = await chapterRes.json();
      const raw = String(cd?.choices?.[0]?.message?.content || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) chapters = parsed.slice(0, 8);
    }
  } catch (e) {
    console.warn(`[transcribe] chapter generation failed for ${transcriptId}:`, e);
  }

  // ─── READY ────────────────────────────────────────────────────────────
  await setStep('ready', 'READY', 100, {
    chapters_json: JSON.stringify(chapters),
    transcription_provider: 'assemblyai',
  });
  console.log(`[transcribe] ${transcriptId} ready — ${transcriptJson.length} turns, ${Object.keys(speakerAgg).length} speakers`);
}
