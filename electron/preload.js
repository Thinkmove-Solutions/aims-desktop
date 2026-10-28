'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a typed API to the renderer — no raw ipcRenderer access
contextBridge.exposeInMainWorld('aimsAgent', {
  getConfig:     ()      => ipcRenderer.invoke('get-config'),
  importConfig:  (obj)   => ipcRenderer.invoke('import-config', obj),
  saveConfig:    (upd)   => ipcRenderer.invoke('save-config', upd),
  openAims:      ()      => ipcRenderer.invoke('open-aims'),
  getPrinters:   ()      => ipcRenderer.invoke('get-printers'),
  restartAgent:  ()      => ipcRenderer.invoke('restart-agent'),

  onAgentState:  (cb) => ipcRenderer.on('agent-state', (_e, s) => cb(s)),
  onAgentLog:    (cb) => ipcRenderer.on('agent-log',   (_e, l) => cb(l)),

  getDisplays:               ()         => ipcRenderer.invoke('get-displays'),
  getCustomerDisplayStatus:  ()         => ipcRenderer.invoke('get-customer-display-status'),
  openCustomerDisplay:       (displayId) => ipcRenderer.invoke('open-customer-display', displayId),
  closeCustomerDisplay:      ()         => ipcRenderer.invoke('close-customer-display'),
  setCustomerDisplayMode:    (mode)     => ipcRenderer.invoke('set-customer-display-mode', mode),

  onDisplaysChanged: (cb) => ipcRenderer.on('displays-changed', (_e, d) => cb(d)),
});
