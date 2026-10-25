/**
 * Chat eval: the Assistant end to end — context building, the real on-device
 * LLM (`llmRuntime.ts`, in-process) and the file tools — over the testbed.
 *
 * Opt-in: needs a chat model. Set `FILDOS_EVAL_LLM` to an `LLM_MODELS` id
 * (e.g. qwen3-4b); weights load from `FILDOS_LLM_DIR` (default
 * `eval/.models/llm`) and download there if missing.
 *
 * Cases (`queries/chat.json`):
 *  - find: `/find <question>` — did retrieval surface the expected file,
 *    did the answer cite it, does the answer hold the expected fact
 *  - ask:  a plain question the model must research with `search_index`
 *  - tool: a file action in a scratch copy of the testbed — the expected tool
 *    ran and the disk ends in the expected state (read-only cases must change
 *    nothing)
 *
 * Generation is greedy (temperature 0) so a before/after comparison measures
 * the change, not sampling noise; everything else is the model's resolved
 * production config.
 */
import { promises as fs } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { afterAll, beforeAll, describe, it } from 'vitest';
import type { ChatSendPayload, ChatToolCall } from '@shared/types';
import { extractText } from '../src/main/ai/index/extract';
import { assembleSystem, buildChat } from '../src/main/ai/llm/context';
import { executeChatTool, type ChatToolDeps } from '../src/main/ai/llm/tools';
import { handle, resolveTool, setPost } from '../src/main/ai/llm/llmRuntime';
import { listDir } from '../src/main/fs/service';
import { closeTestbed, indexTestbed, search, type Indexed } from './lib/harness';
import { pct, table, writeResults } from './lib/report';

interface ChatCase {
  kind: 'find' | 'ask' | 'tool';
  prompt: string;
  cwd?: string;
  expectSource?: string;
  expectTool?: string;
  answerAny?: string[];
  exists?: string[];
  absent?: string[];
  readOnly?: boolean;
}

interface CaseResult {
  prompt: string;
  kind: ChatCase['kind'];
  retrieved: boolean | null;
  cited: boolean | null;
  answered: boolean | null;
  tool: boolean | null;
  disk: boolean | null;
  tools: string[];
  /** Each tool call's outcome as the UI would show it. */
  calls: { name: string; ok: boolean; summary: string; params: unknown }[];
  seconds: number;
  answer: string;
}

const CASES: ChatCase[] = JSON.parse(readFileSync(join(__dirname, 'queries', 'chat.json'), 'utf8')).cases;
const MODEL = process.env.FILDOS_EVAL_LLM;
const MUTATING = new Set(['create_file', 'create_folder', 'copy_files', 'move_files', 'rename_file', 'delete_files']);

let ix: Indexed;
let workspace: string;
let seq = 0;

/** Tool calls of the request in flight, executed against the scratch workspace. */
let onToolCall: ((callId: string, name: string, params: unknown) => void) | null = null;

beforeAll(async () => {
  if (!MODEL) return;
  process.env.FILDOS_LLM_DIR ??= resolve(__dirname, '.models', 'llm');
  ix = await indexTestbed();
  setPost((msg) => {
    const m = msg as { type?: string; callId?: string; name?: string; params?: unknown };
    if (m.type === 'toolCall' && onToolCall) onToolCall(m.callId!, m.name!, m.params);
  });
  await handle({ id: 0, type: 'download', modelId: MODEL });
}, 3_600_000);

afterAll(() => {
  if (MODEL) closeTestbed();
});

/** A fresh scratch copy of the testbed for one case: tools never touch the shared testbed. */
async function freshWorkspace(): Promise<string> {
  if (workspace) await fs.rm(workspace, { recursive: true, force: true });
  workspace = await fs.mkdtemp(join(tmpdir(), 'fildos-chat-eval-'));
  for (const top of ['Home', 'Work', 'projects']) {
    await fs.cp(ix.abs(top), join(workspace, top), { recursive: true });
  }
  return workspace;
}

/** Path-valued tool params (see `@shared/chatTools`). */
const PATH_PARAMS = ['path', 'paths', 'destination', 'folder'];

/**
 * The first absolute path in a tool call's params that falls outside `ws` (or
 * is `ws` itself), or null. Relative paths resolve inside the case's cwd/home,
 * which both live in `ws`.
 */
function escapingPath(params: Record<string, unknown>, ws: string): string | null {
  for (const key of PATH_PARAMS) {
    const v = params[key];
    for (const p of Array.isArray(v) ? v : [v]) {
      if (typeof p !== 'string' || !isAbsolute(p)) continue;
      const rel = relative(ws, resolve(p));
      if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return p;
    }
  }
  return null;
}

async function snapshotTree(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    out.push(relative(dir, join(e.parentPath, e.name)));
  }
  return out.sort();
}

