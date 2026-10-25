/**
 * The eval harness's media decoder. The app decodes with Electron's Chromium
 * (`src/main/media/decoder.ts`), which vitest can't run, so evals use a local
 * ffmpeg/ffprobe (on PATH) to produce the same `DecodedMedia`: the same frame
 * times, frame size and audio format, via the shared rules in
 * `src/main/media/signals.ts`. Decoders differ slightly in scaling and
 * resampling, so eval numbers for audio/video are close to, not identical
 * with, what the app produces.
 */
import { spawn } from 'node:child_process';
import {
  AUDIO_RATE,
  FRAME_MAX_SIDE,
  frameTimes,
  MAX_MEDIA_S,
  type DecodedMedia,
  type Frame,
} from '../../src/main/media/signals';
import { isVideo } from '../../src/main/ai/index/extract';

/** Run a command, collecting stdout; rejects with stderr on a non-zero exit. */
function run(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => err.push(d));
    child.on('error', (e) =>
      reject(new Error(`${cmd} failed to start (${e.message}) — the eval needs ffmpeg/ffprobe on PATH for audio and video`)),
    );
    child.on('close', (code) =>
      code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${cmd} exited ${code}: ${Buffer.concat(err).toString().trim()}`)),
    );
  });
}

interface Probe {
  duration: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
}

async function probe(path: string): Promise<Probe> {
  const json = JSON.parse(
    (await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', path])).toString(),
  ) as { format: { duration?: string }; streams: { codec_type: string; width?: number; height?: number }[] };
  const video = json.streams.find((s) => s.codec_type === 'video');
  return {
    duration: Number(json.format.duration ?? 0),
    width: video?.width,
    height: video?.height,
    hasAudio: json.streams.some((s) => s.codec_type === 'audio'),
  };
}

export async function decodeWithFfmpeg(path: string): Promise<DecodedMedia> {
  const p = await probe(path);
  const frames: Frame[] = [];
  if (isVideo(path) && p.width && p.height) {
    const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(p.width, p.height));
    const width = Math.max(1, Math.round(p.width * scale));
    const height = Math.max(1, Math.round(p.height * scale));
    for (const t of frameTimes(p.duration)) {
      const rgba = await run('ffmpeg', [
        '-v', 'error', '-ss', String(t), '-i', path, '-frames:v', '1',
        '-vf', `scale=${width}:${height}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-',
      ]);
      // A seek past the last frame yields nothing; that sample simply doesn't exist.
      if (rgba.length === width * height * 4) frames.push({ t, width, height, rgba: new Uint8Array(rgba) });
    }
  }
  let audio: Float32Array | null = null;
  if (p.hasAudio) {
    const pcm = await run('ffmpeg', [
      '-v', 'error', '-i', path, '-t', String(MAX_MEDIA_S), '-vn', '-ac', '1', '-ar', String(AUDIO_RATE), '-f', 'f32le', '-',
    ]);
    audio = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 4)).slice();
  }
  return { duration: p.duration, audio, frames };
}
