import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDir } from '../fs/fixtures';
import { AI_MODELS } from '@shared/aiModels';
import { removeRetiredModels, RETIRED_MODEL_IDS } from './retiredModels';

describe('removeRetiredModels', () => {
  const dir = useTempDir();

  async function touch(...parts: string[]) {
    const target = join(dir(), ...parts);
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(join(target, 'model_quantized.onnx'), 'x');
  }

  it('deletes only retired model folders and reports them', async () => {
    await touch('Xenova', 'bge-base-en-v1.5', 'onnx');
    await touch('Xenova', 'clip-vit-base-patch32', 'onnx');
    await touch('Xenova', 'ms-marco-MiniLM-L-6-v2', 'onnx');
    await touch('Xenova', 'bert-base-NER', 'onnx');
    await touch('onnx-community', 'embeddinggemma-2-ONNX', 'onnx');

    const removed = await removeRetiredModels(dir());

    expect(removed).toEqual(['Xenova/bge-base-en-v1.5', 'Xenova/clip-vit-base-patch32', 'Xenova/ms-marco-MiniLM-L-6-v2']);
    expect(await fs.readdir(join(dir(), 'Xenova'))).toEqual(['bert-base-NER']);
    expect(await fs.readdir(join(dir(), 'onnx-community'))).toEqual(['embeddinggemma-2-ONNX']);
  });

  it('is a no-op on a clean or missing cache', async () => {
    expect(await removeRetiredModels(dir())).toEqual([]);
    expect(await removeRetiredModels(join(dir(), 'nope'))).toEqual([]);
  });

  it('never lists a model the app still uses', () => {
    for (const m of AI_MODELS) expect(RETIRED_MODEL_IDS).not.toContain(m.id);
  });
});
