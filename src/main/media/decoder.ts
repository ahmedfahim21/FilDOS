import { net, session, WebContentsView, type Session } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isVideo } from '../ai/index/extract';
import { DECODER_HTML } from './decoderPage';
import { AUDIO_RATE, FRAME_MAX_SIDE, frameTimes, type DecodedMedia, type Frame } from './signals';

/**
 * Decodes audio and video with Electron's own Chromium (its codecs ship with
 * the app — nothing to install). A hidden, sandboxed `WebContentsView` — not a
 * window, so it never counts as one for app lifecycle — runs `DECODER_HTML`
 * in a private session whose `fildos-decode://` protocol serves only files the
 * main process handed out a one-time token for. The view is created on
 * demand and closed after a minute idle.
 */
export const DECODE_SCHEME = 'fildos-decode';

/** Whole-file audio decode buffers the file: past this, a file's sound is skipped. */
export const MAX_AUDIO_BYTES = 256 * 1024 * 1024;
/** One decode never takes longer than this; a stuck file fails instead of stalling indexing. */
const DECODE_TIMEOUT_MS = 180_000;
/** Close the decoder after this long without work. */
const IDLE_MS = 60_000;

export class MediaDecoder {
  private view: WebContentsView | null = null;
  private ready: Promise<WebContentsView> | null = null;
  private ses: Session | null = null;
  private readonly tokens = new Map<string, string>();
  private idle: NodeJS.Timeout | null = null;
  private busy = 0;

  private serve(): Session {
    if (this.ses) return this.ses;
    const ses = session.fromPartition('fildos-decoder');
    ses.protocol.handle(DECODE_SCHEME, async (req) => {
      // One origin for the page and the media it reads, so its CSP's 'self' covers both.
      const url = new URL(req.url);
      if (url.hostname !== 'decoder') return new Response('Not found', { status: 404 });
      if (url.pathname === '/') {
        return new Response(DECODER_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      const token = /^\/media\/([\w-]+)$/.exec(url.pathname)?.[1];
      const path = token ? this.tokens.get(token) : undefined;
      if (!path) return new Response('Forbidden', { status: 403 });
      // file:// through net.fetch streams the file and honours Range requests (video seeking).
      return net.fetch(pathToFileURL(path).toString(), { headers: req.headers });
    });
    this.ses = ses;
    return ses;
  }

  private open(): Promise<WebContentsView> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const view = new WebContentsView({
        webPreferences: {
          session: this.serve(),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          // Hidden pages are throttled by default; decoding must keep going.
          backgroundThrottling: false,
        },
      });
      view.webContents.on('render-process-gone', (_e, details) => {
        console.error('[fildos] media decoder crashed:', details.reason);
        this.close();
      });
      await view.webContents.loadURL(`${DECODE_SCHEME}://decoder/`);
      this.view = view;
      return view;
    })();
    this.ready.catch(() => {
      this.ready = null;
    });
    return this.ready;
  }

  /** Close the decoder view (it reopens on the next decode). */
  close(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    this.view?.webContents.close();
    this.view = null;
    this.ready = null;
  }

  private async call<T>(script: string): Promise<T> {
    const view = await this.open();
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        view.webContents.executeJavaScript(script) as Promise<T>,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Media decode timed out')), DECODE_TIMEOUT_MS);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Decode a media file: frames for a video, mono 16 kHz audio for its sound. */
  async decode(path: string): Promise<DecodedMedia> {
    this.busy++;
    if (this.idle) clearTimeout(this.idle);
    const token = randomUUID();
    this.tokens.set(token, path);
    const url = JSON.stringify(`${DECODE_SCHEME}://decoder/media/${token}`);
    try {
      const { size } = await fs.stat(path);
      const { duration } = await this.call<{ duration: number }>(`probe(${url})`);
      let frames: Frame[] = [];
      if (isVideo(path)) {
        frames = await this.call<Frame[]>(`frames(${url}, ${JSON.stringify(frameTimes(duration))}, ${FRAME_MAX_SIDE})`);
      }
      let audio: Float32Array | null = null;
      if (size > MAX_AUDIO_BYTES) {
        console.warn('[fildos] media too large to decode its sound, indexing frames/name only:', path);
      } else {
        try {
          audio = await this.call<Float32Array>(`audio(${url}, ${AUDIO_RATE})`);
        } catch (err) {
          // Expected for a video without a soundtrack; an audio file that won't
          // decode is a real failure.
          if (!isVideo(path)) throw err;
          console.info('[fildos] no decodable soundtrack:', path, String(err));
        }
      }
      // Audio-only files may report no duration through the media element.
      const length = Number.isFinite(duration) ? duration : audio ? audio.length / AUDIO_RATE : 0;
      return { duration: length, audio, frames };
    } finally {
      this.tokens.delete(token);
      this.busy--;
      if (this.busy === 0) this.idle = setTimeout(() => this.close(), IDLE_MS);
    }
  }
}
