'use strict';

const { app, safeStorage } = require('electron');
const Store = require('electron-store');
const path = require('path');

const store = new Store({
  name: 'aims-config',
  // cwd defaults to the app's userData dir, which uses productName ("AIMS")
  defaults: {
    appUrl: 'https://develop.aaimsoft.com',
    wsUrl: 'wss://develop-api.aaimsoft.com/ws/kds/print-agent/',
    tenantId: null,
    autoStart: false,
    customerDisplayMode: 'external',
    customerDisplayId:   null,
    allowedOrigins: [
      'https://app.aaimsoft.com',
      'https://develop.aaimsoft.com',
      'http://localhost:3000',
    ],
    localApiPort: 27152,
  },
});

// ── Token (sensitive) ────────────────────────────────────────────────────────
// Stored encrypted via OS keychain (safeStorage). Falls back to plain text
// when safeStorage is unavailable (e.g. headless CI), with a console warning.

function saveToken(token) {
  if (safeStorage.isEncryptionAvailable()) {
    store.set('tokenEncrypted', safeStorage.encryptString(token).toString('base64'));
    store.delete('tokenPlain');
  } else {
    console.warn('[store] safeStorage unavailable — storing token as plain text');
    store.set('tokenPlain', token);
    store.delete('tokenEncrypted');
  }
}

function loadToken() {
  const enc = store.get('tokenEncrypted');
  if (enc) {
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'));
    } catch {
      return null;
    }
  }
  return store.get('tokenPlain', null);
}

// ── Config helpers ────────────────────────────────────────────────────────────

function getConfig() {
  return {
    appUrl:              store.get('appUrl'),
    wsUrl:               store.get('wsUrl'),
    tenantId:            store.get('tenantId'),
    autoStart:           store.get('autoStart'),
    customerDisplayMode: store.get('customerDisplayMode'),
    customerDisplayId:   store.get('customerDisplayId'),
    allowedOrigins:      store.get('allowedOrigins'),
    localApiPort:        store.get('localApiPort'),
  };
}

function setConfig(updates) {
  const allowed = ['appUrl', 'wsUrl', 'tenantId', 'autoStart', 'customerDisplayMode', 'customerDisplayId', 'allowedOrigins', 'localApiPort'];
  for (const [k, v] of Object.entries(updates)) {
    if (allowed.includes(k)) store.set(k, v);
  }
}

// ── Import from agent-config.json ────────────────────────────────────────────
// Convenience: accept the same JSON the Python agent uses and migrate it.

function importAgentConfig(obj) {
  if (obj.token) saveToken(obj.token);
  if (obj.tenant_id) store.set('tenantId', obj.tenant_id);
  if (obj.ws_url) store.set('wsUrl', obj.ws_url);
}

function hasCredentials() {
  return !!(loadToken() && store.get('tenantId') && store.get('wsUrl'));
}

module.exports = { saveToken, loadToken, getConfig, setConfig, importAgentConfig, hasCredentials };
