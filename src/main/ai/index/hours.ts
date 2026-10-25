/**
 * "Index only at set hours": the indexer runs only between `start` and `end`
 * (minutes after local midnight), across midnight when `end` comes first
 * (01:00–07:00, or 22:00–06:00). The same start and end mean all day. Search
 * works at any hour; this only holds back the reading and embedding.
 */
export interface IndexHours {
  start: number;
  end: number;
}

/** 01:00–07:00: the night, when a machine that's left on has nothing else to do. */
export const DEFAULT_HOURS: IndexHours = { start: 60, end: 420 };

const MINUTES_PER_DAY = 24 * 60;

function minuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** Whether indexing may run at `now`. */
export function insideHours(hours: IndexHours, now: Date): boolean {
  if (hours.start === hours.end) return true;
  const m = minuteOfDay(now);
  return hours.start < hours.end ? m >= hours.start && m < hours.end : m >= hours.start || m < hours.end;
}

/**
 * Milliseconds until indexing may run again: 0 inside the hours, else the time
 * to the next start. Uses wall-clock local time, so a clock change only moves
 * when the next check lands (the caller re-checks after waking).
 */
export function msUntilAllowed(hours: IndexHours | null | undefined, now: Date): number {
  if (!hours || insideHours(hours, now)) return 0;
  let minutes = hours.start - minuteOfDay(now);
  if (minutes <= 0) minutes += MINUTES_PER_DAY;
  return Math.ceil(minutes * 60_000);
}

/** Valid hours (whole minutes within a day), or null. */
export function parseHours(value: unknown): IndexHours | null {
  if (!value || typeof value !== 'object') return null;
  const { start, end } = value as Record<string, unknown>;
  const ok = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < MINUTES_PER_DAY;
  return ok(start) && ok(end) ? { start, end } : null;
}
