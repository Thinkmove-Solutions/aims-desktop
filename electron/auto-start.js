'use strict';

const { app } = require('electron');

function setAutoStart(enabled) {
  if (process.platform === 'linux') {
    // Linux: electron doesn't support setLoginItemSettings well;
    // user must add to XDG autostart manually — we skip silently.
    return;
  }
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,   // start minimized to tray, not as a visible window
    name: 'AIMS Desktop',
  });
}

function getAutoStart() {
  if (process.platform === 'linux') return false;
  return app.getLoginItemSettings().openAtLogin;
}

module.exports = { setAutoStart, getAutoStart };
