'use strict';

/**
 * Node.js port of print-agent/agent.py
 *
 * Opens an outbound WebSocket to the AIMS backend and waits for print_job
 * messages, then delivers the raw ESC/POS payload to the LAN printer via a
 * plain TCP socket — exactly what the Python agent does.
 *
 * Protocol (mirrors apps/kds/consumers.py::PrintAgentConsumer)
 * ─────────────────────────────────────────────────────────────
 * Client → server:
 *   { type: "ping" }
 *   { type: "print_result", job_id, ok, message }
 *
 * Server → client:
 *   { type: "print_job", job_id, printer_id, printer_name,
 *     ip_address, port, payload_b64 }
 *   { type: "pong" }
 */

const net = require('net');
const WebSocket = require('ws');
const { EventEmitter } = require('events');

const PING_INTERVAL_MS = 20_000;
const PRINTER_TIMEOUT_MS = 5_000;
const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

class PrintAgent extends EventEmitter {
  constructor() {
    super();
    this._ws = null;
    this._pingTimer = null;
    this._reconnectTimer = null;
    this._backoff = RECONNECT_MIN_MS;
    this._running = false;
    this._wsUrl = null;
    this._token = null;
    this.state = 'disconnected'; // 'connecting' | 'connected' | 'disconnected'
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  start(wsUrl, token) {
    this._wsUrl = wsUrl;
    this._token = token;
    this._running = true;
    this._backoff = RECONNECT_MIN_MS;
    this._connect();
  }

  stop() {
    this._running = false;
    clearTimeout(this._reconnectTimer);
    this._cleanup();
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  _connect() {
    if (!this._running) return;

    const url = `${this._wsUrl.replace(/\/$/, '')}/?agent_token=${encodeURIComponent(this._token)}`;
    this._setState('connecting');

    const ws = new WebSocket(url, { rejectUnauthorized: true });
    this._ws = ws;

    ws.on('open', () => {
      this._backoff = RECONNECT_MIN_MS;
      this._setState('connected');
      this.emit('log', 'info', 'Connected — waiting for print jobs.');
      this._startPing(ws);
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === 'pong') return;
      if (msg.type === 'print_job') this._handleJob(ws, msg);
    });

    ws.on('close', (code) => {
      this._cleanup();
      if (!this._running) return;
      this.emit('log', 'warn', `Connection closed (${code}) — retrying in ${this._backoff / 1000}s`);
      this._scheduleReconnect();
    });

    ws.on('error', (err) => {
      this.emit('log', 'warn', `WebSocket error: ${err.message}`);
      // 'close' will fire after 'error', so reconnect is handled there
    });
  }

  _cleanup() {
    clearInterval(this._pingTimer);
    this._pingTimer = null;
    if (this._ws) {
      this._ws.removeAllListeners();
      try { this._ws.terminate(); } catch {}
      this._ws = null;
    }
    this._setState('disconnected');
  }

  _scheduleReconnect() {
    this._reconnectTimer = setTimeout(() => this._connect(), this._backoff);
    this._backoff = Math.min(this._backoff * 2, RECONNECT_MAX_MS);
  }

  _startPing(ws) {
    this._pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, PING_INTERVAL_MS);
  }

  _setState(state) {
    this.state = state;
    this.emit('state', state);
  }

  // ── Print job handling ─────────────────────────────────────────────────────

  async _handleJob(ws, job) {
    const { job_id, printer_name, ip_address, port, payload_b64 } = job;
    this.emit('log', 'info', `Print job ${job_id} → ${printer_name} (${ip_address}:${port})`);
    this.emit('job-start', job);

    let result;
    try {
      const payload = Buffer.from(payload_b64, 'base64');
      await deliverToLanPrinter(ip_address, parseInt(port, 10), payload);
      this.emit('log', 'info', `Printed to ${printer_name}`);
      this.emit('job-done', { job_id, ok: true, printer_name });
      result = { type: 'print_result', job_id, ok: true, message: `Sent to ${printer_name}.` };
    } catch (err) {
      this.emit('log', 'warn', `Could not reach ${printer_name}: ${err.message}`);
      this.emit('job-done', { job_id, ok: false, printer_name, error: err.message });
      result = {
        type: 'print_result', job_id, ok: false,
        message: `Could not reach ${printer_name} (${ip_address}:${port}). ${err.message}`,
      };
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(result));
    }
  }
}

// ── Raw TCP delivery ──────────────────────────────────────────────────────────
// Mirrors print-agent/agent.py::deliver_to_printer exactly.

function deliverToLanPrinter(ip, port, payload) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: ip, port }, () => {
      sock.write(payload, (err) => {
        sock.destroy();
        if (err) reject(err); else resolve();
      });
    });
    sock.setTimeout(PRINTER_TIMEOUT_MS);
    sock.on('timeout', () => { sock.destroy(); reject(new Error('Connection timed out')); });
    sock.on('error', reject);
  });
}

module.exports = PrintAgent;
