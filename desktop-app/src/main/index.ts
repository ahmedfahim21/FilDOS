import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { registerFsHandlers } from './fs/handlers';
import { registerCloudHandlers } from './cloud/handlers';
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

app.whenReady().then(() => {
  initDb(join(app.getPath('userData'), 'fildos.db'));
  registerFsHandlers();
  registerCloudHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => closeDb());
