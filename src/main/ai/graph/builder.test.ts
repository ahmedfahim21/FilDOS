import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Prefs } from '@shared/types';
import type { EntitySpan } from '@shared/graphTypes';
import type { AiProvider } from '../providers/types';
import { closeDb, initDb } from '../../db';
import * as aiIndex from '../../db/aiIndex';
import * as graphStore from '../../db/graphStore';
import { remapPaths } from '../../db/remap';
import { encodeVector } from '../index/vectorStore';
import { GraphBuilder } from './builder';

/**
 * Integration: a real (in-memory) database, a fake provider. Exercises the
 * full lazy/incremental lifecycle — build, watermark, staleness, entity
 * gating — without Electron or a model.
 */

beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());

const unit = (angle: number) => Float32Array.from([Math.cos(angle), Math.sin(angle)]);
const LONG = 'Meeting notes about the Q3 roadmap with Acme Corp in Berlin. '.repeat(3);

async function seedFile(path: string, angle: number, indexedAt = 1000, text = LONG): Promise<void> {
  await aiIndex.upsertState({
    path,
    mtime: indexedAt,
    size: 100,
    contentHash: null,
    modelId: 'm1',
    indexVersion: 2,
    indexedAt,
    status: 'indexed',
  });
  await aiIndex.replaceChunks(path, [
    { chunkIx: 0, text, embedding: encodeVector(unit(angle)), modelId: 'm1' },
  ]);
}

function fakeProvider(opts: { nerReady?: boolean } = {}) {
  let nerCalls = 0;
  const provider: AiProvider = {
    id: 'fake',
    capabilities: { embed: true, generate: false, images: false },
    async status(modelId) {
      return { state: opts.nerReady === false ? 'absent' : 'ready', modelId, dim: 2 };
    },
    async download() {},
    async embed(_m, texts) {
      return texts.map(() => unit(0));
    },
    async embedImages() {
      return [];
    },
    async extractEntities(_m, texts): Promise<EntitySpan[][]> {
      nerCalls += texts.length;
      return texts.map((t) =>
        t.includes('Acme') ? [{ text: 'Acme Corp', type: 'ORG', score: 0.95 }] : [],
      );
    },
  };
  return { provider, nerCalls: () => nerCalls };
}

function makeBuilder(provider: AiProvider) {
  let prefs: Prefs = {};
  const emits: string[] = [];
  const builder = new GraphBuilder({
    provider: async () => provider,
    nerModel: 'ner-model',
    imageModel: 'clip',
    emit: (p) => emits.push(`${p.state}:${p.phase ?? '-'}`),
    prefs: {
      get: async () => prefs,
      set: async (patch) => {
        prefs = { ...prefs, ...patch };
      },
    },
  });
  return { builder, emits, prefs: () => prefs };
}

describe('GraphBuilder', () => {
  it('build persists similarity edges and entities, then goes clean', async () => {
    await seedFile('/a.md', 0);
    await seedFile('/b.md', 0.05); // ~cos 0.999 with /a.md
    await seedFile('/c.md', Math.PI / 2, 1000, 'No entities here, just filler text. '.repeat(4));

    const { provider } = fakeProvider();
    const { builder } = makeBuilder(provider);
    expect(await builder.isDirty()).toBe(true);
    await builder.build(false);

    const edges = await graphStore.allEdges();
    expect(edges).toHaveLength(1);
    expect([edges[0].src, edges[0].dst]).toEqual(['/a.md', '/b.md']);

    const mentions = await graphStore.allMentions();
    expect(mentions.filter((m) => m.name === 'Acme Corp').map((m) => m.path).sort()).toEqual([
      '/a.md',
      '/b.md',
    ]);
    expect(await builder.isDirty()).toBe(false);
  });

  it('snapshot fuses stored edges, entities and temporal sessions', async () => {
    await seedFile('/x/a.md', 0, 1000);
    await seedFile('/y/b.md', 0.05, 1500);
    const { builder } = makeBuilder(fakeProvider().provider);
    await builder.build(false);

    const snap = await builder.snapshot();
    expect(snap.nodes.filter((n) => n.kind === 'file')).toHaveLength(2);
    expect(snap.nodes.filter((n) => n.kind === 'entity').map((n) => n.label)).toEqual(['Acme Corp']);
    expect(new Set(snap.edges.map((e) => e.kind))).toEqual(new Set(['similar', 'entity', 'temporal']));
  });

  it('a rebuild only re-extracts files whose indexed_at moved', async () => {
    await seedFile('/a.md', 0);
    await seedFile('/b.md', 1);
    const { provider, nerCalls } = fakeProvider();
    const { builder } = makeBuilder(provider);
    await builder.build(false);
    const after = nerCalls();
    expect(after).toBe(2);

    await builder.build(false); // clean — ensure no re-extraction
    expect(nerCalls()).toBe(after);

    await seedFile('/a.md', 0, 2000); // touched
    expect(await builder.isDirty()).toBe(true);
    await builder.build(false);
    expect(nerCalls()).toBe(after + 1);
  });

  it('ensureBuilt is a no-op while clean and coalesces into a running build', async () => {
    await seedFile('/a.md', 0);
    const { provider, nerCalls } = fakeProvider();
    const { builder } = makeBuilder(provider);
    await Promise.all([builder.ensureBuilt(), builder.ensureBuilt()]);
    expect(nerCalls()).toBe(1);
    await builder.ensureBuilt();
    expect(nerCalls()).toBe(1);
  });

  it('without the NER model the graph still builds edges, and entities stay stale', async () => {
    await seedFile('/a.md', 0);
    await seedFile('/b.md', 0.05);
    const { provider, nerCalls } = fakeProvider({ nerReady: false });
    const { builder } = makeBuilder(provider);
    await builder.build(false);
    expect((await graphStore.allEdges()).length).toBe(1);
    expect(nerCalls()).toBe(0);
    expect((await graphStore.entityStates()).size).toBe(0);
  });

  it('removed files vanish from the graph via FK cascade, and the count flips dirty', async () => {
    await seedFile('/a.md', 0);
    await seedFile('/b.md', 0.05);
    const { builder } = makeBuilder(fakeProvider().provider);
    await builder.build(false);
    expect((await graphStore.allEdges()).length).toBe(1);

    await aiIndex.remove(['/b.md']);
    expect((await graphStore.allEdges()).length).toBe(0); // cascade
    expect(await builder.isDirty()).toBe(true);
  });

  it('rename/move carries graph rows along (FK ON UPDATE CASCADE via remap)', async () => {
    await seedFile('/a.md', 0);
    await seedFile('/b.md', 0.05);
    const { builder } = makeBuilder(fakeProvider().provider);
    await builder.build(false);

    remapPaths('/b.md', '/moved.md', '/');
    const edges = await graphStore.allEdges();
    expect(edges).toHaveLength(1);
    expect([edges[0].src, edges[0].dst].sort()).toEqual(['/a.md', '/moved.md']);
    expect((await graphStore.allMentions()).some((m) => m.path === '/moved.md')).toBe(true);
  });

  it('clear wipes the stored graph and the watermark', async () => {
    await seedFile('/a.md', 0);
    await seedFile('/b.md', 0.05);
    const { builder, prefs } = makeBuilder(fakeProvider().provider);
    await builder.build(false);
    await builder.clear();
    expect((await graphStore.allEdges()).length).toBe(0);
    expect((await graphStore.allMentions()).length).toBe(0);
    expect(prefs().graph?.builtAt).toBeUndefined();
    expect(await builder.isDirty()).toBe(true);
  });
});
