/**
 * How long indexing will take, from file metadata alone (nothing is read or
 * decoded to estimate). A file becomes units of model work — text chunks,
 * pictures, video frames, 30 s audio windows — guessed from its kind and
 * size, and units cost seconds: measured on this machine as indexing runs
 * (`MeasuredCosts`, kept in prefs), with seed costs standing in until a kind
 * has enough measurements. Pure; the indexer feeds it.
 */
import { extname } from 'node:path';
import { DATA_EXTENSIONS, DOC_EXTENSIONS, isAudio, isImage, isVideo } from './extract';
import { AUDIO_STRIDE_S, FRAME_INTERVAL_S, MAX_FRAMES, MAX_MEDIA_S } from '../../media/signals';

export type UnitKind = 'text' | 'image' | 'frame' | 'audio';
export const UNIT_KINDS: UnitKind[] = ['text', 'image', 'frame', 'audio'];
export type Units = Record<UnitKind, number>;

/**
 * Seconds per unit of model work, measured with EmbeddingGemma 2 (q8, CPU) on
 * an Apple M-series laptop with the eval testbed. Other machines start here
 * scaled by how they compare (`unitCosts`), then go by their own measurements.
 */
export const SEED_COSTS: Units = { text: 0.15, image: 0.9, frame: 0.3, audio: 0.8 };

/** Units of a kind measured before that kind's own average is trusted. */
export const MIN_MEASURED: Units = { text: 50, image: 20, frame: 20, audio: 10 };

/** Running sums of what indexing took, per kind. */
export type MeasuredCosts = Partial<Record<UnitKind, { seconds: number; units: number }>>;

const zero = (): Units => ({ text: 0, image: 0, frame: 0, audio: 0 });

/** Characters per chunk step (a ~2048-char window with ~256 overlap). */
const CHUNK_STRIDE = 1800;
/** Chunks of text per PDF page, on average (pages vary from a line to a dense page). */
const PDF_CHUNKS_PER_PAGE = 1.2;
/** A PDF's size says little about its pages (5 KB to 1 MB each): this guess is only used when the count is unknown. */
const PDF_BYTES_PER_PAGE = 50_000;
/** A .docx is compressed XML: bytes per chunk of text. */
const DOCX_BYTES_PER_CHUNK = 6000;
/** Typical bitrates, to turn a media file's size into a duration. */
const AUDIO_BYTES_PER_S = 16_000; // ~128 kbit/s
const VIDEO_BYTES_PER_S = 625_000; // ~5 Mbit/s

/**
 * The model work a file will take, guessed from its kind and size — and, for a
 * PDF, its page count when the caller read it (`pages`; null = unreadable,
 * which indexes just the name).
 */
export function unitsFor(path: string, size: number, pages?: number | null): Units {
  const u = zero();
  const ext = extname(path).slice(1).toLowerCase();
  if (isImage(path)) {
    u.image = 1;
  } else if (isAudio(path) || isVideo(path)) {
    const seconds = Math.min(MAX_MEDIA_S, size / (isVideo(path) ? VIDEO_BYTES_PER_S : AUDIO_BYTES_PER_S));
    if (isVideo(path)) u.frame = Math.min(MAX_FRAMES, Math.ceil(seconds / FRAME_INTERVAL_S));
    u.audio = Math.max(1, Math.ceil(seconds / AUDIO_STRIDE_S));
  } else if (DATA_EXTENSIONS.has(ext)) {
    // Keyword-only: no model work.
  } else if (ext === 'pdf') {
    if (pages === null) {
      u.text = 1; // unreadable: indexed by name only
    } else {
      const n = Math.min(5000, Math.max(1, pages ?? Math.round(size / PDF_BYTES_PER_PAGE)));
      u.text = Math.ceil(n * PDF_CHUNKS_PER_PAGE);
    }
  } else if (DOC_EXTENSIONS.has(ext)) {
    u.text = Math.max(1, Math.ceil(size / DOCX_BYTES_PER_CHUNK));
  } else {
    u.text = Math.max(1, Math.ceil(Math.min(size, 1_000_000) / CHUNK_STRIDE));
  }
  return u;
}

export function addUnits(a: Units, b: Units): Units {
  return { text: a.text + b.text, image: a.image + b.image, frame: a.frame + b.frame, audio: a.audio + b.audio };
}

/**
 * Seconds per unit to estimate with: a kind's own measured average once it
 * has enough units; otherwise its seed cost scaled by how this machine
 * compares on the kinds it has measured (1 before any).
 */
export function unitCosts(measured: MeasuredCosts = {}): Units {
  let actual = 0;
  let expected = 0;
  for (const k of UNIT_KINDS) {
    const m = measured[k];
    if (m && m.units >= MIN_MEASURED[k]) {
      actual += m.seconds;
      expected += SEED_COSTS[k] * m.units;
    }
  }
  const speed = expected > 0 ? actual / expected : 1;
  const out = zero();
  for (const k of UNIT_KINDS) {
    const m = measured[k];
    out[k] = m && m.units >= MIN_MEASURED[k] ? m.seconds / m.units : SEED_COSTS[k] * speed;
  }
  return out;
}

export function secondsFor(units: Units, costs: Units): number {
  return UNIT_KINDS.reduce((s, k) => s + units[k] * costs[k], 0);
}

/**
 * Add one measurement. Recent work counts most: past ten times what's enough,
 * the older sums are halved.
 */
export function recordCost(measured: MeasuredCosts, kind: UnitKind, seconds: number, units: number): MeasuredCosts {
  const prev = measured[kind] ?? { seconds: 0, units: 0 };
  let next = { seconds: prev.seconds + seconds, units: prev.units + units };
  if (next.units > MIN_MEASURED[kind] * 10) next = { seconds: next.seconds / 2, units: next.units / 2 };
  return { ...measured, [kind]: next };
}
