import { powerMonitor } from 'electron';

/**
 * Duty-cycle a background AI pipeline. After a unit of work that took
 * `elapsedMs`, rest proportionally: barely at all when the user is away, about
 * half speed while they're actively using the machine, gentler on battery, and
 * much gentler when the system reports it's running hot — a background run
 * must never heat a laptop someone is actively typing on. Shared by the indexer (index/handlers.ts) and the knowledge-graph
 * builder (graph/handlers.ts); lives in its own leaf module so those two
 * handler modules don't have to import each other.
 */
export async function pace(elapsedMs: number): Promise<void> {
  const delay = restFor(elapsedMs, {
    idleSeconds: powerMonitor.getSystemIdleTime(),
    onBattery: powerMonitor.isOnBatteryPower(),
    thermal: powerMonitor.getCurrentThermalState(),
  });
  if (delay > 5) await new Promise((r) => setTimeout(r, delay));
}

export type ThermalState = 'unknown' | 'nominal' | 'fair' | 'serious' | 'critical';

/** How long to rest after `elapsedMs` of work, given the machine's state. Pure. */
export function restFor(
  elapsedMs: number,
  state: { idleSeconds: number; onBattery: boolean; thermal: ThermalState },
): number {
  let factor = state.idleSeconds < 60 ? 1 : 0.15; // active: ~50% duty; away: ~87%
  if (state.onBattery) factor += 0.5;
  // Hot: back off hard (serious ≈ 20% duty, critical ≈ 10%), with a longer cap.
  if (state.thermal === 'fair') factor += 0.5;
  if (state.thermal === 'serious') factor = Math.max(factor, 4);
  if (state.thermal === 'critical') factor = Math.max(factor, 9);
  const cap = state.thermal === 'serious' || state.thermal === 'critical' ? 10_000 : 2000;
  return Math.min(cap, elapsedMs * factor);
}
