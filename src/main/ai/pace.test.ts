import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ powerMonitor: {} }));
const { restFor } = await import('./pace');

const cool = { idleSeconds: 600, onBattery: false, thermal: 'nominal' as const };

describe('restFor', () => {
  it('barely rests while the user is away, about half while active', () => {
    expect(restFor(1000, cool)).toBe(150);
    expect(restFor(1000, { ...cool, idleSeconds: 5 })).toBe(1000);
  });

  it('rests longer on battery and when warm', () => {
    expect(restFor(1000, { ...cool, onBattery: true })).toBe(650);
    expect(restFor(1000, { ...cool, thermal: 'fair' })).toBe(650);
  });

  it('backs off hard when hot, with a longer cap', () => {
    expect(restFor(1000, { ...cool, thermal: 'serious' })).toBe(4000);
    expect(restFor(1000, { ...cool, thermal: 'critical' })).toBe(9000);
    expect(restFor(5000, { ...cool, thermal: 'critical' })).toBe(10_000);
  });

  it('caps a normal rest at two seconds', () => {
    expect(restFor(10_000, { ...cool, idleSeconds: 5 })).toBe(2000);
  });
});
