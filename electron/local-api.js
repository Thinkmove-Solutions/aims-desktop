'use strict';

/**
 * Local HTTP API — localhost:27152
 *
 * Lets the AIMS web app call native features (printer list, silent print,
 * OS notifications) when the desktop agent is installed and running.
 *
 * Auth rules:
 *   GET  /api/health     — no auth required (detection before pairing)
 *   POST /api/configure  — no auth required (first-time pairing from web app)
 *   All other endpoints  — Bearer <agent_token> required
 *   POST /api/config     — auth required OR no token stored yet (bootstrap)
 *
 * CORS: restricted to origins in store.allowedOrigins
 */

const http = require('http');
const { Notification } = require('electron');

let server = null;

// Callbacks registered by main.js for endpoints that need BrowserWindow access
let _onGetPrinters  = null;
let _onPrintSilent  = null;
let _onRestartAgent = null;

function startLocalApi(agent, store, { onGetPrinters, onPrintSilent, onRestartAgent } = {}) {
  _onGetPrinters  = onGetPrinters  ?? ((cb) => cb([]));
  _onPrintSilent  = onPrintSilent  ?? ((_p, cb) => cb({ ok: false, error: 'Not wired' }));
  _onRestartAgent = onRestartAgent ?? (() => {});

  const port = store.getConfig().localApiPort;

  server = http.createServer((req, res) => {
    const origins = store.getConfig().allowedOrigins;
    const origin  = req.headers['origin'] || '';

    // ── CORS ──────────────────────────────────────────────────────────────────
    if (origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = req.url.split('?')[0];

    // ── Public routes (no auth) ───────────────────────────────────────────────

    if (req.method === 'GET' && url === '/api/health') {
      json(res, 200, {
        ok: true,
        ws_state: agent.state,
        version: require('../package.json').version,
        configured: store.hasCredentials(),
      });
      return;
    }

    // First-time pairing: web app pushes its agent token → Electron stores it
    // and starts the WebSocket agent. Accepts without auth iff no token is stored.
    if (req.method === 'POST' && url === '/api/configure') {
      readBody(req, (body) => {
        try {
          const { token, tenant_id, ws_url } = JSON.parse(body);
          if (!token || !tenant_id || !ws_url) {
            json(res, 400, { error: 'token, tenant_id and ws_url are required' }); return;
          }

          // If already configured, require auth to overwrite
          const existingToken = store.loadToken();
          if (existingToken) {
            const authHeader = req.headers['authorization'] || '';
            const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
            if (bearer !== existingToken) { json(res, 401, { error: 'Unauthorized' }); return; }
          }

          store.importAgentConfig({ token, tenant_id, ws_url });
          _onRestartAgent();
          json(res, 200, { ok: true, message: 'AIMS Desktop configured.' });
        } catch {
          json(res, 400, { error: 'Invalid JSON' });
        }
      });
      return;
    }

    // ── Authenticated routes ──────────────────────────────────────────────────

    const storedToken = store.loadToken();
    const authHeader  = req.headers['authorization'] || '';
    const bearer      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!storedToken || bearer !== storedToken) {
      json(res, 401, { error: 'Unauthorized' }); return;
    }

    if (req.method === 'GET' && url === '/api/config') {
      const cfg = store.getConfig();
      json(res, 200, { tenant_id: cfg.tenantId, ws_url: cfg.wsUrl, auto_start: cfg.autoStart });
      return;
    }

    if (req.method === 'POST' && url === '/api/config') {
      readBody(req, (body) => {
        try {
          store.setConfig(JSON.parse(body));
          json(res, 200, { ok: true });
        } catch {
          json(res, 400, { error: 'Invalid JSON' });
        }
      });
      return;
    }

    if (req.method === 'POST' && url === '/api/notify') {
      readBody(req, (body) => {
        try {
          const { title = 'AIMS', message = '' } = JSON.parse(body);
          if (Notification.isSupported()) {
            new Notification({ title, body: message, silent: false }).show();
          }
          json(res, 200, { ok: true });
        } catch {
          json(res, 400, { error: 'Invalid JSON' });
        }
      });
      return;
    }

    if (req.method === 'GET' && url === '/api/printers') {
      _onGetPrinters((printers) => json(res, 200, { printers }));
      return;
    }

    if (req.method === 'POST' && url === '/api/print/silent') {
      readBody(req, (body) => {
        try {
          _onPrintSilent(JSON.parse(body), (result) => json(res, result.ok ? 200 : 500, result));
        } catch {
          json(res, 400, { error: 'Invalid JSON' });
        }
      });
      return;
    }

    json(res, 404, { error: 'Not found' });
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[local-api] Listening on http://127.0.0.1:${port}`);
  });
  server.on('error', (err) => console.error(`[local-api] Server error: ${err.message}`));
}

function stopLocalApi() {
  if (server) { server.close(); server = null; }
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req, cb) {
  let data = '';
  req.on('data', (c) => { data += c; });
  req.on('end', () => cb(data));
}

module.exports = { startLocalApi, stopLocalApi };
