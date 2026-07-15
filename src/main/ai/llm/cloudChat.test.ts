import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_TOOLS } from '@shared/chatTools';
import type { CloudModelDef } from '@shared/cloudLlm';
import type { LlmModelConfig } from '@shared/llmModels';
import type { ChatToolDeps } from './tools';

/**
 * The cloud engine against a mocked AI SDK: schema translation for every
 * catalog tool, sampling policy, error mapping, and the streamText loop
 * (chunks, in-process tool execution, abort, sampling retry).
 */

// One mutable script the fake streamText plays per test.
type StreamPart =
  | { type: 'text-delta'; text: string }
  | { type: 'abort' }
  | { type: 'error'; error: unknown }
  | { type: 'tool'; name: string; input: Record<string, unknown> };

const fake = {
  parts: [] as StreamPart[],
  calls: [] as Record<string, unknown>[],
  generated: [] as Record<string, unknown>[],
  failFirstWith: null as unknown,
};

vi.mock('ai', () => ({
  tool: (def: unknown) => def,
  jsonSchema: (schema: unknown) => schema,
  stepCountIs: (n: number) => ({ stepCount: n }),
  generateText: async (args: Record<string, unknown>) => {
    fake.generated.push(args);
    if (fake.failFirstWith) throw fake.failFirstWith;
    return { text: 'ok' };
  },
  streamText: (args: Record<string, unknown>) => {
    fake.calls.push(args);
    if (fake.failFirstWith && fake.calls.length === 1) {
      const cause = fake.failFirstWith;
      return {
        fullStream: (async function* () {
          yield { type: 'error', error: cause };
        })(),
      };
    }
    const tools = args.tools as Record<
      string,
      { execute: (params: Record<string, unknown>) => Promise<unknown> }
    >;
    return {
      fullStream: (async function* () {
        for (const part of fake.parts) {
          if (part.type === 'tool') {
            await tools[part.name].execute(part.input);
          } else {
            yield part;
          }
        }
      })(),
    };
  },
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: (settings: unknown) => {
    void settings;
    return (remoteId: string) => ({ modelId: remoteId });
  },
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: (settings: unknown) => {
    void settings;
    return (remoteId: string) => ({ modelId: remoteId });
  },
}));

import {
  chatToolJsonSchema,
  cloudChat,
  samplingFor,
  stopCloudChat,
  toCloudError,
  type CloudChatArgs,
} from './cloudChat';

const noopToolDeps: ChatToolDeps = {
  trashItem: async () => {},
  remap: () => {},
  dropIndex: async () => {},
  extract: async () => 'file text',
  search: async () => [],
  home: () => '/home/u',
};

const def: CloudModelDef = {
  id: 'cloud-acct-claude-sonnet-5',
  provider: 'anthropic',
  accountId: 'acct',
  remoteId: 'claude-sonnet-5',
  label: 'Claude Sonnet 5',
  family: 'anthropic',
};

const config: LlmModelConfig = {
  temperature: 0.3,
  topP: 0.9,
  maxTokens: 2048,
  contextSize: 16384,
  systemPrompt: '',
};

function args(over?: Partial<CloudChatArgs>): CloudChatArgs {
  return {
    def,
    credentials: { apiKey: 'sk-ant-x' },
    requestId: 'req-1',
    system: 'You are the FilDOS Assistant.',
    history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }],
    prompt: 'What is in my notes?',
    config,
    toolDeps: noopToolDeps,
    onChunk: () => {},
    onToolCall: () => {},
    ...over,
  };
}

beforeEach(() => {
  fake.parts = [];
  fake.calls = [];
  fake.generated = [];
  fake.failFirstWith = null;
});

describe('chatToolJsonSchema', () => {
  it('translates every catalog tool into strict JSON Schema', () => {
    for (const tool of CHAT_TOOLS) {
      const schema = chatToolJsonSchema(tool.params);
      expect(schema.type).toBe('object');
      expect(schema.additionalProperties).toBe(false);
      // Strict mode: every property is listed as required (nullables included).
      expect(schema.required.sort()).toEqual(Object.keys(schema.properties).sort());
    }
  });

  it('folds oneOf-null optionality into a nullable type', () => {
    const createFile = CHAT_TOOLS.find((t) => t.name === 'create_file')!;
    const schema = chatToolJsonSchema(createFile.params);
    expect(schema.properties.folder).toMatchObject({ type: ['string', 'null'] });
    expect((schema.properties.folder as { description?: string }).description).toMatch(/folder/i);
    // Non-optional fields pass through untouched.
    expect(schema.properties.name).toMatchObject({ type: 'string' });
  });

  it('keeps integer nullables and array items intact', () => {
    const search = CHAT_TOOLS.find((t) => t.name === 'search_index')!;
    expect(chatToolJsonSchema(search.params).properties.k).toMatchObject({
      type: ['integer', 'null'],
    });
    const copy = CHAT_TOOLS.find((t) => t.name === 'copy_files')!;
    expect(chatToolJsonSchema(copy.params).properties.paths).toMatchObject({
      type: 'array',
      items: { type: 'string' },
    });
  });
});