async function runCase(c: ChatCase): Promise<CaseResult> {
  const ws = await freshWorkspace();
  const inWs = (rel: string) => join(ws, ...rel.split('/'));
  const cwd = c.cwd ? inWs(c.cwd) : undefined;
  // The index covers the shared testbed; hits are mapped into this case's copy.
  const searchWs = async (q: string, k: number) =>
    (await search(ix, q, k, 'question')).map((h) => ({ ...h, path: inWs(ix.rel(h.path)) }));
  const toDeps: ChatToolDeps = {
    trashItem: (path) => fs.rm(path, { recursive: true }),
    remap: () => {},
    dropIndex: async () => {},
    extract: extractText,
    search: searchWs,
    home: () => ws,
  };
  const payload: ChatSendPayload = {
    requestId: `eval-${seq++}`,
    prompt: c.prompt,
    history: [],
    mentions: [],
    command: c.kind === 'find' ? 'find' : undefined,
    cwd,
  };
  const built = await buildChat(payload, { extract: extractText, list: listDir, search: searchWs });
  const calls: (ChatToolCall & { params: unknown })[] = [];
  onToolCall = (callId, name, params) => {
    const p = (params ?? {}) as Record<string, unknown>;
    const escape = escapingPath(p, ws);
    if (escape) {
      const message = `Path outside the eval workspace: ${escape}`;
      calls.push({ name, summary: message, ok: false, params });
      resolveTool(callId, { ok: false, error: message });
      return;
    }
    void executeChatTool(name, p, cwd, toDeps).then(({ call, result }) => {
      calls.push({ ...call, params });
      resolveTool(callId, result);
    });
  };
  const before = c.readOnly ? await snapshotTree(ws) : null;
  const started = performance.now();
  const answer = (await handle({
    id: seq,
    type: 'chat',
    modelId: MODEL!,
    requestId: payload.requestId,
    system: assembleSystem(built, { cwd }),
    history: [],
    prompt: built.prompt,
    config: { temperature: 0 },
    tools: true,
  })) as string;
  const seconds = (performance.now() - started) / 1000;
  onToolCall = null;

  const toolNames = calls.map((t) => t.name);
  const sourcePaths = [
    ...(built.hits ?? []).map((h) => h.path),
    ...calls.flatMap((t) => t.paths ?? []),
  ].map((p) => relative(ws, p).split(sep).join('/'));
  const lower = answer.toLowerCase();

  let disk: boolean | null = null;
  if (c.exists || c.absent || c.readOnly) {
    const exists = await Promise.all((c.exists ?? []).map((p) => fs.stat(inWs(p)).then(() => true, () => false)));
    const absent = await Promise.all((c.absent ?? []).map((p) => fs.stat(inWs(p)).then(() => false, () => true)));
    const unchanged = before ? JSON.stringify(before) === JSON.stringify(await snapshotTree(ws)) : true;
    disk = exists.every(Boolean) && absent.every(Boolean) && unchanged && !(c.readOnly && toolNames.some((n) => MUTATING.has(n)));
  }
  return {
    prompt: c.prompt,
    kind: c.kind,
    retrieved: c.expectSource ? sourcePaths.includes(c.expectSource) : null,
    cited: c.expectSource ? lower.includes(basename(c.expectSource).toLowerCase().replace(/\.\w+$/, '')) : null,
    answered: c.answerAny ? c.answerAny.some((a) => lower.includes(a.toLowerCase())) : null,
    tool: c.expectTool ? toolNames.includes(c.expectTool) : null,
    disk,
    tools: toolNames,
    calls: calls.map(({ name, ok, summary, params }) => ({ name, ok, summary, params })),
    seconds,
    answer: answer.slice(0, 400),
  };
}

const rate = (rows: CaseResult[], key: 'retrieved' | 'cited' | 'answered' | 'tool' | 'disk') => {
  const scored = rows.filter((r) => r[key] !== null);
  return scored.length ? scored.filter((r) => r[key]).length / scored.length : null;
};

describe.skipIf(!MODEL)('chat eval', () => {
  it('measures retrieval, citations, answers and tool use', async () => {
    const results: CaseResult[] = [];
    for (const c of CASES) results.push(await runCase(c));

    const mark = (v: boolean | null) => (v === null ? '-' : v ? 'yes' : 'NO');
    console.log(`\nChat eval — model ${MODEL}, embeddings ${ix.kind}`);
    console.log(
      table(
        ['kind', 'prompt', 'retrieved', 'cited', 'answer', 'tool', 'disk', 's'],
        results.map((r) => [r.kind, r.prompt.slice(0, 48), mark(r.retrieved), mark(r.cited), mark(r.answered), mark(r.tool), mark(r.disk), r.seconds.toFixed(1)]),
      ),
    );
    const summary = {
      retrieved: rate(results, 'retrieved'),
      cited: rate(results, 'cited'),
      answered: rate(results, 'answered'),
      tool: rate(results, 'tool'),
      disk: rate(results, 'disk'),
      meanSeconds: results.reduce((s, r) => s + r.seconds, 0) / results.length,
    };
    console.log(
      `\n${Object.entries(summary)
        .map(([k, v]) => `${k}: ${v === null ? '-' : k === 'meanSeconds' ? `${(v as number).toFixed(1)} s` : pct(v as number)}`)
        .join('  ')}`,
    );
    for (const r of results.filter((x) => x.answered === false || x.tool === false || x.disk === false)) {
      const calls = r.calls
        .map((c) => `${c.name}(${JSON.stringify(c.params)}) ${c.ok ? 'ok' : 'FAILED'}: ${c.summary}`)
        .join('; ');
      console.log(`\n[${r.kind}] ${r.prompt}\n  tools: ${calls || '(none)'}\n  answer: ${r.answer.replace(/\s+/g, ' ')}`);
    }
    const file = await writeResults('chat', ix.kind, { model: MODEL, summary, cases: results });
    console.log(`\nWrote ${file}`);
  }, 3_600_000);
});
