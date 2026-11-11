// Structures of the points of interest (camps, forts, ruins, mines, farms, lairs, landmarks).
// Each emitter draws into a Mesher at the origin, front towards +z, ground at y = 0; `s` is the layout structure.
import { PALETTE as P } from './materials.js';
import { block, hipRoof, gableRoof, doorAt, bannerAt } from './building-kit.js';
import { timberStyle } from './buildings-timber.js';
import { emitBuilding } from './buildings.js';
import { tree } from './props-extra.js';
import { flame, lantern, emitProp } from './props.js';

const TAU = Math.PI * 2;
const ROCKS = [P.rock, 0x7a766e, P.rockWarm, 0x64625c];

function boulder(m, rng, r, x = 0, y = 0, z = 0, colors = ROCKS, o = {}) {
  m.ico(r, colors[Math.floor(rng() * colors.length)], x, y + r * 0.35, z, { noise: 0.28, detail: r > 1.4 ? 1 : 0, s: o.s || [1.15, 0.85, 1], g: [0.62, 1.08], j: 0.06, ry: rng() * TAU });
}

function logCabin(m, rng, w, d, o = {}) {
  const pal = { ...timberStyle.palette(rng), logGround: true, stoneGround: false, shingle: !o.thatch, roof: o.thatch ? P.thatch : P.roofWood, roof2: o.thatch ? 0x8a763e : P.woodDark, beam: o.dark ? 0x3e2d20 : P.wood, wall: o.dark ? 0x4a3a2c : P.wood };
  return block(m, rng, timberStyle, pal, { w, d, floors: 1, door: o.door ?? 0, ridge: 'x', chimney: o.chimney !== false, roofScale: o.roofScale || 1, lit: 0.8, blind: o.blind || [] });
}

function watchTower(m, rng, size, h, o = {}) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      m.cyl(0.16, 0.22, h + 2.6, P.bark, sx * size, -0.4, sz * size, { seg: 6, lean: [-sx * size * 0.14, -sz * size * 0.14], g: [0.7, 1.05], j: 0.08 });
    }
  }
  for (let i = 0; i < 2; i++) {
    const y = h * (0.3 + i * 0.35), k = size * (1 - 0.14 * y / h) + 0.02;
    m.box(k * 2, 0.12, 0.12, P.woodDark, 0, y, k);
    m.box(k * 2, 0.12, 0.12, P.woodDark, 0, y, -k);
    m.box(0.12, 0.12, k * 2, P.woodDark, k, y, 0);
    m.box(0.12, 0.12, k * 2, P.woodDark, -k, y, 0);
    m.box(0.1, Math.hypot(k * 2, h * 0.35), 0.1, P.wood, 0, y - h * 0.3, k, { rz: Math.atan2(k * 2, h * 0.35), c: false });
  }
  const top = size * 0.86 + 0.5;
  m.box(top * 2, 0.16, top * 2, P.wood, 0, h, 0, { j: 0.06 });
  for (const s of [-1, 1]) {
    m.box(top * 2, 0.95, 0.1, P.woodLight, 0, h + 0.16, s * top, { nb: true, j: 0.08 });
    m.box(0.1, 0.95, top * 2, P.woodLight, s * top, h + 0.16, 0, { nb: true, j: 0.08 });
  }
  hipRoof(m, rng, top * 2, top * 2, h + 2.6, 1.5, { color: o.roof || P.roofWood, color2: P.woodDark, edge: P.woodDark, eave: 0.4, rows: 3 });
  // ladder
  m.box(0.07, h + 0.4, 0.07, P.woodLight, -0.3, 0, size + 0.5, { lean: [0, -0.5], nb: true });
  m.box(0.07, h + 0.4, 0.07, P.woodLight, 0.3, 0, size + 0.5, { lean: [0, -0.5], nb: true });
  for (let i = 1; i < 9; i++) m.box(0.6, 0.05, 0.05, P.woodLight, 0, i * h / 9, size + 0.5 - 0.5 * i / 9);
}

function ruinWall(m, rng, s) {
  const len = s.hw * 2, t = (s.hd || 0.55) * 2, h = s.h || 3;
  const col = [0x8a877c, 0x7a786f, 0x979388, 0x6d6b63];
  const cols = Math.max(1, Math.round(len / 1.1));
  for (let i = 0; i < cols; i++) {
    const hh = Math.max(0.5, h * (0.55 + rng() * 0.5));
    m.box(len / cols + 0.02, hh + 0.5, t * (0.9 + rng() * 0.15), col[i % 4], -len / 2 + (i + 0.5) * len / cols, -0.5, 0, { vj: 0.1, j: 0.08, g: [0.6, 1.05], nb: true, top: [1, 0.86], lean: [(rng() - 0.5) * 0.06, (rng() - 0.5) * 0.1] });
    if (rng() < 0.5) m.box(0.5, 0.3, t + 0.12, col[(i + 1) % 4], -len / 2 + (i + 0.5) * len / cols, hh * rng() * 0.8, 0, { j: 0.2 });
  }
  // moss and ivy
  m.use('foliage');
  for (let i = 0; i < 2; i++) m.ico(0.5 + rng() * 0.4, rng() < 0.5 ? P.moss : P.leafDark, (rng() - 0.5) * len, h * 0.25 + rng() * h * 0.3, t / 2, { noise: 0.3, s: [1.4, 1.2, 0.35], sway: 0.1 });
  m.use('flat');
}

