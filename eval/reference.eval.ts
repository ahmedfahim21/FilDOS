/**
 * Reference vectors: the embedding pipeline (runtime + transformers.js +
 * onnxruntime + weights + prompts) must keep producing the same vectors, or
 * stored indexes silently stop matching new queries. Fixed inputs embed and
 * are compared with `reference/vectors.json` (cosine ≥ 0.999 each).
 *
 * Real models only. `FILDOS_WRITE_REFERENCE=1` rewrites the file — do that
 * only together with a fingerprint change (which rebuilds every index).
 */
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMBED_MODEL_ID, indexFingerprint } from '@shared/aiModels';
import { PROMPTS_VERSION } from '@shared/embeddingPrompts';
import { handle } from '../src/main/ai/modelRuntime';
import { PHOTO_BUDGET } from '../src/main/ai/index/ignore';
import { buildTestbed } from './testbed/build';
import { providerKind } from './lib/harness';

const FILE = join(__dirname, 'reference', 'vectors.json');

const TEXTS: { text: string; role: 'query' | 'question' | 'passage'; title?: string }[] = [
  { text: 'how hot should the oven be for sourdough', role: 'query' },
  { text: 'when is my tax return due?', role: 'question' },
  { text: 'Proof overnight in the fridge, then bake at 250°C.', role: 'passage', title: 'sourdough.md' },
  { text: 'মসুর ডালের রেসিপি', role: 'passage', title: 'ডাল.txt' },
];
const PICTURES = ['Home/Pictures/cats.jpg', 'Home/Travel/photos/lake.png'];

interface Reference {
  fingerprint: string;
  vectors: Record<string, number[]>;
}

const cosine = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

describe.skipIf(providerKind() !== 'real')('reference vectors', () => {
  it('reproduces the stored vectors', async () => {
    process.env.FILDOS_MODELS_DIR ??= resolve(__dirname, '.models');
    const root = await buildTestbed();
    const now: Record<string, Float32Array> = {};
    for (const t of TEXTS) {
      const [v] = (await handle({ type: 'embed', modelId: EMBED_MODEL_ID, texts: [t.text], role: t.role, titles: t.title ? [t.title] : undefined })) as Float32Array[];
      now[`${t.role}:${t.text}`] = v;
    }
    for (const p of PICTURES) {
      const [v] = (await handle({ type: 'embedMedia', modelId: EMBED_MODEL_ID, kind: 'image', paths: [join(root, ...p.split('/'))], budget: PHOTO_BUDGET })) as Float32Array[];
      now[`image:${p}`] = v;
    }

    if (process.env.FILDOS_WRITE_REFERENCE) {
      const ref: Reference = {
        fingerprint: indexFingerprint(PROMPTS_VERSION),
        vectors: Object.fromEntries(Object.entries(now).map(([k, v]) => [k, Array.from(v, (x) => Number(x.toFixed(6)))])),
      };
      await fs.mkdir(join(__dirname, 'reference'), { recursive: true });
      await fs.writeFile(FILE, JSON.stringify(ref) + '\n');
      console.log(`Wrote ${FILE}`);
      return;
    }

    const ref = JSON.parse(await fs.readFile(FILE, 'utf8')) as Reference;
    expect(ref.fingerprint).toBe(indexFingerprint(PROMPTS_VERSION));
    const agreement = Object.fromEntries(Object.entries(ref.vectors).map(([k, v]) => [k, cosine(v, now[k])]));
    console.log('\nReference agreement (cosine):');
    for (const [k, c] of Object.entries(agreement)) console.log(`  ${c.toFixed(6)}  ${k}`);
    for (const c of Object.values(agreement)) expect(c).toBeGreaterThanOrEqual(0.999);
  }, 600_000);
});
