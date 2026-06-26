import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  clearJobs,
  countPending,
  done,
  enqueue,
  enqueueMany,
  markError,
  MAX_ATTEMPTS,
  nextPending,
  resume,
} from './indexJobs';
import { closeDb, db, initDb } from './index';
import { indexJobs } from './schema';

beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());

const row = async (path: string) =>
  (await db().select().from(indexJobs).where(eq(indexJobs.path, path)))[0];

describe('enqueue', () => {
  it('inserts a pending job', async () => {
    await enqueue('/a.txt', 'upsert');
    expect(await row('/a.txt')).toMatchObject({ op: 'upsert', status: 'pending', attempts: 0 });
  });

  it('coalesces to one row per path, newest op wins', async () => {
    await enqueue('/a.txt', 'upsert');
    await enqueue('/a.txt', 'remove'); // delete supersedes the stale upsert
    expect(await countPending()).toBe(1);
    expect((await row('/a.txt')).op).toBe('remove');
  });

  it('re-enqueue re-arms an errored job (status pending, attempts reset)', async () => {
    await enqueue('/a.txt', 'upsert');
    await markError('/a.txt');
    await enqueue('/a.txt', 'upsert');
    expect(await row('/a.txt')).toMatchObject({ status: 'pending', attempts: 0 });
  });
});

describe('nextPending', () => {
  it('returns oldest-first, only pending, respecting the limit', async () => {
    await enqueueMany(['/a', '/b', '/c'], 'upsert');
    await markError('/b');
    const jobs = await nextPending(10);
    expect(jobs.map((j) => j.path)).toEqual(['/a', '/c']); // /b errored, excluded
    expect(await nextPending(1)).toHaveLength(1);
  });
});

describe('markError / resume', () => {
  it('markError increments attempts and flips status', async () => {
    await enqueue('/a', 'upsert');
    await markError('/a');
    expect(await row('/a')).toMatchObject({ status: 'error', attempts: 1 });
  });

  it('resume re-arms transient errors but leaves exhausted ones', async () => {
    await enqueue('/a', 'upsert');
    await enqueue('/b', 'upsert');
    await markError('/a'); // 1 attempt — transient
    for (let i = 0; i < MAX_ATTEMPTS; i++) await markError('/b'); // exhausted

    await resume();

    expect((await row('/a')).status).toBe('pending');
    expect((await row('/b')).status).toBe('error');
  });
});

describe('done / clearJobs', () => {
  it('done removes a single job', async () => {
    await enqueue('/a', 'upsert');
    await done('/a');
    expect(await row('/a')).toBeUndefined();
  });

  it('clearJobs empties the queue', async () => {
    await enqueueMany(['/a', '/b'], 'upsert');
    await clearJobs();
    expect(await countPending()).toBe(0);
  });
});
