import { describe, expect, it } from 'vitest';
import {
  CLOUD_MODEL_SUGGESTIONS,
  CLOUD_PROVIDERS,
  cloudProviderOfAccount,
  getCloudProvider,
  isCloudModelId,
  isLlmAccountProvider,
  llmAccountProvider,
  makeCloudModelDef,
} from './cloudLlm';
import { parseCustomModelInput } from './llmModels';

describe('llm account namespacing', () => {
  it('round-trips provider ids through the account prefix', () => {
    for (const p of CLOUD_PROVIDERS) {
      const account = llmAccountProvider(p.id);
      expect(isLlmAccountProvider(account)).toBe(true);
      expect(cloudProviderOfAccount(account)).toBe(p.id);
    }
  });

  it('never claims cloud-storage providers', () => {
    for (const storage of ['gdrive', 'dropbox', 'onedrive', 's3', 'ipfs']) {
      expect(isLlmAccountProvider(storage)).toBe(false);
      expect(cloudProviderOfAccount(storage)).toBeNull();
    }
  });

  it('rejects unknown llm- providers', () => {
    expect(cloudProviderOfAccount('llm-nonsense')).toBeNull();
  });
});

describe('makeCloudModelDef', () => {
  const acct = 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6';

  it('mints a stable cloud- id scoped to the account', () => {
    const def = makeCloudModelDef('anthropic', acct, 'claude-sonnet-5');
    expect(def).not.toBeNull();
    expect(def!.id).toBe('cloud-f81d4fae-claude-sonnet-5');
    expect(def!.family).toBe('anthropic');
    expect(def!.label).toBe('claude-sonnet-5');
    expect(isCloudModelId(def!.id)).toBe(true);
  });

  it('slugs bedrock inference-profile ids', () => {
    const def = makeCloudModelDef(
      'bedrock',
      acct,
      'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    );
    expect(def!.id).toBe('cloud-f81d4fae-us-anthropic-claude-sonnet-4-5-20250929-v1-0');
    expect(def!.remoteId).toBe('us.anthropic.claude-sonnet-4-5-20250929-v1:0');
    expect(def!.family).toBe('bedrock');
  });

  it('keeps two accounts serving the same model id apart', () => {
    const a = makeCloudModelDef('openai-compat', 'aaaaaaaa-1111', 'llama-3.3-70b');
    const b = makeCloudModelDef('openai-compat', 'bbbbbbbb-2222', 'llama-3.3-70b');
    expect(a!.id).not.toBe(b!.id);
  });

  it('rejects empty and whitespace-carrying ids', () => {
    expect(makeCloudModelDef('openai', acct, '')).toBeNull();
    expect(makeCloudModelDef('openai', acct, '   ')).toBeNull();
    expect(makeCloudModelDef('openai', acct, 'gpt 5')).toBeNull();
    expect(makeCloudModelDef('openai', acct, '///')).toBeNull();
  });

  it('honours a custom label', () => {
    const def = makeCloudModelDef('google', acct, 'gemini-2.5-flash', 'Flash');
    expect(def!.label).toBe('Flash');
  });

  it('never collides with custom- GGUF ids', () => {
    const custom = parseCustomModelInput('bartowski/Llama-3.2-1B-Instruct-GGUF');
    const cloud = makeCloudModelDef('openai-compat', acct, 'llama-3.2-1b');
    expect(custom!.id.startsWith('custom-')).toBe(true);
    expect(cloud!.id.startsWith('cloud-')).toBe(true);
    expect(isCloudModelId(custom!.id)).toBe(false);
  });
});

describe('provider catalog', () => {
  it('every provider has at least one field and a resolvable def', () => {
    for (const p of CLOUD_PROVIDERS) {
      expect(p.fields.length).toBeGreaterThan(0);
      expect(getCloudProvider(p.id)).toBe(p);
    }
  });

  it('showWhen conditions reference real sibling fields', () => {
    for (const p of CLOUD_PROVIDERS) {
      for (const f of p.fields) {
        if (!f.showWhen) continue;
        const target = p.fields.find((o) => o.key === f.showWhen!.key);
        expect(target, `${p.id}.${f.key} showWhen target`).toBeDefined();
        expect(target!.choices).toContain(f.showWhen!.value);
      }
    }
  });

  it('suggestions exist for every provider key', () => {
    for (const p of CLOUD_PROVIDERS) {
      expect(CLOUD_MODEL_SUGGESTIONS[p.id]).toBeDefined();
    }
  });
});
