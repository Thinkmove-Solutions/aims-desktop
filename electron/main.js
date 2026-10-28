'use strict';

// ── Squirrel.Windows startup events (must run before anything else) ───────────
// Squirrel fires these on install/update/uninstall — the app must quit fast or
// the installer hangs and the app appears to never open after install.
if (process.platform === 'win32') {
  const squirrelEvent = process.argv[1];
  if ([
    '--squirrel-install',
    '--squirrel-updated',
    '--squirrel-uninstall',
    '--squirrel-obsolete',
  ].includes(squirrelEvent)) {
    require('electron').app.quit();
    process.exit(0);
  }
}

process.on('uncaughtException',  (e) => console.error('[main] uncaughtException:', e.stack));
process.on('unhandledRejection', (e) => console.error('[main] unhandledRejection:', e));

const { app, BrowserWindow, ipcMain, shell, Notification, screen } = require('electron');
const path = require('path');
const fs   = require('fs');

const store = require('./store');
const PrintAgent = require('./print-agent');
const { createTray, updateTrayState } = require('./tray');
const { startLocalApi, stopLocalApi } = require('./local-api');
const { setAutoStart } = require('./auto-start');

// Auto-update — only active in packaged production builds (not npm start)
if (app.isPackaged) {
  require('update-electron-app')({ updateInterval: '1 hour' });
}

// ── Single instance lock ──────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ── Global state ──────────────────────────────────────────────────────────────
let mainWin            = null;
let settingsWin        = null;
let customerDisplayWin = null;
const agent = new PrintAgent();

// ── Display helpers ───────────────────────────────────────────────────────────

function getDisplayList() {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map(d => ({
    id:        String(d.id),
    label:     `${d.size.width}×${d.size.height}${d.id === primary.id ? ' (Primary)' : ''}`,
    width:     d.size.width,
    height:    d.size.height,
    isPrimary: d.id === primary.id,
  }));
}

function notifyDisplaysChanged() {
  const displays = getDisplayList();
  if (settingsWin) settingsWin.webContents.send('displays-changed', displays);
  // If the customer display was on a screen that got disconnected, close it
  if (customerDisplayWin && !customerDisplayWin.isDestroyed()) {
    const cfg = store.getConfig();
    if (cfg.customerDisplayId) {
      const still = screen.getAllDisplays().find(d => String(d.id) === cfg.customerDisplayId);
      if (!still) closeCustomerDisplay();
    }
  }
}

function closeCustomerDisplay() {
  if (customerDisplayWin && !customerDisplayWin.isDestroyed()) customerDisplayWin.destroy();
  customerDisplayWin = null;
}

