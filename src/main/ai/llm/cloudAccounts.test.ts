import { describe, expect, it } from 'vitest';
import type { AccountRecord, Prefs } from '@shared/types';
import type { CloudLlmTestResult } from '@shared/cloudLlm';
import {
  connectCloudProvider,
  disconnectCloudAccount,
  labelFor,
  validateOptions,
  verifyCredentials,
  type CloudAccountsDeps,
} from './cloudAccounts';

/**
 * The BYO-key connection flows against a fake fetch and an in-memory account
 * store: field validation, per-provider credential checks, and the prefs
 * cleanup a disconnect must perform.
 */

interface FakeDeps extends CloudAccountsDeps {
  saved: { provider: string; label: string; options: Record<string, string> }[];
  deleted: string[];
  prefs: Prefs;
  requests: { url: string; init?: RequestInit }[];
}

function fakeDeps(overrides?: {
  fetchFn?: typeof fetch;
  prefs?: Prefs;
  bedrockCheck?: (options: Record<string, string>) => Promise<CloudLlmTestResult>;
}): FakeDeps {
  const deps: FakeDeps = {
    saved: [],
    deleted: [],
    prefs: overrides?.prefs ?? {},
    requests: [],
    fetchFn: (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      deps.requests.push({ url: String(url), init });
      return overrides?.fetchFn
        ? overrides.fetchFn(url, init)
        : new Response('{}', { status: 200 });
    }) as typeof fetch,
    saveAccount: async (provider, label, options): Promise<AccountRecord> => {
      deps.saved.push({ provider, label, options });
      return { id: 'acct-1', provider, label, createdAt: 1 };
    },
    deleteAccount: async (accountId) => {
      deps.deleted.push(accountId);
    },
    getPrefs: async () => deps.prefs,
    setPrefs: async (patch) => {
      deps.prefs = { ...deps.prefs, ...patch };
    },
    bedrockCheck: overrides?.bedrockCheck ?? (async () => ({ ok: true })),
  };
  return deps;
}

const status = (code: number) => async () => new Response('{}', { status: code });

describe('validateOptions', () => {
  it('rejects unknown providers', () => {
    expect(() => validateOptions('nope', {})).toThrowError(/unknown cloud provider/i);
  });

  it('requires non-optional fields', () => {
    expect(() => validateOptions('anthropic', { apiKey: '  ' })).toThrowError(/api key/i);
  });

  it('trims values and drops unknown keys', () => {
    const { options } = validateOptions('anthropic', {
      apiKey: '  sk-ant-x  ',
      sneaky: 'value',
    });
    expect(options).toEqual({ apiKey: 'sk-ant-x' });
  });

  it('only requires fields applicable to the chosen bedrock auth mode', () => {
    // Profile mode: no access keys needed (profile itself is optional).
    const profile = validateOptions('bedrock', { region: 'us-east-1', authMode: 'profile' });
    expect(profile.options).toEqual({ region: 'us-east-1', authMode: 'profile' });
    // Keys mode: secretAccessKey becomes required.
    expect(() =>
      validateOptions('bedrock', { region: 'us-east-1', authMode: 'keys', accessKeyId: 'AKIA' }),
    ).toThrowError(/secret access key/i);
  });

  it('rejects values outside a choice field', () => {
    expect(() =>
      validateOptions('bedrock', { region: 'us-east-1', authMode: 'magic' }),
    ).toThrowError(/authentication/i);
  });
});

describe('labelFor', () => {
  it('derives readable connection labels', () => {
    expect(labelFor('anthropic', {})).toBe('Anthropic');
    expect(labelFor('bedrock', { region: 'eu-west-1' })).toBe('Bedrock · eu-west-1');
    expect(labelFor('openai', { baseURL: 'https://proxy.corp.dev/v1' })).toBe(
      'OpenAI · proxy.corp.dev',
    );
    expect(labelFor('openai-compat', { name: 'OpenRouter' })).toBe('OpenRouter');
    expect(labelFor('openai-compat', { baseURL: 'http://localhost:11434/v1' })).toBe(
      'localhost:11434',
    );
  });
});

