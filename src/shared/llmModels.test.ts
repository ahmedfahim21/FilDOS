import { describe, expect, it } from 'vitest';
import {
  defaultLlmConfig,
  LLM_CONFIG_LIMITS,
  LLM_SYSTEM_PROMPT_MAX,
  parseCustomModelInput,
  recommendLlmModel,
  resolveLlmConfig,
  type LlmSystemSpecs,
} from './llmModels';

describe('resolveLlmConfig', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(resolveLlmConfig('llama-3.2-1b')).toEqual(defaultLlmConfig('llama-3.2-1b'));
  });

  it('merges stored values over the defaults', () => {
    const cfg = resolveLlmConfig('llama-3.2-1b', { temperature: 0.8, maxTokens: 512 });
    expect(cfg.temperature).toBe(0.8);
    expect(cfg.maxTokens).toBe(512);
    expect(cfg.topP).toBe(defaultLlmConfig('llama-3.2-1b').topP);
  });

  it('clamps out-of-range values to the limits', () => {
    const cfg = resolveLlmConfig('llama-3.2-1b', {
      temperature: 99,
      topP: -1,
      maxTokens: 1_000_000,
      contextSize: 3,
    });
    expect(cfg.temperature).toBe(LLM_CONFIG_LIMITS.temperature.max);
    expect(cfg.topP).toBe(LLM_CONFIG_LIMITS.topP.min);
    expect(cfg.maxTokens).toBe(LLM_CONFIG_LIMITS.maxTokens.max);
    expect(cfg.contextSize).toBe(LLM_CONFIG_LIMITS.contextSize.min);
  });

  it('caps custom instructions at the length limit', () => {
    const cfg = resolveLlmConfig('llama-3.2-1b', { systemPrompt: 'x'.repeat(9_999) });
    expect(cfg.systemPrompt.length).toBe(LLM_SYSTEM_PROMPT_MAX);
  });
});

describe('recommendLlmModel', () => {
  const specs = (over: Partial<LlmSystemSpecs>): LlmSystemSpecs => ({
    gpu: 'metal',
    vramMb: 8 * 1024,
    ramMb: 8 * 1024,
    cpus: 8,
    arch: 'arm64',
    ...over,
  });

  it('recommends heavyweight models on workstation-class machines', () => {
    expect(recommendLlmModel(specs({ vramMb: 128 * 1024, ramMb: 128 * 1024 }))).toBe('gemma-4-31b');
    expect(recommendLlmModel(specs({ vramMb: 64 * 1024, ramMb: 64 * 1024 }))).toBe('qwen3.5-27b');
  });

  it('recommends a capable mid-size model on mainstream machines', () => {
    expect(recommendLlmModel(specs({ vramMb: 32 * 1024, ramMb: 32 * 1024 }))).toBe('qwen3-8b');
    expect(recommendLlmModel(specs({ vramMb: 16 * 1024, ramMb: 16 * 1024 }))).toBe('qwen3-4b');
  });

  it('recommends a small-but-useful model on tight machines', () => {
    expect(recommendLlmModel(specs({ vramMb: 8 * 1024, ramMb: 8 * 1024 }))).toBe('qwen3-1.7b');
    expect(recommendLlmModel(specs({ vramMb: 4 * 1024, ramMb: 4 * 1024 }))).toBe('qwen3-0.6b');
  });

  it('budgets against RAM when there is no GPU backend', () => {
    expect(recommendLlmModel(specs({ gpu: null, vramMb: 0, ramMb: 32 * 1024 }))).toBe('qwen3-8b');
    expect(recommendLlmModel(specs({ gpu: null, vramMb: 0, ramMb: 8 * 1024 }))).toBe('qwen3-1.7b');
  });

  it('lets a discrete GPU lift the tier above what RAM alone would give', () => {
    // 16 GB RAM but a 24 GB card → power-user tier, not budget.
    expect(recommendLlmModel(specs({ gpu: 'cuda', vramMb: 48 * 1024, ramMb: 16 * 1024 }))).toBe(
      'qwen3.5-27b',
    );
  });
});

describe('parseCustomModelInput', () => {
  it('accepts an hf: URI with a quant', () => {
    const def = parseCustomModelInput('hf:bartowski/Qwen2.5-14B-Instruct-GGUF:Q4_K_M');
    expect(def).toMatchObject({
      uri: 'hf:bartowski/Qwen2.5-14B-Instruct-GGUF:Q4_K_M',
      label: 'Qwen2.5-14B-Instruct · Q4_K_M',
      family: 'custom',
      sizeMb: 0,
    });
    expect(def!.id).toMatch(/^custom-/);
  });

  it('implies hf: for owner/repo shorthand', () => {
    expect(parseCustomModelInput('unsloth/gemma-3-4b-it-GGUF')?.uri).toBe(
      'hf:unsloth/gemma-3-4b-it-GGUF',
    );
  });

  it('accepts a direct .gguf URL and labels it by file name', () => {
    const def = parseCustomModelInput('https://example.com/models/My%20Model.Q5_K_M.gguf');
    expect(def?.uri).toBe('https://example.com/models/My%20Model.Q5_K_M.gguf');
    expect(def?.label).toBe('My Model.Q5_K_M');
  });

  it('produces the same stable id for the same source', () => {
    const a = parseCustomModelInput('hf:owner/repo:Q4_K_M');
    const b = parseCustomModelInput('owner/repo:Q4_K_M');
    expect(a?.id).toBe(b?.id);
  });

  it('rejects junk', () => {
    expect(parseCustomModelInput('')).toBeNull();
    expect(parseCustomModelInput('not a model')).toBeNull();
    expect(parseCustomModelInput('https://example.com/page.html')).toBeNull();
  });
});
