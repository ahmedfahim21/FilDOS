import type { LlmModelFamily } from '@shared/llmModels';
import llama from '@/assets/ai-logos/llama.webp';
import qwen from '@/assets/ai-logos/qwen.png';
import gemma from '@/assets/ai-logos/gemma.webp';
import phi from '@/assets/ai-logos/phi.webp';
import mistral from '@/assets/ai-logos/mistral.webp';
import smollm from '@/assets/ai-logos/smollm.webp';
import deepseek from '@/assets/ai-logos/deepseek.png';
import granite from '@/assets/ai-logos/granite.svg';
import lfm from '@/assets/ai-logos/lfm.png';
import custom from '@/assets/ai-logos/custom.webp';
// Cloud providers get a flat cloud glyph in the provider's accent colour —
// the "this model leaves the device" cue, consistent across the picker.
import anthropic from '@/assets/ai-logos/anthropic.svg';
import openai from '@/assets/ai-logos/openai.svg';
import google from '@/assets/ai-logos/google.svg';
import bedrock from '@/assets/ai-logos/bedrock.svg';
import openaiCompat from '@/assets/ai-logos/openai-compat.svg';

const LOGOS: Record<LlmModelFamily, string> = {
  llama,
  qwen,
  gemma,
  phi,
  mistral,
  smollm,
  deepseek,
  granite,
  lfm,
  custom,
  anthropic,
  openai,
  google,
  bedrock,
  'openai-compat': openaiCompat,
};

export function modelLogo(family: LlmModelFamily): string {
  return LOGOS[family] ?? custom;
}
