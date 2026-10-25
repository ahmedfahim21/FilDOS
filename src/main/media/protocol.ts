import { net, protocol } from 'electron';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertValidPath } from '../fs/service';
import * as aiIndex from '../db/aiIndex';

/**
 * `fildos-media://` — read-only access for the renderer to the bytes of
 * indexed documents and media, so it can show a PDF at the page a search hit
 * points at (and, later, play a recording from its moment).
 *
 * The renderer otherwise has no way to read files, so this is a deliberate,
 * narrow widening: only absolute paths, only these previewable types, and only
 * files already in the AI index (the user chose to make their content
 * searchable; secrets and excluded folders never are). Everything else is 403.
 *
 * URLs: `fildos-media://file/<encodeURIComponent(absolute path)>`.
 */
export const MEDIA_SCHEME = 'fildos-media';

/** Types the renderer may read through the protocol. */
const PREVIEWABLE = new Set(['.pdf']);

/** Register the scheme as privileged. Must run before `app.whenReady()`. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
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
