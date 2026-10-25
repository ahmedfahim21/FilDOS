import type { SemanticHit } from '@shared/types';

/** Where in a file a search hit points: a PDF page, or a moment of a recording. */
export type Place = { kind: 'page'; page: number } | { kind: 'moment'; seconds: number; video: boolean };

const VIDEO_EXT = new Set(['mp4', 'm4v', 'mov', 'webm']);

export function placeOf(hit: SemanticHit): Place | undefined {
  if (hit.segment === 'page' && hit.loc) return { kind: 'page', page: hit.loc };
  if ((hit.segment === 'frame' || hit.segment === 'audio') && hit.loc != null) {
    return { kind: 'moment', seconds: hit.loc, video: VIDEO_EXT.has(hit.ext.toLowerCase()) };
  }
  return undefined;
}

/** "1:05", "1:02:09". */
export function formatMoment(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** The pill label: "p. 7" or "0:25". */
export function placeLabel(place: Place): string {
  return place.kind === 'page' ? `p. ${place.page}` : formatMoment(place.seconds);
}
