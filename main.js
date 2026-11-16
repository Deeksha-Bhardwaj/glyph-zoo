'use strict';

/* =============================================================
   Glyph Zoo — main.js
   Simulation (movement, flocking, food chain, ripples, particles),
   drawing everything onto the character grid, and the UI.
   Animals live in species.js, sound in audio.js, helpers in util.js.
   ============================================================= */

/* ---------- constants ---------- */

const UNIT = 18;              // px — base unit for creature size and speed
const LEVELS = 16;            // pre-built colour steps per style
const MAX_CREATURES = 90;
const STORE_KEY = 'glyph-zoo:v3';
const OLD_KEYS = ['glyph-zoo:v2', 'glyph-zoo:v1'];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const smallScreen = innerWidth < 700;

// kinds of effects drawn on the grid
const K_SPARK = 1, K_INK = 2, K_FOOD = 3, K_WATER = 4;

const SPECIES_INDEX = Object.fromEntries(SPECIES.map((s, i) => [s.id, i]));
const HUNTS = SPECIES.map((sp) => (sp.hunts || []).map((id) => SPECIES_INDEX[id]));      // who I chase
const PREDATORS = SPECIES.map((_, i) => SPECIES.map((_, j) => j).filter((j) => HUNTS[j].includes(i))); // who chases me

/* ---------- settings ---------- */

const DEFAULTS = {
  count: smallScreen ? 7 : 12,
  speed: reduceMotion ? 0.4 : 1,
  cell: smallScreen ? 6 : 7,
  glow: true,
  grid: true,
  trails: true,
  scatter: true,
  flocking: true,
  foodchain: true,
  sound: false,
  lowpower: false,    // ~30 fps instead of ~60
  showClock: true,
  clock24: false,
  showQuote: true,
  showWeather: true,
  city: '',           // for the weather; empty = not set yet
  unit: 'c',          // 'c' or 'f'
  glyphs: 'ascii',
  styles: {},         // chosen style per animal id; missing = 'mix' (random per individual)
  time: 'auto',
  select: 'butterfly',
  name: 'friend',
};
const WIDGET_TOGGLES = ['showClock', 'clock24', 'showQuote', 'showWeather'];
const TOGGLES = ['glow', 'grid', 'trails', 'scatter', 'flocking', 'foodchain', 'sound', 'lowpower', ...WIDGET_TOGGLES];
const UNITS = [['c', '°C'], ['f', '°F']];
const TIMES = [['auto', 'Auto'], ['day', 'Day'], ['night', 'Night']];

function readKey(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function load() {
  const current = readKey(STORE_KEY);
  if (current) return current;
  for (const key of OLD_KEYS) {            // keep the name from older versions
    const old = readKey(key);
    if (old && typeof old.name === 'string') return { name: old.name };
  }
  return {};
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(tw));
  } catch {
    /* storage blocked (private mode etc.) — settings just won't persist */
  }
}

const NAV = SPECIES.map((s) => ({ id: s.id, name: s.name }));

function sanitize(s) {
  const out = { ...DEFAULTS, ...s };
  const num = (v, lo, hi, d) => (Number.isFinite(+v) ? clamp(+v, lo, hi) : d);
  out.count = round(num(out.count, 3, 30, DEFAULTS.count));
  out.speed = num(out.speed, 0.2, 2.5, DEFAULTS.speed);
  out.cell = round(num(out.cell, 5, 24, DEFAULTS.cell));
  for (const k of TOGGLES) out[k] = !!out[k];
  if (!NAV.some((n) => n.id === out.select)) out.select = DEFAULTS.select;
  if (!GLYPH_SETS[out.glyphs]) out.glyphs = DEFAULTS.glyphs;
  // keep only valid per-animal styles (and carry over the older butterfly-only setting)
  const src = s && s.styles && typeof s.styles === 'object' ? s.styles : {};
  const styles = {};
  for (const sp of SPECIES) {
    const v = sp.id === 'butterfly' && !src.butterfly && s ? s.bstyle : src[sp.id];
    if (sp.styles && sp.styles.some((st) => st.id === v)) styles[sp.id] = v;
  }
  out.styles = styles;
  delete out.bstyle;
  if (!TIMES.some(([v]) => v === out.time)) out.time = DEFAULTS.time;
  out.city = typeof out.city === 'string' ? out.city.trim().slice(0, 60) : '';
  if (!UNITS.some(([v]) => v === out.unit)) out.unit = DEFAULTS.unit;
  if (typeof out.name !== 'string' || !out.name.trim()) out.name = DEFAULTS.name;
  return out;
}

let tw = sanitize(load());

/* ---------- colours (pre-built strings so the render loop stays fast) ---------- */

const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
const mixRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE = [255, 255, 255];

function makeStyle(base, hi, bgA = [0.08, 0.62], fgA = [0.3, 0.7]) {
  const bg = [], fg = [], tr = [];
  for (let l = 0; l < LEVELS; l++) {
    const t = (l + 0.5) / LEVELS;
    bg.push(rgba(mixRGB(base, hi, t * t), bgA[0] + bgA[1] * t));
    fg.push(rgba(mixRGB(hi, WHITE, t * 0.55), fgA[0] + fgA[1] * t));
    tr.push(rgba(hi, 0.1 + 0.4 * t));
  }
  return { bg, fg, tr, glow: `rgba(${base.join(',')},` };
}

const STYLES = [];
const addStyle = (s) => STYLES.push(s) - 1;

// Every species gets one style per tone, for each colour variant (palette).
// A palette is either { base, hi, accent } or { tones: [[base, hi], ...] }.
const SPECIES_STYLES = SPECIES.map((sp) =>
  (sp.palettes || [{ base: sp.base, hi: sp.hi }]).map((p) => {
    const tones = p.tones || [[p.base, p.hi], ...(p.accent ? [p.accent] : [])];
    return tones.map(([b, h]) => addStyle(makeStyle(b, h)));
  })
);
const S_WATER = addStyle(makeStyle([50, 110, 190], [185, 225, 255]));
const S_FOOD = addStyle(makeStyle([190, 140, 40], [255, 228, 150]));
const S_INK = addStyle(makeStyle([45, 25, 80], [175, 145, 235], [0.45, 0.45], [0.4, 0.5]));
const S_WHITE = addStyle(makeStyle([185, 195, 230], [255, 255, 255], [0.3, 0.65], [0.6, 0.4]));

