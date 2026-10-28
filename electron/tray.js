'use strict';

const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

let tray = null;
let currentState = 'disconnected';
let _onShowApp  = null;
let _onSettings = null;
let _onQuit     = null;

const STATE_LABELS = {
  connecting:   'Connecting…',
  connected:    'Connected',
  disconnected: 'Disconnected',
};

const STATE_ICONS = {
  connecting:   'icon-tray-connecting.png',
  connected:    'icon-tray-connected.png',
  disconnected: 'icon-tray-disconnected.png',
};

function iconPath(name) {
  return path.join(__dirname, '..', 'assets', name);
}

function createTray({ onShowApp, onSettings, onQuit }) {
  _onShowApp  = onShowApp;
  _onSettings = onSettings;
  _onQuit     = onQuit;

  const img = nativeImage.createFromPath(iconPath('icon-tray.png'));
  tray = new Tray(process.platform === 'darwin' ? img.resize({ width: 18, height: 18 }) : img);
  tray.setToolTip('AIMS');
  tray.on('click', _onShowApp);

  _rebuildMenu();
  return tray;
}

function updateTrayState(state) {
  currentState = state;
  if (!tray) return;

  const iconName = STATE_ICONS[state] ?? 'icon-tray.png';
  const img = nativeImage.createFromPath(iconPath(iconName));
  tray.setImage(process.platform === 'darwin' ? img.resize({ width: 18, height: 18 }) : img);

  _rebuildMenu();
}

function _rebuildMenu() {
  const menu = Menu.buildFromTemplate([
    { label: 'Show AIMS',      click: _onShowApp },
    { type: 'separator' },
    {
      label:   `Print Agent: ${STATE_LABELS[currentState] ?? currentState}`,
      enabled: false,
    },
    { type: 'separator' },
    { label: 'Settings',       click: _onSettings },
    { type: 'separator' },
    { label: 'Quit',           click: _onQuit },
  ]);

  tray.setContextMenu(menu);
  tray.setToolTip(`AIMS — Print Agent ${STATE_LABELS[currentState] ?? currentState}`);
}

module.exports = { createTray, updateTrayState };
