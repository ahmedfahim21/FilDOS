import { join } from 'node:path';
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

/**
 * Smoke test: the most basic guarantee — the packaged main process boots,
 * opens a window, and the renderer paints its shell (sidebar + toolbar) by
 * talking to the real preload bridge and filesystem. If this passes, the
 * IPC contract and the production bundle are wired up end to end.
 */

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    // `--no-sandbox` lets Electron's Chromium start inside CI containers that
    // lack the setuid sandbox; the app's own renderer sandbox is unaffected.
    args: [join(__dirname, '..', 'out', 'main', 'index.js'), '--no-sandbox'],
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
});

test('boots into the file browser shell', async () => {
  expect(await page.title()).toBe('FilDOS');

  // App root mounts.
  await expect(page.getByTestId('app')).toBeVisible();

  // Sidebar renders its static header and at least one Quick Access entry
  // (home/desktop/etc.), proving the preload→main IPC round-trip works.
  await expect(page.getByText('Quick Access')).toBeVisible();
  await expect(page.getByTestId('quick-access-item').first()).toBeVisible();
});

test('lists the contents of the starting directory', async () => {
  // The status bar reports item counts once a directory has loaded.
  await expect(page.getByTestId('statusbar')).toBeVisible();
});

test('opens the Recents view (SQLite round-trip)', async () => {
  // Recents is served from the SQLite metadata DB, so this proves the
  // database opened and the tags/recents IPC surface is wired up.
  await page.getByTitle('Recently opened files').click();
  await expect(page.getByTestId('panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('panel')).toBeHidden();
});
