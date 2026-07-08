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

/**
 * Assemble a tiny but structurally valid PDF (correct xref offsets) with one
 * page of Helvetica text — enough to exercise the real pdfjs parse through the
 * byte-range transport.
 */
function minimalPdf(text: string, padBytes = 0): Buffer {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    // Optional unused padding stream: inflates the file so the xref/trailer sit
    // beyond the initial ranged-read chunk, forcing requestDataRange to fire.
    ...(padBytes > 0
      ? [`6 0 obj\n<< /Length ${padBytes} >>\nstream\n${' '.repeat(padBytes)}\nendstream\nendobj\n`]
      : []),
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const o of objs) {
    offsets.push(out.length);
    out += o;
  }
  const xref = out.length;
  out +=
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

describe('document extractors', () => {
  const tmpDoc = useTempDir();

  it('extracts text from a valid PDF through the ranged file reader', async () => {
    const p = join(tmpDoc(), 'doc.pdf');
    await fs.writeFile(p, minimalPdf('Hello FilDOS'));
    expect(await extractText(p)).toContain('Hello FilDOS');
  });

  it('extracts from a PDF larger than the initial chunk (ranged reads fire)', async () => {
    const p = join(tmpDoc(), 'big.pdf');
    // 2.5 MB of padding puts the xref well past the 1 MB initial chunk.
    await fs.writeFile(p, minimalPdf('Hello Ranged FilDOS', 2_500_000));
    expect(await extractText(p)).toContain('Hello Ranged FilDOS');
  });

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
