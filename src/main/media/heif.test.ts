import { describe, expect, it } from 'vitest';
import { bgraToRgba, heifSize } from './heif';

const u8 = (...n: number[]) => Uint8Array.from(n);
const u16 = (n: number) => u8(n >> 8, n & 0xff);
const u32 = (n: number) => u8(n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
};
const box = (type: string, ...payload: Uint8Array[]) => {
  const body = cat(...payload);
  return cat(u32(8 + body.length), new TextEncoder().encode(type), body);
};
const full = (type: string, version: number, flags: number, ...payload: Uint8Array[]) =>
  box(type, u8(version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff), ...payload);

const ispe = (w: number, h: number) => full('ispe', 0, 0, u32(w), u32(h));
const irot = (quarters: number) => box('irot', u8(quarters));

/** ipma (version 0, narrow indices): [itemId, [1-based ipco indices]] per entry. */
const ipma = (entries: [number, number[]][], version = 0, wide = false) =>
  full(
    'ipma',
    version,
    wide ? 1 : 0,
    u32(entries.length),
    ...entries.map(([item, ix]) =>
      cat(version < 1 ? u16(item) : u32(item), u8(ix.length), ...ix.map((i) => (wide ? u16(0x8000 | i) : u8(0x80 | i)))),
    ),
  );

/** A HEIF header: ftyp, then meta with pitm + iprp(ipco, ipma). */
const heif = (primary: number, props: Uint8Array[], assoc: Uint8Array) =>
  cat(
    box('ftyp', new TextEncoder().encode('heic'), u32(0), new TextEncoder().encode('mif1heic')),
    full('meta', 0, 0, full('hdlr', 0, 0, u32(0), new TextEncoder().encode('pict'), new Uint8Array(13)), full('pitm', 0, 0, u16(primary)), box('iprp', box('ipco', ...props), assoc)),
  );

describe('heifSize', () => {
  it('reads the primary picture’s extents', () => {
    expect(heifSize(heif(1, [ispe(4032, 3024)], ipma([[1, [1]]])))).toEqual({ width: 4032, height: 3024 });
  });

  it('follows the primary item, not the largest extents (grid tiles can be bigger)', () => {
    // Items 1–2 are 640×512 tiles; item 3 is the 480×640 grid that is the picture.
    const header = heif(3, [ispe(640, 512), ispe(480, 640)], ipma([[1, [1]], [2, [1]], [3, [2]]]));
    expect(heifSize(header)).toEqual({ width: 480, height: 640 });
  });

  it('swaps width and height when the picture is turned a quarter', () => {
    expect(heifSize(heif(1, [ispe(4032, 3024), irot(1)], ipma([[1, [1, 2]]])))).toEqual({ width: 3024, height: 4032 });
    expect(heifSize(heif(1, [ispe(4032, 3024), irot(3)], ipma([[1, [1, 2]]])))).toEqual({ width: 3024, height: 4032 });
    expect(heifSize(heif(1, [ispe(4032, 3024), irot(2)], ipma([[1, [1, 2]]])))).toEqual({ width: 4032, height: 3024 });
  });

  it('ignores a rotation that belongs to another item', () => {
    expect(heifSize(heif(1, [ispe(400, 300), irot(1)], ipma([[1, [1]], [2, [2]]])))).toEqual({ width: 400, height: 300 });
  });

  it('reads 32-bit item ids and 15-bit property indices (ipma version 1, flag 1)', () => {
    expect(heifSize(heif(1, [ispe(800, 600)], ipma([[1, [1]]], 1, true)))).toEqual({ width: 800, height: 600 });
  });

  it('is null without meta, without the primary’s extents, or when the header is cut short', () => {
    expect(heifSize(box('ftyp', new TextEncoder().encode('heic')))).toBeNull();
    expect(heifSize(heif(2, [ispe(400, 300)], ipma([[1, [1]]])))).toBeNull();
    const whole = heif(1, [ispe(400, 300)], ipma([[1, [1]]]));
    expect(heifSize(whole.subarray(0, whole.length - 6))).toBeNull();
    expect(heifSize(new Uint8Array(0))).toBeNull();
  });
});

describe('bgraToRgba', () => {
  it('swaps blue and red in place, leaving green and alpha', () => {
    const px = u8(1, 2, 3, 4, 10, 20, 30, 40);
    expect(bgraToRgba(px)).toBe(px);
    expect([...px]).toEqual([3, 2, 1, 4, 30, 20, 10, 40]);
  });
});
