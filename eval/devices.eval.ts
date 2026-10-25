/**
 * Devices eval: is a GPU worth it for EmbeddingGemma 2's vision encoder here?
 * Opt-in (`FILDOS_EVAL_DEVICES=1`, real models only): embeds the testbed's
 * pictures on the CPU and on this platform's GPU device (CoreML on macOS,
 * DirectML on Windows, CUDA on Linux) and reports time per picture and the
 * worst cosine agreement with the CPU. A device only counts as usable at
 * agreement ≥ 0.999. Production embeds on the CPU; this is the evidence a
 * default change would need.
 */
import { describe, it } from 'vitest';
import type { DeviceCheckResult, EmbedDevice } from '@shared/types';
import { EMBED_MODEL_ID } from '@shared/aiModels';
import { handle } from '../src/main/ai/modelRuntime';
import { buildTestbed } from './testbed/build';
import { MEDIA_FILES } from './testbed/manifest';
import { join, resolve } from 'node:path';
import { table, writeResults } from './lib/report';

const GPU: Partial<Record<NodeJS.Platform, EmbedDevice>> = { darwin: 'coreml', win32: 'dml', linux: 'cuda' };

describe.skipIf(!process.env.FILDOS_EVAL_DEVICES)('devices eval', () => {
  it('times the vision encoder on CPU and GPU', async () => {
    process.env.FILDOS_MODELS_DIR ??= resolve(__dirname, '.models');
    const root = await buildTestbed();
    const images = MEDIA_FILES.filter((f) => /\.(jpe?g|png)$/i.test(f.path)).map((f) => join(root, ...f.path.split('/')));
    const gpu = GPU[process.platform];
    const result = (await handle({
      type: 'deviceCheck',
      modelId: EMBED_MODEL_ID,
      devices: gpu ? [gpu] : [],
      images,
    })) as DeviceCheckResult;

    console.log(`\nDevices eval — ${process.platform}/${process.arch}, ${images.length} pictures`);
    console.log(
      table(
        ['device', 'ms / picture', 'agreement', 'note'],
        result.results.map((r) => [
          r.device,
          r.msPerImage?.toFixed(0) ?? '-',
          r.agreement?.toFixed(4) ?? '-',
          r.error ? r.error.slice(0, 80) : r.device === result.chosen ? 'fastest usable' : '',
        ]),
      ),
    );
    console.log(`\nWrote ${await writeResults('devices', `${process.platform}-${process.arch}`, result)}`);
  }, 1_800_000);
});
