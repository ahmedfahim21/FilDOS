import 'dotenv/config';
import { app, BrowserWindow, nativeTheme, safeStorage, shell } from 'electron';
import { join } from 'node:path';
import { registerFsHandlers } from './fs/handlers';
import { registerCloudHandlers } from './cloud/handlers';
import { registerProvider } from './cloud/registry';
import { GDriveProvider } from './cloud/providers/gdrive';
import { DropboxProvider } from './cloud/providers/dropbox';
import { OpenDalProvider } from './cloud/providers/opendal';
import { OPENDAL_BACKENDS } from '@shared/opendalBackends';
import { registerAiHandlers } from './ai/handlers';
import { registerAiProvider } from './ai/registry';
import { EmbeddedAiProvider } from './ai/providers/embedded';
import { CloudAiProvider } from './ai/providers/cloud';
import {
  registerIndexHandlers,
  startIndexBackground,
  stopIndexBackground,
} from './ai/index/handlers';
import { registerLlmHandlers } from './ai/llm/handlers';
import { closeDb, initDb } from './db';
import { getPrefs, setPrefs } from './prefs';

async function createWindow(): Promise<void> {
  const prefs = await getPrefs();
  const bounds = prefs.windowBounds;
  // Sync native appearance before the window opens so traffic lights match the
  // app's stored theme choice rather than the system default.
  if (prefs.theme) nativeTheme.themeSource = prefs.theme;

  const isMac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: bounds?.width ?? 1200,
    height: bounds?.height ?? 800,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'FilDOS',
    backgroundColor: '#0f1117',
    // On macOS: hide the system title bar and position native traffic lights
    // inside the sidebar's drag-zone spacer (h-10 = 40px, lights centred at y=20).
    titleBarStyle: isMac ? 'hidden' : 'default',
    ...(isMac ? { trafficLightPosition: { x: 14, y: 14 } } : {}),
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
  // Cloud credentials are encrypted with the OS keyring (safeStorage). Warn once
  // if it's unavailable (typically a Linux box with no unlocked keyring) so the
  // reason connect fails is visible in logs; the connect flow surfaces it too.
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn(
      '[fildos] OS secure storage (keyring) unavailable — cloud accounts cannot be connected until a keyring is available.',
    );
  }
  registerProvider('gdrive', new GDriveProvider());
  registerProvider('dropbox', new DropboxProvider());
  // One OpenDAL-backed provider per available backend (S3, IPFS, OneDrive, …).
  for (const backend of OPENDAL_BACKENDS) {
    if (backend.available) registerProvider(backend.id, new OpenDalProvider(backend));
  }
  // The embedded AI worker can't call app.getPath; hand it the model cache dir.
  process.env.FILDOS_MODELS_DIR = join(app.getPath('userData'), 'models');
  // Same for the chat LLM worker's GGUF weights.
  process.env.FILDOS_LLM_DIR = join(app.getPath('userData'), 'models', 'llm');
  registerAiProvider('embedded', new EmbeddedAiProvider());
  registerAiProvider('cloud', new CloudAiProvider());
  registerFsHandlers();
  registerCloudHandlers();
  registerAiHandlers();
  registerIndexHandlers();
  registerLlmHandlers();
  createWindow();
  // Resume any indexing left over from last session (no-op unless enabled).
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
  closeDb();
});
