// Pure-JS MP3 frame parser. Cuts MP3 files at frame boundaries near a target
// duration. No decoding required — works in Cloudflare Workers where
// AudioContext / AudioDecoder / OfflineAudioContext / lamejs-decode are
// unavailable. Walks frame sync headers and accumulates duration from
// samples-per-frame / sample rate until the target is met, then slices the
// buffer at the post-frame byte boundary.
//
// The cut lands at a valid MP3 frame boundary, producing a playable file.
// Audible quality at the cut depends on whether source audio has low signal
// energy at that moment — engineered into the Lyria prompt upstream.

interface FrameInfo {
  offset: number;       // byte offset of frame header
  size: number;         // frame size in bytes (header + payload)
  durationMs: number;
}

interface CutResult {
  buffer: ArrayBuffer;
  actualDurationMs: number;
  frameCount: number;
}

const MPEG_VERSION: Record<number, number | null> = { 0: 2.5, 1: null, 2: 2, 3: 1 };
const LAYER: Record<number, number | null> = { 0: null, 1: 3, 2: 2, 3: 1 };

// Layer 3 bitrate tables (kbps), indexed by 4-bit bitrate field.
const BITRATES_V1_L3 = [null, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, null];
const BITRATES_V2_L3 = [null, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, null];
const SAMPLE_RATES_V1 = [44100, 48000, 32000, null];
const SAMPLE_RATES_V2 = [22050, 24000, 16000, null];
const SAMPLE_RATES_V25 = [11025, 12000, 8000, null];
const SAMPLES_PER_FRAME_V1_L3 = 1152;
const SAMPLES_PER_FRAME_V2_L3 = 576;

function parseFrameHeader(view: DataView, offset: number): FrameInfo | null {
  if (offset + 4 > view.byteLength) return null;
  const b1 = view.getUint8(offset);
  const b2 = view.getUint8(offset + 1);
  const b3 = view.getUint8(offset + 2);
  if (b1 !== 0xFF || (b2 & 0xE0) !== 0xE0) return null;

  const versionBits = (b2 >> 3) & 0x03;
  const layerBits = (b2 >> 1) & 0x03;
  const bitrateIndex = (b3 >> 4) & 0x0F;
  const sampleRateIndex = (b3 >> 2) & 0x03;
  const padding = (b3 >> 1) & 0x01;

  const version = MPEG_VERSION[versionBits];
  const layer = LAYER[layerBits];
  if (version === null || layer !== 3) return null;

  const isV1 = version === 1;
  const bitrateTable = isV1 ? BITRATES_V1_L3 : BITRATES_V2_L3;
  const sampleRateTable = version === 2.5 ? SAMPLE_RATES_V25 : (isV1 ? SAMPLE_RATES_V1 : SAMPLE_RATES_V2);
  const samplesPerFrame = isV1 ? SAMPLES_PER_FRAME_V1_L3 : SAMPLES_PER_FRAME_V2_L3;

  const bitrate = bitrateTable[bitrateIndex];
  const sampleRate = sampleRateTable[sampleRateIndex];
  if (!bitrate || !sampleRate) return null;

  const size = Math.floor((samplesPerFrame / 8) * bitrate * 1000 / sampleRate) + padding;
  if (size < 4) return null;
  const durationMs = (samplesPerFrame / sampleRate) * 1000;
  return { offset, size, durationMs };
}

function skipId3v2(view: DataView): number {
  if (view.byteLength < 10) return 0;
  if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 || view.getUint8(2) !== 0x33) return 0;
  const tagSize =
    ((view.getUint8(6) & 0x7F) << 21) |
    ((view.getUint8(7) & 0x7F) << 14) |
    ((view.getUint8(8) & 0x7F) << 7) |
    (view.getUint8(9) & 0x7F);
  return 10 + tagSize;
}

export function cutMp3AtTime(source: ArrayBuffer, targetMs: number): CutResult {
  const view = new DataView(source);
  let offset = skipId3v2(view);
  let totalMs = 0;
  let frameCount = 0;
  let lastEnd = offset;

  while (offset < view.byteLength - 4) {
    const frame = parseFrameHeader(view, offset);
    if (!frame) { offset++; continue; }
    totalMs += frame.durationMs;
    frameCount++;
    offset += frame.size;
    lastEnd = offset;
    if (totalMs >= targetMs) break;
  }

  return { buffer: source.slice(0, lastEnd), actualDurationMs: totalMs, frameCount };
}

export function cutMp3Range(source: ArrayBuffer, startMs: number, endMs: number): CutResult {
  const view = new DataView(source);
  let offset = skipId3v2(view);
  let cumulativeMs = 0;
  let startByteOffset = offset;
  let startFound = false;
  let endByteOffset = view.byteLength;

  while (offset < view.byteLength - 4) {
    const frame = parseFrameHeader(view, offset);
    if (!frame) { offset++; continue; }
    if (!startFound && cumulativeMs >= startMs) {
      startByteOffset = offset;
      startFound = true;
    }
    cumulativeMs += frame.durationMs;
    offset += frame.size;
    if (cumulativeMs >= endMs) {
      endByteOffset = offset;
      break;
    }
  }

  if (!startFound) startByteOffset = view.byteLength; // startMs beyond source
  return {
    buffer: source.slice(startByteOffset, endByteOffset),
    actualDurationMs: Math.max(0, cumulativeMs - startMs),
    frameCount: -1,
  };
}
