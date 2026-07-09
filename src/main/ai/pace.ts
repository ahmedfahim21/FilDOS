import { powerMonitor } from 'electron';

/**
 * Duty-cycle a background AI pipeline. After a unit of work that took
 * `elapsedMs`, rest proportionally: barely at all when the user is away, about
 * half speed while they're actively using the machine, and gentler still on
 * battery — a background run must never heat a laptop someone is actively
 * typing on. Shared by the indexer (index/handlers.ts) and the knowledge-graph
 * builder (graph/handlers.ts); lives in its own leaf module so those two
 * handler modules don't have to import each other.
 */
export async function pace(elapsedMs: number): Promise<void> {
  let factor = 0.15; // user away: ~87% duty cycle
  try {
    if (powerMonitor.getSystemIdleTime() < 60) factor = 1; // active: ~50% duty
    if (powerMonitor.isOnBatteryPower()) factor += 0.5;
  } catch {
    // power status unavailable — keep the conservative default
  }
  const delay = Math.min(2000, elapsedMs * factor);
  if (delay > 5) await new Promise((r) => setTimeout(r, delay));
}