function sails(m) {
  for (let i = 0; i < 4; i++) {
    m.push(0, 0, 0, 0, 0, i * Math.PI / 2);
    m.box(0.16, 6.6, 0.14, P.woodDark, 0, 0.3, 0);
    for (let k = 0; k < 7; k++) m.box(1.5, 0.06, 0.06, P.wood, 0.75, 1.5 + k * 0.82, 0.02);
    m.box(0.07, 5.3, 0.07, P.wood, 1.5, 1.5, 0.02);
    m.use('cloth');
    m.quad([0.1, 1.5, 0.08], [1.45, 1.5, 0.1], [1.45, 6.7, 0.1], [0.1, 6.7, 0.08], P.canvas, { both: true, g: [0.85, 1.05] });
    m.use('flat');
    m.pop();
  }
  m.cyl(0.3, 0.3, 0.5, P.woodDark, 0, 0, 0.05, { rx: Math.PI / 2, seg: 7, bottom: true, c: true });
}

/** Parts that are animated by a shader and therefore built as separate meshes: kind -> { draw(m), at:[x,y,z], spin }. */
export const ANIMATED = {
  windmill: { draw: sails, at: [0, 10.2, 3.5], axis: 'z', speed: 0.45 },
  lighthouse: { beam: true, at: [0, 22.6, 0] },
};

