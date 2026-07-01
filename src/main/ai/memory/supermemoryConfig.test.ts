import { describe, expect, it } from 'vitest';
import { resolveLlmEnv } from './supermemoryConfig';

describe('resolveLlmEnv', () => {
  it('returns null when no model provider is configured', () => {
    expect(resolveLlmEnv({})).toBeNull();
    expect(resolveLlmEnv({ OPENAI_MODEL: 'gpt-x' })).toBeNull(); // model without a provider
  });

  it('collects a cloud key and its model overrides', () => {
    const env = resolveLlmEnv({ ANTHROPIC_API_KEY: 'sk-ant', OPENAI_MODEL: 'ignored', UNRELATED: 'x' });
    expect(env).toEqual({ ANTHROPIC_API_KEY: 'sk-ant', OPENAI_MODEL: 'ignored' });
  });

  it('treats a local Ollama base URL as a valid provider', () => {
    const env = resolveLlmEnv({
      OPENAI_BASE_URL: 'http://localhost:11434/v1',
      OPENAI_API_KEY: 'ollama',
      OPENAI_MODEL: 'qwen2.5:0.5b',
    });
    expect(env).toMatchObject({ OPENAI_BASE_URL: 'http://localhost:11434/v1', OPENAI_MODEL: 'qwen2.5:0.5b' });
  });

  it('ignores unrelated env vars', () => {
    expect(resolveLlmEnv({ PATH: '/usr/bin', HOME: '/root' })).toBeNull();
  });
});
