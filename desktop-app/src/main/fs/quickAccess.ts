import { app } from 'electron';
import { promises as fs } from 'node:fs';
import type { QuickAccessItem } from '@shared/types';

type AppPathName = Parameters<typeof app.getPath>[0];

const SOURCES: { kind: QuickAccessItem['kind']; label: string; appPath: AppPathName }[] = [
  { kind: 'home', label: 'Home', appPath: 'home' },
  { kind: 'desktop', label: 'Desktop', appPath: 'desktop' },
  { kind: 'documents', label: 'Documents', appPath: 'documents' },
  { kind: 'downloads', label: 'Downloads', appPath: 'downloads' },
  { kind: 'pictures', label: 'Pictures', appPath: 'pictures' },
  { kind: 'music', label: 'Music', appPath: 'music' },
  { kind: 'videos', label: 'Videos', appPath: 'videos' },
];

/**
 * Resolve the standard user locations for the sidebar, skipping any that the
 * OS doesn't define or that don't exist on disk.
 */
export async function quickAccess(): Promise<QuickAccessItem[]> {
  const items: QuickAccessItem[] = [];
  for (const source of SOURCES) {
    let resolved: string;
    try {
      resolved = app.getPath(source.appPath);
    } catch {
      continue; // OS doesn't define this location.
    }
    try {
      await fs.access(resolved);
    } catch {
      continue; // Path doesn't exist on disk.
    }
    items.push({ kind: source.kind, label: source.label, path: resolved });
  }
  return items;
}
