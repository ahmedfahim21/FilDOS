import { describe, expect, it } from 'vitest';
import {
  AUDIO_RATE,
  audioWindows,
  FRAME_INTERVAL_S,
  frameTimes,
  keepShots,
  MAX_FRAMES,
  MAX_MEDIA_S,
  type Frame,
} from './signals';

const frame = (t: number, gray: number, w = 32, h = 18): Frame => ({
  t,
  width: w,
  height: h,
  rgba: new Uint8Array(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : gray)),
});

describe('frameTimes', () => {
  it('samples every few seconds, starting just after the first frame', () => {
    expect(frameTimes(10)).toEqual([0.5, 0.5 + FRAME_INTERVAL_S, 0.5 + 2 * FRAME_INTERVAL_S, 0.5 + 3 * FRAME_INTERVAL_S]);
  });

  it('spreads a long video’s samples evenly, capped', () => {
    const times = frameTimes(2 * 3600);
    expect(times.length).toBeLessThanOrEqual(MAX_FRAMES);
    expect(times.at(-1)!).toBeLessThan(MAX_MEDIA_S);
  });

  it('handles very short and empty videos', () => {
    expect(frameTimes(0.4)).toEqual([0.2]);
    expect(frameTimes(0)).toEqual([]);
    expect(frameTimes(Number.NaN)).toEqual([]);
  });
});

describe('keepShots', () => {
  it('keeps the first frame and each frame that changes the picture', () => {
    const kept = keepShots([frame(0, 20), frame(3, 22), frame(6, 200), frame(9, 199), frame(12, 30)]);
    expect(kept.map((f) => f.t)).toEqual([0, 6, 12]);
  });

  it('compares against the last kept frame, so slow drift still splits', () => {
    const kept = keepShots([0, 6, 12, 18].map((g, i) => frame(i, g)));
    expect(kept.map((f) => f.t)).toEqual([0, 2]);
  });
});

describe('audioWindows', () => {
  const secs = (s: number) => new Float32Array(Math.round(s * AUDIO_RATE));

  it('cuts overlapping 30 s windows', () => {
    expect(audioWindows(secs(70)).map((w) => [w.start, w.end])).toEqual([
      [0, 30],
      [25, 55],
      [50, 70],
    ]);
  });

  it('keeps a short recording whole', () => {
    expect(audioWindows(secs(11)).map((w) => [w.start, w.end])).toEqual([[0, 11]]);
  });

  it('drops a sub-second sliver after the last full window', () => {
    expect(audioWindows(secs(55.5)).map((w) => [w.start, w.end])).toEqual([
      [0, 30],
      [25, 55],
    ]);
  });

  it('stops at the media cap and shares the sample buffer', () => {
    const samples = secs(MAX_MEDIA_S + 100);
    const ws = audioWindows(samples);
    expect(ws.at(-1)!.end).toBe(MAX_MEDIA_S);
    expect(ws[0].samples.buffer).toBe(samples.buffer);
  });

  it('returns nothing for silence of zero length', () => {
    expect(audioWindows(new Float32Array(0))).toEqual([]);
  });
});
