import 'dotenv/config';
import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { registerFsHandlers } from './fs/handlers';
import { registerCloudHandlers } from './cloud/handlers';
import { registerProvider } from './cloud/registry';
import { GDriveProvider } from './cloud/providers/gdrive';
import { DropboxProvider } from './cloud/providers/dropbox';
import { registerAiHandlers } from './ai/handlers';
import { registerAiProvider } from './ai/registry';
import { EmbeddedAiProvider } from './ai/providers/embedded';
import { CloudAiProvider } from './ai/providers/cloud';
import {
  registerIndexHandlers,
  startIndexBackground,
  stopIndexBackground,
} from './ai/index/handlers';
import {
  registerSupermemory,
  startSupermemoryIfSelected,
  stopSupermemory,
} from './ai/memory/lifecycle';
import { closeDb, initDb } from './db';
import { getPrefs, setPrefs } from './prefs';

async function createWindow(): Promise<void> {
  const prefs = await getPrefs();
  const bounds = prefs.windowBounds;

  const win = new BrowserWindow({
    width: bounds?.width ?? 1200,
    height: bounds?.height ?? 800,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'FilDOS',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Persist window bounds when the window closes.
  win.on('close', () => {
    setPrefs({ windowBounds: win.getBounds() });
  });

  // Open external links in the user's browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  initDb(join(app.getPath('userData'), 'fildos.db'));
  registerProvider('gdrive', new GDriveProvider());
  registerProvider('dropbox', new DropboxProvider());
  // The embedded AI worker can't call app.getPath; hand it the model cache dir.
  process.env.FILDOS_MODELS_DIR = join(app.getPath('userData'), 'models');
  registerAiProvider('embedded', new EmbeddedAiProvider());
  registerAiProvider('cloud', new CloudAiProvider());
  registerFsHandlers();
  registerCloudHandlers();
  registerAiHandlers();
  registerIndexHandlers(); // registers the local memory backend
  registerSupermemory(); // registers the supermemory backend (daemon stays off)
  createWindow();
  // Start the supermemory daemon first *iff* it's the active backend, so the
  // indexer drains into a live daemon; both are no-ops unless enabled/selected.
  await startSupermemoryIfSelected();
  startIndexBackground();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  stopIndexBackground();
  stopSupermemory();
  closeDb();
});
