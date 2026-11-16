'use strict';

/* =============================================================
   util.js — small math helpers shared by every other script.
   Plain <script> files share their top-level names, so everything
   here is usable in species.js, audio.js and main.js.
   ============================================================= */

const { abs, sin, cos, max, min, floor, ceil, sqrt, atan2, exp, random, round, pow, PI } = Math;
const TAU = PI * 2;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const rand = (a, b) => a + random() * (b - a);

/* ---------- shape primitives (soft-edged, return 0..1) ---------- */

// Filled ellipse centred at (cx, cy) with radii rx, ry.
function ell(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return clamp01((1 - (dx * dx + dy * dy)) * 2.2);
}

// Thick line segment from (ax, ay) to (bx, by) with radius r.
function seg(x, y, ax, ay, bx, by, r) {
  const px = x - ax, py = y - ay;
  const vx = bx - ax, vy = by - ay;
  const h = clamp01((px * vx + py * vy) / (vx * vx + vy * vy || 1));
  const dx = px - vx * h, dy = py - vy * h;
  return clamp01((1 - sqrt(dx * dx + dy * dy) / r) * 1.6);
}

// Rotated ellipse, returned *raw*: 1 at the centre, 0 on the edge, < 0 outside.
// Handy when a shape needs to know "how deep inside" a point is (for borders).
function rell(x, y, cx, cy, rx, ry, a) {
  const dx = x - cx, dy = y - cy;
  const ca = cos(a), sa = sin(a);
  const u = (dx * ca + dy * sa) / rx;
  const v = (-dx * sa + dy * ca) / ry;
  return 1 - (u * u + v * v);
}

/* ---------- colour tone ----------
   A shape can set TONE while it's being sampled to colour that point
   differently: 0 = main colour, 1 = accent (borders, veins), 2 = white. */
let TONE = 0;

/* ---------- misc ---------- */

// Cheap deterministic hash -> [0, 1). Same inputs always give the same output.
function hash(a, b) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Rotate angle a towards b by fraction t along the shortest path.
function lerpAngle(a, b, t) {
  const d = ((((b - a) % TAU) + TAU * 1.5) % TAU) - PI;
  return a + d * t;
}

// Progress (0..1) of a creature's click reaction, or -1 when it isn't reacting.
const reacting = (c) => (c.react ? c.react.t / c.react.dur : -1);

// 0 -> 1 -> 0 bump over p in [0, 1]; 0 when p < 0.
const hump = (p) => (p < 0 ? 0 : sin(clamp01(p) * PI));
