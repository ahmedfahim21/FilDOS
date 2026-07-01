import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDir } from '../../fs/fixtures';
import { extractText, isExtractable, isImage, MAX_BYTES } from './extract';

describe('isExtractable', () => {
  it('accepts text/code/data and parsed documents (pdf/docx)', () => {
    for (const p of ['/a/notes.md', '/a/main.ts', '/a/data.json', '/a/q.SQL', '/a/report.docx', '/a/paper.PDF']) {
      expect(isExtractable(p)).toBe(true);
    }
    for (const p of ['/a/photo.png', '/a/clip.mp4', '/a/archive.zip', '/a/noext']) {
      expect(isExtractable(p)).toBe(false);
    }
  });
});

describe('isImage', () => {
  it('recognizes image extensions only', () => {
    for (const p of ['/a/photo.png', '/a/pic.JPG', '/a/anim.gif', '/a/shot.webp', '/a/scan.tiff']) {
      expect(isImage(p)).toBe(true);
    }
    for (const p of ['/a/notes.md', '/a/report.docx', '/a/clip.mp4']) {
      expect(isImage(p)).toBe(false);
    }
  });
});

describe('document extractors', () => {
  const tmpDoc = useTempDir();

  it('returns null for a corrupt PDF/DOCX rather than throwing', async () => {
    const badPdf = join(tmpDoc(), 'broken.pdf');
    const badDocx = join(tmpDoc(), 'broken.docx');
    await fs.writeFile(badPdf, 'not a real pdf');
    await fs.writeFile(badDocx, 'not a real docx');
    expect(await extractText(badPdf)).toBeNull();
    expect(await extractText(badDocx)).toBeNull();
  });
});

describe('extractText', () => {
  const tmp = useTempDir();

  it('reads text, markdown, json and code files', async () => {
    for (const [name, body] of [
      ['notes.txt', 'plain text'],
      ['readme.md', '# Heading\n\nbody'],
      ['data.json', '{"k": 1}'],
      ['main.ts', 'export const x = 1;'],
    ]) {
      const p = join(tmp(), name);
      await fs.writeFile(p, body);
      expect(await extractText(p)).toBe(body);
    }
  });

  it('skips unsupported extensions', async () => {
    const p = join(tmp(), 'photo.png');
    await fs.writeFile(p, 'not really a png');
    expect(await extractText(p)).toBeNull();
  });

  it('skips a binary file masquerading as text (NUL byte)', async () => {
    const p = join(tmp(), 'fake.txt');
    await fs.writeFile(p, Buffer.from([0x68, 0x69, 0x00, 0x79, 0x6f]));
    expect(await extractText(p)).toBeNull();
  });

  it('skips files over the size cap', async () => {
    const p = join(tmp(), 'big.txt');
    await fs.writeFile(p, 'x'.repeat(MAX_BYTES + 1));
    expect(await extractText(p)).toBeNull();
  });

  it('returns null for a missing file or a directory', async () => {
    expect(await extractText(join(tmp(), 'nope.txt'))).toBeNull();
    const dir = join(tmp(), 'sub.txt');
    await fs.mkdir(dir);
    expect(await extractText(dir)).toBeNull();
  });
});
