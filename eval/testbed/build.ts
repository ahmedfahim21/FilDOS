/**
 * Builds the eval testbed from `manifest.ts`: writes the generated files,
 * fetches the pinned media (verified against its SHA-256, cached between runs)
 * and lays down the traps. Rebuilds only when the manifest changes.
 *
 * The testbed root defaults to `eval/testbed-data` (gitignored); set
 * `FILDOS_TESTBED` to put it elsewhere. Note the indexer's built-in rules look
 * at every path segment, so the root must not sit under a dot-folder, `tmp`,
 * `Library` and the like, or nothing gets indexed.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  DATASET,
  DOCX_FILES,
  DUPLICATES,
  MEDIA_BASE,
  MEDIA_FILES,
  PDF_FILES,
  TEXT_FILES,
} from './manifest';
import { makeDocx, makePdf, makePng } from './writers';

const EVAL_DIR = resolve(__dirname, '..');
export const TESTBED_DIR = process.env.FILDOS_TESTBED ?? join(EVAL_DIR, 'testbed-data');
const MEDIA_CACHE = join(EVAL_DIR, '.media-cache');
const STAMP = '.testbed-stamp';

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** A hash of everything the manifest declares: a change means a rebuild. */
export function manifestHash(): string {
  return sha256(JSON.stringify({ TEXT_FILES, PDF_FILES, DOCX_FILES, MEDIA_FILES, DATASET: { ...DATASET, name: DATASET.name(1) }, DUPLICATES })).slice(0, 16);
}

async function write(rel: string, data: Buffer | string): Promise<void> {
  const full = join(TESTBED_DIR, rel);
  await fs.mkdir(dirname(full), { recursive: true });
  await fs.writeFile(full, data);
}

/** The media file's bytes, from the cache or the pinned URL; throws on a hash mismatch. */
async function media(source: string, expected: string): Promise<Buffer> {
  const cached = join(MEDIA_CACHE, source);
  try {
    const data = await fs.readFile(cached);
    if (sha256(data) === expected) return data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const url = `${MEDIA_BASE}/${source}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Testbed media download failed: ${url} → HTTP ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  const actual = sha256(data);
  if (actual !== expected) throw new Error(`Testbed media ${source}: SHA-256 ${actual}, expected ${expected}`);
  await fs.mkdir(MEDIA_CACHE, { recursive: true });
  await fs.writeFile(cached, data);
  return data;
}

/** Build the testbed (or reuse it when its stamp matches) and return its root. */
export async function buildTestbed(): Promise<string> {
  const hash = manifestHash();
  const stamp = await fs.readFile(join(TESTBED_DIR, STAMP), 'utf8').catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') return null;
    throw err;
  });
  if (stamp === hash) return TESTBED_DIR;

  await fs.rm(TESTBED_DIR, { recursive: true, force: true });
  for (const f of TEXT_FILES) await write(f.path, f.content);
  for (const f of PDF_FILES) await write(f.path, makePdf(f.pages));
  for (const f of DOCX_FILES) await write(f.path, makeDocx(f.paragraphs));
  for (const f of MEDIA_FILES) await write(f.path, await media(f.source, f.sha256));
  for (let i = 1; i <= DATASET.count; i++) {
    await write(`${DATASET.dir}/${DATASET.name(i)}`, makePng(16, 16, [(i * 7) % 256, (i * 13) % 256, (i * 29) % 256]));
  }
  for (const d of DUPLICATES) await fs.copyFile(join(TESTBED_DIR, d.from), join(TESTBED_DIR, d.to));
  await fs.writeFile(join(TESTBED_DIR, STAMP), hash);
  return TESTBED_DIR;
}
