import { describe, expect, it } from 'vitest';
import type {
  ChatSendPayload,
  ChatStreamEvent,
  ChatToolCall,
  Prefs,
} from '@shared/types';
import type { CloudModelDef } from '@shared/cloudLlm';
import { sendChat, type SendChatDeps } from './sendChat';
import type { CloudChatArgs } from './cloudChat';

/**
 * The engine routing in sendChat with both engines faked: local ids reach the
 * LlmManager surface, cloud ids reach the cloud engine with decrypted
 * credentials, and persistence + stream events behave identically on both
 * paths (and on failure).
 */

const cloudModel: CloudModelDef = {
  id: 'cloud-acct1234-claude-sonnet-5',
  provider: 'anthropic',
  accountId: 'acct-1',
  remoteId: 'claude-sonnet-5',
  label: 'Claude Sonnet 5',
  family: 'anthropic',
};

interface Fake {
  deps: SendChatDeps;
  events: ChatStreamEvent[];
  localCalls: Record<string, unknown>[];
  cloudCalls: CloudChatArgs[];
  appended: { sessionId: string; message: Record<string, unknown> }[];
  created: string[];
  touched: string[];
}

function fake(over?: {
  prefs?: Prefs;
  credentials?: Record<string, string> | null;
  localAnswer?: () => Promise<string>;
  cloudAnswer?: (args: CloudChatArgs) => Promise<string>;
}): Fake {
  const f: Fake = {
    events: [],
    localCalls: [],
    cloudCalls: [],
    appended: [],
    created: [],
    touched: [],
    deps: {
      getPrefs: async () =>
        over?.prefs ?? {
          ai: { enabled: true, activeProvider: 'embedded', cloudModels: [cloudModel] },
        },
      chats: {
        titleFor: (prompt) => prompt.slice(0, 20),
        createSession: async (id) => {
          f.created.push(id);
        },
        touchSession: async (id) => {
          f.touched.push(id);
        },
        appendMessage: async (sessionId, message) => {
          f.appended.push({ sessionId, message: message as Record<string, unknown> });
        },
      },
      buildChat: async (payload) => ({
        system: 'SYSTEM',
        prompt: payload.prompt,
      }),
      contextDeps: { extract: async () => null, list: async () => [] },
      toolDeps: {
        trashItem: async () => {},
        remap: () => {},
        dropIndex: async () => {},
        extract: async () => null,
        search: async () => [],
        home: () => '/home/u',
      },
      local: {
        chat: async (args) => {
          f.localCalls.push(args as unknown as Record<string, unknown>);
          return over?.localAnswer ? over.localAnswer() : 'local answer';
        },
        onChunk: () => () => {},
        onToolCall: () => () => {},
        toolResult: () => {},
      },
      cloud: async (args) => {
        f.cloudCalls.push(args);
        return over?.cloudAnswer ? over.cloudAnswer(args) : 'cloud answer';
      },
      getCredentials: async () =>
        over && 'credentials' in over ? over.credentials! : { apiKey: 'sk-ant-x' },
      modelDefOf: async () => undefined,
      send: (event) => {
        f.events.push(event);
      },
    },
  };
  return f;
}

function payload(over?: Partial<ChatSendPayload>): ChatSendPayload {
  return {
    requestId: 'req-1',
    prompt: 'hello',
    history: [],
    mentions: [],
    ...over,
  };
}

