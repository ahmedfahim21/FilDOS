import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';

/**
 * Shared test fixtures for the FS service. The service touches the real disk,
 * so each test gets a throwaway directory under `os.tmpdir()` that is removed
 * afterwards — giving genuine integration coverage without leaving artifacts.
 */

/** Provision a fresh temp directory per test; returns a getter for its path. */
export function useTempDir(): () => string {
  let dir = '';
  beforeEach(async () => {
    dir = await fs.mkdtemp(join(os.tmpdir(), 'fildos-test-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return () => dir;
}

/** Sorted base names directly inside a directory, for terse assertions. */
export async function namesIn(dir: string): Promise<string[]> {
  return (await fs.readdir(dir)).sort();
}
