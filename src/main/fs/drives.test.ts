import { describe, expect, it } from 'vitest';
import { listDrives } from './drives';

describe('listDrives', () => {
  it('returns at least one drive', async () => {
    const drives = await listDrives();
    expect(drives.length).toBeGreaterThan(0);
  });

  it('boot/root drive has total > 0 and 0 <= free <= total', async () => {
    const drives = await listDrives();
    // The root-ish drive: "/" on Unix, "C:\" or first probed letter on Windows.
    const root =
      drives.find((d) => d.path === '/' || d.path === 'C:\\') ?? drives[0];
    expect(root.total).toBeGreaterThan(0);
    expect(root.free).toBeGreaterThanOrEqual(0);
    expect(root.free).toBeLessThanOrEqual(root.total);
  });

  it('every drive has a non-empty name and path', async () => {
    const drives = await listDrives();
    for (const d of drives) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.path.length).toBeGreaterThan(0);
    }
  });

  it('boot volume is not marked removable', async () => {
    const drives = await listDrives();
    const bootPath =
      process.platform === 'darwin'
        ? undefined // boot volume in /Volumes is the symlink resolved to "/"
        : process.platform === 'win32'
          ? 'C:\\'
          : '/';
    if (bootPath) {
      const boot = drives.find((d) => d.path === bootPath);
      if (boot) expect(boot.removable).toBe(false);
    }
  });
});