function createCustomerDisplayWindow(displayId) {
  // If already open, just focus it
  if (customerDisplayWin && !customerDisplayWin.isDestroyed()) {
    customerDisplayWin.focus();
    return;
  }

  const cfg         = store.getConfig();
  const allDisplays = screen.getAllDisplays();
  const primary     = screen.getPrimaryDisplay();

  // Pick target display: explicit id → first non-primary → primary fallback
  let target = displayId
    ? allDisplays.find(d => String(d.id) === displayId)
    : null;
  if (!target) target = allDisplays.find(d => d.id !== primary.id);
  if (!target) target = primary;

  const { x, y, width, height } = target.bounds;
  const baseUrl = cfg.appUrl || 'https://develop.aaimsoft.com';
  const mode    = cfg.customerDisplayMode || 'external';
  const url     = mode === 'duplicate' ? baseUrl : `${baseUrl}/customer-display`;

  const iconP = path.join(__dirname, '..', 'assets', 'icon.png');

  customerDisplayWin = new BrowserWindow({
    x, y, width, height,
    frame:   false,
    title:   'AIMS Customer Display',
    icon:    fs.existsSync(iconP) ? iconP : undefined,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
    },
  });

  customerDisplayWin.setBounds({ x, y, width, height });
  customerDisplayWin.loadURL(url);

  customerDisplayWin.on('closed', () => { customerDisplayWin = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  screen.on('display-added',          notifyDisplaysChanged);
  screen.on('display-removed',        notifyDisplaysChanged);
  screen.on('display-metrics-changed', notifyDisplaysChanged);

  // Tray icon — shows agent status, gives access to Settings and Quit
  createTray({
    onShowApp:    () => { if (mainWin) { mainWin.show(); mainWin.focus(); } else createMainWindow(); },
    onSettings:   openSettings,
    onQuit:       () => app.quit(),
  });

  // Start local HTTP API — BrowserWindow callbacks wired directly
  startLocalApi(agent, store, {
    onGetPrinters: (cb) => {
      const win = mainWin || settingsWin || new BrowserWindow({ show: false });
      const owned = !mainWin && !settingsWin;
      win.webContents.getPrintersAsync().then((printers) => {
        if (owned) win.destroy();
        cb(printers.map((p) => ({
          name: p.name, displayName: p.displayName, isDefault: p.isDefault, status: p.status,
        })));
      }).catch(() => { if (owned) win.destroy(); cb([]); });
    },
    onPrintSilent: (payload, cb) => {
      const { printer_name, data_b64 } = payload;
      if (!data_b64) return cb({ ok: false, error: 'Missing data_b64' });
      const win = new BrowserWindow({ show: false });
      const html = `<pre>${Buffer.from(data_b64, 'base64').toString('utf8')}</pre>`;
      win.loadURL(`data:text/html,${encodeURIComponent(html)}`);
      win.webContents.once('did-finish-load', () => {
        win.webContents.print(
          { silent: true, printBackground: false, deviceName: printer_name || '' },
          (success, reason) => { win.destroy(); cb({ ok: success, reason: reason ?? null, printer: printer_name }); }
        );
      });
    },
    onRestartAgent: () => { agent.stop(); if (store.hasCredentials()) startAgent(); },
  });

  // First run — open settings wizard so the user can configure the agent.
  // After configuration the main AIMS window is opened via "Open AIMS" in the tray.
  if (!store.hasCredentials()) {
    openSettings();
  } else {
    createMainWindow();
  }

  // Start print agent if already configured
  if (store.hasCredentials()) startAgent();

  // Apply auto-start preference
  setAutoStart(store.getConfig().autoStart);
});

app.on('second-instance', () => {
  if (mainWin)     { mainWin.show();     mainWin.focus();     }
  else if (settingsWin) { settingsWin.show(); settingsWin.focus(); }
  else showPrimaryWindow();
});

app.on('activate', () => {
  // macOS: fires on launch AND when clicking the Dock icon.
  // Bring whatever window is already open to the front; only create
  // a new one if nothing is open at all.
  if (mainWin)     { mainWin.show();     mainWin.focus();     }
  else if (settingsWin) { settingsWin.show(); settingsWin.focus(); }
  else showPrimaryWindow();
});

app.on('window-all-closed', () => {
  // Keep the app (and print agent) running when all windows are closed
  // Do NOT call app.quit() here — tray keeps the app alive
});

app.on('before-quit', () => {
  closeCustomerDisplay();
  agent.stop();
  stopLocalApi();
});

// ── Window helpers ────────────────────────────────────────────────────────────

function showPrimaryWindow() {
  if (store.hasCredentials()) createMainWindow();
  else openSettings();
}

// ── Main window (AIMS web app) ────────────────────────────────────────────────

function createMainWindow() {
  if (mainWin) { mainWin.show(); mainWin.focus(); return; }

  const iconP = path.join(__dirname, '..', 'assets', 'icon.png');

  mainWin = new BrowserWindow({
    width:     1280,
    height:    800,
    minWidth:  900,
    minHeight: 600,
    title:     'AIMS — Main',
    icon:      fs.existsSync(iconP) ? iconP : undefined,
    webPreferences: {
      nodeIntegration:    false,
      contextIsolation:   true,
      // Allow the AIMS https page to call http://127.0.0.1:27152 (local API)
      allowRunningInsecureContent: false,
    },
  });

  const appUrl = store.getConfig().appUrl || 'https://app.aaimsoft.com';
  mainWin.loadURL(appUrl);

  // Open external links (target=_blank) in the system browser, not a new window
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Hide to tray on close — print agent keeps running
  mainWin.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWin.hide();
    }
  });

  mainWin.on('closed', () => { mainWin = null; });
}

