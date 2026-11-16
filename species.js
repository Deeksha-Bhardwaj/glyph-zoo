'use strict';

/* =============================================================
   species.js — every animal, its styles, and the character sets.

   Each animal is a "density field": shape(x, y, t, c) returns 0..1
   for a point in the creature's own space (x = forward, y = sideways,
   ~1 unit = half its size). t is the creature's clock, c the creature.
   A shape can also set TONE to colour a point differently
   (0 = main colour, 1 = accent, 2 = white/light, 3+ = extra tones).

   Species fields
     size      half-size in UNITs (18px)
     extent    how far the shape reaches (local units) — bounding box
     speed     UNITs per second at pace 1
     agility   how much it wanders / turns
     mode      'free' | 'up' (drifts upward)
     sideView  drawn from the side (belly stays down, swims left/right)
     palettes  colour sets: { base, hi, accent } or { tones: [[base, hi], ...] }
     styles    designs you can pick in Tweaks: { id, name, palette? }.
               The shape reads c.design (index into styles). If a style names
               a palette it uses those colours; otherwise a random palette.
     slot      how much of the "Creatures" count one individual uses
     group     spawns in groups of this size
     flock     Boids settings: r = neighbour radius, sep = personal space
               (both in UNITs), align / coh / sepW = rule strengths
     eats      swims to food you drop
     voice     sound: oscillator type, octave, note length, volume
     glow(c)   optional glow multiplier
     pace(t, c)        speed multiplier over time (darts, pulses)
     react.start(c)    what happens when you click it (lasts react.dur s)

   Functions such as burst(), addRipple(), sing(), styleOf() and toWorld()
   live in main.js; they're only called at runtime, after all files load.
   ============================================================= */

const shimmer = (x, v, t) => 0.5 + 0.5 * sin(x * 6 - v * 4 + t * 2.5); // iridescent sweep

/* =============================================================
   BUTTERFLY wing designs
   Each takes (x, v, t) in un-squashed wing space and returns density,
   setting TONE: 0 = pink, 1 = dark accent, 2 = white/pale.
   "inside" = how deep inside the wing (1 centre, 0 edge) drives borders.
   ============================================================= */

const foreWing = (x, v) => rell(x, v, 0.26, 0.5, 0.56, 0.32, 1.08);  // points out & forward
const hindWing = (x, v) => rell(x, v, -0.2, 0.42, 0.44, 0.3, -1.15); // points out & back
const rootAngle = (x, v) => atan2(v - 0.02, x);                       // angle around the wing root

// Classic: dark border with white spots, veins, a hind-wing eye spot, small tails.
function wingClassic(x, v, t) {
  const inside = max(foreWing(x, v), hindWing(x, v));
  if (inside <= 0) {
    const tail = seg(x, v, -0.38, 0.62, -0.72, 0.86, 0.08);
    if (tail > 0) { TONE = 1; return tail * 0.7; }
    return 0;
  }
  const ang = rootAngle(x, v);
  if (inside < 0.3) {
    const spot = inside > 0.08 && inside < 0.24 && sin(ang * 22) > 0.55;
    TONE = spot ? 2 : 1;
    return spot ? 1 : 0.55;
  }
  const er = sqrt((x + 0.24) ** 2 + (v - 0.5) ** 2);
  if (er < 0.13) { TONE = er < 0.05 ? 2 : 1; return er < 0.05 ? 1 : 0.65; }
  if (abs(sin(ang * 9)) < 0.16) { TONE = 1; return 0.5; }
  return 0.6 + 0.4 * shimmer(x, v, t) * inside;
}

// Swallowtail: long pointed fore wings, tiger stripes, long clubbed tails.
function wingSwallowtail(x, v, t) {
  const fore = rell(x, v, 0.3, 0.56, 0.66, 0.26, 1.0);
  const hind = rell(x, v, -0.17, 0.4, 0.4, 0.27, -1.25);
  const inside = max(fore, hind);
  if (inside <= 0) {
    const tail = max(seg(x, v, -0.32, 0.6, -0.92, 0.98, 0.075), ell(x, v, -0.95, 1.0, 0.07, 0.07));
    if (tail > 0) { TONE = 1; return 0.8 * tail; }
    return 0;
  }
  if (inside < 0.22) {
    const crescent = hind > 0.06 && hind < 0.18 && sin(atan2(v, x) * 16) > 0.3; // pale crescents
    TONE = crescent ? 2 : 1;
    return crescent ? 0.9 : 0.6;
  }
  if (sin(x * 16 + v * 3) > 0.45) { TONE = 1; return 0.6; }  // tiger stripes
  return 0.65 + 0.35 * shimmer(x, v, t) * inside;
}

// Glasswing: see-through wings — only the rim, veins and white tips show.
function wingGlasswing(x, v, t) {
  const fore = foreWing(x, v);
  const inside = max(fore, hindWing(x, v));
  if (inside <= 0) return 0;
  if (inside < 0.16) { TONE = 1; return 0.85; }                       // dark rim
  if (fore > 0 && fore < 0.45 && x > 0.3) { TONE = 2; return 0.75; }   // white band at the tip
  if (abs(sin(rootAngle(x, v) * 7)) < 0.13) { TONE = 1; return 0.6; }  // veins
  return 0.1 + 0.15 * shimmer(x, v, t);                                // glassy
}

