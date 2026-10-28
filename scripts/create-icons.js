#!/usr/bin/env node
'use strict';

/**
 * Generates all icon assets for AIMS Desktop.
 * Pure Node.js — no extra dependencies (uses built-in zlib).
 *
 * Outputs:
 *   assets/icon.png                   512×512  app / window / installer icon
 *   assets/icon-tray.png              22×22    tray — neutral (starting)
 *   assets/icon-tray-connected.png    22×22    tray — green dot
 *   assets/icon-tray-connecting.png   22×22    tray — amber dot
 *   assets/icon-tray-disconnected.png 22×22    tray — red dot
 */

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── Minimal RGBA PNG writer ───────────────────────────────────────────────────

const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : (c >>> 1);
  CRC[n] = c;
}

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const t   = Buffer.from(type);
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
  const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

// getPixel(x, y, w, h) → [R, G, B, A]  (0–255 each)
function makePNG(w, h, getPixel) {
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  ihdr[10] = ihdr[11] = ihdr[12] = 0;

  const rows = [];
  for (let y = 0; y < h; y++) {
    rows.push(0); // filter: None
    for (let x = 0; x < w; x++) rows.push(...getPixel(x, y, w, h));
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Math helpers ──────────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mix   = (a, b, t) => a + (b - a) * t;
const dist  = (ax, ay, bx, by) => Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);

// Anti-aliased circle: 1 inside, 0 outside, smooth at edge
function circleA(px, py, cx, cy, r) {
  return clamp(r - dist(px, py, cx, cy) + 0.5, 0, 1);
}

// Anti-aliased rounded rect
function rrectA(px, py, rx, ry, rw, rh, cr) {
  const dx = Math.max(0, Math.abs(px - rx - rw / 2) - rw / 2 + cr);
  const dy = Math.max(0, Math.abs(py - ry - rh / 2) - rh / 2 + cr);
  return clamp(cr - Math.sqrt(dx * dx + dy * dy) + 0.5, 0, 1);
}

// Anti-aliased thick line segment — returns alpha based on perp distance
function lineA(px, py, x1, y1, x2, y2, halfW) {
  const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (len2 === 0) return circleA(px, py, x1, y1, halfW);
  const t  = clamp(((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / len2, 0, 1);
  const d  = dist(px, py, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
  return clamp(halfW - d + 0.5, 0, 1);
}

// Composite src onto dst using src alpha
function over(dst, src, alpha) {
  return [
    Math.round(mix(dst[0], src[0], alpha)),
    Math.round(mix(dst[1], src[1], alpha)),
    Math.round(mix(dst[2], src[2], alpha)),
    255,
  ];
}

// ── Colours ───────────────────────────────────────────────────────────────────

const C = {
  bg:     [11,  17,  32],   // #0B1120
  badge:  [20,  30,  64],   // #141E40  inner dark
  orange: [224, 122, 31],   // #E07A1F  AIMS accent
  white:  [255, 255, 255],
  grey:   [138, 151, 189],  // neutral tray dot
  green:  [16,  185, 129],
  amber:  [245, 158, 11],
  red:    [239, 68,  68],
};

// ── Main icon 512×512 ─────────────────────────────────────────────────────────

function mainPixel(x, y, w, h) {
  const cx = w / 2, cy = h / 2;

  let rgb = [...C.bg];

  // Orange outer rounded-square badge
  const ba = rrectA(x, y, w * 0.06, h * 0.06, w * 0.88, h * 0.88, w * 0.20);
  if (ba > 0) rgb = over(rgb, C.orange, ba).slice(0, 3);

  // Dark inner badge
  const ia = rrectA(x, y, w * 0.13, h * 0.13, w * 0.74, h * 0.74, w * 0.14);
  if (ia > 0) rgb = over(rgb, C.badge, ia).slice(0, 3);

  // Letter "A" — two angled legs + crossbar (white)
  const ah = h * 0.48, aw = w * 0.38, sw = w * 0.072;
  const top = { x: cx, y: cy - ah / 2 };
  const bl  = { x: cx - aw / 2, y: cy + ah / 2 };
  const br  = { x: cx + aw / 2, y: cy + ah / 2 };
  const crossY = cy + ah * 0.10;

  const la = lineA(x, y, top.x, top.y, bl.x, bl.y, sw / 2);
  const ra = lineA(x, y, top.x, top.y, br.x, br.y, sw / 2);

  // Crossbar: horizontal line between the legs at crossY
  const cbLx = top.x + (bl.x - top.x) * 0.58;
  const cbRx = top.x + (br.x - top.x) * 0.58;
  const ca = lineA(x, y, cbLx, crossY, cbRx, crossY, sw * 0.42);

  const la2 = Math.min(1, la + ra + ca);
  if (la2 > 0) rgb = over(rgb, C.white, la2).slice(0, 3);

  return [...rgb, 255];
}

// ── Tray icon 22×22 ───────────────────────────────────────────────────────────

function trayPixel(dotColor) {
  return function(x, y, w, h) {
    // Clip to rounded rect — transparent outside
    const ba = rrectA(x, y, 0.5, 0.5, w - 1, h - 1, 3.5);
    if (ba < 0.01) return [0, 0, 0, 0];

    let rgb = [...C.badge]; // dark background

    // "A" letter — scaled down to icon
    const cx = w * 0.46, cy = h * 0.56;
    const ah = h * 0.50, aw = w * 0.38, sw = w * 0.085;
    const top = { x: cx, y: cy - ah / 2 };
    const bl  = { x: cx - aw / 2, y: cy + ah / 2 };
    const br  = { x: cx + aw / 2, y: cy + ah / 2 };
    const crossY = cy + ah * 0.10;
    const cbLx = top.x + (bl.x - top.x) * 0.58;
    const cbRx = top.x + (br.x - top.x) * 0.58;

    const la = lineA(x, y, top.x, top.y, bl.x, bl.y, sw / 2);
    const ra = lineA(x, y, top.x, top.y, br.x, br.y, sw / 2);
    const ca = lineA(x, y, cbLx, crossY, cbRx, crossY, sw * 0.42);
    const letA = Math.min(1, la + ra + ca);
    if (letA > 0) rgb = over(rgb, C.orange, letA).slice(0, 3);

    // Status dot — top-right corner
    const da = circleA(x, y, w - 4, 3.5, 3.2);
    if (da > 0) rgb = over(rgb, dotColor, da).slice(0, 3);

    return [...rgb, Math.round(255 * ba)];
  };
}

// ── Write ─────────────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

const files = [
  // icon.png is the real AIMS brand icon — skip generating it
  ['icon-tray.png',              makePNG(22,  22,  trayPixel(C.grey))],
  ['icon-tray-connected.png',    makePNG(22,  22,  trayPixel(C.green))],
  ['icon-tray-connecting.png',   makePNG(22,  22,  trayPixel(C.amber))],
  ['icon-tray-disconnected.png', makePNG(22,  22,  trayPixel(C.red))],
];

for (const [name, buf] of files) {
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log(`  ✓  ${name}  (${buf.length} bytes)`);
}
console.log('\nDone — assets/ ready.');