// Which style (design) an individual uses: the one picked in Tweaks for its
// animal, or — for "Mix" — a random one fixed by its seed.
function designOf(c) {
  const sp = SPECIES[c.sp];
  if (!sp.styles) return 0;
  const i = sp.styles.findIndex((s) => s.id === tw.styles[sp.id]);
  return i >= 0 ? i : floor(c.seed) % sp.styles.length;
}

function refreshDesigns() {
  for (const c of creatures) c.design = designOf(c);
}

// Style for a creature's tone (0 = main colour). A style can pick its own
// palette; otherwise the creature's random colour variant is used.
// Missing tones fall back to white for tone 2, otherwise to the main colour.
function styleOf(c, tone = 0) {
  const sp = SPECIES[c.sp];
  const st = sp.styles && sp.styles[c.design];
  const pal = st && st.palette !== undefined ? st.palette : c.variant;
  const tones = SPECIES_STYLES[c.sp][pal];
  return tones[tone] ?? (tone === 2 ? S_WHITE : tones[0]);
}

// Local creature coordinates -> screen position (inverse of rasterize's rotation).
function toWorld(c, lx, ly) {
  if (SPECIES[c.sp].sideView && cos(c.angle) < 0) ly = -ly;
  const u = scaleOf(c), ca = cos(c.angle), sa = sin(c.angle);
  return [c.x + (lx * ca - ly * sa) * u, c.y + (lx * sa + ly * ca) * u];
}
const STAR = Array.from({ length: LEVELS }, (_, l) => rgba([200, 210, 255], 0.08 + 0.4 * ((l + 0.5) / LEVELS)));
const SPARK_BG = 'rgba(236,240,255,0.92)';
const SPARK_FG = '#0b0d14';

function glyphSet(key) {
  const g = GLYPH_SETS[key];
  return {
    ramp: Array.from(g.ramp),
    trail: Array.from(g.trail),
    spark: Array.from(g.spark),
    food: Array.from(g.food),
    water: Array.from(g.water),
  };
}
let G = glyphSet(tw.glyphs);

/* ---------- canvas & world state ---------- */

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

let W = 0, H = 0, dpr = 1, cell = 7, cols = 0, rows = 0;
let dens, owner, trail, trailOwner, fx, fxStyle, fxKind;
let stars = [];
let creatures = [];
let particles = [];
let ripples = [];
let food = [];
let gt = 0;                 // animation clock (scaled by the speed slider)
let realTime = 0;           // real seconds since start
let lastTime = performance.now();
let paused = false;
let night = false;
let replenishTimer = 0;
let lastPassNote = 0;
const pointer = { x: 0, y: 0, active: false, speed: 0, t: 0 }; // speed in px/s
const SCATTER_SPEED = 450; // creatures only scatter from a mouse moving faster than this