describe('sendChat routing', () => {
  it('routes local model ids to the local engine', async () => {
    const f = fake();
    const { sessionId } = await sendChat(payload({ modelId: 'qwen3-4b' }), f.deps);
    expect(f.localCalls).toHaveLength(1);
    expect(f.cloudCalls).toHaveLength(0);
    expect(f.created).toEqual([sessionId]);
    expect(f.events.at(-1)).toMatchObject({ type: 'done' });
    // user message then assistant answer persisted.
    expect(f.appended.map((a) => a.message.role)).toEqual(['user', 'assistant']);
    expect(f.appended[1].message.content).toBe('local answer');
  });

  it('routes cloud model ids to the cloud engine with decrypted credentials', async () => {
    const f = fake();
    await sendChat(payload({ modelId: cloudModel.id }), f.deps);
    expect(f.localCalls).toHaveLength(0);
    expect(f.cloudCalls).toHaveLength(1);
    const call = f.cloudCalls[0];
    expect(call.def).toBe(cloudModel);
    expect(call.credentials).toEqual({ apiKey: 'sk-ant-x' });
    expect(call.system).toContain('SYSTEM');
    expect(f.appended[1].message.content).toBe('cloud answer');
  });

  it('falls back to the prefs-selected cloud model when payload has none', async () => {
    const f = fake({
      prefs: {
        ai: {
          enabled: true,
          activeProvider: 'embedded',
          llmModelId: cloudModel.id,
          cloudModels: [cloudModel],
        },
      },
    });
    await sendChat(payload(), f.deps);
    expect(f.cloudCalls).toHaveLength(1);
  });

  it('widens the context budget for cloud models (and research further)', async () => {
    const f = fake();
    await sendChat(payload({ modelId: cloudModel.id }), f.deps);
    expect(f.cloudCalls[0].config.contextSize).toBe(16_384);

    const r = fake();
    await sendChat(payload({ modelId: cloudModel.id, mode: 'research' }), r.deps);
    expect(r.cloudCalls[0].config.contextSize).toBe(32_768);
  });

  it('honours cloud config limits above the local clamp', async () => {
    const f = fake({
      prefs: {
        ai: {
          enabled: true,
          activeProvider: 'embedded',
          cloudModels: [cloudModel],
          llmConfigs: { [cloudModel.id]: { maxTokens: 8192 } },
        },
      },
    });
    await sendChat(payload({ modelId: cloudModel.id }), f.deps);
    // Local limits would clamp this to 2048.
    expect(f.cloudCalls[0].config.maxTokens).toBe(8192);
  });

  it('fails with EAUTH when the credentials are gone, still persisting the user message', async () => {
    const f = fake({ credentials: null });
    await expect(sendChat(payload({ modelId: cloudModel.id }), f.deps)).rejects.toMatchObject({
      code: 'EAUTH',
    });
    expect(f.appended.map((a) => a.message.role)).toEqual(['user']);
    expect(f.touched).toHaveLength(1);
    expect(f.events.at(-1)).toMatchObject({ type: 'error', error: { code: 'EAUTH' } });
  });

  it('streams cloud chunks and tool calls as ChatStreamEvents and persists the calls', async () => {
    const f = fake({
      cloudAnswer: async (args) => {
        args.onChunk('He');
        args.onChunk('llo');
        args.onToolCall({ name: 'read_file', summary: 'Read notes.md', ok: true } as ChatToolCall);
        return 'Hello';
      },
    });
    await sendChat(payload({ modelId: cloudModel.id }), f.deps);
    const types = f.events.map((e) => e.type);
    expect(types).toEqual(['chunk', 'chunk', 'tool', 'done']);
    expect((f.appended[1].message.toolCalls as ChatToolCall[]).map((c) => c.name)).toEqual([
      'read_file',
    ]);
  });

  it('surfaces cloud engine failures as error events and rethrows', async () => {
    const f = fake({
      cloudAnswer: async () => {
        throw Object.assign(new Error('rate limited'), { code: 'ERATELIMIT' });
      },
    });
    await expect(sendChat(payload({ modelId: cloudModel.id }), f.deps)).rejects.toMatchObject({
      code: 'ERATELIMIT',
    });
    expect(f.events.at(-1)).toMatchObject({ type: 'error', error: { code: 'ERATELIMIT' } });
  });

  it('appends to an existing session without re-minting one', async () => {
    const f = fake();
    const { sessionId } = await sendChat(
      payload({ modelId: cloudModel.id, sessionId: 'sess-9' }),
      f.deps,
    );
    expect(sessionId).toBe('sess-9');
    expect(f.created).toHaveLength(0);
  });
});
