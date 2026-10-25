/**
 * Metrics and result files shared by the eval suites. Each suite prints a
 * table and writes `eval/results/<date>-<label>-<suite>.json`, so PRs can
 * commit before/after numbers. `FILDOS_EVAL_LABEL` names the run (default
 * "local"); the provider kind is part of the file name too.
 */
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

const RESULTS_DIR = resolve(__dirname, '..', 'results');

/**
 * An expected result: a testbed path, optionally pinned to a place —
 * `file.pdf@p7` (page 7) or `clip.mp4@t0-30` (seconds 0–30).
 */
export interface Expectation {
  path: string;
  page?: number;
  time?: [number, number];
}

export function parseExpectation(spec: string): Expectation {
  const at = spec.lastIndexOf('@');
  if (at < 0) return { path: spec };
  const path = spec.slice(0, at);
  const place = spec.slice(at + 1);
  const page = /^p(\d+)$/.exec(place);
  if (page) return { path, page: Number(page[1]) };
  const time = /^t(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(place);
  if (time) return { path, time: [Number(time[1]), Number(time[2])] };
  throw new Error(`Bad expectation place '${place}' in '${spec}' (use @p<page> or @t<from>-<to>)`);
}

/** Where a hit points inside its file, when the search reports it. */
export interface HitPlace {
  loc?: number;
  locEnd?: number;
}

/** Whether a hit's place satisfies an expectation's place (no place expected → always). */
export function placeMatches(e: Expectation, hit: HitPlace): boolean {
  if (e.page !== undefined) return hit.loc === e.page;
  if (e.time) {
    if (hit.loc === undefined) return false;
    const end = hit.locEnd ?? hit.loc;
    return hit.loc < e.time[1] && end > e.time[0];
  }
  return true;
}

/** 1-based rank of the first hit whose path is expected, or null. */
export function firstRank(paths: string[], expected: Expectation[]): number | null {
  const want = new Set(expected.map((e) => e.path));
  const i = paths.findIndex((p) => want.has(p));
  return i < 0 ? null : i + 1;
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;

/** Print a fixed-width table. */
export function table(headers: string[], rows: (string | number)[][]): string {
  const cells = [headers, ...rows.map((r) => r.map(String))];
  const widths = headers.map((_, c) => Math.max(...cells.map((r) => (r[c] ?? '').length)));
  const line = (r: string[]) => r.map((v, c) => v.padEnd(widths[c])).join('  ');
  return [line(headers), widths.map((w) => '-'.repeat(w)).join('  '), ...cells.slice(1).map(line)].join('\n');
}

/** Write one suite's results as JSON and return the file path. */
export async function writeResults(suite: string, provider: string, data: unknown): Promise<string> {
  const label = (process.env.FILDOS_EVAL_LABEL ?? 'local').replace(/[^\w.-]/g, '_');
  const date = new Date().toISOString().slice(0, 10);
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const file = join(RESULTS_DIR, `${date}-${label}-${provider}-${suite}.json`);
  await fs.writeFile(file, JSON.stringify({ suite, provider, label, date, ...(data as object) }, null, 2) + '\n');
  return file;
}