function resize() {
  dpr = min(window.devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  canvas.width = floor(W * dpr);
  canvas.height = floor(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  cell = tw.cell;
  cols = ceil(W / cell);
  rows = ceil(H / cell);
  const n = cols * rows;
  dens = new Float32Array(n);
  owner = new Uint8Array(n);
  trail = new Float32Array(n);
  trailOwner = new Uint8Array(n);
  fx = new Float32Array(n);
  fxStyle = new Uint8Array(n);
  fxKind = new Uint8Array(n);

  stars = [];
  for (let i = 0; i < n; i++) if (hash(i, 99) < 0.006) stars.push(i);

  // resizing the canvas resets context state, so set the text style again
  ctx.font = `700 ${max(5, round(cell * 0.72))}px ui-monospace, "Cascadia Mono", Consolas, "Segoe UI Symbol", "MS Gothic", Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  document.documentElement.style.setProperty('--cell', cell + 'px');
}

/* ---------- population ---------- */

const scaleOf = (c) => UNIT * SPECIES[c.sp].size * c.s * (1 + c.zoom);
const slotOf = (c) => (c.ambient ? 0 : SPECIES[c.sp].slot ?? 1);

function computeNight() {
  if (tw.time === 'night') return true;
  if (tw.time === 'day') return false;
  const h = new Date().getHours();
  return h < 6 || h >= 19;
}

// Which species may appear: the animal picked in the top bar.
function allowedSpecies() {
  return [SPECIES_INDEX[tw.select]];
}

function pickSpecies() {
  const list = allowedSpecies();
  let total = 0;
  for (const i of list) total += SPECIES[i].weight ?? 1;
  let r = random() * total;
  for (const i of list) {
    r -= SPECIES[i].weight ?? 1;
    if (r <= 0) return i;
  }
  return list[list.length - 1];
}

function makeCreature(spIndex, x, y, heading) {
  const sp = SPECIES[spIndex];
  const h = heading ?? (
    sp.mode === 'up' ? -PI / 2 + rand(-0.3, 0.3) :
    sp.mode === 'side' ? (random() < 0.5 ? 0 : PI) :
    random() * TAU
  );
  const s = rand(0.8, 1.25);
  const c = {
    sp: spIndex, x, y,
    design: 0,                // which style it's drawn in (set below)
    variant: floor(random() * (sp.palettes ? sp.palettes.length : 1)), // colour variant
    seed: random() * 1000,    // makes each individual's markings unique
    spin: 0,                  // rad/s of looping during a reaction
    sparkle: 0,               // sparkles/s trailed during a reaction
    sparkAcc: 0,
    heading: h,
    angle: sp.mode === 'side' ? 0 : h,
    turn: 0,
    boost: 0,
    s, s0: s,                 // size (grows a little when eating)
    clock: random() * 100,    // de-syncs flaps/hops between creatures
    alpha: 0,
    dying: false,
    caught: false,
    ambient: false,
    react: null,
    flash: 0,
    zoom: 0,
    zoomAmp: 0,
    full: 0,                  // predator rest time after a meal
    band: -1,                 // for "creatures passing" notes
  };
  c.design = designOf(c);
  return c;
}

function edgePoint(sp) {
  const m = UNIT * sp.size * 1.5;
  if (sp.mode === 'up') return { x: rand(0, W), y: H + m, heading: -PI / 2 };
  if (sp.mode === 'side') {
    const left = random() < 0.5;
    return { x: left ? -m : W + m, y: rand(0, H), heading: left ? 0 : PI };
  }
  const side = floor(random() * 4);
  const p =
    side === 0 ? { x: -m, y: rand(0, H) } :
    side === 1 ? { x: W + m, y: rand(0, H) } :
    side === 2 ? { x: rand(0, W), y: -m } :
    { x: rand(0, W), y: H + m };
  p.heading = atan2(H / 2 - p.y, W / 2 - p.x) + rand(-0.6, 0.6);
  return p;
}

// Spawns one creature, or a whole group (birds, fireflies). Returns slots used.
function spawnGroup(spIndex, opts = {}) {
  const sp = SPECIES[spIndex];
  const n = opts.single ? 1 : sp.group || 1;
  let p;
  if (opts.x !== undefined) p = { x: opts.x, y: opts.y };
  else if (opts.edge) p = edgePoint(sp);
  else p = { x: rand(0, W), y: rand(0, H) };
  const spread = n > 1 ? UNIT * sp.size * 3 : 0;
  const heading = p.heading ?? (n > 1 && !sp.mode ? random() * TAU : undefined);

  let added = 0;
  // a flock shares its colours and style
  const variant = floor(random() * (sp.palettes ? sp.palettes.length : 1));
  const seed = random() * 1000;
  for (let i = 0; i < n; i++) {
    const c = makeCreature(spIndex, p.x + rand(-spread, spread), p.y + rand(-spread, spread), heading);
    if (n > 1) {
      c.variant = variant;
      c.seed = seed;
      c.design = designOf(c);
    }
    c.ambient = !!opts.ambient;
    if (opts.x !== undefined) c.boost = 0.6;
    creatures.push(c);
    added += slotOf(c);
  }
  return added;
}

function aliveSlots() {
  let s = 0;
  for (const c of creatures) if (!c.dying) s += slotOf(c);
  return s;
}

function fillPopulation() {
  let s = aliveSlots();
  let guard = 0;
  while (s < tw.count - 0.01 && guard++ < 200 && creatures.length < MAX_CREATURES) {
    s += spawnGroup(pickSpecies());
  }
}

function trimPopulation() {
  let s = aliveSlots();
  for (const c of creatures) {
    if (s <= tw.count + 0.01) break;
    if (c.dying || c.ambient) continue;
    c.dying = true;
    s -= slotOf(c);
  }
}

// At night a few extra fireflies float around with every animal.
function updateAmbient() {
  const want = night && tw.select !== 'firefly' ? (smallScreen ? 6 : 10) : 0;
  const amb = creatures.filter((c) => c.ambient && !c.dying);
  for (let i = amb.length; i < want; i++) spawnGroup(SPECIES_INDEX.firefly, { single: true, ambient: true });
  for (let i = want; i < amb.length; i++) amb[i].dying = true;
}

// Keep creatures that still belong, fade out the rest, fill the gaps.
function refreshPopulation() {
  const allowed = new Set(allowedSpecies());
  for (const c of creatures) if (!c.ambient && !allowed.has(c.sp)) c.dying = true;
  trimPopulation();
  fillPopulation();
  updateAmbient();
}

function applyTime(force = false) {
  const n = computeNight();
  document.body.classList.toggle('night', n);
  document.body.classList.toggle('day', !n);
  if (n !== night || force) {
    night = n;
    refreshPopulation();
  }
}

/* ---------- effects: particles, ripples, food, sound ---------- */

function burst(x, y, style, n, o = {}) {
  const { speed = 180, kind = K_SPARK, life = 0.9, spray = false } = o;
  for (let i = 0; i < n; i++) {
    if (particles.length > 700) particles.shift();
    let vx, vy;
    if (spray) {                       // fountain: shoots up, falls back down
      vx = rand(-80, 80);
      vy = rand(-340, -180);
    } else {                           // explosion in all directions
      const a = random() * TAU;
      const v = speed * rand(0.35, 1);
      vx = cos(a) * v;
      vy = sin(a) * v;
    }
    const l = life * rand(0.7, 1.2);
    particles.push({ x, y, vx, vy, life: l, max: l, style, kind, gravity: spray ? 420 : 0, drag: spray ? 0.6 : 2.2 });
  }
}

function addRipple(x, y, strength = 1) {
  if (ripples.length > 8) ripples.shift();
  ripples.push({ x, y, r: 0, life: 1, strength });
}

function dropFood(x, y) {
  for (let i = 0; i < 3; i++) {
    if (food.length > 40) food.shift();
    food.push({ x: x + rand(-20, 20), y: y + rand(-20, 20), vx: rand(-25, 25), vy: rand(-25, 25), life: 25, seed: floor(random() * 1e6) });
  }
}

// Play a note in this creature's "voice", panned to where it is.
function sing(c, degree, opts = {}) {
  if (!Sound.enabled) return;
  const v = SPECIES[c.sp].voice;
  Sound.tone({
    f: Sound.freq(degree, v.oct),
    type: v.type,
    dur: v.dur,
    vol: v.vol,
    pan: (c.x / W) * 2 - 1,
    ...opts,
  });
}

/* ---------- simulation ---------- */

function update(dt) {
  const sdt = dt * tw.speed;
  gt += sdt;
  realTime += dt;

  const decay = exp(-dt * 1.8);
  for (let i = 0; i < trail.length; i++) trail[i] *= decay;

  updateEffects(dt);

  for (let i = creatures.length - 1; i >= 0; i--) {
    if (!updateCreature(creatures[i], dt, sdt)) creatures.splice(i, 1);
  }

  // slowly replace animals that were eaten or removed
  replenishTimer -= dt;
  if (replenishTimer <= 0) {
    replenishTimer = 2.5;
    if (aliveSlots() < tw.count - 0.01 && creatures.length < MAX_CREATURES) spawnGroup(pickSpecies(), { edge: true });
  }
}

function updateEffects(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vy += p.gravity * dt;
    const drag = exp(-p.drag * dt);
    p.vx *= drag;
    p.vy *= drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.r += 230 * dt;
    r.life -= dt / 1.8;
    if (r.life <= 0) ripples.splice(i, 1);
  }
  for (let i = food.length - 1; i >= 0; i--) {
    const f = food[i];
    f.life -= dt;
    if (f.life <= 0) { food.splice(i, 1); continue; }
    const drag = exp(-1.5 * dt);
    f.vx *= drag;
    f.vy *= drag;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    pushByRipples(f, dt, 0.5);
  }
}

// Expanding ripple rings push things outward as they pass.
function pushByRipples(o, dt, k) {
  for (const r of ripples) {
    const dx = o.x - r.x, dy = o.y - r.y;
    const d = sqrt(dx * dx + dy * dy) || 1;
    const band = abs(d - r.r);
    if (band < 36) {
      const f = (1 - band / 36) * r.life * r.strength * 140 * k;
      o.x += (dx / d) * f * dt;
      o.y += (dy / d) * f * dt;
      if (o.boost !== undefined) o.boost = max(o.boost, 0.3 * r.life);
    }
  }
}

function headOf(c) {
  const u = scaleOf(c);
  return [c.x + cos(c.angle) * u * 0.7, c.y + sin(c.angle) * u * 0.7];
}

/* Boids: three simple rules give realistic flocks and schools.
   1. separation — don't crowd your neighbours
   2. alignment  — face the same way as your neighbours
   3. cohesion   — move towards the middle of your neighbours */
function flock(c, sp, dt) {
  const f = sp.flock;
  const R = f.r * UNIT, R2 = R * R, S = f.sep * UNIT;
  let ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0, n = 0;
  for (const o of creatures) {
    if (o === c || o.sp !== c.sp || o.dying) continue;
    const dx = o.x - c.x, dy = o.y - c.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > R2) continue;
    n++;
    ax += cos(o.heading); ay += sin(o.heading);         // alignment
    cx += dx; cy += dy;                                 // cohesion
    if (d2 < S * S) {                                   // separation
      const d = sqrt(d2) || 1;
      const k = (S - d) / S;
      sx -= (dx / d) * k;
      sy -= (dy / d) * k;
    }
  }
  if (!n) return;
  const vx = cos(c.heading) + (f.align * ax) / n + (f.coh * (cx / n)) / R + f.sepW * sx;
  const vy = sin(c.heading) + (f.align * ay) / n + (f.coh * (cy / n)) / R + f.sepW * sy;
  c.heading = lerpAngle(c.heading, atan2(vy, vx), 1 - exp(-dt * 3));
  c.turn *= 0.9;
}

function seekFood(c, sp, dt) {
  const [hx, hy] = headOf(c);
  let best = -1, bd = (UNIT * 20) ** 2;
  for (let i = 0; i < food.length; i++) {
    const dx = food[i].x - hx, dy = food[i].y - hy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = i; }
  }
  if (best < 0) return 0;
  const f = food[best];
  const eatR = max(UNIT * 0.9, scaleOf(c) * 0.35);
  if (bd < eatR * eatR) {                       // nom
    food.splice(best, 1);
    c.s = min(c.s0 * 1.3, c.s + 0.02);
    burst(f.x, f.y, S_FOOD, 5, { speed: 70, life: 0.5 });
    sing(c, 5 + floor(random() * 5), { dur: 0.25, vol: sp.voice.vol * 0.7 });
    return 0;
  }
  if (sp.mode === 'side') c.heading = f.x >= c.x ? 0 : PI;
  else c.heading = lerpAngle(c.heading, atan2(f.y - c.y, f.x - c.x), 1 - exp(-dt * 4));
  return 0.9;
}

function hunt(c, sp, dt) {
  const [hx, hy] = headOf(c);
  let prey = null, bd = (UNIT * 22) ** 2;
  for (const o of creatures) {
    if (o.dying || o.ambient || !HUNTS[c.sp].includes(o.sp)) continue;
    const dx = o.x - hx, dy = o.y - hy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; prey = o; }
  }
  if (!prey) return 0;
  const catchR = max(UNIT * 1.2, scaleOf(prey) * 0.6);
  if (bd < catchR * catchR) {                   // caught!
    prey.dying = true;
    prey.caught = true;
    burst(prey.x, prey.y, styleOf(prey), 16, { speed: 150 });
    c.full = 10;
    sing(c, -2, { dur: 0.6, slide: 0.7 });
    return 0;
  }
  c.heading = lerpAngle(c.heading, atan2(prey.y - c.y, prey.x - c.x), 1 - exp(-dt * 2.5));
  return 1.6;
}

function fleePredators(c, sp, dt) {
  const R = UNIT * 11 + scaleOf(c);
  for (const o of creatures) {
    if (o.dying || o.full > 0 || !PREDATORS[c.sp].includes(o.sp)) continue;
    const dx = c.x - o.x, dy = c.y - o.y;
    if (dx * dx + dy * dy < R * R) {
      if (sp.mode === 'side') c.heading = dx >= 0 ? 0 : PI;
      else c.heading = lerpAngle(c.heading, atan2(dy, dx), 1 - exp(-dt * 5));
      c.boost = max(c.boost, 0.35);
      return;
    }
  }
}

// Returns false when the creature should be removed.
function updateCreature(c, dt, sdt) {
  const sp = SPECIES[c.sp];
  const ease = (k) => 1 - exp(-dt * k);

  c.alpha = c.dying ? c.alpha - dt * (c.caught ? 4 : 2) : min(1, c.alpha + dt * 1.5);
  if (c.dying && c.alpha <= 0) return false;

  c.clock += sdt;
  if (c.react) {
    c.react.t += dt;
    if (c.spin) c.heading += c.spin * dt;            // loop-the-loop
    if (c.sparkle) {                                  // leave a sparkle trail
      c.sparkAcc += c.sparkle * dt;
      while (c.sparkAcc >= 1) {
        c.sparkAcc -= 1;
        const r = scaleOf(c) * 0.6;
        burst(c.x + rand(-r, r), c.y + rand(-r, r), random() < 0.35 ? S_WHITE : styleOf(c), 1, { speed: 40, life: 0.9 });
      }
    }
    if (c.react.t >= c.react.dur) {
      c.react = null;
      c.zoomAmp = 0;
      c.spin = 0;
      c.sparkle = 0;
    }
  }
  c.zoom = c.zoomAmp ? c.zoomAmp * hump(reacting(c)) : 0;
  c.flash *= exp(-dt * 2);
  c.full = max(0, c.full - dt);

  // 1. wander
  if (sp.mode === 'side') {
    if (random() < sdt * 0.08) c.heading = c.heading === 0 ? PI : 0;
  } else {
    c.turn = clamp((c.turn + (random() - 0.5) * 6 * dt) * exp(-dt * 1.5), -1.5, 1.5);
    c.heading += c.turn * sp.agility * sdt;
    if (sp.mode === 'up') c.heading = lerpAngle(c.heading, -PI / 2, ease(0.8));
  }

  // 2. flocking
  if (tw.flocking && sp.flock && !c.dying) flock(c, sp, dt);

  // 3. food chain
  let paceMin = 0;
  if (tw.foodchain && !c.dying && !c.ambient) {
    if (sp.eats && food.length) paceMin = max(paceMin, seekFood(c, sp, dt));
    if (HUNTS[c.sp].length && c.full <= 0) paceMin = max(paceMin, hunt(c, sp, dt));
    if (PREDATORS[c.sp].length) fleePredators(c, sp, dt);
  }

  // 4. scatter away from a fast-moving cursor (a slow hover leaves them alone)
  if (tw.scatter && pointer.active && pointer.speed > SCATTER_SPEED && !c.react) {
    const dx = c.x - pointer.x, dy = c.y - pointer.y;
    const R = UNIT * 8 + scaleOf(c);
    if (dx * dx + dy * dy < R * R) {
      if (sp.mode === 'side') c.heading = dx >= 0 ? 0 : PI;
      else c.heading = lerpAngle(c.heading, atan2(dy, dx), ease(8));
      c.boost = min(1, c.boost + dt * 4);
    }
  }

  // 5. ripples push
  pushByRipples(c, dt, 1);
  c.boost *= exp(-dt * 1.2);

  // move
  if (sp.mode === 'side') c.heading = cos(c.heading) >= 0 ? 0 : PI;
  if (sp.sideView) {
    // seen from the side: swim mostly left/right, tilting at most ~23°
    const dir = cos(c.heading) >= 0 ? 0 : PI;
    c.heading = dir + clamp(lerpAngle(0, c.heading - dir, 1), -0.4, 0.4);
  }
  const pace = max(sp.pace(c.clock, c), c.boost, paceMin);
  const v = sp.speed * UNIT * pace * (1 + c.boost * 2.5) * tw.speed;
  c.x += cos(c.heading) * v * dt;
  c.y += sin(c.heading) * v * dt;

  const target = sp.mode === 'side' ? 0 : c.heading;
  c.angle = lerpAngle(c.angle, target, ease(6));

  // wrap around the screen edges
  const m = scaleOf(c) * sp.extent;
  if (c.x < -m) c.x = W + m; else if (c.x > W + m) c.x = -m;
  if (c.y < -m) c.y = H + m; else if (c.y > H + m) c.y = -m;

  // music: crossing into a new horizontal band plays that band's note
  if (Sound.enabled && !c.ambient && !c.dying) {
    const band = clamp(floor((c.y / H) * 8), 0, 7);
    if (band !== c.band) {
      if (c.band >= 0 && realTime - lastPassNote > 0.18 && random() < 0.5) {
        lastPassNote = realTime;
        sing(c, 7 - band, { vol: sp.voice.vol * 0.55 });
      }
      c.band = band;
    }
  }
  return true;
}

/* ---------- interaction ---------- */

// Which creature (if any) is under the point? Checks the real shape, not a box.
function creatureAt(x, y) {
  for (let i = creatures.length - 1; i >= 0; i--) {
    const c = creatures[i];
    if (c.dying) continue;
    const sp = SPECIES[c.sp];
    const u = scaleOf(c);
    const dx = x - c.x, dy = y - c.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > (u * sp.extent) ** 2) continue;
    const ca = cos(c.angle), sa = sin(c.angle);
    const lx = (dx * ca + dy * sa) / u;
    let ly = (-dx * sa + dy * ca) / u;
    if (sp.sideView && ca < 0) ly = -ly;
    // generous: anywhere on the body, or close to its centre, counts as a hit
    if (sp.shape(lx, ly, c.clock, c) > 0.1 || d2 < max(u * 0.75, 18) ** 2) return c;
  }
  return null;
}

function react(c) {
  const sp = SPECIES[c.sp];
  if (c.react || !sp.react) return;
  c.react = { t: 0, dur: sp.react.dur };
  sp.react.start(c);
}

/* ---------- render ---------- */

function rasterize(c, writeTrail) {
  const sp = SPECIES[c.sp];
  const unit = scaleOf(c);
  const R = unit * sp.extent;
  const c0 = max(0, floor((c.x - R) / cell));
  const c1 = min(cols - 1, floor((c.x + R) / cell));
  const r0 = max(0, floor((c.y - R) / cell));
  const r1 = min(rows - 1, floor((c.y + R) / cell));
  if (c0 > c1 || r0 > r1) return;

  const boost = !sp.selfFlash && c.flash > 0.02 ? 1 + c.flash : 1;
  const main = styleOf(c);
  const ca = cos(c.angle), sa = sin(c.angle), inv = 1 / unit;
  // side-view animals flip when swimming left so their belly stays down
  const flip = sp.sideView && ca < 0 ? -1 : 1;
  for (let r = r0; r <= r1; r++) {
    const py = (r + 0.5) * cell - c.y;
    for (let col = c0; col <= c1; col++) {
      const px = (col + 0.5) * cell - c.x;
      // rotate the cell centre into the creature's own space
      const lx = (px * ca + py * sa) * inv;
      const ly = (-px * sa + py * ca) * inv * flip;
      TONE = 0;                          // the shape may change this
      let d = sp.shape(lx, ly, c.clock, c) * c.alpha;
      if (d <= 0.02) continue;
      if (boost > 1) d = min(1, d * boost);
      const idx = r * cols + col;
      if (d > dens[idx]) {
        dens[idx] = d;
        owner[idx] = TONE ? styleOf(c, TONE) : main;
      }
      if (writeTrail && d > 0.35 && d > trail[idx]) {
        trail[idx] = d * 0.9;
        trailOwner[idx] = main;
      }
    }
  }
}

function putFx(px, py, v, style, kind) {
  const col = floor(px / cell), row = floor(py / cell);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return;
  const i = row * cols + col;
  if (v > fx[i]) {
    fx[i] = v;
    fxStyle[i] = style;
    fxKind[i] = kind;
  }
}

function rasterizeEffects() {
  for (const r of ripples) {
    const steps = max(12, ceil((TAU * r.r) / (cell * 0.8)));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * TAU;
      const ca = cos(a), sa = sin(a);
      const wob = 0.75 + 0.25 * sin(a * 7 + r.r * 0.05);
      for (let o = -1; o <= 1; o++) {
        const rr = r.r + o * cell;
        const v = r.life * r.strength * wob * (o === 0 ? 1 : 0.45);
        putFx(r.x + ca * rr, r.y + sa * rr, v, S_WATER, K_WATER);
      }
      if (r.r > 40) putFx(r.x + ca * r.r * 0.62, r.y + sa * r.r * 0.62, r.life * r.strength * wob * 0.4, S_WATER, K_WATER);
    }
  }
  for (const p of particles) {
    const v = p.life / p.max;
    if (p.kind === K_INK) {           // ink clouds are 3x3 cells
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          putFx(p.x + dx * cell, p.y + dy * cell, v * (dx || dy ? 0.6 : 1), p.style, K_INK);
        }
      }
    } else {
      putFx(p.x, p.y, v, p.style, p.kind);
    }
  }
  for (const f of food) {
    const v = min(1, f.life / 3) * (0.8 + 0.2 * sin(realTime * 4 + f.seed));
    putFx(f.x, f.y, v, S_FOOD, K_FOOD);
  }
}

function drawGlow() {
  ctx.globalCompositeOperation = 'lighter';
  for (const c of creatures) {
    const sp = SPECIES[c.sp];
    const r = scaleOf(c) * sp.extent * 1.1;
    const a = min(0.6, 0.14 * c.alpha * ((sp.glow ? sp.glow(c) : 1) + c.flash * 2));
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
    g.addColorStop(0, STYLES[styleOf(c)].glow + a.toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawCells() {
  const tick = floor(gt * 8);                 // glyph shimmer rate
  const gap = cell > 14 ? 1 : cell > 9 ? 0.5 : 0.25;
  const tile = cell - gap * 2;
  const half = cell / 2;
  const { ramp, trail: trailChars, spark, food: foodChars, water } = G;
  const lastGlyph = ramp.length - 1;

  for (let r = 0; r < rows; r++) {
    const y = r * cell;
    const ty = y + half + 1;
    for (let col = 0; col < cols; col++) {
      const idx = r * cols + col;
      const x = col * cell;
      const tx = x + half;

      // 1. creatures
      const d = dens[idx];
      if (d > 0.06) {
        const st = STYLES[owner[idx]];
        const lvl = min(LEVELS - 1, floor(d * LEVELS));
        const sparkCell = d > 0.9 && hash(idx, 11) > 0.9;
        let gi = floor(d * lastGlyph + (hash(idx, tick) - 0.5) * 1.6);
        gi = gi < 0 ? 0 : gi > lastGlyph ? lastGlyph : gi;
        if (d > 0.28) {
          ctx.fillStyle = sparkCell ? SPARK_BG : st.bg[lvl];
          ctx.fillRect(x + gap, y + gap, tile, tile);
        }
        ctx.fillStyle = sparkCell ? SPARK_FG : st.fg[lvl];
        ctx.fillText(ramp[gi], tx, ty);
        continue;
      }

      // 2. effects
      const f = fx[idx];
      if (f > 0.05) {
        const st = STYLES[fxStyle[idx]];
        const lvl = min(LEVELS - 1, floor(f * LEVELS));
        const kind = fxKind[idx];
        if (kind === K_INK) {
          ctx.fillStyle = st.bg[lvl];
          ctx.fillRect(x + gap, y + gap, tile, tile);
          ctx.fillStyle = st.fg[lvl];
          ctx.fillText(ramp[min(lastGlyph, floor(f * 3))], tx, ty);
        } else if (kind === K_FOOD) {
          ctx.fillStyle = st.bg[lvl];
          ctx.fillRect(x + gap, y + gap, tile, tile);
          ctx.fillStyle = st.fg[LEVELS - 1];
          ctx.fillText(foodChars[0], tx, ty);
        } else if (kind === K_SPARK) {
          if (f > 0.55) {
            ctx.fillStyle = st.bg[lvl];
            ctx.fillRect(x + gap, y + gap, tile, tile);
          }
          ctx.fillStyle = st.fg[lvl];
          ctx.fillText(spark[floor(hash(idx, tick) * spark.length)], tx, ty);
        } else {
          ctx.fillStyle = st.fg[lvl];
          ctx.fillText(water[min(water.length - 1, floor(f * water.length))], tx, ty);
        }
        continue;
      }

      // 3. trails
      if (tw.trails) {
        const t = trail[idx];
        if (t > 0.1 && hash(idx, 7) < 0.2) {
          ctx.fillStyle = STYLES[trailOwner[idx]].tr[min(LEVELS - 1, floor(t * LEVELS))];
          ctx.fillText(trailChars[floor(hash(idx, 3) * trailChars.length)], tx, ty);
        }
      }
    }
  }

  // 4. twinkling stars at night
  if (night) {
    for (const i of stars) {
      if (dens[i] > 0.06 || fx[i] > 0.05) continue;
      const tv = 0.5 + 0.5 * sin(realTime * 1.5 + hash(i, 5) * 20);
      ctx.fillStyle = STAR[floor(tv * (LEVELS - 1))];
      ctx.fillText(tv > 0.85 ? '+' : '.', (i % cols) * cell + half, floor(i / cols) * cell + half + 1);
    }
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);
  dens.fill(0);
  fx.fill(0);
  if (tw.glow) drawGlow();
  const writeTrail = tw.trails && !paused;
  for (const c of creatures) rasterize(c, writeTrail);
  rasterizeEffects();
  drawCells();
}

let hoverTick = 0;
function frame(now) {
  requestAnimationFrame(frame);
  // Low power: draw ~30 times a second instead of ~60 (half the CPU/battery).
  // (Chrome already stops animation completely while the tab is hidden.)
  if (tw.lowpower && now - lastTime < 30) return;
  const dt = min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  pointer.speed *= exp(-dt * 5); // a mouse that stops counts as slow again
  if (!paused) update(dt);
  render();
  // show a hand cursor when hovering an animal (checked every few frames)
  if (pointer.active && ++hoverTick % 6 === 0) {
    canvas.style.cursor = creatureAt(pointer.x, pointer.y) ? 'pointer' : 'crosshair';
  }
}

/* ---------- UI ---------- */

const $ = (id) => document.getElementById(id);
const root = document.documentElement;

function applyAccent() {
  root.style.setProperty('--accent-rgb', SPECIES[SPECIES_INDEX[tw.select]].hi.join(','));
}

function buildNav() {
  const nav = $('species');
  NAV.forEach((item, n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pill';
    b.dataset.key = item.id;
    b.title = n < 9 ? `${item.name} (${n + 1})` : item.name;
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = rgba(SPECIES[SPECIES_INDEX[item.id]].hi, 1);
    b.append(dot, item.name);
    b.addEventListener('click', () => setSelection(item.id));
    nav.appendChild(b);
  });
  // mouse wheel scrolls the picker sideways
  nav.addEventListener('wheel', (e) => {
    if (abs(e.deltaY) > abs(e.deltaX)) {
      nav.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });
}

function markNav() {
  const nav = $('species');
  for (const b of nav.querySelectorAll('.pill')) {
    const on = b.dataset.key === tw.select;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
    // scroll only the picker (not the page) so the active pill is centred
    if (on) nav.scrollTo({ left: b.offsetLeft - nav.clientWidth / 2 + b.offsetWidth / 2, behavior: 'smooth' });
  }
}

function setSelection(id) {
  if (id === tw.select) return;
  tw.select = id;
  refreshPopulation();
  markNav();
  applyAccent();
  buildStyleSeg();
  save();
}

function stepSelection(dir) {
  const i = NAV.findIndex((n) => n.id === tw.select);
  setSelection(NAV[(i + dir + NAV.length) % NAV.length].id);
}

/* tweaks panel */
const SLIDERS = {
  count: (v) => String(v),
  speed: (v) => v.toFixed(1) + '×',
  cell: (v) => v + 'px',
};

function buildSeg(el, options, onPick) {
  for (const [value, label] of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.value = value;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => onPick(value));
    el.appendChild(b);
  }
}

function markSeg(el, value) {
  for (const b of el.children) {
    const on = b.dataset.value === value;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  }
}

function setGlyphs(key) {
  tw.glyphs = key;
  G = glyphSet(key);
  markSeg($('glyphs'), key);
  save();
}

function setTime(value) {
  tw.time = value;
  markSeg($('time'), value);
  applyTime();
  save();
}

// The Style buttons always show the styles of the animal picked in the top bar.
function buildStyleSeg() {
  const sp = SPECIES[SPECIES_INDEX[tw.select]];
  const el = $('astyle');
  el.replaceChildren();
  $('styleFor').textContent = sp.name;
  $('styleField').hidden = !sp.styles;
  if (!sp.styles) return;
  buildSeg(el, [['mix', 'Mix'], ...sp.styles.map((s) => [s.id, s.name])], setAnimalStyle);
  markSeg(el, tw.styles[sp.id] || 'mix');
}

function setAnimalStyle(value) {
  if (value === 'mix') delete tw.styles[tw.select];
  else tw.styles[tw.select] = value;
  markSeg($('astyle'), value);
  refreshDesigns();   // existing animals switch straight away
  save();
}

function cycleAnimalStyle() {
  const sp = SPECIES[SPECIES_INDEX[tw.select]];
  if (!sp.styles) return;
  const ids = ['mix', ...sp.styles.map((s) => s.id)];
  setAnimalStyle(ids[(ids.indexOf(tw.styles[sp.id] || 'mix') + 1) % ids.length]);
}

function setSound(on) {
  tw.sound = on;
  $('sound').checked = on;
  Sound.setEnabled(on).then(() => {
    if (tw.sound) Sound.tone({ f: Sound.freq(4, 1), dur: 0.6, vol: 0.05 });
  });
  save();
}

function syncTweaksUI() {
  for (const key of Object.keys(SLIDERS)) {
    $(key).value = tw[key];
    $(key + 'Out').textContent = SLIDERS[key](tw[key]);
  }
  for (const key of TOGGLES) $(key).checked = tw[key];
  markSeg($('glyphs'), tw.glyphs);
  markSeg($('time'), tw.time);
  markSeg($('unit'), tw.unit);
  $('city').value = tw.city;
  buildStyleSeg();
  document.body.classList.toggle('grid', tw.grid);
}

function bindTweaks() {
  buildSeg($('glyphs'), Object.entries(GLYPH_SETS).map(([k, g]) => [k, g.name]), setGlyphs);
  buildSeg($('time'), TIMES, setTime);
  buildSeg($('unit'), UNITS, (v) => {
    tw.unit = v;
    markSeg($('unit'), v);
    save();
    refreshWeather(true);
  });
  // 'change' fires when you press Enter or click away
  $('city').addEventListener('change', (e) => {
    tw.city = e.target.value.trim().slice(0, 60);
    save();
    refreshWeather(true);
  });

  for (const key of Object.keys(SLIDERS)) {
    $(key).addEventListener('input', (e) => {
      tw[key] = parseFloat(e.target.value);
      $(key + 'Out').textContent = SLIDERS[key](tw[key]);
      if (key === 'cell') resize();
      if (key === 'count') { trimPopulation(); fillPopulation(); }
      save();
    });
  }
  for (const key of TOGGLES) {
    $(key).addEventListener('change', (e) => {
      if (key === 'sound') return setSound(e.target.checked);
      tw[key] = e.target.checked;
      if (key === 'grid') document.body.classList.toggle('grid', tw.grid);
      if (key === 'trails' && !tw.trails) trail.fill(0);
      if (key === 'foodchain' && !tw.foodchain) food.length = 0;
      if (WIDGET_TOGGLES.includes(key)) applyWidgets();
      save();
    });
  }
  $('resetTweaks').addEventListener('click', () => {
    tw = sanitize({ ...DEFAULTS, select: tw.select, name: tw.name, city: tw.city, unit: tw.unit });
    G = glyphSet(tw.glyphs);
    syncTweaksUI();
    refreshDesigns();
    applyWidgets();
    Sound.setEnabled(tw.sound);
    resize();
    applyTime(true);
    save();
  });
  $('tweaksBtn').addEventListener('click', () => toggleTweaks());
  $('helpBtn').addEventListener('click', () => toggleHelp());
  $('weather').addEventListener('click', () => {
    toggleTweaks(true);
    $('city').focus();
  });
  $('quote').addEventListener('click', () => {
    quoteOffset++;
    showQuote();
  });
}

// Tweaks and Help share the same spot, so opening one closes the other.
function togglePanel(id, btnId, force) {
  const panel = $(id);
  const open = force ?? panel.hidden;
  panel.hidden = !open;
  $(btnId).setAttribute('aria-expanded', String(open));
  if (open) {
    const other = id === 'tweaks' ? ['help', 'helpBtn'] : ['tweaks', 'tweaksBtn'];
    $(other[0]).hidden = true;
    $(other[1]).setAttribute('aria-expanded', 'false');
  }
}
const toggleTweaks = (force) => togglePanel('tweaks', 'tweaksBtn', force);
const toggleHelp = (force) => togglePanel('help', 'helpBtn', force);

function setPaused(p) {
  paused = p;
  $('pausedBadge').hidden = !p;
}

/* ---------- clock, quote, weather ---------- */

function updateClock() {
  const d = new Date();
  let h = d.getHours();
  if (!tw.clock24) h = h % 12 || 12;
  const hh = tw.clock24 ? String(h).padStart(2, '0') : String(h);
  $('clock').textContent = `${hh}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// One quote per day (same for the whole day); clicking adds an offset.
let quoteOffset = 0;
function showQuote() {
  const d = new Date();
  const day = floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5) + d.getFullYear() * 7;
  const [text, by] = QUOTES[(day + quoteOffset) % QUOTES.length];
  $('quoteText').textContent = `“${text}”`;
  $('quoteBy').textContent = by;
}

async function refreshWeather(force = false) {
  const el = $('weather');
  const status = $('weatherStatus');
  el.hidden = !tw.showWeather;
  if (!tw.showWeather) return;

  if (!tw.city) {
    $('weatherIcon').textContent = '☀';
    $('weatherTemp').textContent = 'Weather';
    $('weatherCity').textContent = 'Set your city';
    el.title = 'Click to set your city';
    status.textContent = 'Type your city above and press Enter to show the weather.';
    return;
  }
  try {
    if (force) status.textContent = 'Loading weather…';
    const w = await Weather.get(tw.city, tw.unit, force);
    const [icon, label] = Weather.describe(w.code, w.isDay);
    const temp = `${round(w.temp)}°`;
    $('weatherIcon').textContent = icon;
    $('weatherTemp').textContent = temp;
    $('weatherCity').textContent = w.name;
    el.title = `${label} in ${w.name} — click to change city`;
    status.textContent = `${label}, ${temp}${tw.unit.toUpperCase()} in ${w.name}. Weather by Open-Meteo.`;
  } catch (err) {
    $('weatherTemp').textContent = '--°';
    $('weatherCity').textContent = tw.city;
    status.textContent = err.message === 'notfound'
      ? `Couldn't find “${tw.city}”. Try another spelling or a nearby city.`
      : 'Weather is unavailable right now (are you offline?).';
  }
}

function applyWidgets() {
  $('clock').hidden = !tw.showClock;
  $('quote').hidden = !tw.showQuote;
  updateClock();
  refreshWeather();
}

/* greeting + editable name */
function updateGreeting() {
  const h = new Date().getHours();
  $('greet').textContent =
    h < 5 ? 'Good night' :
    h < 12 ? 'Good morning' :
    h < 17 ? 'Good afternoon' :
    h < 22 ? 'Good evening' : 'Good night';
}

function bindName() {
  const el = $('name');
  el.textContent = tw.name;
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.blur();
    }
  });
  el.addEventListener('blur', () => {
    const v = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 24) || DEFAULTS.name;
    el.textContent = v;
    tw.name = v;
    save();
  });
}

