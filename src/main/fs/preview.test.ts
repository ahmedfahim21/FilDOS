import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDir } from './fixtures';
import { previewOf, sniffText, TEXT_PREVIEW_BYTES, type PreviewDeps } from './preview';

const tmp = useTempDir();

/** Deps that record what was asked of them. */
function deps(osImage: string | null = null, docText: string | null = null) {
  const granted: string[] = [];
  const os: string[] = [];
  const docs: string[] = [];
  const d: PreviewDeps = {
    grant: (path) => {
      granted.push(path);
      return `fildos-media://preview/token-${granted.length}`;
    },
    osImage: async (path) => {
      os.push(path);
      return osImage;
    },
    docText: async (path) => {
      docs.push(path);
      return docText;
    },
  };
  return { d, granted, os, docs };
}

const put = async (name: string, data: string | Uint8Array) => {
  const p = join(tmp(), name);
  await fs.writeFile(p, data);
  return p;
};

describe('previewOf', () => {
  it.each([
    ['photo.JPG', 'image'],
    ['logo.svg', 'image'],
    ['lease.pdf', 'pdf'],
    ['trip.mov', 'video'],
    ['talk.mp3', 'audio'],
  ] as const)('grants %s to the renderer as %s, reading nothing itself', async (name, kind) => {
    const p = await put(name, 'bytes');
    const { d, granted, os, docs } = deps();
    expect(await previewOf(p, d)).toEqual({ kind, url: 'fildos-media://preview/token-1' });
    expect(granted).toEqual([p]);
    expect(os).toEqual([]);
    expect(docs).toEqual([]);
  });

  it('asks the OS for HEIC/TIFF, never granting the raw file', async () => {
    const heic = await put('IMG_1.HEIC', 'heic');
    const ok = deps('data:image/png;base64,AAAA');
    expect(await previewOf(heic, ok.d)).toEqual({ kind: 'image', url: 'data:image/png;base64,AAAA' });
    expect(ok.os).toEqual([heic]);
    expect(ok.granted).toEqual([]);

    const tiff = await put('scan.tiff', 'tiff');
    const none = deps(null);
    expect(await previewOf(tiff, none.d)).toEqual({ kind: 'none' });
    expect(none.granted).toEqual([]);
  });

  it('returns a text file inline, whole when it fits', async () => {
    const p = await put('notes.md', '# Notes\nßüñ — ok\n');
    const { d, granted } = deps();
    expect(await previewOf(p, d)).toEqual({ kind: 'text', text: '# Notes\nßüñ — ok\n', truncated: false, language: 'md' });
    expect(granted).toEqual([]);
  });

  it('cuts a long text file at the limit and says so', async () => {
    const p = await put('big.log', 'a'.repeat(TEXT_PREVIEW_BYTES + 10));
    const r = await previewOf(p, deps().d);
    expect(r).toMatchObject({ kind: 'text', truncated: true, language: 'log' });
    expect(r.kind === 'text' && r.text.length).toBe(TEXT_PREVIEW_BYTES);
  });

  it('reads extensionless text (README) and refuses binary', async () => {
    expect(await previewOf(await put('README', 'hello'), deps().d)).toEqual({ kind: 'text', text: 'hello', truncated: false, language: '' });
    expect(await previewOf(await put('blob.bin', new Uint8Array([1, 2, 0, 3])), deps().d)).toEqual({ kind: 'none' });
    expect(await previewOf(await put('latin1.txt', new Uint8Array([0x63, 0x61, 0xe9, 0x20])), deps().d)).toEqual({ kind: 'none' });
  });

  it('shows a DOCX as its extracted text, or nothing when it can’t be read', async () => {
    const p = await put('budget.docx', 'zip');
    const ok = deps(null, 'Household budget');
    expect(await previewOf(p, ok.d)).toEqual({ kind: 'document', text: 'Household budget', truncated: false });
    expect(ok.docs).toEqual([p]);
    expect(await previewOf(p, deps(null, null).d)).toEqual({ kind: 'none' });
  });

  it('counts a folder’s items', async () => {
    const dir = join(tmp(), 'Photos');
    await fs.mkdir(dir);
    await fs.writeFile(join(dir, 'a.jpg'), 'x');
    await fs.writeFile(join(dir, '.hidden'), 'x');
    expect(await previewOf(dir, deps().d)).toEqual({ kind: 'folder', items: 2 });
  });

  it('fails loudly for a missing file', async () => {
    await expect(previewOf(join(tmp(), 'gone.txt'), deps().d)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('sniffText', () => {
  it('backs off a multi-byte character split by the cut', () => {
    const bytes = new TextEncoder().encode('abé'); // é is 2 bytes: cut after its first
    expect(sniffText(bytes, 3)).toEqual({ text: 'ab', truncated: true });
  });
  it('treats a NUL byte as binary', () => {
    expect(sniffText(new Uint8Array([104, 0, 105]), 10)).toBeNull();
  });
});
