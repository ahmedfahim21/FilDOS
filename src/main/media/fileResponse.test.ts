import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDir } from '../fs/fixtures';
import { contentTypeOf, fileResponse, parseRange } from './fileResponse';

const tmp = useTempDir();

describe('parseRange', () => {
  it('reads a closed, open-ended and suffix range', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual([0, 99]);
    expect(parseRange('bytes=500-', 1000)).toEqual([500, 999]);
    expect(parseRange('bytes=-100', 1000)).toEqual([900, 999]);
  });

  it('clamps an end past the file, and a suffix longer than it', () => {
    expect(parseRange('bytes=900-5000', 1000)).toEqual([900, 999]);
    expect(parseRange('bytes=-5000', 1000)).toEqual([0, 999]);
  });

  it('is unsatisfiable when it starts past the end, asks for nothing, or the file is empty', () => {
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=0-', 0)).toBe('unsatisfiable');
  });

  it('ignores what it does not understand (the whole file is served)', () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange('bytes=0-1,5-9', 1000)).toBeNull(); // multi-range
    expect(parseRange('items=0-9', 1000)).toBeNull();
    expect(parseRange('bytes=-', 1000)).toBeNull();
    expect(parseRange('bytes=50-10', 1000)).toBeNull();
  });
});

describe('fileResponse', () => {
  const bytes = Uint8Array.from({ length: 1000 }, (_, i) => i % 251);
  const file = async (name = 'clip.mp4', data: Uint8Array = bytes) => {
    const p = join(tmp(), name);
    await fs.writeFile(p, data);
    return p;
  };

  it('serves the whole file with 200, advertising ranges', async () => {
    const r = await fileResponse(await file(), null);
    expect(r.status).toBe(200);
    expect(Object.fromEntries(r.headers)).toEqual({
      'accept-ranges': 'bytes',
      'content-length': '1000',
      'content-type': 'video/mp4',
    });
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes);
  });

  it('serves a range with 206 and Content-Range — what lets a player seek', async () => {
    const r = await fileResponse(await file(), 'bytes=100-199');
    expect(r.status).toBe(206);
    expect(Object.fromEntries(r.headers)).toEqual({
      'accept-ranges': 'bytes',
      'content-length': '100',
      'content-range': 'bytes 100-199/1000',
      'content-type': 'video/mp4',
    });
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes.slice(100, 200));
  });

  it('serves an open-ended range to the end', async () => {
    const r = await fileResponse(await file(), 'bytes=990-');
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe('bytes 990-999/1000');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes.slice(990));
  });

  it('answers 416 for a range past the end', async () => {
    const r = await fileResponse(await file(), 'bytes=5000-');
    expect(r.status).toBe(416);
    expect(r.headers.get('content-range')).toBe('bytes */1000');
    expect(await r.arrayBuffer()).toEqual(new ArrayBuffer(0));
  });

  it('serves an empty file as an empty 200', async () => {
    const r = await fileResponse(await file('empty.wav', new Uint8Array(0)), null);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-length')).toBe('0');
    expect(r.headers.get('content-type')).toBe('audio/wav');
  });

  it('fails loudly for a missing file', async () => {
    await expect(fileResponse(join(tmp(), 'gone.mp4'), null)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('contentTypeOf', () => {
  it('maps what the protocols serve, case-insensitively', () => {
    expect(contentTypeOf('/a/b.MOV')).toBe('video/quicktime');
    expect(contentTypeOf('/a/b.m4a')).toBe('audio/mp4');
    expect(contentTypeOf('/a/b.pdf')).toBe('application/pdf');
    expect(contentTypeOf('/a/b.heic')).toBe('application/octet-stream');
  });
});
