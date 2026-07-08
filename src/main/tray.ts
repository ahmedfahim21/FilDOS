import { Menu, nativeImage, Tray } from 'electron';
import type { IndexProgress } from '@shared/types';

/**
 * The menu-bar / system-tray presence for ambient indexing. Shown only while
 * the app is resident with no windows (last window closed, `index.ambient` on)
 * so the user can see that background indexing is alive, reopen the window, or
 * quit. The icon is the brand mark (the 3×3 scoop grid from `Logo.tsx`,
 * .claude/brand-guidelines.md) rasterised in code: a monochrome template image
 * on macOS so it follows the menu-bar appearance, full scoop colours elsewhere.
 */

/** The six active tiles of the mark (col, row, scoop colour) + three ghosts. */
const TILES: ReadonlyArray<readonly [number, number, string]> = [
  [0, 0, '#f26d6d'], // strawberry
  [1, 0, '#f286b4'], // bubblegum
  [2, 0, '#f9a85c'], // mango
  [0, 1, '#6e9bee'], // blueberry
  [1, 1, '#4fc9b8'], // mint
  [0, 2, '#a585e0'], // grape
];
const GHOST_TILES: ReadonlyArray<readonly [number, number]> = [[2, 1], [1, 2], [2, 2]];

let tray: Tray | null = null;

/** Draw the mark into a raw BGRA bitmap at `16 * scale` px. */
function markBitmap(scale: number, template: boolean): Buffer {
  const size = 16 * scale;
  const buf = Buffer.alloc(size * size * 4);
  const tile = 4 * scale; // 16px grid: 1px margin, 4px tiles, 1px gaps
  const pitch = 5 * scale;
  const margin = 1 * scale;

  const fill = (col: number, row: number, r: number, g: number, b: number, a: number) => {
    const x0 = margin + col * pitch;
    const y0 = margin + row * pitch;
    for (let y = y0; y < y0 + tile; y++) {
      for (let x = x0; x < x0 + tile; x++) {
        const i = (y * size + x) * 4;
        // BGRA, premultiplied alpha.
        buf[i] = (b * a) / 255;
        buf[i + 1] = (g * a) / 255;
        buf[i + 2] = (r * a) / 255;
        buf[i + 3] = a;
      }
    }
  };

  for (const [col, row, hex] of TILES) {
    if (template) {
      fill(col, row, 0, 0, 0, 255); // template: pure black, alpha carries shape
    } else {
      const n = parseInt(hex.slice(1), 16);
      fill(col, row, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 255);
    }
  }
  for (const [col, row] of GHOST_TILES) {
    if (template) fill(col, row, 0, 0, 0, 64);
    else fill(col, row, 128, 128, 128, 96);
  }
  return buf;
}

function markImage(): Electron.NativeImage {
  const template = process.platform === 'darwin';
  const img = nativeImage.createEmpty();
  for (const scale of [1, 2]) {
    img.addRepresentation({
      scaleFactor: scale,
      width: 16 * scale,
      height: 16 * scale,
      buffer: markBitmap(scale, template),
    });
  }
  if (template) img.setTemplateImage(true);
  return img;
}

function statusLine(progress: IndexProgress | null): string {
  if (!progress) return 'Indexing in the background';
  switch (progress.state) {
    case 'scanning':
      return `Scanning… ${progress.scanned.toLocaleString()} files found`;
    case 'indexing':
      return `Indexing… ${progress.indexed.toLocaleString()} of ${progress.total.toLocaleString()} files`;
    case 'paused':
      return 'Indexing paused';
    case 'error':
      return progress.message ?? 'Indexing failed';
    default:
      return 'Index up to date';
  }
}

interface TrayActions {
  onOpen: () => void;
  onQuit: () => void;
}

let actions: TrayActions | null = null;
let lastProgress: IndexProgress | null = null;

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: statusLine(lastProgress), enabled: false },
    { type: 'separator' },
    { label: 'Open FilDOS', click: () => actions?.onOpen() },
    { type: 'separator' },
    { label: 'Quit FilDOS', click: () => actions?.onQuit() },
  ]);
}

/** Put the app in the tray (idempotent). Call when the last window closes. */
export function showTray(a: TrayActions): void {
  actions = a;
  if (tray) return;
  tray = new Tray(markImage());
  tray.setToolTip('FilDOS — indexing in the background');
  tray.setContextMenu(buildMenu());
  // Windows convention: a plain click reopens the app (macOS opens the menu).
  tray.on('click', () => {
    if (process.platform !== 'darwin') actions?.onOpen();
  });
}

/** Refresh the tray's status line from indexer progress. No-op without a tray. */
export function updateTrayStatus(progress: IndexProgress): void {
  lastProgress = progress;
  tray?.setContextMenu(buildMenu());
}

/** Remove the tray icon. Call when a window opens again. */
export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
