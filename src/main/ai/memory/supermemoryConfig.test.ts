import { describe, expect, it } from 'vitest';
import { buildLlmEnv, resolveLlmEnv } from './supermemoryConfig';

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

describe('buildLlmEnv', () => {
  it('builds a local Ollama env without needing a key', () => {
    expect(buildLlmEnv({ provider: 'ollama', model: 'qwen2.5:0.5b' })).toEqual({
      OPENAI_MODEL: 'qwen2.5:0.5b',
      OPENAI_BASE_URL: 'http://localhost:11434/v1',
      OPENAI_API_KEY: 'ollama',
    });
  });

  it('honours a custom Ollama base URL', () => {
    const env = buildLlmEnv({ provider: 'ollama', baseUrl: 'http://box:1234/v1' });
    expect(env?.OPENAI_BASE_URL).toBe('http://box:1234/v1');
  });

  it('returns null for a cloud provider without a key', () => {
    expect(buildLlmEnv({ provider: 'openai', model: 'gpt-x' })).toBeNull();
    expect(buildLlmEnv({ provider: 'anthropic' })).toBeNull();
  });

  it('maps each cloud provider to its native key var', () => {
    expect(buildLlmEnv({ provider: 'openai', apiKey: 'k' })).toMatchObject({ OPENAI_API_KEY: 'k' });
    expect(buildLlmEnv({ provider: 'anthropic', apiKey: 'k' })).toMatchObject({ ANTHROPIC_API_KEY: 'k' });
    expect(buildLlmEnv({ provider: 'gemini', apiKey: 'k' })).toMatchObject({ GEMINI_API_KEY: 'k' });
    expect(buildLlmEnv({ provider: 'groq', apiKey: 'k' })).toMatchObject({ GROQ_API_KEY: 'k' });
  });
});