export const STRUCTURES = {
  'boss-tent': (m, rng) => {
    m.use('cloth');
    const n = 8, r = 3.2;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * TAU + Math.PI / 2 + TAU / 16, a1 = (i + 1) / n * TAU + Math.PI / 2 + TAU / 16;
      const p0 = [Math.cos(a0) * r, 0, Math.sin(a0) * r], p1 = [Math.cos(a1) * r, 0, Math.sin(a1) * r];
      const q0 = [p0[0] * 0.95, 2.1, p0[2] * 0.95], q1 = [p1[0] * 0.95, 2.1, p1[2] * 0.95];
      const c = i % 2 ? 0x5a4a3c : P.banditRed;
      if (i !== 0) m.quad(p1, p0, q0, q1, c, { g: [0.7, 1.02], both: true });
      m.tri(q1, q0, [0, 4.2, 0], c, { g: [0.9, 1.1], both: true });
    }
    m.use('flat');
    m.cyl(0.07, 0.09, 4.9, P.woodDark, 0, 0, 0, { seg: 5 });
    m.ico(0.16, P.bone, 0, 4.95, 0);
    for (const sx of [-1, 1]) m.cyl(0.07, 0.08, 2.3, P.woodDark, sx * 1.25, 0, 3.05, { seg: 5 });
  },
  'watch-platform': (m, rng) => watchTower(m, rng, 1.4, 5.2),
  'guard-tower': (m, rng) => {
    watchTower(m, rng, 1.6, 6.4, { roof: P.roofSlate });
    m.push(0, 0, 1.75);
    bannerAt(m, 0, 6.3, 0.9, 2.0, P.guardBlue, P.steel);
    m.pop();
    lantern(m, 1.9, 6.0, 1.9, 1.3);
  },
  throne: (m, rng) => {
    m.box(2.6, 0.3, 2.2, P.woodDark, 0, 0, 0, { j: 0.05 });
    m.box(1.1, 0.5, 0.9, P.wood, 0, 0.3, -0.2, { j: 0.05 });
    m.box(1.2, 2.1, 0.2, P.woodDark, 0, 0.3, -0.75, { top: [0.8, 1], j: 0.05 });
    for (const sx of [-1, 1]) {
      m.box(0.2, 0.8, 0.9, P.wood, sx * 0.62, 0.3, -0.2);
      m.cyl(0, 0.07, 0.7, P.bone, sx * 0.5, 2.3, -0.75, { seg: 5, rz: -sx * 0.5 });
    }
    m.use('cloth').quad([-0.5, 0.82, 0.26], [0.5, 0.82, 0.26], [0.5, 2.2, -0.63], [-0.5, 2.2, -0.63], P.fur, { g: [0.8, 1.05] });
    m.use('flat');
    m.ico(0.17, P.bone, 0, 2.5, -0.72, { s: [1, 0.9, 1.1] });
  },
  'fort-tower': (m, rng) => {
    const h = 7.2;
    for (let i = 0; i < 12; i++) m.box(4.6, h / 12 - 0.03, 4.6, i % 2 ? P.wood : 0x5e4a36, 0, -0.4 + i * (h + 0.4) / 12, 0, { nb: true, j: 0.12, top: [1.004, 1.004], g: [0.8, 1.04] });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) m.cyl(0.28, 0.34, h + 3.6, P.bark, sx * 2.25, -0.4, sz * 2.25, { seg: 6, j: 0.1, g: [0.65, 1.05] });
    }
    m.box(5.6, 0.2, 5.6, P.woodDark, 0, h, 0);
    for (const s of [-1, 1]) {
      m.box(5.6, 1.0, 0.12, P.wood, 0, h + 0.2, s * 2.75, { nb: true, j: 0.06 });
      m.box(0.12, 1.0, 5.6, P.wood, s * 2.75, h + 0.2, 0, { nb: true, j: 0.06 });
    }
    hipRoof(m, rng, 5.4, 5.4, h + 3.1, 2.3, { color: P.roofWood, color2: P.woodDark, edge: P.woodDark, eave: 0.5, rows: 3 });
    m.use('win').box(0.3, 0.7, 0.06, P.lantern, 0, h * 0.62, 2.33, { nb: true });
    m.use('flat');
  },
  'fort-gate': (m, rng) => {
    m.box(9, 0.4, 0.5, P.woodDark, 0, 5.4, 0.8);
    m.box(9, 0.4, 0.5, P.woodDark, 0, 5.4, -0.8);
    m.box(8.6, 0.14, 2.4, P.wood, 0, 5.8, 0, { j: 0.05 });
    for (const sz of [-1, 1]) m.box(8.6, 1.0, 0.1, P.woodLight, 0, 5.94, sz * 1.15, { nb: true });
    for (const s of [-1, 1]) {
      m.push(s * 4.2, 0, -0.5, -s * 0.2);
      m.box(0.18, 4.9, 4.0, P.wood, 0, 0.1, -2.1, { j: 0.06, g: [0.72, 1.04] });
      for (const k of [1, 2.6, 4.2]) m.box(0.24, 0.16, 4.0, P.iron, 0, k, -2.1);
      m.pop();
      m.cyl(0, 0.1, 0.9, P.bone, s * 2.2, 6.9, 1.2, { seg: 5 });
    }
    m.ico(0.3, P.bone, 0, 7.2, 1.2, { s: [1, 0.9, 1.1], detail: 1 });
    m.push(0, 0, 1.1);
    bannerAt(m, -2.6, 5.3, 1.0, 1.6, P.banditRed, P.clothBlack);
    bannerAt(m, 2.6, 5.3, 1.0, 1.6, P.banditRed, P.clothBlack);
    m.pop();
  },
  'log-hall': (m, rng) => {
    const res = logCabin(m, rng, 12, 7.6, { dark: true, roofScale: 1.2, door: 0 });
    for (const sx of [-1, 1]) {
      m.cyl(0.2, 0.24, 3.4, P.bark, sx * 2.2, 0, 5.4, { seg: 6 });
      m.cyl(0, 0.1, 0.8, P.bone, sx * 2.2, 3.4, 5.4, { seg: 5 });
    }
    m.box(5.4, 0.2, 2.2, P.woodDark, 0, 3.3, 4.7, { rx: 0.14 });
    m.box(6.2, 0.3, 2.6, P.wood, 0, 0, 4.9, { j: 0.05 });
    m.push(0, 0, 3.82);
    bannerAt(m, -3.8, 3.2, 1.0, 2.2, P.banditRed, P.clothBlack);
    bannerAt(m, 3.8, 3.2, 1.0, 2.2, P.banditRed, P.clothBlack);
    m.pop();
    return res;
  },
  'log-hut': (m, rng, s) => logCabin(m, rng, s.hw * 2 - 0.5, s.hd * 2 - 0.4, { thatch: rng() < 0.4 }),
  'fish-hut': (m, rng, s) => {
    logCabin(m, rng, s.hw * 2 - 0.5, s.hd * 2 - 0.4, { thatch: true, chimney: false });
    m.use('cloth');
    m.quad([s.hw - 0.2, 0.4, -1.2], [s.hw - 0.2, 0.3, 1.2], [s.hw - 0.3, 2.2, 1.2], [s.hw - 0.3, 2.2, -1.2], 0x6b6a52, { both: true, g: [0.7, 1] });
    m.use('flat');
    for (let i = 0; i < 3; i++) m.ico(0.12, P.woodPale, s.hw - 0.15, 0.5 + i * 0.5, -0.8 + i * 0.8);
  },
  farmhouse: (m, rng, s) => emitBuilding(m, { type: 'house', w: 9, d: 6.4, floors: 2, door: 0, seed: s.seed }, 'timber'),
  barn: (m, rng, s) => emitBuilding(m, { type: 'barn', w: 10.2, d: 7.2, floors: 1, door: 0, seed: s.seed }, 'timber'),
  'ruin-wall': ruinWall,
  rubble: (m, rng) => {
    for (let i = 0; i < 6; i++) boulder(m, rng, 0.25 + rng() * 0.4, (rng() - 0.5) * 1.6, -0.1, (rng() - 0.5) * 1.6, [0x8a877c, 0x7a786f, 0x979388]);
    m.box(0.9, 0.35, 0.5, 0x979388, 0.2, 0, -0.2, { ry: rng() * 3, rz: 0.2, j: 0.1 });
  },
  column: (m, rng, s) => {
    const h = s.h || 3.5;
    m.box(1.0, 0.4, 1.0, 0x8a877c, 0, -0.1, 0, { vj: 0.08 });
    m.cyl(0.33, 0.38, h, 0x979388, 0, 0.3, 0, { seg: 8, vj: 0.08, g: [0.7, 1.05], lean: [(rng() - 0.5) * 0.2, (rng() - 0.5) * 0.2] });
    if (h > 3) m.box(0.9, 0.3, 0.9, 0x8a877c, 0, h + 0.3, 0, { rz: 0.06, j: 0.08 });
  },
  'dead-tree': (m, rng) => {
    const lean = [(rng() - 0.5) * 1.2, (rng() - 0.5) * 1.2];
    m.cyl(0.12, 0.34, 5.2, 0x4a4038, 0, -0.2, 0, { seg: 6, lean, g: [0.7, 1.1], vj: 0.08 });
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + rng(), k = 0.45 + i * 0.13;
      m.cyl(0.03, 0.1, 1.6 + rng(), 0x4a4038, lean[0] * k, 5 * k, lean[1] * k, { seg: 4, lean: [Math.cos(a) * 1.3, Math.sin(a) * 1.3] });
    }
  },
  'web-tree': (m, rng) => {
    STRUCTURES['dead-tree'](m, rng);
    m.use('cloth');
    for (let i = 0; i < 3; i++) {
      const a = rng() * TAU, w = 1.6 + rng();
      const c = Math.cos(a), sn = Math.sin(a);
      m.tri([0, 1.6 + i, 0], [c * w * 0.7, 1.0 + i * 0.8, sn * w * 0.7], [c * w * 0.25, 3.2 + i * 0.7, sn * w * 0.25], 0xeef0e6, { both: true, g: [0.9, 1.1] });
    }
    m.use('flat');
  },
  rock: (m, rng, s) => {
    const r = s.r || 1.2;
    boulder(m, rng, r * 1.05);
    if (r > 1) boulder(m, rng, r * 0.55, r * 0.9, 0, r * 0.3);
  },
  'ice-rock': (m, rng, s) => {
    const r = s.r || 1.2;
    boulder(m, rng, r, 0, 0, 0, [0x9fb4c0, 0x8aa3b0]);
    m.ico(r * 0.9, P.snow, 0, r * 0.75, 0, { s: [1.05, 0.35, 0.95], noise: 0.15 });
    for (let i = 0; i < 3; i++) m.cyl(0, 0.22 * r, r * (1.4 + rng()), 0xbfe6f0, (rng() - 0.5) * r, r * 0.3, (rng() - 0.5) * r, { seg: 5, lean: [(rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6], g: [0.8, 1.25] });
  },
  'rock-mound': (m, rng, s) => {
    const r = s.r;
    m.ico(r * 0.92, P.rock, 0, r * 0.18, 0, { detail: 1, noise: 0.2, s: [1, 0.95, 1], g: [0.6, 1.08], vj: 0.04 });
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + rng(), d = r * 0.55;
      m.ico(r * (0.38 + rng() * 0.16), ROCKS[i % 4], Math.cos(a) * d, r * 0.1 + rng() * r * 0.25, Math.sin(a) * d, { detail: 1, noise: 0.26, s: [1, 1.1, 1], g: [0.6, 1.08] });
    }
    m.use('foliage');
    for (let i = 0; i < 5; i++) m.ico(r * 0.2, P.moss, (rng() - 0.5) * r, r * (0.85 + rng() * 0.2), (rng() - 0.5) * r, { noise: 0.3, s: [1.5, 0.4, 1.5], sway: 0.1 });
    m.use('flat');
    if (s.cobalt) {
      for (let i = 0; i < 9; i++) {
        const a = -0.6 + i * 0.4 + Math.PI / 2 - 1;
        m.cyl(0, 0.35, 1.2 + rng() * 1.4, P.cobalt, Math.sin(a) * r * 0.9, r * (0.15 + rng() * 0.5), Math.cos(a) * r * 0.9, { seg: 5, lean: [Math.sin(a) * 0.8, Math.cos(a) * 0.8], g: [0.7, 1.5] });
      }
    }
  },
  adit: (m, rng, s) => {
    m.box(2.5, 2.5, 3.6, 0x0d0b0a, 0, 0, -1.6, { nb: true });
    for (const k of [0, -1.4]) {
      for (const sx of [-1, 1]) m.cyl(0.17, 0.2, 2.75, P.bark, sx * 1.42, 0, 0.35 + k, { seg: 6, lean: [-sx * 0.12, 0], j: 0.1 });
      m.cyl(0.18, 0.2, 3.5, P.wood, -1.75, 2.78, 0.35 + k, { rz: -Math.PI / 2, seg: 6, bottom: true, j: 0.1 });
    }
    m.box(3.0, 0.08, 1.5, P.woodDark, 0, 2.98, -0.3);
    if (s.abandoned) {
      m.box(0.16, 3.2, 0.14, P.woodLight, 0.3, 0, 0.6, { rz: 0.75, j: 0.1 });
      m.box(0.16, 3.0, 0.14, P.wood, -0.2, 0, 0.7, { rz: -0.6, j: 0.1 });
    } else {
      lantern(m, 1.1, 2.3, 0.5, 1.2);
    }
  },
  rails: (m, rng, s) => {
    const len = s.len || 12;
    for (const sx of [-1, 1]) m.box(0.08, 0.1, len, P.iron, sx * 0.5, 0.1, 0);
    for (let k = -len / 2 + 0.4; k < len / 2; k += 0.85) m.box(1.5, 0.1, 0.22, P.woodDark, 0, 0.02, k, { j: 0.12, ry: (rng() - 0.5) * 0.08 });
  },
  'spoil-heap': (m, rng) => {
    m.ico(1.9, 0x6d665c, 0, 0.1, 0, { detail: 1, noise: 0.18, s: [1, 0.55, 1], g: [0.7, 1.05], vj: 0.06 });
    for (let i = 0; i < 6; i++) boulder(m, rng, 0.25 + rng() * 0.3, (rng() - 0.5) * 3, 0, (rng() - 0.5) * 3);
  },
  'crystal-rock': (m, rng, s) => {
    const r = s.r || 1.5;
    boulder(m, rng, r, 0, 0, 0, [0x5c5f66, 0x6a6c72]);
    for (let i = 0; i < 6; i++) {
      const a = rng() * TAU;
      m.cyl(0, 0.24 * r, r * (0.9 + rng() * 0.9), i % 3 ? P.cobalt : 0x5f8fd0, Math.cos(a) * r * 0.5, r * 0.4, Math.sin(a) * r * 0.5, { seg: 5, lean: [Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6], g: [0.7, 1.6] });
    }
  },
  scaffold: (m, rng) => {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) m.cyl(0.08, 0.1, 4.8, P.wood, sx * 1.9, -0.3, sz * 0.9, { seg: 5, lean: [(rng() - 0.5) * 0.2, 0] });
    }
    for (const y of [1.9, 3.9]) {
      m.box(4.2, 0.1, 2.0, P.woodLight, 0, y, 0, { j: 0.1 });
      m.box(4.4, 0.1, 0.1, P.woodDark, 0, y - 0.15, 0.95);
    }
    m.box(0.1, 4.6, 0.1, P.woodLight, 2.2, 0, 1.2, { lean: [-0.4, 0] });
    m.box(0.1, 4.4, 0.1, P.wood, -1.9, 0, 0.9, { rz: -0.75 });
  },
  'saw-shed': (m, rng) => {
    for (const sx of [-1, 0, 1]) {
      for (const sz of [-1, 1]) m.cyl(0.16, 0.2, 3.2, P.bark, sx * 4.6, -0.2, sz * 2.4, { seg: 6, j: 0.1 });
    }
    gableRoof(m, rng, 9.8, 5.2, 3.0, 1.9, { color: P.roofWood, edge: P.woodDark, wall: null, t: 0.12, rows: 3, eave: 0.5, verge: 0.4, sag: 0.15 });
    // saw frame with a log on the carriage
    m.box(7.5, 0.5, 1.2, P.woodDark, 0, 0, 0, { j: 0.05 });
    for (const sx of [-1, 1]) m.box(0.2, 2.6, 0.2, P.wood, 1.2 + sx * 0.0, 0.5, sx * 0.75, { nb: true });
    m.box(0.24, 0.2, 1.8, P.wood, 1.2, 3.0, 0);
    m.box(0.04, 2.2, 0.3, P.steel, 1.2, 0.6, 0);
    m.cyl(0.34, 0.38, 5.5, P.bark, -3.6, 0.9, 0, { rz: -Math.PI / 2, seg: 7, bottom: true });
    m.box(2.2, 0.08, 0.3, P.woodPale, 3.2, 0.55, 0.2);
    m.box(2.2, 0.08, 0.3, P.woodPale, 3.3, 0.55, -0.2);
    m.ico(0.5, P.woodPale, 1.4, 0.05, 1.2, { s: [1.3, 0.3, 1], noise: 0.2 });
  },
  'log-stack': (m, rng, s) => {
    const col = s.rotten ? [0x4a4038, 0x55503f] : [P.bark, P.wood];
    let i = 0;
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 4 - row; k++, i++) {
        m.cyl(0.3, 0.33, 4.6, col[i % 2], -2.3, 0.3 + row * 0.56, (k - (3 - row) / 2) * 0.66, { rz: -Math.PI / 2, seg: 7, bottom: true, j: 0.12 });
        m.cyl(0.24, 0.24, 0.02, P.woodPale, 2.31, 0.3 + row * 0.56, (k - (3 - row) / 2) * 0.66, { rz: -Math.PI / 2, seg: 7 });
      }
    }
    for (const sx of [-1.4, 1.4]) {
      for (const sz of [-1, 1]) m.box(0.1, 1.5, 0.1, P.woodDark, sx, 0, sz * 1.35, { nb: true });
    }
  },
  'plank-stack': (m, rng) => {
    for (let i = 0; i < 6; i++) m.box(3.0, 0.12, 1.2 + (rng() - 0.5) * 0.1, i % 2 ? P.woodPale : P.woodLight, (rng() - 0.5) * 0.1, 0.2 + i * 0.15, 0, { j: 0.08, ry: (rng() - 0.5) * 0.04 });
    for (const sx of [-1, 1]) m.box(0.14, 0.2, 1.3, P.woodDark, sx, 0, 0);
  },
  windmill: (m, rng) => {
    m.cyl(2.3, 3.2, 9.4, P.plaster, 0, -0.4, 0, { seg: 8, g: [0.74, 1.04], vj: 0.03 });
    m.cyl(3.3, 3.4, 1.0, P.stone, 0, -0.4, 0, { seg: 8, vj: 0.08 });
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) / 8 * TAU;
      m.box(0.16, 9.2, 0.14, P.woodDark, Math.cos(a) * 3.15, -0.3, Math.sin(a) * 3.15, { lean: [-Math.cos(a) * 0.9, -Math.sin(a) * 0.9], nb: true });
    }
    m.cyl(2.5, 2.5, 0.25, P.woodDark, 0, 9.0, 0, { seg: 8, bottom: true });
    m.cyl(0, 2.9, 2.6, P.thatch, 0, 9.25, 0, { seg: 8, vj: 0.06, g: [0.8, 1.06] });
    m.box(1.2, 1.2, 1.6, P.woodDark, 0, 9.6, 2.3);
    m.cyl(0.14, 0.14, 1.4, P.woodDark, 0, 10.2, 2.4, { rx: Math.PI / 2, seg: 6 });
    m.push(0, 0, 3.0, 0, 0, 0);
    doorAt(m, rng, 0, { color: P.wood, frame: P.woodDark, step: P.stone });
    m.pop();
    m.use('win').box(0.5, 0.7, 0.06, P.lantern, 0, 5.2, 2.72, { rx: -0.09 });
    m.use('flat');
    m.box(4.5, 0.1, 0.1, P.woodDark, -1.6, 9.1, -3.2, { rz: -0.9 });
  },
  field: (m, rng, s) => {
    const w = s.w || 12, d = s.d || 8;
    const crops = { wheat: [P.wheat, 0xc9a646], rye: [0xb9a25a, 0xa89350], flax: [P.flax, 0x6e93b8], flowers: [P.heather, P.clothRed, P.wheat, 0xd9d2c0] }[s.crop || 'wheat'];
    m.use('ground').box(w, 0.06, d, 0x5e4c36, 0, 0.0, 0, { vj: 0.08 });
    m.use('foliage');
    const rows = Math.round(d / 0.9);
    for (let r = 0; r < rows; r++) {
      const z = -d / 2 + (r + 0.5) * d / rows;
      const pieces = Math.round(w / 2.4);
      for (let k = 0; k < pieces; k++) {
        m.box(w / pieces - 0.02, 0.7 + rng() * 0.3, 0.62, crops[(r + k) % crops.length], -w / 2 + (k + 0.5) * w / pieces, 0.02, z, { top: [1, 0.12], vj: 0.14, g: [0.55, 1.12], sway: 0.35, nb: true, j: 0.08 });
      }
    }
    m.use('flat');
  },
  'fence-run': (m, rng, s) => {
    const len = s.hw * 2, n = Math.round(len / 2.2);
    for (let i = 0; i <= n; i++) m.box(0.12, 1.15, 0.12, P.wood, -len / 2 + i * len / n, 0, 0, { nb: true, lean: [(rng() - 0.5) * 0.1, (rng() - 0.5) * 0.1], j: 0.1 });
    m.box(len, 0.1, 0.06, P.woodLight, 0, 0.9, 0.05, { j: 0.1 });
    m.box(len, 0.1, 0.06, P.woodLight, 0, 0.45, 0.05, { j: 0.1 });
  },
  kiln: (m, rng, s) => {
    m.ico(2.2, 0x4f463c, 0, 0.1, 0, { detail: 1, noise: 0.1, s: [1, 0.95, 1], g: [0.7, 1.05], vj: 0.05 });
    m.cyl(0.4, 0.5, 0.3, 0x2a2623, 0, 2.05, 0, { seg: 7 });
    for (let i = 0; i < 6; i++) m.cyl(0.07, 0.08, 1.2, P.bark, Math.cos(i) * 2.0, 0, Math.sin(i) * 2.0, { seg: 4, lean: [-Math.cos(i) * 0.5, -Math.sin(i) * 0.5] });
    if (s.lit) {
      m.use('ember').cyl(0.3, 0.3, 0.05, P.ember, 0, 2.33, 0, { seg: 7 });
      m.use('ember').box(0.4, 0.3, 0.1, P.ember, 0, 0.25, 2.12);
      m.use('flat');
    }
  },
  'drying-rack': (m, rng) => {
    for (const sx of [-1, 1]) m.cyl(0.05, 0.06, 2.0, P.woodDark, sx * 1.5, 0, 0, { seg: 5, lean: [0, (rng() - 0.5) * 0.2] });
    m.box(3.2, 0.06, 0.06, P.wood, 0, 1.9, 0);
    m.box(3.2, 0.06, 0.06, P.wood, 0, 1.3, 0);
    for (let i = 0; i < 9; i++) {
      m.box(0.14, 0.5, 0.04, i % 2 ? 0x9aa0a0 : 0xb8aa90, -1.3 + i * 0.32, i % 2 ? 1.36 : 0.76, 0, { top: [0.3, 1], rz: (rng() - 0.5) * 0.2 });
    }
  },
  barrier: (m, rng) => {
    m.box(0.3, 1.3, 0.3, P.woodDark, 0, 0, 0, { nb: true });
    m.push(0, 1.15, 0, 0, 0, 0.75);
    for (let i = 0; i < 6; i++) m.box(0.9, 0.14, 0.14, i % 2 ? P.clothRed : P.clothCream, 0.45 + i * 0.9 - 0.9, 0, 0);
    m.pop();
    m.box(0.5, 0.5, 0.5, P.stone, -0.7, 0.9, 0, { rz: 0.75 });
  },
  'hitching-post': (m, rng) => {
    for (const sx of [-1, 1]) m.box(0.14, 1.1, 0.14, P.woodDark, sx * 1.1, 0, 0, { nb: true });
    m.cyl(0.07, 0.07, 2.6, P.wood, -1.3, 1.0, 0, { rz: -Math.PI / 2, seg: 6, bottom: true });
    emitProp(m, 'trough', 0, 0, 0.9, 0, {});
  },
  'hide-shelter': (m, rng) => {
    m.use('cloth');
    m.quad([-1.8, 0, -1.4], [1.8, 0, -1.4], [1.6, 2.0, 0.9], [-1.6, 2.0, 0.9], P.leather, { both: true, g: [0.7, 1.05] });
    m.use('flat');
    for (const sx of [-1, 1]) m.cyl(0.06, 0.07, 2.2, P.woodDark, sx * 1.6, 0, 1.0, { seg: 5, lean: [0, -0.1] });
    m.box(1.8, 0.14, 1.2, P.fur, 0, 0, -0.2, { j: 0.05 });
  },
  'rock-den': (m, rng, s) => {
    const v = s.variant;
    const col = v === 'ice' ? [0x9fb4c0, 0x8aa3b0, 0xb5c8d2] : v === 'mud' ? [0x5a5648, 0x4d4a3e] : ROCKS;
    boulder(m, rng, 2.6, -2.5, 0, -0.5, col, { s: [1, 1.25, 1.1] });
    boulder(m, rng, 2.4, 2.6, 0, -0.3, col, { s: [1, 1.2, 1.1] });
    boulder(m, rng, 2.9, 0, 0.4, -2.6, col, { s: [1.3, 1.1, 0.9] });
    m.ico(3.0, col[0], 0, 3.3, -0.6, { detail: 1, noise: 0.22, s: [1.25, 0.42, 1.0], g: [0.7, 1.08], rz: 0.08 });
    m.box(2.6, 2.3, 2.0, 0x0e0c0b, 0, 0, -0.6, { nb: true });
    if (v === 'spires') {
      for (let i = 0; i < 5; i++) m.cyl(0, 0.7, 3 + rng() * 3, col[i % col.length], -4 + i * 2, 0, -3 + rng(), { seg: 5, lean: [(rng() - 0.5) * 1.2, -0.4], g: [0.6, 1.1], vj: 0.06 });
    }
    if (v === 'ice') {
      m.ico(3.1, P.snow, 0, 3.75, -0.6, { detail: 1, noise: 0.12, s: [1.2, 0.2, 0.95] });
      for (let i = 0; i < 6; i++) m.cyl(0.12, 0, 0.6 + rng() * 0.9, 0xbfe6f0, -1.5 + i * 0.6, 2.2 - rng() * 0.3, 1.4, { seg: 4, g: [1.3, 0.9] });
    }
    if (v === 'webbed') {
      m.use('cloth');
      m.tri([-2.2, 0.3, 1.6], [2.3, 0.4, 1.7], [0.2, 3.3, 1.0], 0xd9dccf, { both: true, g: [0.75, 1.05] });
      m.tri([-4.2, 0.2, 0.5], [-1.8, 3.4, 0.2], [-2.2, 0.3, 2.4], 0xcfd2c5, { both: true });
      m.tri([4.2, 0.2, 0.5], [1.9, 3.3, 0.3], [2.4, 0.3, 2.5], 0xcfd2c5, { both: true });
      m.use('flat');
    }
    m.use('foliage');
    if (v !== 'ice') for (let i = 0; i < 4; i++) m.ico(0.8, v === 'mud' ? P.reed : P.moss, (rng() - 0.5) * 5, 3.6 + rng() * 0.3, -0.6 + (rng() - 0.5) * 2, { noise: 0.3, s: [1.4, 0.35, 1.2], sway: 0.1 });
    m.use('flat');
  },
  'egg-sac': (m, rng) => {
    m.ico(0.45, 0xd4d6c6, 0, 0.35, 0, { detail: 1, noise: 0.12, s: [1, 1.25, 1], g: [0.7, 1.05] });
    m.ico(0.3, 0xc4c6b4, 0.45, 0.22, 0.2, { noise: 0.15 });
  },
  reeds: (m, rng) => {
    m.use('foliage');
    for (let i = 0; i < 12; i++) m.cyl(0, 0.05, 1.3 + rng() * 0.8, i % 3 ? P.reed : 0x6f7040, (rng() - 0.5) * 2.2, 0, (rng() - 0.5) * 2.2, { seg: 3, lean: [(rng() - 0.5) * 0.4, (rng() - 0.5) * 0.4], sway: 0.6 });
    m.use('flat');
  },
  mushrooms: (m, rng) => {
    for (let i = 0; i < 5; i++) {
      const x = (rng() - 0.5) * 1.4, z = (rng() - 0.5) * 1.4, h = 0.25 + rng() * 0.3;
      m.cyl(0.05, 0.07, h, P.bone, x, 0, z, { seg: 5 });
      m.cyl(0.03, 0.2 + rng() * 0.1, 0.14, i % 2 ? P.clothRed : 0xa8744e, x, h, z, { seg: 7 });
    }
  },
  'giant-oak': (m, rng) => {
    m.cyl(1.7, 2.7, 9, P.bark, 0, -0.5, 0, { seg: 10, vj: 0.07, g: [0.62, 1.05], lean: [0.4, -0.3] });
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + rng() * 0.3;
      m.cyl(0.25, 0.9, 4.2, P.barkDark, Math.cos(a) * 4.6, -0.6, Math.sin(a) * 4.6, { seg: 5, lean: [-Math.cos(a) * 3.2, -Math.sin(a) * 3.2], g: [0.7, 1.05] });
    }
    const boughs = [];
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + rng() * 0.5, len = 8 + rng() * 4;
      const tip = [Math.cos(a) * len, Math.sin(a) * len];
      m.cyl(0.3, 0.75, 9 + rng() * 3, P.bark, 0.3, 7.2, -0.2, { seg: 6, lean: tip, g: [0.75, 1.05] });
      boughs.push(tip);
    }
    m.use('foliage');
    const greens = [P.leaf, P.leafDark, 0x426e36, P.leafPale];
    m.ico(7.5, P.leafDark, 0.5, 21, -0.3, { detail: 1, noise: 0.2, s: [1.1, 0.75, 1.1], g: [0.6, 1.12], sway: 0.5 });
    boughs.forEach(([bx, bz], i) => {
      m.ico(5.2 + rng() * 1.5, greens[i % 4], bx * 0.95, 16 + rng() * 3, bz * 0.95, { detail: 1, noise: 0.22, s: [1.1, 0.72, 1.1], g: [0.6, 1.12], sway: 0.6 });
      m.ico(3.6 + rng(), greens[(i + 1) % 4], bx * 1.35, 13 + rng() * 3, bz * 1.35, { detail: 1, noise: 0.25, s: [1.1, 0.7, 1.1], g: [0.62, 1.1], sway: 0.7 });
    });
    m.use('flat');
  },
  lighthouse: (m, rng) => {
    m.cyl(4.6, 5.2, 2.4, 0xb8a47c, 0, -1.4, 0, { seg: 10, vj: 0.07, g: [0.7, 1.03] });
    m.cyl(2.5, 3.9, 19, 0xe6dcc0, 0, 1.0, 0, { seg: 10, vj: 0.03, g: [0.78, 1.04] });
    for (const k of [0.3, 0.62]) m.cyl(3.9 - 1.4 * k + 0.03, 3.9 - 1.4 * (k - 0.09) + 0.03, 1.7, P.roofAmber, 0, 1.0 + 19 * (k - 0.09), 0, { seg: 10, vj: 0.04 });
    m.cyl(3.5, 2.6, 0.5, 0xcdb588, 0, 20, 0, { seg: 10, bottom: true });
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU;
      m.box(0.1, 1.0, 0.1, P.iron, Math.cos(a) * 3.3, 20.5, Math.sin(a) * 3.3, { nb: true });
    }
    m.cyl(3.35, 3.35, 0.08, P.iron, 0, 21.5, 0, { seg: 10 });
    m.cyl(1.7, 1.7, 0.5, 0xcdb588, 0, 20.5, 0, { seg: 8 });
    m.use('lamp').cyl(1.5, 1.5, 2.6, P.lantern, 0, 21.0, 0, { seg: 8 });
    m.use('flat');
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      m.box(0.12, 2.6, 0.12, P.iron, Math.cos(a) * 1.55, 21.0, Math.sin(a) * 1.55, { nb: true });
    }
    m.cyl(0, 2.2, 2.2, P.roofAmber, 0, 23.6, 0, { seg: 8, g: [0.85, 1.08] });
    m.ico(0.25, P.gold, 0, 25.9, 0);
    m.push(0, 1.0, 3.85);
    doorAt(m, rng, 0, { color: P.clothBlue, frame: P.woodDark, step: 0xcdb588 });
    m.pop();
    for (const [y, a] of [[7, 0.5], [12, 2.4], [16.5, 4.2]]) {
      const r = 3.9 - 1.4 * (y - 1) / 19 - 0.04;
      m.use('win').box(0.5, 0.9, 0.1, P.lantern, Math.sin(a) * r, y, Math.cos(a) * r, { ry: a });
      m.use('flat');
    }
  },
  'standing-stone': (m, rng, s) => {
    const h = s.h || 3;
    if (s.fallen) {
      m.box(0.9, 0.7, h, 0x7d7b74, 0, 0, 0, { vj: 0.08, ry: 0.4, top: [0.9, 0.8], j: 0.06 });
      return;
    }
    m.box(1.0, h, 0.6, 0x7d7b74, 0, -0.4, 0, { top: [0.6, 0.7], vj: 0.09, g: [0.62, 1.06], lean: [(rng() - 0.5) * 0.5, (rng() - 0.5) * 0.4], j: 0.08 });
    m.box(0.5, 0.06, 0.03, 0x5c5a55, 0, h * 0.55, 0.26, { nb: true });
    m.box(0.06, 0.4, 0.03, 0x5c5a55, 0, h * 0.42, 0.27, { nb: true });
    m.use('foliage').ico(0.45, P.moss, 0.2, 0.15, 0.25, { noise: 0.3, s: [1.3, 0.5, 1], sway: 0.1 });
    m.use('flat');
  },
  'flat-stone': (m, rng) => {
    m.cyl(1.35, 1.55, 0.55, 0x85837b, 0, -0.05, 0, { seg: 8, vj: 0.1, g: [0.7, 1.05] });
    m.cyl(0.5, 0.5, 0.03, 0x5c5a55, 0, 0.5, 0, { seg: 8 });
  },
  'rock-spire': (m, rng) => {
    m.cyl(2.0, 4.9, 12, P.rock, 0, -1, 0, { seg: 8, vj: 0.1, g: [0.6, 1.05], lean: [0.8, -0.5] });
    m.cyl(0.9, 2.2, 8, 0x7a766e, 0.8, 10.5, -0.5, { seg: 7, vj: 0.1, g: [0.8, 1.08], lean: [1.4, 0.6] });
    m.cyl(0, 1.3, 4.4, P.rockWarm, 2.1, 17.6, 0.1, { seg: 6, vj: 0.08, lean: [0.6, 0.3] });
    boulder(m, rng, 2.6, -3.4, 0, 1.5);
    boulder(m, rng, 2.0, 3.2, 0, -2.6);
    boulder(m, rng, 1.5, 1, 0, 4.2);
    // the eagles' nest on a ledge
    m.cyl(1.1, 0.7, 0.5, P.bark, -0.8, 12.2, 1.2, { seg: 8, vj: 0.15 });
    m.ico(0.2, P.bone, -0.7, 12.75, 1.2);
    m.ico(0.2, P.bone, -1.0, 12.75, 1.0);
  },
};

/** Draw a structure of a POI layout (falls back to props.js for prop kinds). */
export function emitStructure(m, s, rng) {
  const fn = STRUCTURES[s.kind];
  m.use('flat');
  if (fn) fn(m, rng, s);
  else if (s.kind === 'banner') emitProp(m, 'banner', 0, 0, 0, 0, { seed: s.seed, color: s.color === 'guard' ? P.guardBlue : P.banditRed });
  else if (s.kind === 'ore-cart' && s.tipped) {
    m.push(0, 0.5, 0, 0, 0, 1.3);
    emitProp(m, 'ore-cart', 0, 0, 0, 0, { seed: s.seed });
    m.pop();
  } else emitProp(m, s.kind, 0, 0, 0, 0, { seed: s.seed });
  m.use('flat');
}

export { flame };