describe('samplingFor', () => {
  it('omits sampling for anthropic and bedrock-claude models', () => {
    expect(samplingFor('anthropic', 'claude-sonnet-5', config)).toEqual({});
    expect(
      samplingFor('bedrock', 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', config),
    ).toEqual({});
  });

  it('passes sampling through for everything else', () => {
    expect(samplingFor('openai', 'gpt-5.1', config)).toEqual({ temperature: 0.3, topP: 0.9 });
    expect(samplingFor('bedrock', 'meta.llama3-70b-instruct-v1:0', config)).toEqual({
      temperature: 0.3,
      topP: 0.9,
    });
  });
});

describe('toCloudError', () => {
  const cases: [unknown, string][] = [
    [Object.assign(new Error('Unauthorized'), { statusCode: 401 }), 'EAUTH'],
    [Object.assign(new Error('forbidden'), { statusCode: 403 }), 'EAUTH'],
    [new Error('invalid x-api-key'), 'EAUTH'],
    [Object.assign(new Error('The security token included in the request is expired'), { name: 'ExpiredTokenException' }), 'EAUTH'],
    [Object.assign(new Error('Could not load credentials from any providers'), { name: 'CredentialsProviderError' }), 'EAUTH'],
    [Object.assign(new Error('model not found'), { statusCode: 404 }), 'EINVAL'],
    [Object.assign(new Error('rate limited'), { statusCode: 429 }), 'ERATELIMIT'],
    [Object.assign(new Error("The provided model identifier is invalid."), { name: 'ValidationException' }), 'EINVAL'],
    [new TypeError('fetch failed'), 'EOFFLINE'],
    [new Error('something exploded'), 'ELLMFAILED'],
  ];

  it.each(cases)('maps %s', (cause, code) => {
    expect(toCloudError(cause, 'anthropic', 'claude-sonnet-5')).toMatchObject({ code });
  });

  it('names the model and provider in the message', () => {
    const err = toCloudError(
      Object.assign(new Error('nope'), { statusCode: 404 }),
      'bedrock',
      'us.meta.llama4:0',
    );
    expect(err.message).toContain('us.meta.llama4:0');
    expect(err.message).toContain('AWS Bedrock');
  });

  it('gives AWS credential-chain failures an actionable hint', () => {
    const err = toCloudError(
      Object.assign(new Error('Could not load credentials from any providers'), {
        name: 'CredentialsProviderError',
      }),
      'bedrock',
      'x',
    );
    expect(err.message).toContain('aws sso login');
  });
});

describe('cloudChat', () => {
  it('streams chunks, resolves with the full answer, and shapes the request', async () => {
    fake.parts = [
      { type: 'text-delta', text: 'Hello ' },
      { type: 'text-delta', text: 'world' },
    ];
    const chunks: string[] = [];
    const answer = await cloudChat(args({ onChunk: (t) => chunks.push(t) }));
    expect(answer).toBe('Hello world');
    expect(chunks).toEqual(['Hello ', 'world']);

    const call = fake.calls[0];
    expect(call.system).toContain('FilDOS Assistant');
    expect(call.maxOutputTokens).toBe(2048);
    // Anthropic: sampling omitted entirely.
    expect('temperature' in call).toBe(false);
    // History rides ahead of the prompt.
    expect(call.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'What is in my notes?' },
    ]);
    expect(Object.keys(call.tools as object)).toEqual(CHAT_TOOLS.map((t) => t.name));
  });

  it('executes tools in-process and surfaces the call', async () => {
    fake.parts = [
      { type: 'tool', name: 'read_file', input: { path: '/home/u/notes.md' } },
      { type: 'text-delta', text: 'Done.' },
    ];
    const seen: string[] = [];
    const answer = await cloudChat(args({ onToolCall: (c) => seen.push(c.name) }));
    expect(answer).toBe('Done.');
    expect(seen).toEqual(['read_file']);
  });

  it('an abort part resolves with the partial answer', async () => {
    fake.parts = [{ type: 'text-delta', text: 'Partial' }, { type: 'abort' }];
    const answer = await cloudChat(args());
    expect(answer).toBe('Partial');
  });

  it('stopCloudChat is a no-op for unknown request ids', () => {
    expect(() => stopCloudChat('nope')).not.toThrow();
  });

  it('retries once without sampling on a 400 naming temperature', async () => {
    fake.failFirstWith = Object.assign(new Error('temperature is not supported'), {
      statusCode: 400,
    });
    fake.parts = [{ type: 'text-delta', text: 'ok' }];
    const openaiDef: CloudModelDef = { ...def, provider: 'openai', remoteId: 'o9-preview' };
    // Reset after the first streamText call plays the failure.
    const origStream = fake.calls;
    void origStream;
    const answer = await cloudChat(
      args({
        def: openaiDef,
        credentials: { apiKey: 'sk-x' },
      }),
    ).catch((e) => e);
    // First call carried sampling, second didn't.
    expect(fake.calls).toHaveLength(2);
    expect('temperature' in fake.calls[0]).toBe(true);
    expect('temperature' in fake.calls[1]).toBe(false);
    expect(answer).toBe('ok');
  });

  it('maps stream errors onto coded errors', async () => {
    fake.parts = [
      { type: 'error', error: Object.assign(new Error('rate limited'), { statusCode: 429 }) },
    ];
    await expect(cloudChat(args())).rejects.toMatchObject({ code: 'ERATELIMIT' });
  });
});
