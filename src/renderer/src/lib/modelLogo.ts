import type { LlmModelFamily } from '@shared/llmModels';
import llama from '@/assets/ai-logos/llama.webp';
import qwen from '@/assets/ai-logos/qwen.png';
import gemma from '@/assets/ai-logos/gemma.webp';
import phi from '@/assets/ai-logos/phi.webp';
import mistral from '@/assets/ai-logos/mistral.webp';
import smollm from '@/assets/ai-logos/smollm.webp';
import custom from '@/assets/ai-logos/custom.webp';

const LOGOS: Record<LlmModelFamily, string> = {
  llama,
  qwen,
  gemma,
  phi,
  mistral,
  smollm,
  custom,
};

export function modelLogo(family: LlmModelFamily): string {
  return LOGOS[family] ?? custom;
}