// ── Settings window (print agent config) ─────────────────────────────────────

function openSettings() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }

  const iconP = path.join(__dirname, '..', 'assets', 'icon.png');

  settingsWin = new BrowserWindow({
    width:     520,
    height:    620,
    resizable: false,
    title:     'AIMS — Settings',
    icon:      fs.existsSync(iconP) ? iconP : undefined,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  settingsWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  settingsWin.on('close', (e) => {
    // On first run (no main window yet) let the window actually close so the
    // user can dismiss the wizard without quitting the whole app.
    if (mainWin) { e.preventDefault(); settingsWin.hide(); }
  });
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ── Print agent ───────────────────────────────────────────────────────────────

function startAgent() {
  const { wsUrl } = store.getConfig();
  const token = store.loadToken();
  if (!token || !wsUrl) return;

  agent.on('state', (state) => {
    updateTrayState(state);
    if (settingsWin) settingsWin.webContents.send('agent-state', state);
  });

  agent.on('log', (level, msg) => {
    if (settingsWin) settingsWin.webContents.send('agent-log', { level, msg });
    console[level === 'warn' ? 'warn' : 'log'](`[agent] ${msg}`);
  });

  agent.on('job-done', ({ ok, printer_name }) => {
    if (Notification.isSupported()) {
      new Notification({
        title: ok ? 'Print successful' : 'Print failed',
        body:  ok ? `Sent to ${printer_name}` : `Could not reach ${printer_name}`,
        silent: true,
      }).show();
    }
  });

  agent.start(wsUrl, token);
}

// ── IPC handlers (settings renderer → main) ───────────────────────────────────

ipcMain.handle('get-config', () => ({
  ...store.getConfig(),
  hasCredentials: store.hasCredentials(),
  agentState:     agent.state,
}));

ipcMain.handle('import-config', (_event, obj) => {
  try {
    store.importAgentConfig(obj);
    agent.stop();
    startAgent();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('save-config', (_event, updates) => {
  store.setConfig(updates);
  if ('autoStart' in updates) setAutoStart(updates.autoStart);
  // If appUrl changed, reload the main window
  if ('appUrl' in updates && mainWin) mainWin.loadURL(updates.appUrl);
  return { ok: true };
});

ipcMain.handle('open-aims', () => {
  if (mainWin) { mainWin.show(); mainWin.focus(); }
  else createMainWindow();
});

ipcMain.handle('get-printers', async () => {
  const win = mainWin || settingsWin || new BrowserWindow({ show: false });
  const owned = !mainWin && !settingsWin;
  try {
    const printers = await win.webContents.getPrintersAsync();
    return printers;
  } finally {
    if (owned) win.destroy();
  }
});

ipcMain.handle('restart-agent', () => {
  agent.stop();
  if (store.hasCredentials()) startAgent();
  return { ok: true };
});

ipcMain.handle('get-displays', () => getDisplayList());

ipcMain.handle('get-customer-display-status', () => ({
  open:      !!customerDisplayWin && !customerDisplayWin.isDestroyed(),
  displayId: store.getConfig().customerDisplayId || null,
  mode:      store.getConfig().customerDisplayMode || 'external',
}));

ipcMain.handle('open-customer-display', (_event, displayId) => {
  if (displayId) store.setConfig({ customerDisplayId: displayId });
  createCustomerDisplayWindow(displayId || store.getConfig().customerDisplayId);
  return { ok: true };
});

ipcMain.handle('close-customer-display', () => {
  closeCustomerDisplay();
  return { ok: true };
});

ipcMain.handle('set-customer-display-mode', (_event, mode) => {
  store.setConfig({ customerDisplayMode: mode });
  // Reload if already open so the URL updates immediately
  if (customerDisplayWin && !customerDisplayWin.isDestroyed()) {
    const cfg     = store.getConfig();
    const baseUrl = cfg.appUrl || 'https://develop.aaimsoft.com';
    const url     = mode === 'duplicate' ? baseUrl : `${baseUrl}/customer-display`;
    customerDisplayWin.loadURL(url);
  }
  return { ok: true };
});
