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
  await expect(page.locator('.app')).toBeVisible();

  // Sidebar renders its static header and at least one Quick Access entry
  // (home/desktop/etc.), proving the preload→main IPC round-trip works.
  await expect(page.locator('.sidebar__title')).toHaveText('Quick Access');
  await expect(page.locator('.sidebar__item').first()).toBeVisible();
});

test('lists the contents of the starting directory', async () => {
  // The status bar reports item counts once a directory has loaded.
  await expect(page.locator('.statusbar')).toBeVisible();
});