// As a Chrome extension, search with the user's own default search engine
// (the Chrome Web Store requires this). As a normal web page, fall back to Google.
function webSearch(q) {
  if (window.chrome && chrome.search && chrome.search.query) {
    chrome.search.query({ text: q, disposition: 'CURRENT_TAB' });
  } else {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank', 'noopener');
  }
}

/* search: animal names, "day"/"night", character sets — else web search */
function bindSearch() {
  const input = $('q');
  $('search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const lower = q.toLowerCase();
    const hit = NAV.find((n) => lower === n.id || lower === n.name.toLowerCase() || lower === n.id + 's');
    if (hit) setSelection(hit.id);
    else if (TIMES.some(([v]) => v === lower)) setTime(lower);
    else if (GLYPH_SETS[lower]) setGlyphs(lower);
    else webSearch(q);
    input.value = '';
  });
}

/* keyboard shortcuts */
function bindKeys() {
  window.addEventListener('keydown', (e) => {
    Sound.unlock();
    const t = e.target;
    const typing = t.tagName === 'INPUT' || t.isContentEditable;
    if (e.key === 'Escape') {
      if (typing) t.blur();
      toggleTweaks(false);
      toggleHelp(false);
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    const k = e.key.toLowerCase();
    if (e.key >= '1' && e.key <= '9') setSelection(NAV[Number(e.key) - 1].id);
    else if (e.key === 'ArrowRight') stepSelection(1);
    else if (e.key === 'ArrowLeft') stepSelection(-1);
    else if (e.key === ' ' && t === document.body) { e.preventDefault(); setPaused(!paused); }
    else if (k === 'h') document.body.classList.toggle('ui-hidden');
    else if (k === 't') toggleTweaks();
    else if (k === 'm') setSound(!tw.sound);
    else if (k === 's') cycleAnimalStyle();
    else if (k === 'g') {
      const keys = Object.keys(GLYPH_SETS);
      setGlyphs(keys[(keys.indexOf(tw.glyphs) + 1) % keys.length]);
    } else if (k === 'n') {
      const i = TIMES.findIndex(([v]) => v === tw.time);
      setTime(TIMES[(i + 1) % TIMES.length][0]);
    } else if (e.key === '?') toggleHelp();
    else if (e.key === '/') { e.preventDefault(); $('q').focus(); }
  });
}

/* pointer: click an animal = react, click water = ripple + food, shift+click = spawn */
function bindPointer() {
  window.addEventListener('pointermove', (e) => {
    const now = performance.now();
    if (pointer.active && pointer.t) {
      const secs = max(8, now - pointer.t) / 1000;
      const v = sqrt((e.clientX - pointer.x) ** 2 + (e.clientY - pointer.y) ** 2) / secs;
      pointer.speed = pointer.speed * 0.5 + v * 0.5;
    }
    pointer.t = now;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  }, { passive: true });
  root.addEventListener('mouseleave', () => { pointer.active = false; });
  window.addEventListener('blur', () => { pointer.active = false; });
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse') pointer.active = false;
  });

  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    const x = e.clientX, y = e.clientY;

    const hit = creatureAt(x, y);
    if (hit) {
      react(hit);
      return;
    }
    if (e.shiftKey) {
      if (creatures.length < MAX_CREATURES) spawnGroup(pickSpecies(), { x, y });
      return;
    }
    addRipple(x, y, 1);
    if (tw.foodchain) dropFood(x, y);
    Sound.tone({ f: Sound.freq(7 - clamp(floor((y / H) * 8), 0, 7), 0), dur: 1.4, vol: 0.06, pan: (x / W) * 2 - 1 });
  });
}

/* ---------- boot ---------- */

buildNav();
bindTweaks();
syncTweaksUI();
bindName();
bindSearch();
bindKeys();
bindPointer();
updateGreeting();
setInterval(() => { updateGreeting(); applyTime(); }, 30_000);
showQuote();
applyWidgets();
setInterval(updateClock, 1000);
setInterval(() => refreshWeather(), 10 * 60 * 1000); // uses the 30-minute cache

resize();
markNav();
applyAccent();
applyTime(true);
if (tw.sound) Sound.setEnabled(true);

window.addEventListener('resize', resize);

requestAnimationFrame(frame);
