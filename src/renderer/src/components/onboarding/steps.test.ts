import { describe, expect, it } from 'vitest';
import { needsOnboarding, onboardingSteps } from './steps';

describe('onboardingSteps', () => {
  it('includes the assistant + models + privacy steps only when AI is enabled', () => {
    expect(onboardingSteps({ aiEnabled: true, isMac: true })).toEqual([
      'welcome',
      'appearance',
      'access',
      'ai',
      'assistant',
      'models',
      'privacy',
      'ready',
    ]);
    expect(onboardingSteps({ aiEnabled: false, isMac: true })).toEqual([
      'welcome',
      'appearance',
      'access',
      'ai',
      'ready',
    ]);
  });

  it('includes the file-access step only on macOS', () => {
    expect(onboardingSteps({ aiEnabled: true, isMac: false })).not.toContain('access');
    expect(onboardingSteps({ aiEnabled: true, isMac: true })).toContain('access');
  });

  it('keeps the shared steps in the same order across variants', () => {
    const full = onboardingSteps({ aiEnabled: true, isMac: true });
    for (const [aiEnabled, isMac] of [
      [true, false],
      [false, true],
      [false, false],
    ] as const) {
      const variant = onboardingSteps({ aiEnabled, isMac });
      expect(full.filter((s) => variant.includes(s))).toEqual(variant);
    }
  });
});

describe('needsOnboarding', () => {
  it('shows onboarding on a completely fresh profile', () => {
    expect(needsOnboarding({})).toBe(true);
  });

  it('skips once onboarding has been completed', () => {
    expect(needsOnboarding({ onboarded: true })).toBe(false);
  });

  it('skips for existing installs that predate onboarding (lastPath present)', () => {
    expect(needsOnboarding({ lastPath: '/Users/me/Documents' })).toBe(false);
  });
});