// Peacock: big ringed eye spots on every wing.
function wingPeacock(x, v, t) {
  const inside = max(rell(x, v, 0.26, 0.52, 0.58, 0.36, 1.08), rell(x, v, -0.2, 0.42, 0.46, 0.33, -1.15));
  if (inside <= 0) return 0;
  if (inside < 0.14) { TONE = 1; return 0.7; }
  const e = min(sqrt((x - 0.38) ** 2 + (v - 0.72) ** 2), sqrt((x + 0.26) ** 2 + (v - 0.55) ** 2));
  if (e < 0.05) { TONE = 2; return 1; }    // white pupil
  if (e < 0.1) { TONE = 1; return 0.9; }   // dark ring
  if (e < 0.15) { TONE = 0; return 1; }    // bright pink ring
  if (e < 0.19) { TONE = 2; return 0.75; } // pale outer ring
  return 0.5 + 0.35 * shimmer(x, v, t) * inside;
}

// Stained glass: thick dark veins and cross-veins make little "window panes".
function wingStained(x, v, t) {
  const inside = max(foreWing(x, v), hindWing(x, v));
  if (inside <= 0) return 0;
  const ang = rootAngle(x, v);
  if (inside < 0.26) {
    const spot = inside > 0.07 && inside < 0.2 && sin(ang * 26) > 0.5;
    TONE = spot ? 2 : 1;
    return spot ? 1 : 0.7;
  }
  const rr = sqrt(x * x + (v - 0.02) ** 2);
  if (abs(sin(ang * 7)) < 0.22 || abs(sin(rr * 11)) < 0.14) { TONE = 1; return 0.75; }
  return 0.7 + 0.3 * shimmer(x, v, t);
}

// Silk: no markings — pale near the body fading to rich pink, with a glowing edge.
function wingSilk(x, v, t) {
  const inside = max(foreWing(x, v), hindWing(x, v));
  if (inside <= 0) return 0;
  if (inside < 0.07) { TONE = 2; return 0.85; }
  const rr = sqrt(x * x + (v - 0.02) ** 2);
  if (rr < 0.35) { TONE = 2; return 0.55 + 0.3 * (1 - rr / 0.35); }
  return 0.45 + 0.55 * shimmer(x, v, t) * (0.4 + 0.6 * inside);
}

const BUTTERFLY_WINGS = [wingClassic, wingSwallowtail, wingGlasswing, wingPeacock, wingStained, wingSilk];

/* =============================================================
   KOI helpers
   ============================================================= */

// Which colour a point on a koi's body gets, per variety (c.design).
// Patches come from a few overlapping sine waves offset by the fish's seed,
// so every fish has its own unique markings.
function koiPattern(design, x, y, s) {
  if (design === 4 || design === 5) return 0;                    // Ogon / Platinum: solid metallic
  if (design === 3) {                                            // Tancho: one red dot on the head
    const dx = x - 0.48;
    return dx * dx + y * y < 0.15 * 0.15 ? 0 : 2;
  }
  const n = sin(x * 6.5 + s) + sin(y * 9 + s * 1.7) + sin((x - y) * 5 + s * 2.3);
  if (design === 2) {                                            // Showa: mostly black, red and white
    const b = sin(x * 5 + s * 1.3) + sin(y * 8 + s * 2.1) + sin((x + y) * 4 + s);
    if (b > 0.4) return 3;
    return n > 0.3 ? 0 : 2;
  }
  if (design === 1 && sin(x * 14 + s * 3) * sin(y * 17 + s) > 0.7) return 3; // Sanke: black spots
  if (n > 0.5 || (x > 0.42 && n > -0.4)) return 0;               // red patches (and usually a red head)
  return 2;                                                      // white body
}

// Long, flowing, see-through fins (like "butterfly koi").
function koiFins(x, yy, ay, t) {
  let f = 0;
  const pf = rell(x, ay, 0.22 - 0.05 * sin(t * 3), 0.36, 0.26, 0.11, -0.75); // pectoral fins
  if (pf > 0) f = 0.35 + 0.25 * pf;
  if (rell(x, ay, -0.3, 0.22, 0.15, 0.07, -0.6) > 0) f = max(f, 0.35);       // pelvic fins
  const tx = x + 0.8;                                                          // tail fan
  if (tx < 0 && tx > -0.62) {
    const len = -tx;
    const spread = 0.12 + len * 0.75;
    const wy = yy - 0.08 * sin(t * 5 + len * 6) * len;
    if (abs(wy) < spread) {
      const ray = 0.75 + 0.25 * cos(atan2(wy, len) * 18);
      f = max(f, (0.55 - len * 0.45) * ray);
    }
  }
  return f;
}

const KOI_FIN = [[110, 120, 140], [225, 232, 245]];
const KOI_WHITE = [[200, 200, 210], [255, 252, 246]];
const KOI_BLACK = [[12, 12, 18], [60, 60, 72]];
const KOI_RED = [[200, 45, 25], [255, 135, 95]];

/* =============================================================
   JELLYFISH designs: tentacle layout per style
   ============================================================= */
const range = (a, b, step) => Array.from({ length: round((b - a) / step) + 1 }, (_, i) => a + i * step);
const JELLY_DESIGNS = [
  { y0: range(-0.45, 0.45, 0.15), len: 1.3, r: 0.09, amp: 0.1 },   // Moon
  { y0: range(-0.48, 0.48, 0.08), len: 1.85, r: 0.07, amp: 0.14 }, // Lion's mane
  { y0: range(-0.5, 0.5, 0.1), len: 0.9, r: 0.05, amp: 0.06 },     // Crystal
  { y0: [-0.46, -0.16, 0.16, 0.46], len: 1.6, r: 0.065, amp: 0.05 }, // Box
];

