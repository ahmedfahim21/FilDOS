import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/**
 * Models earlier versions downloaded and nothing uses any more: the embedding
 * models EmbeddingGemma 2 replaced, and the cross-encoder reranker (search's
 * score gate made it redundant). Their folders are deleted from the model
 * cache at startup so upgrades don't leave ~600 MB behind. The NER model is
 * still in use and is never listed here.
 */
export const RETIRED_MODEL_IDS = [
  'Xenova/all-MiniLM-L6-v2',
  'Xenova/bge-small-en-v1.5',
  'Xenova/bge-base-en-v1.5',
  'Xenova/gte-small',
  'Xenova/multilingual-e5-small',
  'Xenova/clip-vit-base-patch32',
  'Xenova/ms-marco-MiniLM-L-6-v2',
];

/** Delete retired model folders under `modelsDir`; returns the ids removed. */
export async function removeRetiredModels(modelsDir: string): Promise<string[]> {
  const removed: string[] = [];
  for (const id of RETIRED_MODEL_IDS) {
    const dir = join(modelsDir, ...id.split('/'));
    const present = await fs.stat(dir).then(
      (s) => s.isDirectory(),
      (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') return false;
        throw err;
      },
    );
    if (!present) continue;
    await fs.rm(dir, { recursive: true });
    removed.push(id);
  }
  return removed;
}
