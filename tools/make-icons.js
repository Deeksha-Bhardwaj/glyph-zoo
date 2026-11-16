'use strict';

/* =============================================================
   make-icons.js — draws the extension icons (16, 48, 128 px).
   A pink butterfly made of little square tiles on a dark rounded
   square, using the same wing maths as the app.

   Run from the project folder:   node tools/make-icons.js
   Writes: icons/icon16.png, icons/icon48.png, icons/icon128.png
   No libraries needed — it writes the PNG format by hand.
   ============================================================= */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- tiny PNG writer ---------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function writePNG(file, size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

/* ---------- butterfly (same idea as species.js) ---------- */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function rell(x, y, cx, cy, rx, ry, a) {
  const dx = x - cx, dy = y - cy, ca = Math.cos(a), sa = Math.sin(a);
  const u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry;
  return 1 - (u * u + v * v);
}
function seg(x, y, ax, ay, bx, by, r) {
  const px = x - ax, py = y - ay, vx = bx - ax, vy = by - ay;
  const h = clamp01((px * vx + py * vy) / (vx * vx + vy * vy || 1));
  return clamp01(1 - Math.hypot(px - vx * h, py - vy * h) / r);
}

const PINK = [236, 100, 168], PINK_HI = [255, 205, 232], DARK = [92, 30, 80], WHITE = [255, 246, 252];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// colour at a point in butterfly space (x = forward/up, y = sideways), or null
function butterfly(x, y) {
  const ay = Math.abs(y);
  const body = Math.max(seg(x, y, -0.6, 0, 0.4, 0, 0.1), seg(x, ay, 0.4, 0.03, 0.82, 0.26, 0.06));
  if (body > 0.2) return DARK;
  const inside = Math.max(rell(x, ay, 0.26, 0.5, 0.56, 0.32, 1.08), rell(x, ay, -0.2, 0.42, 0.44, 0.3, -1.15));
  if (inside <= 0) return null;
  if (inside < 0.28) {
    const spot = inside > 0.08 && inside < 0.22 && Math.sin(Math.atan2(ay, x) * 22) > 0.55;
    return spot ? WHITE : DARK;
  }
  return mix(PINK, PINK_HI, clamp01(inside * 1.2));
}

/* ---------- draw one icon ---------- */

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const cells = size >= 64 ? 26 : size >= 32 ? 16 : 16; // grid resolution
  const cell = size / cells;
  const gap = size >= 64 ? cell * 0.14 : 0;            // tile gaps only when there's room
  const radius = size * 0.22;                          // rounded corners
  const scale = 0.43 * size;                           // butterfly size

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // rounded-square mask
      const cx = Math.max(radius - x - 0.5, 0, x + 0.5 - (size - radius));
      const cy = Math.max(radius - y - 0.5, 0, y + 0.5 - (size - radius));
      const outside = Math.hypot(cx, cy) - radius;
      const alpha = clamp01(0.5 - outside);
      if (alpha <= 0) continue;

      // background: dark navy with a soft pink glow in the middle
      const glow = clamp01(1 - Math.hypot(x - size / 2, y - size / 2) / (size * 0.6));
      let col = mix([10, 11, 20], [70, 25, 60], glow * glow * 0.7);

      // which tile is this pixel in, and is it in the gap between tiles?
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
      const fx = x - gx * cell, fy = y - gy * cell;
      const inGap = fx < gap || fy < gap;
      if (!inGap) {
        // sample the butterfly at the tile centre (facing up)
        const sx = (gx + 0.5) * cell - size / 2;
        const sy = (gy + 0.5) * cell - size / 2;
        const c = butterfly(-sy / scale, sx / scale);
        if (c) col = c;
      }
      px[i] = col[0];
      px[i + 1] = col[1];
      px[i + 2] = col[2];
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

// extension icons (go into the zip)
const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  writePNG(path.join(outDir, `icon${size}.png`), size, drawIcon(size));
  console.log(`wrote icons/icon${size}.png`);
}

// store logo (uploaded separately in the store dashboard, not part of the zip)
const storeDir = path.join(__dirname, '..', 'store-assets');
fs.mkdirSync(storeDir, { recursive: true });
writePNG(path.join(storeDir, 'logo300.png'), 300, drawIcon(300));
console.log('wrote store-assets/logo300.png');
