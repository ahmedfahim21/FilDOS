/** A URL the renderer can fetch an indexed document's bytes from (see main/media/protocol.ts). */
export function mediaUrl(path: string): string {
  return `fildos-media://file/${encodeURIComponent(path)}`;
}
