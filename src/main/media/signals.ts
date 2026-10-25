/**
 * Decoded media and the pure rules that turn it into what gets embedded:
 * which moments of a video to sample, which of those frames are distinct
 * shots, and how a recording is cut into overlapping windows. Shared by the
 * app's Chromium decoder (`decoder.ts`) and the eval harness's ffmpeg one, so
 * both feed the indexer the same shape.
 */

/** One video frame as RGBA pixels, `t` seconds into the file. */
export interface Frame {
  t: number;
  width: number;
  height: number;
  rgba: Uint8Array;
}

/** A media file, decoded. `audio` is mono at AUDIO_RATE; null when there's no (decodable) soundtrack. */
export interface DecodedMedia {
  duration: number;
  audio: Float32Array | null;
  frames: Frame[];
}

/** Sample rate EmbeddingGemma 2's audio encoder expects. */
export const AUDIO_RATE = 16_000;
/** The audio encoder reads at most this much of one input. */
export const AUDIO_WINDOW_S = 30;
/** Windows overlap by 5 s so a sentence on a boundary is whole in one of them. */
export const AUDIO_STRIDE_S = 25;
/** Longest stretch of a file that's embedded (the rest is findable by name). */
export const MAX_MEDIA_S = 3600;
/** Seconds between sampled video frames. */
export const FRAME_INTERVAL_S = 3;
/** Most frames sampled from one video (longer ones are sampled evenly). */
export const MAX_FRAMES = 40;
/** Longest side of a decoded frame; the vision encoder downsizes further anyway. */
export const FRAME_MAX_SIDE = 448;
/** Vision soft tokens per frame: frames are many and coarse detail is enough. */
export const FRAME_BUDGET = 70;
/** Mean per-pixel brightness change (0–255) that makes a frame a new shot. */
export const SHOT_THRESHOLD = 10;

/** When to sample frames from a video of `duration` seconds. */
export function frameTimes(duration: number): number[] {
  const span = Math.min(duration, MAX_MEDIA_S);
  if (!(span > 0)) return [];
  const every = Math.max(FRAME_INTERVAL_S, span / MAX_FRAMES);
  const times: number[] = [];
  // Start a moment in: a video's first frame is often black.
  for (let t = Math.min(0.5, span / 2); t < span; t += every) times.push(Number(t.toFixed(3)));
  return times;
}

/** A 16×16 grayscale thumbnail of a frame, for cheap shot comparison. */
function thumb(f: Frame): Float32Array {
  const out = new Float32Array(256);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const sx = Math.min(f.width - 1, Math.floor(((x + 0.5) * f.width) / 16));
      const sy = Math.min(f.height - 1, Math.floor(((y + 0.5) * f.height) / 16));
      const i = (sy * f.width + sx) * 4;
      out[y * 16 + x] = 0.299 * f.rgba[i] + 0.587 * f.rgba[i + 1] + 0.114 * f.rgba[i + 2];
    }
  }
  return out;
}

/** Keep one frame per shot: a frame that looks like the last kept one is dropped. */
export function keepShots(frames: Frame[], threshold = SHOT_THRESHOLD): Frame[] {
  const kept: Frame[] = [];
  let last: Float32Array | null = null;
  for (const f of frames) {
    const t = thumb(f);
    let diff = Infinity;
    if (last) {
      diff = 0;
      for (let i = 0; i < 256; i++) diff += Math.abs(t[i] - last[i]);
      diff /= 256;
    }
    if (diff >= threshold) {
      kept.push(f);
      last = t;
    }
  }
  return kept;
}

/** A stretch of a recording: `start`/`end` in seconds. */
export interface AudioWindow {
  start: number;
  end: number;
  samples: Float32Array;
}

/** Cut mono audio into overlapping windows of at most AUDIO_WINDOW_S seconds. */
export function audioWindows(samples: Float32Array, rate = AUDIO_RATE): AudioWindow[] {
  const total = Math.min(samples.length, MAX_MEDIA_S * rate);
  const size = AUDIO_WINDOW_S * rate;
  const stride = AUDIO_STRIDE_S * rate;
  const out: AudioWindow[] = [];
  for (let start = 0; start < total; start += stride) {
    const end = Math.min(total, start + size);
    // A window adding under a second past the previous one holds nothing new.
    if (out.length && end - out[out.length - 1].end * rate < rate) break;
    out.push({ start: start / rate, end: end / rate, samples: samples.subarray(start, end) });
    if (end === total) break;
  }
  return out;
}
