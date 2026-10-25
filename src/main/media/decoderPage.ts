/**
 * The page the media decoder runs in (`decoder.ts`): plain browser JS, served
 * by the decoder's own protocol so its fetches are same-origin. Three calls,
 * orchestrated from the main process (which owns the sampling rules in
 * `signals.ts`):
 *
 *  - `probe(url)` → `{ duration }` from the <video>/<audio> element's metadata.
 *  - `frames(url, times, maxSide)` → RGBA frames: a muted <video> is seeked to
 *    each time and the frame captured with `createImageBitmap` (a hidden page
 *    never paints video, so drawing the element itself would repeat the first
 *    frame), scaled so its longest side is at most `maxSide`.
 *  - `audio(url, rate)` → mono Float32Array: `decodeAudioData` on an
 *    OfflineAudioContext at `rate` resamples for free; channels are averaged.
 *
 * Kept as a string: it runs in a sandboxed renderer with no Node, no preload
 * and no bundler, and it's small enough to read here.
 */
export const DECODER_HTML = `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'unsafe-inline'; media-src 'self'">
</head><body><script>
function load(url) {
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.src = url;
  document.body.appendChild(v);
  return new Promise((resolve, reject) => {
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => reject(new Error('Unreadable media: ' + (v.error ? v.error.message || 'code ' + v.error.code : 'unknown')));
  });
}

function release(v) {
  v.removeAttribute('src');
  v.load();
  v.remove();
}

window.probe = async (url) => {
  const v = await load(url);
  try {
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
  } finally {
    release(v);
  }
};

window.frames = async (url, times, maxSide) => {
  const v = await load(url);
  try {
    const scale = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
    const width = Math.max(1, Math.round(v.videoWidth * scale));
    const height = Math.max(1, Math.round(v.videoHeight * scale));
    const g = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
    const out = [];
    for (const t of times) {
      v.currentTime = t;
      await new Promise((resolve, reject) => {
        v.onseeked = resolve;
        v.onerror = () => reject(new Error('Seek failed at ' + t + 's'));
      });
      const bitmap = await createImageBitmap(v);
      g.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      out.push({ t, width, height, rgba: new Uint8Array(g.getImageData(0, 0, width, height).data.buffer) });
    }
    return out;
  } finally {
    release(v);
  }
};

window.audio = async (url, rate) => {
  const bytes = await (await fetch(url)).arrayBuffer();
  const buf = await new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes);
  const mono = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buf.numberOfChannels;
  }
  return mono;
};
</script></body></html>`;