describe('verifyCredentials', () => {
  it('accepts a good anthropic key and sends the right headers', async () => {
    const deps = fakeDeps();
    await expect(
      verifyCredentials('anthropic', { apiKey: 'sk-ant-x' }, deps),
    ).resolves.toEqual({ ok: true });
    const req = deps.requests[0];
    expect(req.url).toContain('api.anthropic.com/v1/models');
    expect((req.init?.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-x');
  });

  it('maps 401 to EAUTH', async () => {
    const deps = fakeDeps({ fetchFn: status(401) as typeof fetch });
    await expect(
      verifyCredentials('anthropic', { apiKey: 'bad' }, deps),
    ).rejects.toMatchObject({ code: 'EAUTH' });
  });

  it('probes a custom openai baseURL', async () => {
    const deps = fakeDeps();
    await verifyCredentials('openai', { apiKey: 'sk-x', baseURL: 'https://p.dev/v1/' }, deps);
    expect(deps.requests[0].url).toBe('https://p.dev/v1/models');
  });

  it('turns network failure into EOFFLINE', async () => {
    const deps = fakeDeps({
      fetchFn: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    await expect(
      verifyCredentials('openai', { apiKey: 'sk-x' }, deps),
    ).rejects.toMatchObject({ code: 'EOFFLINE' });
  });

  it('saves compat endpoints without /models as unverified', async () => {
    const deps = fakeDeps({ fetchFn: status(404) as typeof fetch });
    const result = await verifyCredentials(
      'openai-compat',
      { name: 'Local', baseURL: 'http://localhost:11434/v1' },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(result.unverified).toBe(true);
  });

  it('rejects a compat base URL that is not http(s)', async () => {
    const deps = fakeDeps();
    await expect(
      verifyCredentials('openai-compat', { name: 'X', baseURL: 'localhost:11434' }, deps),
    ).rejects.toMatchObject({ code: 'EINVAL' });
  });

  it('delegates bedrock to the injected check', async () => {
    const seen: Record<string, string>[] = [];
    const deps = fakeDeps({
      bedrockCheck: async (options) => {
        seen.push(options);
        return { ok: true, unverified: true };
      },
    });
    const result = await verifyCredentials(
      'bedrock',
      { region: 'us-east-1', authMode: 'profile' },
      deps,
    );
    expect(result.unverified).toBe(true);
    expect(seen[0].region).toBe('us-east-1');
  });
});

describe('connectCloudProvider', () => {
  it('verifies then persists under the llm- namespace', async () => {
    const deps = fakeDeps();
    const { account, unverified } = await connectCloudProvider(
      'anthropic',
      { apiKey: 'sk-ant-x' },
      deps,
    );
    expect(unverified).toBeUndefined();
    expect(account.provider).toBe('llm-anthropic');
    expect(deps.saved[0]).toMatchObject({
      provider: 'llm-anthropic',
      label: 'Anthropic',
      options: { apiKey: 'sk-ant-x' },
    });
  });

  it('does not persist when verification fails', async () => {
    const deps = fakeDeps({ fetchFn: status(401) as typeof fetch });
    await expect(
      connectCloudProvider('anthropic', { apiKey: 'bad' }, deps),
    ).rejects.toMatchObject({ code: 'EAUTH' });
    expect(deps.saved).toHaveLength(0);
  });

  it('carries the unverified flag through', async () => {
    const deps = fakeDeps({ fetchFn: status(404) as typeof fetch });
    const { unverified } = await connectCloudProvider(
      'openai-compat',
      { name: 'Local', baseURL: 'http://localhost:1234/v1' },
      deps,
    );
    expect(unverified).toBe(true);
  });
});

describe('disconnectCloudAccount', () => {
  const cloudModel = (accountId: string, id: string) => ({
    id,
    provider: 'anthropic' as const,
    accountId,
    remoteId: 'claude-sonnet-5',
    label: 'Sonnet',
    family: 'anthropic' as const,
  });

  it('deletes the account and prunes its models, configs and selection', async () => {
    const deps = fakeDeps({
      prefs: {
        ai: {
          enabled: true,
          activeProvider: 'embedded',
          llmModelId: 'cloud-a',
          cloudModels: [cloudModel('acct-1', 'cloud-a'), cloudModel('acct-2', 'cloud-b')],
          llmConfigs: { 'cloud-a': { temperature: 1 }, 'qwen3-4b': { topP: 0.5 } },
        },
      },
    });
    await disconnectCloudAccount('acct-1', deps);
    expect(deps.deleted).toEqual(['acct-1']);
    expect(deps.prefs.ai?.cloudModels?.map((m) => m.id)).toEqual(['cloud-b']);
    expect(deps.prefs.ai?.llmConfigs).toEqual({ 'qwen3-4b': { topP: 0.5 } });
    expect(deps.prefs.ai?.llmModelId).toBeUndefined();
    // Untouched sibling settings survive the merge.
    expect(deps.prefs.ai?.enabled).toBe(true);
  });

  it('keeps the selected model when it belongs to another account', async () => {
    const deps = fakeDeps({
      prefs: {
        ai: {
          enabled: true,
          activeProvider: 'embedded',
          llmModelId: 'cloud-b',
          cloudModels: [cloudModel('acct-1', 'cloud-a'), cloudModel('acct-2', 'cloud-b')],
        },
      },
    });
    await disconnectCloudAccount('acct-1', deps);
    expect(deps.prefs.ai?.llmModelId).toBe('cloud-b');
  });

  it('leaves prefs untouched when no models referenced the account', async () => {
    const deps = fakeDeps({ prefs: { ai: { enabled: true, activeProvider: 'embedded' } } });
    await disconnectCloudAccount('acct-9', deps);
    expect(deps.deleted).toEqual(['acct-9']);
    expect(deps.prefs).toEqual({ ai: { enabled: true, activeProvider: 'embedded' } });
  });
});
