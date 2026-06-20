import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DriveItem } from '@shared/types';

const execFileAsync = promisify(execFile);

async function statfsCapacity(path: string): Promise<{ total: number; free: number }> {
  try {
    const s = await fs.statfs(path);
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    return { total: 0, free: 0 };
  }
}

async function listDrivesMac(): Promise<DriveItem[]> {
  const volDir = '/Volumes';
  let entries: string[];
  try {
    entries = await fs.readdir(volDir);
  } catch {
    return [];
  }
  const drives: DriveItem[] = [];
  for (const name of entries) {
    const mountPath = `${volDir}/${name}`;
    let removable = true;
    try {
      const lstat = await fs.lstat(mountPath);
      if (lstat.isSymbolicLink()) {
        // Symlinks in /Volumes that resolve to "/" are the boot volume.
        const real = await fs.realpath(mountPath);
        removable = real !== '/';
      }
    } catch {
      continue;
    }
    const { total, free } = await statfsCapacity(mountPath);
    drives.push({ name, path: mountPath, total, free, removable });
  }
  return drives;
}

async function listDrivesWin(): Promise<DriveItem[]> {
  const drives: DriveItem[] = [];
  const systemDriveLetter = (process.env.SYSTEMDRIVE ?? 'C:').slice(0, 2).toUpperCase();
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    const drivePath = `${letter}:\\`;
    try {
      await fs.access(drivePath);
    } catch {
      continue;
    }
    const { total, free } = await statfsCapacity(drivePath);
    const removable = `${letter}:` !== systemDriveLetter;
    drives.push({ name: `${letter}:`, path: drivePath, total, free, removable });
  }
  return drives;
}

const PSEUDO_FS = new Set([
  'proc', 'sysfs', 'devtmpfs', 'devpts', 'tmpfs', 'cgroup', 'cgroup2',
  'pstore', 'bpf', 'tracefs', 'securityfs', 'mqueue', 'hugetlbfs',
  'debugfs', 'fusectl', 'configfs', 'ramfs', 'efivarfs', 'autofs',
  'squashfs', 'overlay', 'nsfs',
]);

async function listDrivesLinux(): Promise<DriveItem[]> {
  let raw: string;
  try {
    raw = await fs.readFile('/proc/mounts', 'utf8');
  } catch {
    return [];
  }
  const drives: DriveItem[] = [];
  const seen = new Set<string>();
  for (const line of raw.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [, mountPoint, fsType] = parts;
    if (PSEUDO_FS.has(fsType)) continue;
    const isRelevant =
      mountPoint === '/' ||
      mountPoint.startsWith('/media') ||
      mountPoint.startsWith('/mnt') ||
      mountPoint.startsWith('/run/media');
    if (!isRelevant) continue;
    if (seen.has(mountPoint)) continue;
    seen.add(mountPoint);
    try {
      await fs.access(mountPoint);
    } catch {
      continue;
    }
    const { total, free } = await statfsCapacity(mountPoint);
    const removable =
      mountPoint.startsWith('/media') || mountPoint.startsWith('/run/media');
    const name =
      mountPoint === '/' ? 'Root' : (mountPoint.split('/').at(-1) ?? mountPoint);
    drives.push({ name, path: mountPoint, total, free, removable });
  }
  return drives;
}

export async function listDrives(): Promise<DriveItem[]> {
  if (process.platform === 'darwin') return listDrivesMac();
  if (process.platform === 'win32') return listDrivesWin();
  return listDrivesLinux();
}

export async function ejectDrive(mountPath: string): Promise<void> {
  if (process.platform === 'darwin') {
    await execFileAsync('diskutil', ['eject', mountPath]);
  } else if (process.platform === 'linux') {
    try {
      await execFileAsync('udisksctl', ['unmount', '--mount-point', mountPath]);
    } catch {
      await execFileAsync('umount', [mountPath]);
    }
  } else {
    throw Object.assign(new Error('Eject is not supported on this platform.'), {
      code: 'EINVAL',
    });
  }
}