const WING_PALE = [[150, 200, 210], [230, 250, 255]];

const SPECIES = [
  /* ---------------- Butterfly ---------------- */
  {
    id: 'butterfly', name: 'Butterfly',
    base: [225, 85, 160], hi: [255, 200, 235],
    palettes: [ // three pinks, picked at random
      { base: [215, 70, 150],  hi: [255, 195, 235], accent: [[55, 18, 55], [150, 80, 150]] },
      { base: [235, 105, 170], hi: [255, 212, 236], accent: [[70, 25, 60], [165, 90, 140]] },
      { base: [200, 50, 140],  hi: [255, 160, 215], accent: [[50, 12, 45], [140, 60, 130]] },
    ],
    styles: [
      { id: 'classic', name: 'Classic' },
      { id: 'swallowtail', name: 'Swallow' },
      { id: 'glasswing', name: 'Glass' },
      { id: 'peacock', name: 'Peacock' },
      { id: 'stained', name: 'Stained' },
      { id: 'silk', name: 'Silk' },
    ],
    size: 4, extent: 1.25, speed: 3.6, agility: 2.4,
    voice: { type: 'sine', oct: 1, dur: 0.9, vol: 0.05 },
    pace: (t) => 0.6 + 0.6 * abs(sin(t * 3.5)),
    shape(x, y, t, c) {
      const flap = c.react ? 2.2 : 1;
      const w = 0.16 + 0.84 * abs(cos(t * 6 * flap)); // flap = squash wings sideways
      const ay = abs(y);
      const v = ay / w;                                // un-squashed wing coordinate

      let d = BUTTERFLY_WINGS[c.design](x, v, t);
      if (d > 0 && TONE !== 2) d *= 0.6 + 0.4 * w;    // darker when edge-on

      const body = max(
        ell(x, y, 0.12, 0, 0.2, 0.1),
        seg(x, y, -0.02, 0, -0.62, 0, 0.08),
        ell(x, y, 0.36, 0, 0.1, 0.1)
      );
      if (body > 0.25) {
        d = 0.7 + 0.3 * body;
        TONE = x < 0 && sin(x * 34) > 0.4 ? 0 : 1;   // striped abdomen
      }
      const ant = max(seg(x, ay, 0.4, 0.03, 0.82, 0.24, 0.055), ell(x, ay, 0.86, 0.26, 0.06, 0.06));
      if (ant > 0.2 && ant > d) { d = ant; TONE = 1; }
      return d;
    },
    react: {
      dur: 1.6,
      start(c) { // loop-the-loop with a sparkle trail
        c.spin = 6;
        c.sparkle = 30;
        burst(c.x, c.y, styleOf(c), 26, { speed: 240 });
        burst(c.x, c.y, S_WHITE, 12, { speed: 160 });
        sing(c, 4); sing(c, 7, { at: 0.08 }); sing(c, 9, { at: 0.16 }); sing(c, 11, { at: 0.24 });
      },
    },
  },

  /* ---------------- Koi: real koi varieties ---------------- */
  {
    id: 'koi', name: 'Koi',
    base: [226, 112, 28], hi: [255, 214, 150],
    palettes: [
      { tones: [KOI_RED, KOI_FIN, KOI_WHITE, KOI_BLACK] },                                              // red & white
      { tones: [[[205, 150, 30], [255, 232, 150]], [[150, 120, 50], [255, 225, 150]], [[205, 150, 30], [255, 232, 150]], [[60, 45, 15], [130, 100, 40]]] }, // gold
      { tones: [[[150, 160, 175], [248, 250, 255]], KOI_FIN, KOI_WHITE, KOI_BLACK] },                  // platinum
    ],
    styles: [
      { id: 'kohaku', name: 'Kohaku', palette: 0 },     // red patches on white
      { id: 'sanke', name: 'Sanke', palette: 0 },       // + black spots
      { id: 'showa', name: 'Showa', palette: 0 },       // mostly black, red and white
      { id: 'tancho', name: 'Tancho', palette: 0 },     // white with a red crown
      { id: 'ogon', name: 'Ogon', palette: 1 },         // solid gold
      { id: 'platinum', name: 'Platinum', palette: 2 }, // solid silver-white
    ],
    size: 6, extent: 1.45, speed: 3, agility: 1.2, eats: true,
    flock: { r: 18, sep: 8, align: 0.8, coh: 0.7, sepW: 1.6 },
    voice: { type: 'triangle', oct: 0, dur: 0.9, vol: 0.06 },
    pace: (t) => 0.8 + 0.25 * sin(t * 1.7),
    shape(x, y, t, c) {
      const bend = 0.15 * sin(x * 2.6 - t * 5) * (0.55 - x * 0.55); // swimming wave
      const yy = y - bend;
      const ay = abs(yy);
      let d = 0;
      if (x > -0.85 && x < 0.83) {                                  // body: round head, slim tail
        const u = (x - 0.05) / 0.78;
        let half = 0.27 * sqrt(max(0, 1 - u * u));
        if (x < 0) half *= 1 + x * 0.45;
        if (ay < half) {
          const edge = 1 - ay / half;
          d = 0.7 + 0.3 * min(1, edge * 2.5);
          d *= 0.88 + 0.12 * sin(x * 38 + yy * 22) * sin(x * 22 - yy * 38 + t * 2); // scales
          TONE = koiPattern(c.design, x, yy, c.seed);
          if (x > 0.52 && x < 0.64 && ay > 0.09 && ay < 0.17) { d = 1; TONE = 3; } // eyes
        }
      }
      if (d === 0) {
        const fin = koiFins(x, yy, ay, t);
        if (fin > 0) { d = fin; TONE = 1; }
      }
      return d;
    },
    react: {
      dur: 0.8,
      start(c) { // splash and turn around
        addRipple(c.x, c.y, 0.8);
        c.heading += PI;
        c.boost = 1;
        sing(c, 2); sing(c, 0, { at: 0.1 });
      },
    },
  },

  /* ---------------- Jellyfish ---------------- */
  {
    id: 'jellyfish', name: 'Jellyfish',
    base: [206, 58, 186], hi: [255, 190, 240],
    palettes: [
      { tones: [[[206, 58, 186], [255, 190, 240]]] },                                 // moon: pink
      { tones: [[[215, 85, 30], [255, 195, 120]], [[150, 30, 20], [240, 110, 80]]] }, // lion's mane: orange-red
      { tones: [[[60, 170, 200], [200, 250, 255]]] },                                 // crystal: icy cyan
      { tones: [[[90, 90, 220], [200, 200, 255]]] },                                  // box: violet-blue
    ],
    styles: [
      { id: 'moon', name: 'Moon', palette: 0 },       // glowing rings inside the bell
      { id: 'lion', name: 'Lion', palette: 1 },       // lots of long tentacles + frilly arms
      { id: 'crystal', name: 'Crystal', palette: 2 }, // clear bell, bright rim and canals
      { id: 'box', name: 'Box', palette: 3 },         // square bell, four long tentacles
    ],
    size: 5, extent: 1.9, speed: 2.2, agility: 0.8, mode: 'up',
    voice: { type: 'sine', oct: 1, dur: 1.6, vol: 0.05 },
    glow: () => 1.3,
    pace: (t) => 0.2 + max(0, -cos(t * 3)) * 1.2,
    shape(x, y, t, c) {
      const k = c.design;
      const J = JELLY_DESIGNS[k];
      const p = 0.5 + 0.5 * sin(t * 3); // bell pulse
      const rx = 0.55 + 0.1 * p, ry = 0.62 - 0.1 * p;
      let d = 0;

      // bell
      if (x > -0.1) {
        const bx = x / rx, by = y / ry;
        const e = k === 3 ? 1 - (bx ** 4 + by ** 4) : 1 - (bx * bx + by * by);
        if (e > 0) {
          if (k === 2) {                                                  // crystal
            if (e < 0.22) { d = 0.9; TONE = 2; }
            else if (abs(sin(atan2(y, x + 0.1) * 12)) < 0.14) d = 0.6;
            else d = 0.16 + 0.1 * sin(t * 4 + x * 8);
          } else {
            d = clamp01(e * 2.2) * (0.75 + 0.25 * cos(y * 10));
            if (k === 0) {                                                // moon: four rings
              const r1 = sqrt((x - 0.15) ** 2 + (abs(y) - 0.17) ** 2);
              if (abs(r1 - 0.12) < 0.04) { d = 0.95; TONE = 2; }
            } else if (k === 1) {                                         // lion: lobed edge
              d *= 0.8 + 0.2 * cos(atan2(y, x) * 16);
              if (e > 0.6) TONE = 1;
            } else if (abs(by) > 0.7 && bx > -0.05 && bx < 0.35) {        // box: bright corners
              d = 0.95; TONE = 2;
            }
          }
        }
      }

      // tentacles
      if (x < 0) {
        const f = 1 + x / J.len;
        if (f > 0) {
          const sc = 1 - 0.15 * p;
          for (const y0 of J.y0) {
            const wy = y0 * sc + J.amp * sin(x * 7 + t * 4 + y0 * 9) * -x;
            const dd = clamp01(1 - abs(y - wy) / J.r) * f * (k === 2 ? 0.6 : 1);
            if (dd > d) { d = dd; TONE = 0; }
          }
        }
        if (k === 1 && x > -0.95) {                                       // lion: frilly oral arms
          const wy = 0.06 * sin(x * 5 + t * 3);
          const dd = clamp01(1 - abs(y - wy) / (0.14 * (1 + x))) * (0.85 + 0.15 * sin(x * 30));
          if (dd > d) { d = dd; TONE = 1; }
        }
      }
      return d;
    },
    react: {
      dur: 1.2,
      start(c) { // flash brightly
        c.flash = 1;
        c.boost = 0.8;
        burst(c.x, c.y, styleOf(c), 14, { speed: 110 });
        burst(c.x, c.y, S_WHITE, 6, { speed: 80 });
        sing(c, 5); sing(c, 9, { at: 0.12 });
      },
    },
  },

  /* ---------------- Dragonfly ---------------- */
  {
    id: 'dragonfly', name: 'Dragonfly',
    base: [18, 170, 138], hi: [160, 255, 222],
    palettes: [
      { tones: [[[18, 170, 138], [160, 255, 222]], [[10, 60, 50], [60, 140, 120]], WING_PALE] },   // emerald
      { tones: [[[30, 110, 220], [150, 210, 255]], [[10, 25, 70], [60, 90, 160]], WING_PALE] },    // azure
      { tones: [[[200, 40, 50], [255, 150, 150]], [[60, 10, 15], [140, 50, 60]], WING_PALE] },     // ruby
      { tones: [[[230, 190, 30], [255, 240, 140]], [[15, 15, 15], [70, 70, 60]], WING_PALE] },     // golden-ringed
    ],
    styles: [
      { id: 'emerald', name: 'Emerald', palette: 0 },
      { id: 'azure', name: 'Azure', palette: 1 },
      { id: 'ruby', name: 'Ruby', palette: 2 },
      { id: 'golden', name: 'Golden', palette: 3 },
    ],
    size: 5.5, extent: 1.3, speed: 6, agility: 2.8,
    voice: { type: 'triangle', oct: 1, dur: 0.4, vol: 0.04 },
    pace: (t) => (sin(t * 1.3) > 0.1 ? 1.6 : 0.15), // hover, then dart
    shape(x, y, t, c) {
      const f = 0.55 + 0.45 * abs(cos(t * 22));    // very fast wing shimmer
      const ay = abs(y);
      let d = 0;

      // see-through wings with a dark spot near each tip
      const wing = max(rell(x, ay, 0.28, 0.5 * f, 0.13, 0.5 * f, 0), rell(x, ay, 0.02, 0.45 * f, 0.12, 0.45 * f, 0));
      if (wing > 0) {
        if (ay > 0.82 * f && ay < 0.94 * f) { d = 0.85; TONE = 1; }      // wing spot
        else if (wing < 0.18) { d = 0.55; TONE = 2; }                    // rim
        else { d = 0.25 + 0.1 * sin(ay * 30); TONE = 2; }                // glassy with veins
      }

      // body: long banded tail, thorax, big eyes
      const body = max(seg(x, y, -1.1, 0, 0.3, 0, 0.1), ell(x, y, 0.38, 0, 0.18, 0.13));
      if (body > 0.1) {
        d = max(d, 0.7 + 0.3 * body);
        const k = c.design;
        if (k === 3) TONE = sin(x * 26) > 0.2 ? 1 : 0;        // golden rings on black
        else if (k === 1) TONE = sin(x * 26) > 0.75 ? 1 : 0;  // thin dark bands
        else TONE = x < -0.95 ? 1 : 0;                        // dark tail tip
      }
      const eyes = ell(x, ay, 0.62, 0.08, 0.1, 0.1);
      if (eyes > 0.2) { d = 1; TONE = 0; }
      return d;
    },
    react: {
      dur: 0.6,
      start(c) { // zip away in a random direction
        c.heading = random() * TAU;
        c.boost = 1;
        burst(c.x, c.y, styleOf(c), 12, { speed: 140 });
        sing(c, 6, { slide: 1.5 });
      },
    },
  },

  /* ---------------- Manta ---------------- */
  {
    id: 'manta', name: 'Manta',
    base: [96, 92, 220], hi: [205, 200, 255],
    palettes: [
      { tones: [[[25, 30, 60], [110, 120, 170]]] },    // oceanic: dark navy
      { tones: [[[96, 92, 220], [205, 200, 255]]] },   // reef: violet
      { tones: [[[150, 170, 200], [240, 248, 255]]] }, // ghost: pale
    ],
    styles: [
      { id: 'oceanic', name: 'Oceanic', palette: 0 }, // white shoulder patches
      { id: 'reef', name: 'Reef', palette: 1 },       // pale spots
      { id: 'ghost', name: 'Ghost', palette: 2 },     // see-through with a glowing edge
    ],
    size: 6, extent: 1.45, speed: 2.6, agility: 0.6, eats: true,
    voice: { type: 'sine', oct: 0, dur: 1.8, vol: 0.05 },
    pace: () => 1,
    shape(x, y, t, c) {
      const p = reacting(c);
      const roll = p >= 0 ? max(0.1, abs(cos(p * TAU))) : 1;  // barrel roll
      const ay = abs(y);
      const span = 1.15 * (0.8 + 0.2 * cos(t * 2.2)) * roll;
      const edge = 1 - ay / span;
      const k = c.design;
      let d = 0;
      if (edge > 0) {
        const wave = sin(t * 2.2 - ay * 2.5);
        const xc = 0.05 - ay * 0.3 + wave * 0.08 * ay;
        const half = 0.55 * pow(edge, 0.8);
        const inner = 1 - abs(x - xc) / half;                  // 1 centre line, 0 at front/back edge
        d = clamp01(inner * 2) * clamp01(edge * 4);
        d *= 0.75 + 0.25 * cos(ay * 8);
        if (d > 0) {
          if (k === 0 && rell(x, ay, 0.12, 0.38, 0.26, 0.12, 0.5) > 0) TONE = 2;        // shoulder patches
          else if (k === 1 && sin(x * 20 + 1) * sin(ay * 20) > 0.85) TONE = 2;           // spots
          else if (k === 2) {                                                           // ghost
            if (inner < 0.2 || edge < 0.15) { d = 0.85; TONE = 2; } else d *= 0.35;
          }
        }
      }
      const tail = seg(x, y, -0.4, 0, -1.3, 0.12 * sin(t * 3), 0.07);
      const fins = seg(x, ay, 0.45, 0.12, 0.72, 0.2, 0.09);    // head fins
      if (tail > d) { d = tail; TONE = 0; }
      if (fins > d) { d = fins; TONE = 0; }
      return d;
    },
    react: {
      dur: 1.4,
      start(c) {
        c.boost = 0.6;
        sing(c, 2); sing(c, 4, { at: 0.2 });
      },
    },
  },

  /* ---------------- Turtle ---------------- */
  {
    id: 'turtle', name: 'Turtle',
    base: [52, 150, 110], hi: [190, 240, 200],
    palettes: [
      { tones: [[[52, 150, 110], [190, 240, 200]], [[20, 60, 45], [80, 130, 100]], [[170, 220, 180], [235, 255, 235]]] }, // green
      { tones: [[[150, 90, 30], [240, 180, 100]], [[50, 25, 10], [120, 70, 30]], [[220, 170, 90], [255, 225, 160]]] },    // hawksbill
      { tones: [[[40, 50, 60], [120, 135, 150]], [[15, 18, 22], [60, 65, 75]], [[150, 165, 180], [225, 232, 240]]] },     // leatherback
      { tones: [[[50, 35, 20], [130, 100, 60]], [[25, 15, 8], [80, 60, 35]], [[220, 180, 40], [255, 235, 130]]] },        // star
    ],
    styles: [
      { id: 'green', name: 'Green', palette: 0 },        // plated shell
      { id: 'hawksbill', name: 'Hawksbill', palette: 1 }, // mottled amber shell
      { id: 'leather', name: 'Leather', palette: 2 },    // dark shell with long ridges
      { id: 'star', name: 'Star', palette: 3 },          // yellow star on every plate
    ],
    size: 6, extent: 1.15, speed: 1.6, agility: 0.7, eats: true,
    voice: { type: 'triangle', oct: -1, dur: 1, vol: 0.06 },
    pace: (t, c) => (c.react ? 0 : 0.6 + 0.4 * max(0, sin(t * 3))),
    shape(x, y, t, c) {
      const p = reacting(c);
      const hide = p < 0 ? 0 : p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;
      const k = 1 - hide;                          // how far head/legs stick out
      const ay = abs(y);
      const sw = sin(t * 3);                       // flipper stroke
      let d = 0;

      const shell = ell(x, y, 0, 0, 0.62, 0.5);
      if (shell > 0) {
        d = 0.75 + 0.25 * shell;
        const s = c.seed;
        const plate = abs(cos(x * 9) * cos(y * 9));
        switch (c.design) {
          case 0: if (plate < 0.25) TONE = 1; break;                                   // plate lines
          case 1:                                                                     // tortoiseshell
            if (sin(x * 13 + s) * sin(y * 11 + s * 2) + 0.5 * sin((x + y) * 17) > 0.3) TONE = 2;
            if (plate < 0.15) TONE = 1;
            break;
          case 2: if (abs(sin(y * 14)) < 0.2 && shell > 0.15) TONE = 2; break;        // ridges
          case 3: {                                                                   // star plates
            const fx = x * 3 - round(x * 3), fy = y * 3 - round(y * 3);
            const rr = sqrt(fx * fx + fy * fy);
            TONE = rr < 0.42 && (rr < 0.1 || abs(sin(atan2(fy, fx) * 3)) < 0.35) ? 2 : 1;
            if (rr > 0.42) TONE = 0;
            break;
          }
        }
      }
      if (k > 0.03) {
        const limbs = max(
          ell(x, y, 0.58 + 0.2 * k, 0, 0.18, 0.15),                                       // head
          seg(x, ay, 0.3, 0.38, 0.3 + (0.22 + 0.16 * sw) * k, 0.4 + 0.42 * k, 0.11),      // front flippers
          seg(x, ay, -0.38, 0.32, -0.38 - (0.18 - 0.1 * sw) * k, 0.32 + 0.28 * k, 0.09),  // back flippers
          seg(x, y, -0.58, 0, -0.58 - 0.18 * k, 0, 0.07)                                  // tail
        ) * k;
        if (limbs > d) { d = limbs; TONE = 0; }
      }
      return d;
    },
    react: {
      dur: 3,
      start(c) { // hide in the shell
        sing(c, 0, { dur: 1.2 }); sing(c, -3, { at: 0.15, dur: 1.2 });
      },
    },
  },

  /* ---------------- Bird: swallow-like, flocks, glides between flaps ---------------- */
  {
    id: 'bird', name: 'Bird',
    base: [60, 120, 230], hi: [160, 205, 255],
    palettes: [
      { tones: [[[40, 95, 215], [140, 195, 255]], [[15, 25, 70], [70, 90, 170]], [[200, 120, 60], [255, 190, 130]]] },  // bluebird
      { tones: [[[30, 40, 95], [115, 135, 205]], [[10, 12, 30], [50, 60, 110]], [[200, 205, 220], [255, 255, 255]]] },  // swallow
      { tones: [[[220, 180, 20], [255, 235, 120]], [[20, 20, 20], [85, 85, 85]], [[240, 240, 230], [255, 255, 255]]] }, // goldfinch
      { tones: [[[200, 30, 30], [255, 140, 130]], [[90, 15, 15], [170, 60, 60]], [[25, 18, 18], [80, 65, 65]]] },      // cardinal
    ],
    styles: [
      { id: 'bluebird', name: 'Bluebird', palette: 0 },
      { id: 'swallow', name: 'Swallow', palette: 1 },
      { id: 'goldfinch', name: 'Finch', palette: 2 },
      { id: 'cardinal', name: 'Cardinal', palette: 3 },
    ],
    size: 2.4, extent: 1.35, speed: 6, agility: 1.5, slot: 0.4, group: 5,
    flock: { r: 12, sep: 3.2, align: 1.2, coh: 1.0, sepW: 2.2 },
    voice: { type: 'sine', oct: 2, dur: 0.25, vol: 0.03 },
    pace: () => 1,
    shape(x, y, t, c) {
      const gliding = sin(t * 0.7 + c.seed) < -0.3;
      const span = gliding ? 1 : 0.3 + 0.7 * abs(sin(t * 9)); // flap = squash wings
      const ay = abs(y);
      let d = 0;

      const mx = 0.02, my = 0.5 * span;                         // swept-back wings
      const tx = -0.32, ty = 1.05 * span;
      const wing = max(seg(x, ay, 0.12, 0.06, mx, my, 0.2), seg(x, ay, mx, my, tx, ty, 0.13));
      if (wing > 0) {
        d = (0.65 + 0.35 * wing) * (0.85 + 0.15 * sin(x * 30 + ay * 10)); // feather lines
        if (ay > 0.62 * ty) TONE = 1;                                        // dark wing tips
      }
      const tail = max(seg(x, ay, -0.3, 0, -0.62, 0.05, 0.1), seg(x, ay, -0.6, 0.05, -0.95, 0.2, 0.06));
      if (tail > 0.15 && tail > d) { d = tail * 0.9; TONE = 1; }
      const body = max(ell(x, y, 0.02, 0, 0.42, 0.17), ell(x, y, 0.42, 0, 0.15, 0.14));
      if (body > 0.15) {
        d = max(d, 0.75 + 0.25 * body);
        TONE = x > 0.12 && x < 0.38 && ay < 0.1 ? 2 : 0;          // throat patch
      }
      const beak = seg(x, y, 0.55, 0, 0.7, 0, 0.05);
      if (beak > 0.3 && body <= 0.15) { d = beak; TONE = 2; }
      return d;
    },
    react: {
      dur: 0.6,
      start(c) { // the whole flock nearby scatters
        for (const o of creatures) {
          if (o.sp !== c.sp || o.dying) continue;
          const dx = o.x - c.x, dy = o.y - c.y;
          if (dx * dx + dy * dy < 260 * 260) {
            o.heading = atan2(dy, dx) + rand(-0.4, 0.4);
            o.boost = 1;
          }
        }
        burst(c.x, c.y, styleOf(c), 10, { speed: 120, life: 0.6 });
        sing(c, 7); sing(c, 9, { at: 0.06 }); sing(c, 11, { at: 0.12 });
      },
    },
  },

  /* ---------------- Whale: seen from the side ----------------
     The body is the area between a "back" curve and a "belly" curve;
     the tail end bends up and down. Each style changes the build, fins
     and markings. */
  {
    id: 'whale', name: 'Whale',
    base: [45, 80, 140], hi: [140, 180, 235],
    palettes: [
      { tones: [[[40, 72, 130], [130, 170, 225]], [[12, 20, 45], [55, 75, 120]], [[170, 190, 215], [240, 246, 255]]] },  // humpback
      { tones: [[[70, 110, 160], [160, 200, 240]], [[20, 35, 60], [70, 100, 140]], [[150, 180, 210], [220, 235, 250]]] }, // blue whale
      { tones: [[[22, 22, 30], [90, 95, 110]], [[10, 10, 14], [50, 50, 60]], [[220, 225, 235], [255, 255, 255]]] },     // orca
    ],
    styles: [
      { id: 'humpback', name: 'Humpback', palette: 0 }, // long white flippers, throat grooves
      { id: 'blue', name: 'Blue', palette: 1 },         // long and slender, mottled
      { id: 'orca', name: 'Orca', palette: 2 },         // black & white, tall dorsal fin
    ],
    size: 6.5, extent: 1.5, speed: 1.4, agility: 0.4, eats: true, sideView: true,
    voice: { type: 'sine', oct: -2, dur: 2.5, vol: 0.09 },
    pace: () => 1,
    shape(x, y, t, c) {
      const k = c.design;
      const beat = sin(t * 1.8);
      const tb = x < -0.2 ? 0.16 * beat * ((-x - 0.2) / 0.9) ** 2 : 0; // tail bends up/down
      const yy = y - tb;
      const girth = k === 1 ? 0.78 : k === 2 ? 1.08 : 1;               // slender blue, stocky orca
      let d = 0;

      if (x > -1.05 && x < 1.0) {
        let hb = 0.27 * girth * sqrt(max(0, 1 - ((x - 0.12) / 0.9) ** 2));
        if (x < -0.4) hb = min(hb, 0.06 + (x + 1.05) * 0.33);
        let top = -hb * 0.85;
        const bottom = hb * 1.05 + (x > 0 ? 0.04 * x : 0);
        if (k === 0) top -= 0.07 * max(0, 1 - abs(x + 0.45) / 0.1);     // small hump fin
        if (k === 1) top -= 0.04 * max(0, 1 - abs(x + 0.6) / 0.06);     // tiny fin far back
        if (yy > top && yy < bottom) {
          const v = (yy - top) / (bottom - top);                         // 0 = back, 1 = belly
          d = 0.7 + 0.3 * min(1, min(v, 1 - v) * 6);
          if (k === 2) {                                                 // orca markings
            if (v > 0.6 && x > -0.6) TONE = 2;                           // white belly
            if (rell(x, yy, 0.45, top + 0.08, 0.14, 0.05, 0) > 0) TONE = 2; // eye patch
          } else {
            if (v > 0.62 && x > -0.5) TONE = x > -0.1 && sin(yy * 55) < 0.2 ? 0 : 2; // pale grooved belly
            else if (k === 1 && sin(x * 31 + c.seed) * sin(yy * 37) > 0.55) TONE = 2;  // mottling
            else if (k === 0 && v < 0.4 && sin(x * 53) * sin(yy * 61) > 0.85) TONE = 2; // barnacles
          }
          const mouth = 0.07 + (0.85 - x) * 0.08;
          if (k !== 2 && x > 0.4 && x < 0.9 && abs(yy - mouth) < 0.025) { d = 0.9; TONE = 1; }
          const ex = x - 0.6, ey = yy - 0.03;
          if (ex * ex + ey * ey < 0.05 * 0.05) { d = 1; TONE = 1; }      // eye
        }
      }

      if (d === 0) {
        if (k === 2) {                                                    // orca: tall dorsal fin
          const fin = seg(x, yy, 0.02, -0.2, -0.14, -0.62, 0.07);
          if (fin > 0.1) { d = 0.9; TONE = 0; }
        }
        const fin =
          k === 0 ? seg(x, yy, 0.3, 0.15, 0.02, 0.55 + 0.06 * sin(t * 1.2), 0.075) :  // long white flippers
          k === 1 ? seg(x, yy, 0.35, 0.12, 0.2, 0.3, 0.06) :                         // small flippers
          seg(x, yy, 0.32, 0.17, 0.14, 0.4, 0.1);                                    // paddle flippers
        if (fin > 0.1) { d = 0.55 + 0.35 * fin; TONE = k === 0 ? 2 : 0; }
        const fl = rell(x, yy, -1.2, 0, 0.22, 0.065, 0.3 * beat);                     // tail flukes
        if (fl > 0) { d = 0.6 + 0.3 * fl; TONE = 1; }
      }
      return d;
    },
    react: {
      dur: 2,
      start(c) { // spout water from the blowhole
        const [hx, hy] = toWorld(c, 0.35, -0.27);
        burst(hx, hy, S_WATER, 40, { life: 1.8, spray: true });
        burst(hx, hy, S_WHITE, 14, { life: 1.4, spray: true });
        addRipple(c.x, c.y, 0.7);
        sing(c, 0); sing(c, 2, { at: 0.25 });
      },
    },
  },

  /* ---------------- Firefly: tiny, blinks ---------------- */
  {
    id: 'firefly', name: 'Firefly',
    base: [170, 190, 30], hi: [255, 250, 160],
    palettes: [
      { tones: [[[200, 170, 30], [255, 240, 150]]] }, // gold
      { tones: [[[120, 200, 40], [220, 255, 150]]] }, // green
      { tones: [[[40, 140, 230], [170, 230, 255]]] }, // blue
    ],
    styles: [
      { id: 'gold', name: 'Gold', palette: 0 },
      { id: 'green', name: 'Green', palette: 1 },
      { id: 'blue', name: 'Blue', palette: 2 },
    ],
    size: 1, extent: 1.6, speed: 1.6, agility: 3, slot: 0.35, group: 3,
    selfFlash: true,
    voice: { type: 'sine', oct: 2, dur: 1, vol: 0.03 },
    glow: (c) => 0.3 + 3 * max(pow(max(0, sin(c.clock * 1.6)), 6), c.flash),
    pace: (t) => 0.6 + 0.4 * sin(t * 0.9),
    shape(x, y, t, c) {
      const f = max(pow(max(0, sin(t * 1.6)), 6), c.flash); // blink
      let d = 0.65 * ell(x, y, 0, 0, 0.5, 0.34);             // body
      d = max(d, f * ell(x, y, -0.1, 0, 0.35, 0.3));         // lit tail
      return max(d, 0.45 * f * ell(x, y, 0, 0, 1.5, 1.5));   // halo
    },
    react: {
      dur: 1.5,
      start(c) {
        c.flash = 1;
        burst(c.x, c.y, styleOf(c), 14, { speed: 90 });
        sing(c, 9); sing(c, 11, { at: 0.1 });
      },
    },
  },
];

/* ---------- character sets (ramp goes light -> dense) ---------- */
const GLYPH_SETS = {
  ascii:   { name: 'ASCII',   ramp: '.:-=+o*#%8@',          trail: '.-/|o~`', spark: "*+.`'",   food: 'o', water: '.-~=' },
  blocks:  { name: 'Blocks',  ramp: '·▖▞░░▒▒▓▓█',           trail: '·▘▝▗▖',   spark: '▪▫·',     food: '■', water: '·░▒' },
  braille: { name: 'Braille', ramp: '⠂⠃⠇⠏⠟⠿⡿⣟⣿',           trail: '⠁⠂⠄⠈⠐⠠', spark: '⠁⠈⠐⠂',   food: '⣿', water: '⠂⠒⠶' },
  kana:    { name: 'Kana',    ramp: '･ｰｨｩｧｦｶｸｹﾀﾂﾈﾊﾐﾒﾗﾜﾝ', trail: '･ｰﾞﾟ',    spark: 'ﾟﾞ･',     food: 'ｵ', water: '･ｰﾆ' },
};
