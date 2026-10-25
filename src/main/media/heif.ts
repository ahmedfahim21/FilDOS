/** Pure helpers for decoding HEIC/HEIF pictures through the OS (`osImage.ts`). */

/** `nativeImage` bitmaps are BGRA on macOS and Windows; swap to RGBA in place. */
export function bgraToRgba(px: Uint8Array): Uint8Array {
  for (let i = 0; i < px.length; i += 4) {
    const b = px[i];
    px[i] = px[i + 2];
    px[i + 2] = b;
  }
  return px;
}

interface Box {
  type: string;
  /** Payload start (after the header) and end, as offsets into the buffer. */
  start: number;
  end: number;
}

/** The ISO-BMFF boxes laid end to end in `buf[from, to)`; stops at a truncated one. */
function boxes(buf: Uint8Array, view: DataView, from: number, to: number): Box[] {
  const out: Box[] = [];
  let i = from;
  while (i + 8 <= to) {
    let size = view.getUint32(i);
    const type = String.fromCharCode(...buf.subarray(i + 4, i + 8));
    let header = 8;
    if (size === 1) {
      if (i + 16 > to) break;
      size = Number(view.getBigUint64(i + 8));
      header = 16;
    } else if (size === 0) {
      size = to - i;
    }
    if (size < header || i + size > to) break;
    out.push({ type, start: i + header, end: i + size });
    i += size;
  }
  return out;
}

/**
 * The displayed size of a HEIF picture from its container, without decoding:
 * the primary item's `ispe` (spatial extents) found through `pitm` → `ipma` →
 * `ipco`, swapped when its `irot` turns it a quarter. (Grid pictures carry
 * tile-sized `ispe`s too, sometimes larger than the picture, so guessing from
 * any `ispe` is wrong.) Null when the header doesn't hold it.
 */
export function heifSize(buf: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const meta = boxes(buf, view, 0, buf.length).find((b) => b.type === 'meta');
  if (!meta) return null;
  // meta, pitm, ipma and ispe are full boxes: 1 byte version + 3 bytes flags first.
  const children = boxes(buf, view, meta.start + 4, meta.end);
  const pitm = children.find((b) => b.type === 'pitm');
  const iprp = children.find((b) => b.type === 'iprp');
  if (!pitm || !iprp) return null;
  const primary = buf[pitm.start] === 0 ? view.getUint16(pitm.start + 4) : view.getUint32(pitm.start + 4);
  const props = boxes(buf, view, iprp.start, iprp.end);
  const ipco = props.find((b) => b.type === 'ipco');
  const ipma = props.find((b) => b.type === 'ipma');
  if (!ipco || !ipma) return null;
  const list = boxes(buf, view, ipco.start, ipco.end);

  const version = buf[ipma.start];
  const wideIndex = (buf[ipma.start + 3] & 1) === 1;
  let i = ipma.start + 4;
  const entries = view.getUint32(i);
  i += 4;
  let mine: number[] = [];
  for (let e = 0; e < entries && i < ipma.end; e++) {
    const item = version < 1 ? view.getUint16(i) : view.getUint32(i);
    i += version < 1 ? 2 : 4;
    const count = buf[i++];
    const indices: number[] = [];
    for (let a = 0; a < count; a++) {
      // High bit = "essential"; the rest is a 1-based index into ipco.
      indices.push(wideIndex ? view.getUint16(i) & 0x7fff : buf[i] & 0x7f);
      i += wideIndex ? 2 : 1;
    }
    if (item === primary) mine = indices;
  }

  let size: { width: number; height: number } | null = null;
  let quarter = false;
  for (const ix of mine) {
    const prop = list[ix - 1];
    if (prop?.type === 'ispe' && prop.start + 12 <= prop.end) {
      size = { width: view.getUint32(prop.start + 4), height: view.getUint32(prop.start + 8) };
    } else if (prop?.type === 'irot' && prop.start < prop.end) {
      quarter = (buf[prop.start] & 0b11) % 2 === 1;
    }
  }
  if (!size?.width || !size.height) return null;
  return quarter ? { width: size.height, height: size.width } : size;
}
