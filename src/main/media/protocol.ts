import { net, protocol } from 'electron';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertValidPath } from '../fs/service';
import * as aiIndex from '../db/aiIndex';
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } from '../ai/index/extract';
import { DECODE_SCHEME } from './decoder';

/**
 * `fildos-media://` — read-only access for the renderer to the bytes of
 * indexed documents and media, so it can show a PDF at the page a search hit
 * points at and play a recording from its moment.
 *
 * The renderer otherwise has no way to read files, so this is a deliberate,
 * narrow widening: only absolute paths, only these previewable types, and only
 * files already in the AI index (the user chose to make their content
 * searchable; secrets and excluded folders never are). Everything else is 403.
 *
 * URLs: `fildos-media://file/<encodeURIComponent(absolute path)>`.
 *
 * Quick Look adds one more door: when the user opens a file in it, the main
 * process grants that file a one-time URL, `fildos-media://preview/<token>`.
 * Only granted files are served that way, and only the latest grants are kept.
 */
export const MEDIA_SCHEME = 'fildos-media';

/** Types the renderer may read through the protocol: PDFs for page previews, media to play from a moment. */
const PREVIEWABLE = new Set(['.pdf', ...[...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS].map((e) => `.${e}`)]);

/** Quick Look grants: token → absolute path, oldest first. */
const grants = new Map<string, string>();
/** Grants kept at once; older ones stop working (their previews have long closed). */
export const MAX_GRANTS = 32;

/** Let the renderer read `path` (already validated) through a one-time preview URL. */
export function grantPreview(path: string): string {
  const token = randomUUID();
  grants.set(token, path);
  while (grants.size > MAX_GRANTS) grants.delete(grants.keys().next().value as string);
  return `${MEDIA_SCHEME}://preview/${token}`;
}

/** The file a preview URL was granted for, or null when it names no live grant. */
export function grantedPath(url: string): string | null {
  const u = new URL(url);
  if (u.protocol !== `${MEDIA_SCHEME}:` || u.hostname !== 'preview') return null;
  return grants.get(u.pathname.slice(1)) ?? null;
}

/** Register the scheme as privileged. Must run before `app.whenReady()`. */
export function registerMediaScheme(): void {
  // One call for every app scheme: Electron keeps only the last registration.
  const privileges = { standard: true, secure: true, supportFetchAPI: true, stream: true };
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges },
    { scheme: DECODE_SCHEME, privileges },
  ]);
}

/** The absolute path a protocol URL names, or null when it isn't one of ours. */
export function pathOfMediaUrl(url: string): string | null {
  const u = new URL(url);
  if (u.protocol !== `${MEDIA_SCHEME}:` || u.hostname !== 'file') return null;
  return decodeURIComponent(u.pathname.slice(1));
}

/** Whether `path` may be served: a previewable type that's in the index. */
export async function mayServe(path: string): Promise<boolean> {
  if (!PREVIEWABLE.has(extname(path).toLowerCase())) return false;
  const state = await aiIndex.getState(path);
  return state !== null && state.status !== 'error';
}

/** Serve the protocol. Call once the app is ready. */
export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (req) => {
    const granted = grantedPath(req.url);
    if (granted) return net.fetch(pathToFileURL(granted).toString(), { headers: req.headers });
    if (new URL(req.url).hostname === 'preview') return new Response('Forbidden', { status: 403 });
    let path: string;
    try {
      const raw = pathOfMediaUrl(req.url);
      if (!raw) return new Response('Not found', { status: 404 });
      path = assertValidPath(raw);
    } catch {
      return new Response('Bad path', { status: 400 });
    }
    if (!(await mayServe(path))) return new Response('Forbidden', { status: 403 });
    // file:// through net.fetch streams the file and honours Range requests.
    return net.fetch(pathToFileURL(path).toString(), { headers: req.headers });
  });
}
