// Props: small world objects (furniture, containers, camp gear, road obstacles …).
// Every prop is a function drawing into a Mesher at the origin, facing +z; createProp() wraps one into an Object3D
// (1–3 draw calls on shared materials), emitProp() bakes one into a bigger merged mesh (cities, POIs).
import { PALETTE as P } from './materials.js';
import { makeRng } from '../core/noise.js';
import { Mesher } from './mesher.js';
import { EXTRA_PROPS } from './props-extra.js';

const TAU = Math.PI * 2;

/** Animated fire: call inside a prop; s = size. */
export function flame(m, x, y, z, s = 1) {
  m.use('fire');
  m.cyl(0, 0.3 * s, 0.95 * s, P.ember, x, y, z, { seg: 5, sway: 1 });
  m.cyl(0, 0.2 * s, 0.7 * s, P.flame, x + 0.05 * s, y + 0.05 * s, z + 0.04 * s, { seg: 4, sway: 1 });
  m.cyl(0, 0.16 * s, 0.55 * s, P.amber, x - 0.16 * s, y, z - 0.1 * s, { seg: 4, sway: 1 });
  m.cyl(0, 0.14 * s, 0.5 * s, P.ember, x + 0.12 * s, y, z - 0.16 * s, { seg: 4, sway: 1 });
  m.use('flat');
}

/** A lantern box that glows at night. */
export function lantern(m, x, y, z, s = 1) {
  m.box(0.26 * s, 0.05 * s, 0.26 * s, P.iron, x, y, z);
  m.use('lamp').box(0.2 * s, 0.26 * s, 0.2 * s, P.lantern, x, y + 0.05 * s, z, { nb: true });
  m.use('flat');
  m.cyl(0.03 * s, 0.17 * s, 0.14 * s, P.iron, x, y + 0.31 * s, z, { seg: 4 });
}

function chestBody(m, open) {
  m.box(0.95, 0.5, 0.6, P.wood, 0, 0, 0, { g: [0.75, 1.05], j: 0.04 });
  for (const sx of [-0.36, 0.36]) m.box(0.09, 0.52, 0.63, P.iron, sx, 0, 0, { nb: true });
  m.box(0.99, 0.07, 0.64, P.iron, 0, 0.44, 0, { nb: true });
  m.box(0.14, 0.18, 0.05, P.gold, 0, 0.32, 0.31);
  if (open) {
    m.push(0, 0.5, -0.3, 0, -1.25);
    m.box(0.95, 0.24, 0.6, P.wood, 0, 0, 0.3, { top: [1, 0.7], j: 0.04 });
    for (const sx of [-0.36, 0.36]) m.box(0.09, 0.26, 0.63, P.iron, sx, 0, 0.3, { top: [1, 0.7], nb: true });
    m.pop();
    m.box(0.8, 0.06, 0.46, 0x2a1f16, 0, 0.42, 0);
  } else {
    m.box(0.95, 0.24, 0.6, P.wood, 0, 0.5, 0, { top: [1, 0.7], j: 0.04 });
    for (const sx of [-0.36, 0.36]) m.box(0.09, 0.26, 0.63, P.iron, sx, 0.5, 0, { top: [1, 0.7], nb: true });
  }
}

function barrel(m, rng, x = 0, y = 0, z = 0, s = 1) {
  m.cyl(0.3 * s, 0.34 * s, 0.42 * s, P.wood, x, y, z, { seg: 8, g: [0.8, 1], j: 0.06 });
  m.cyl(0.3 * s, 0.34 * s, 0.42 * s, P.wood, x, y + 0.84 * s, z, { seg: 8, rx: Math.PI, bottom: true, g: [1.05, 0.95], j: 0.06 });
  for (const k of [0.16, 0.66]) m.cyl(0.345 * s, 0.345 * s, 0.05 * s, P.iron, x, y + k * s, z, { seg: 8 });
}

function crate(m, rng, x = 0, y = 0, z = 0, s = 0.7, ry = 0) {
  m.push(x, y, z, ry);
  m.box(s, s, s, P.woodLight, 0, 0, 0, { g: [0.8, 1.05], j: 0.1 });
  for (const sx of [-1, 1]) {
    m.box(0.07 * s, s * 1.02, s * 1.04, P.wood, sx * s * 0.46, 0, 0, { nb: true });
    m.box(s * 1.04, s * 1.02, 0.07 * s, P.wood, 0, 0, sx * s * 0.46, { nb: true });
  }
  m.pop();
}

function sack(m, rng, x = 0, y = 0, z = 0, s = 1) {
  m.ico(0.34 * s, P.canvas, x, y + 0.3 * s, z, { s: [1, 1.05, 0.85], noise: 0.12, detail: 1, g: [0.75, 1.05] });
  m.cyl(0.05 * s, 0.1 * s, 0.14 * s, P.canvas, x, y + 0.6 * s, z, { seg: 5 });
}

function wheel(m, x, y, z, r, ry = 0) {
  m.push(x, y, z, ry);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU;
    m.box(0.09, r * 0.66, 0.1, P.woodDark, 0, Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, { c: true, rx: a + Math.PI / 2 });
  }
  for (let i = 0; i < 4; i++) m.box(0.06, r * 1.9, 0.07, P.wood, 0, 0, 0, { c: true, rx: i * Math.PI / 4 });
  m.cyl(0.1, 0.1, 0.2, P.iron, -0.1, 0, 0, { rz: -Math.PI / 2, seg: 6, bottom: true });
  m.pop();
}

function cart(m, rng, broken) {
  m.push(0, 0, 0, 0, 0, broken ? 0.22 : 0);
  m.box(1.5, 0.12, 2.6, P.wood, 0, 0.75, 0, { j: 0.05 });
  for (const sx of [-1, 1]) m.box(0.08, 0.5, 2.6, P.woodLight, sx * 0.74, 0.86, 0, { j: 0.08, lean: [sx * 0.12, 0], nb: true });
  m.box(1.5, 0.5, 0.08, P.woodLight, 0, 0.86, -1.28, { j: 0.08, nb: true });
  for (const sx of [-1, 1]) m.box(0.09, 0.09, 2.0, P.woodDark, sx * 0.4, 0.72, 2.2, { rx: broken ? 0.3 : 0.12 });
  wheel(m, 0.86, 0.62, -0.2, 0.62);
  if (!broken) wheel(m, -0.86, 0.62, -0.2, 0.62);
  m.pop();
  if (broken) {
    wheel(m, -1.5, 0.12, 0.9, 0.62, 0.4);
    crate(m, rng, 1.2, 0, 1.4, 0.55, 0.6);
    m.box(1.2, 0.06, 0.25, P.woodLight, -0.6, 0.02, -1.9, { ry: 0.7 });
  } else {
    sack(m, rng, -0.3, 0.86, -0.6, 0.9);
    crate(m, rng, 0.3, 0.86, 0.4, 0.5, 0.3);
  }
}

function tent(m, rng, cloth, trim, s = 1) {
  const w = 3.2 * s, d = 3.6 * s, h = 2.3 * s;
  m.use('cloth');
  const A = [-w / 2, 0, d / 2], B = [w / 2, 0, d / 2], C = [w / 2, 0, -d / 2], D = [-w / 2, 0, -d / 2];
  const R1 = [0, h, d / 2 - 0.2], R2 = [0, h * 0.94, -d / 2 + 0.2];
  m.quad(B, C, R2, R1, cloth, { g: [0.78, 1.05] });
  m.quad(D, A, R1, R2, cloth, { g: [0.72, 1.0] });
  m.tri(C, D, R2, cloth, { g: [0.7, 0.95] });
  m.tri(A, [-w * 0.16, 0, d / 2], R1, trim, { g: [0.75, 1] });
  m.tri([w * 0.16, 0, d / 2], B, R1, trim, { g: [0.75, 1] });
  m.use('flat');
  m.cyl(0.05, 0.06, h + 0.25, P.woodDark, 0, 0, d / 2 - 0.2, { seg: 5 });
  m.cyl(0.05, 0.06, h + 0.1, P.woodDark, 0, 0, -d / 2 + 0.2, { seg: 5 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) m.cyl(0.03, 0.04, 0.4, P.wood, sx * (w / 2 + 0.35), 0, sz * d * 0.4, { seg: 4, lean: [sx * 0.1, 0] });
  }
}

function logs(m, rng, n, len, r, x0 = 0, y0 = 0) {
  let i = 0;
  for (let row = 0; i < n; row++) {
    const inRow = Math.max(1, Math.ceil(Math.sqrt(n * 2)) - row);
    for (let k = 0; k < inRow && i < n; k++, i++) {
      m.cyl(r, r, len, row % 2 ? P.wood : P.bark, x0 + (k - (inRow - 1) / 2) * r * 2.05, y0 + r + row * r * 1.75, -len / 2 + (rng() - 0.5) * 0.1, { rx: Math.PI / 2, seg: 6, bottom: true, j: 0.1 });
    }
  }
}

const PROPS = {
  chest: m => chestBody(m, false),
  'chest-open': m => {
    chestBody(m, true);
    for (let i = 0; i < 5; i++) m.ico(0.07, P.gold, -0.25 + i * 0.12, 0.47, (i % 2) * 0.1 - 0.05);
  },
  crate: (m, rng) => crate(m, rng),
  barrel: (m, rng) => barrel(m, rng),
  sack: (m, rng) => {
    sack(m, rng, 0, 0, 0, 1);
    sack(m, rng, 0.45, 0, 0.2, 0.85);
  },
  cart: (m, rng) => cart(m, rng, false),
  'wagon-wreck': (m, rng) => cart(m, rng, true),
  'market-stall': (m, rng) => {
    m.box(2.6, 0.9, 1.0, P.wood, 0, 0, 0, { nb: true, j: 0.06, g: [0.8, 1.05] });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) m.box(0.1, sz > 0 ? 2.0 : 2.4, 0.1, P.woodDark, sx * 1.3, 0, sz * 0.75, { nb: true });
    }
    m.use('cloth');
    for (let i = 0; i < 4; i++) {
      const xa = -1.5 + i * 0.75, xb = xa + 0.75;
      m.quad([xa, 2.0, 0.95], [xb, 2.0, 0.95], [xb, 2.4, -0.85], [xa, 2.4, -0.85], i % 2 ? P.clothRed : P.clothCream, { g: [0.88, 1.04] });
    }
    m.use('flat');
    for (let i = 0; i < 4; i++) m.ico(0.16, [P.clothRed, P.wheat, P.leaf, P.amber][i], -0.9 + i * 0.6, 1.02, 0, { noise: 0.2 });
  },
  bench: (m, rng) => {
    m.box(1.7, 0.07, 0.42, P.woodLight, 0, 0.34, 0, { j: 0.06 });
    for (const sx of [-1, 1]) m.box(0.1, 0.34, 0.38, P.wood, sx * 0.7, 0, 0, { nb: true, top: [1, 0.7] });
    m.box(1.7, 0.3, 0.06, P.woodLight, 0, 0.62, -0.2, { j: 0.06, rx: -0.12 });
  },
  table: (m, rng) => {
    m.box(1.7, 0.09, 0.8, P.woodLight, 0, 0.74, 0, { j: 0.05 });
    for (const sx of [-1, 1]) m.box(0.1, 0.74, 0.66, P.wood, sx * 0.68, 0, 0, { nb: true, top: [1, 0.4] });
    for (const sz of [-1, 1]) {
      m.box(1.6, 0.07, 0.3, P.wood, 0, 0.34, sz * 0.82, { j: 0.06 });
      for (const sx of [-1, 1]) m.box(0.08, 0.34, 0.26, P.woodDark, sx * 0.65, 0, sz * 0.82, { nb: true });
    }
    m.cyl(0.07, 0.06, 0.16, P.clay, 0.3, 0.83, 0.1, { seg: 6 });
    m.cyl(0.07, 0.06, 0.16, P.clay, -0.4, 0.83, -0.12, { seg: 6 });
    m.cyl(0.16, 0.13, 0.05, P.woodDark, -0.05, 0.83, 0.18, { seg: 7 });
  },
  well: (m, rng) => {
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU;
      m.box(0.72, 0.9, 0.36, i % 2 ? P.stone : P.stoneLight, Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05, { ry: -a + Math.PI / 2, nb: true, j: 0.12, top: [0.95, 0.9] });
    }
    m.cyl(0.9, 0.9, 0.05, P.waterDeep, 0, 0.45, 0, { seg: 10 });
    for (const sx of [-1, 1]) m.box(0.16, 2.5, 0.16, P.woodDark, sx * 1.15, 0, 0, { nb: true, lean: [0, 0.04] });
    m.cyl(0.09, 0.09, 2.3, P.wood, -1.15, 1.9, 0, { rz: -Math.PI / 2, seg: 6 });
    m.gable(1.6, 0.7, 2.9, P.roofWood, 0, 2.5, 0, { ry: Math.PI / 2, j: 0.05 });
    m.box(0.03, 0.9, 0.03, P.canvas, 0.2, 1.0, 0, { nb: true });
    m.cyl(0.16, 0.13, 0.26, P.wood, 0.2, 0.78, 0, { seg: 6 });
    m.box(0.5, 0.06, 0.06, P.iron, 1.5, 1.9, 0);
  },
  'lantern-post': (m, rng) => {
    m.cyl(0.07, 0.11, 3.1, P.woodDark, 0, 0, 0, { seg: 6, lean: [(rng() - 0.5) * 0.14, (rng() - 0.5) * 0.14], g: [0.8, 1.05] });
    m.cyl(0.16, 0.2, 0.3, P.stone, 0, 0, 0, { seg: 6 });
    m.box(0.07, 0.07, 0.6, P.woodDark, 0, 3.0, 0.24);
    m.box(0.05, 0.5, 0.05, P.woodDark, 0, 2.6, 0.12, { rx: 0.7 });
    lantern(m, 0, 2.56, 0.46, 1.25);
  },
  'torch-stand': (m, rng) => {
    m.cyl(0.05, 0.07, 1.7, P.woodDark, 0, 0, 0, { seg: 5, lean: [0.05, 0.02] });
    for (let i = 0; i < 3; i++) m.box(0.05, 0.6, 0.05, P.woodDark, Math.cos(i * 2.1) * 0.18, 0, Math.sin(i * 2.1) * 0.18, { lean: [-Math.cos(i * 2.1) * 0.18, -Math.sin(i * 2.1) * 0.18] });
    m.cyl(0.12, 0.07, 0.18, P.iron, 0.05, 1.7, 0.02, { seg: 6 });
    flame(m, 0.05, 1.84, 0.02, 0.5);
  },
  campfire: (m, rng) => {
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU;
      m.ico(0.17, i % 2 ? P.stone : P.stoneDark, Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62, { noise: 0.25, s: [1.1, 0.8, 1] });
    }
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + 0.3;
      m.cyl(0.07, 0.08, 0.95, 0x2b221b, Math.cos(a) * 0.42, 0.04, Math.sin(a) * 0.42, { seg: 5, lean: [-Math.cos(a) * 0.42, -Math.sin(a) * 0.42], j: 0.15 });
    }
    m.use('ember').cyl(0.34, 0.4, 0.07, P.ember, 0, 0.02, 0, { seg: 7 });
    flame(m, 0, 0.08, 0, 1.15);
  },
  tent: (m, rng) => tent(m, rng, P.canvas, 0xa8986e),
  'bandit-tent': (m, rng) => {
    tent(m, rng, 0x6b5a48, P.banditRed, 1.1);
    m.box(0.06, 0.06, 0.06, P.bone, 0, 2.75, 1.78);
    m.use('cloth').tri([0, 2.7, 1.8], [0.7, 2.5, 1.85], [0, 2.3, 1.8], P.banditRed, { both: true });
    m.use('flat');
  },
  'palisade-section': (m, rng) => {
    for (let i = 0; i < 9; i++) {
      const h = 3.2 + rng() * 0.6, x = -2 + i * 0.5;
      m.cyl(0.22, 0.25, h, i % 2 ? P.bark : P.wood, x, 0, (rng() - 0.5) * 0.1, { seg: 5, j: 0.12, g: [0.72, 1.05], lean: [(rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08] });
      m.cyl(0, 0.22, 0.5, P.woodLight, x, h, 0, { seg: 5 });
    }
    m.box(4.5, 0.16, 0.12, P.woodDark, 0, 2.1, -0.26);
  },
  'fence-section': (m, rng) => {
    for (const sx of [-1.5, 0, 1.5]) m.box(0.12, 1.15, 0.12, P.wood, sx, 0, 0, { nb: true, lean: [(rng() - 0.5) * 0.1, (rng() - 0.5) * 0.1], j: 0.1 });
    m.box(3.1, 0.1, 0.06, P.woodLight, 0, 0.9, 0.05, { rz: (rng() - 0.5) * 0.04, j: 0.1 });
    m.box(3.1, 0.1, 0.06, P.woodLight, 0, 0.45, 0.05, { rz: (rng() - 0.5) * 0.05, j: 0.1 });
  },
  'hay-bale': (m, rng) => {
    m.cyl(0.55, 0.55, 1.1, P.wheat, 0, 0.55, -0.55, { rx: Math.PI / 2, seg: 9, bottom: true, j: 0.06, vj: 0.06 });
    m.cyl(0.56, 0.56, 0.06, P.woodLight, 0, 0.55, -0.2, { rx: Math.PI / 2, seg: 9 });
  },
  woodpile: (m, rng) => {
    logs(m, rng, 9, 1.1, 0.14);
    for (const sx of [-1, 1]) m.box(0.07, 0.85, 0.07, P.woodDark, sx * 0.72, 0, 0, { nb: true });
  },
  anvil: m => {
    m.cyl(0.3, 0.36, 0.5, P.bark, 0, 0, 0, { seg: 7, j: 0.05 });
    m.box(0.3, 0.16, 0.22, P.iron, 0, 0.5, 0);
    m.box(0.62, 0.16, 0.24, 0x4a4f56, 0, 0.66, 0, { top: [1.05, 1] });
    m.cyl(0, 0.1, 0.3, 0x4a4f56, 0.31, 0.74, 0, { rz: -Math.PI / 2, seg: 5 });
    m.box(0.05, 0.05, 0.4, P.wood, -0.1, 0.83, 0.05, { ry: 0.5 });
    m.box(0.12, 0.09, 0.09, P.iron, -0.2, 0.82, -0.1, { ry: 0.5 });
  },
  forge: (m, rng) => {
    m.box(1.6, 0.9, 1.2, P.stoneDark, 0, 0, 0, { vj: 0.1, nb: true, top: [0.94, 0.94] });
    m.box(1.3, 0.12, 0.9, 0x1c1714, 0, 0.9, 0);
    m.use('ember').box(0.8, 0.07, 0.5, P.ember, 0, 1.0, 0);
    flame(m, 0, 1.02, 0, 0.45);
    m.box(1.6, 1.3, 0.3, P.stoneDark, 0, 0.9, -0.5, { vj: 0.1, top: [0.5, 1] });
    m.box(0.5, 1.5, 0.4, P.stone, 0, 2.1, -0.5, { vj: 0.1, top: [0.8, 0.8] });
    m.box(0.5, 0.35, 0.7, P.leatherDark, 1.15, 0.6, 0, { top: [0.3, 0.6], rz: 0.1 });
  },
  workbench: (m, rng) => {
    m.box(1.8, 0.1, 0.75, P.woodLight, 0, 0.82, 0, { j: 0.05 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) m.box(0.1, 0.82, 0.1, P.wood, sx * 0.8, 0, sz * 0.3, { nb: true });
    }
    m.box(1.6, 0.06, 0.6, P.wood, 0, 0.25, 0);
    m.box(0.7, 0.06, 0.16, P.woodPale, -0.3, 0.92, 0.1, { ry: 0.3 });
    m.box(0.3, 0.14, 0.12, P.iron, 0.55, 0.92, -0.2);
    m.box(0.05, 0.05, 0.45, P.wood, 0.3, 0.93, 0.15, { ry: -0.6 });
  },
  loom: (m, rng) => {
    for (const sx of [-1, 1]) {
      m.box(0.1, 1.8, 0.1, P.wood, sx * 0.75, 0, -0.3, { nb: true });
      m.box(0.1, 1.0, 0.1, P.wood, sx * 0.75, 0, 0.5, { nb: true });
      m.box(0.08, 0.08, 1.0, P.woodDark, sx * 0.75, 0.9, 0.1);
    }
    m.box(1.6, 0.1, 0.1, P.woodDark, 0, 1.75, -0.3);
    m.cyl(0.08, 0.08, 1.5, P.woodLight, -0.75, 0.95, 0.5, { rz: -Math.PI / 2, seg: 6 });
    m.use('cloth');
    m.quad([-0.6, 0.98, 0.5], [0.6, 0.98, 0.5], [0.6, 1.7, -0.3], [-0.6, 1.7, -0.3], P.clothCream, { both: true });
    m.quad([-0.6, 0.98, 0.5], [0.6, 0.98, 0.5], [0.6, 1.2, 0.26], [-0.6, 1.2, 0.26], P.clothBlue, { both: true });
    m.use('flat');
  },
  grindstone: m => {
    for (const sx of [-1, 1]) {
      m.box(0.08, 0.8, 0.5, P.wood, sx * 0.2, 0, 0, { nb: true, top: [1, 0.3] });
    }
    m.cyl(0.38, 0.38, 0.14, P.stoneLight, -0.07, 0.72, 0, { rz: -Math.PI / 2, seg: 10, bottom: true });
    m.box(0.3, 0.05, 0.05, P.iron, 0.35, 0.72, 0);
    m.box(0.05, 0.2, 0.05, P.iron, 0.5, 0.56, 0);
  },
  'notice-board': (m, rng) => {
    for (const sx of [-1, 1]) m.box(0.14, 2.3, 0.14, P.woodDark, sx * 0.85, 0, 0, { nb: true, lean: [0, (rng() - 0.5) * 0.06] });
    m.box(1.9, 1.15, 0.08, P.wood, 0, 0.95, 0, { j: 0.04 });
    m.gable(0.5, 0.3, 2.3, P.roofWood, 0, 2.25, 0, { ry: Math.PI / 2 });
    const notes = [[-0.55, 1.6, 0.1], [0.05, 1.5, -0.08], [0.55, 1.65, 0.05], [-0.3, 1.15, -0.05], [0.4, 1.12, 0.12]];
    for (const [nx, ny, rz] of notes) m.box(0.34, 0.42, 0.02, rng() < 0.3 ? P.clothCream : 0xe6dcc0, nx, ny - 0.2, 0.05, { rz, nb: true, j: 0.05 });
    m.box(0.05, 0.05, 0.03, P.clothRed, 0.05, 1.68, 0.07);
  },
  signpost: (m, rng, o) => {
    m.cyl(0.07, 0.1, 2.7, P.woodDark, 0, 0, 0, { seg: 6, lean: [0.06, -0.03], g: [0.8, 1.05] });
    m.ico(0.2, P.stone, 0.05, 0.05, 0, { noise: 0.2, s: [1.5, 0.6, 1.3] });
    const arms = o.arms || [0.3, 2.4];
    arms.forEach((a, i) => {
      m.push(0.05, 2.35 - i * 0.36, 0, a);
      m.box(0.05, 0.24, 1.15, P.woodLight, 0, 0, 0.62, { j: 0.06 });
      m.box(0.05, 0.18, 0.18, P.woodLight, 0, 0.03, 1.2, { rx: Math.PI / 4 });
      m.pop();
    });
  },
  banner: (m, rng, o) => {
    m.cyl(0.05, 0.07, 4.2, P.woodDark, 0, 0, 0, { seg: 5 });
    m.box(1.0, 0.06, 0.06, P.woodDark, 0.45, 3.9, 0);
    m.use('cloth');
    const c = o.color || P.clothRed;
    m.quad([0.05, 2.2, 0], [0.9, 2.2, 0.05], [0.9, 3.9, 0], [0.05, 3.9, 0], c, { both: true, g: [0.8, 1.05] });
    m.tri([0.05, 2.2, 0], [0.47, 1.8, 0.03], [0.9, 2.2, 0.05], c, { both: true });
    m.use('flat');
    m.ico(0.1, P.gold, 0, 4.25, 0);
  },
  crane: (m, rng) => {
    m.box(1.8, 0.3, 1.8, P.woodDark, 0, 0, 0, { j: 0.05 });
    m.cyl(0.2, 0.26, 5.2, P.wood, 0, 0.3, 0, { seg: 6, g: [0.8, 1.05] });
    for (let i = 0; i < 4; i++) m.box(0.12, 2.4, 0.12, P.woodDark, Math.cos(i * 1.57) * 0.8, 0.2, Math.sin(i * 1.57) * 0.8, { lean: [-Math.cos(i * 1.57) * 0.7, -Math.sin(i * 1.57) * 0.7] });
    m.push(0, 5.3, 0, 0, -0.5);
    m.box(0.2, 0.2, 5.4, P.wood, 0, 0, 1.6, { j: 0.05 });
    m.pop();
    m.box(0.12, 2.6, 0.12, P.woodDark, 0, 3.4, -0.5, { rx: -0.8 });
    m.box(0.04, 3.0, 0.04, P.canvas, 0, 4.2, 3.75, { nb: true });
    m.box(0.16, 0.2, 0.08, P.iron, 0, 4.0, 3.75);
    crate(m, rng, 0, 3.3, 3.75, 0.7, 0.4);
    wheel(m, 0.3, 1.5, -0.9, 0.7);
  },
  boat: (m, rng) => {
    const hull = P.wood;
    m.box(1.3, 0.5, 3.4, hull, 0, 0, 0, { top: [1.25, 1.02], g: [0.7, 1.05], j: 0.04 });
    m.box(1.3, 0.5, 1.2, hull, 0, 0, 2.25, { top: [1.2, 1], lean: [0, 0.35], g: [0.7, 1.05] });
    m.cyl(0, 0.75, 1.1, hull, 0, 0.3, 2.85, { rx: Math.PI / 2, seg: 4, a0: Math.PI / 4 });
    m.box(1.5, 0.06, 0.3, P.woodLight, 0, 0.42, -0.6);
    m.box(1.5, 0.06, 0.3, P.woodLight, 0, 0.42, 0.9);
    m.box(0.06, 0.06, 2.6, P.woodPale, 0.5, 0.52, 0.2, { ry: 0.12 });
    m.box(0.3, 0.03, 0.5, P.woodPale, 0.66, 0.52, 1.5, { ry: 0.12 });
  },
  'fishing-net': (m, rng) => {
    for (const sx of [-1, 1]) m.cyl(0.05, 0.06, 2.0, P.woodDark, sx * 1.1, 0, 0, { seg: 5, lean: [sx * 0.1, 0] });
    m.box(2.5, 0.05, 0.05, P.wood, 0, 1.9, 0);
    m.use('cloth');
    for (let i = 0; i < 6; i++) {
      const xa = -1.15 + i * 0.38;
      m.quad([xa, 0.35 + (i % 2) * 0.12, 0.05], [xa + 0.3, 0.3, 0.02], [xa + 0.3, 1.88, 0], [xa, 1.88, 0], i % 2 ? 0x7d7a5c : 0x6b6a52, { both: true, g: [0.7, 1] });
    }
    m.use('flat');
    for (let i = 0; i < 4; i++) m.ico(0.09, P.woodPale, -0.9 + i * 0.6, 0.38, 0.06);
  },
  beehive: (m, rng) => {
    for (const sx of [-1, 1]) m.box(0.08, 0.4, 0.5, P.woodDark, sx * 0.25, 0, 0, { nb: true });
    m.box(0.7, 0.06, 0.6, P.wood, 0, 0.4, 0);
    for (let i = 0; i < 4; i++) m.cyl(0.3 - i * 0.055, 0.34 - i * 0.05, 0.2, i % 2 ? 0xc9a85a : 0xb8964c, 0, 0.46 + i * 0.19, 0, { seg: 8, j: 0.05 });
    m.cyl(0, 0.14, 0.14, 0xb8964c, 0, 1.22, 0, { seg: 8 });
    m.box(0.1, 0.07, 0.04, 0x2a2018, 0, 0.5, 0.33);
  },
  scarecrow: (m, rng) => {
    m.cyl(0.05, 0.06, 2.1, P.woodDark, 0, 0, 0, { seg: 5, lean: [0.08, 0] });
    m.box(1.7, 0.07, 0.07, P.wood, 0.06, 1.5, 0, { rz: 0.06 });
    m.use('cloth');
    m.quad([-0.4, 0.75, 0.06], [0.5, 0.75, 0.06], [0.45, 1.6, 0.06], [-0.35, 1.6, 0.06], P.clothBrown, { both: true, g: [0.75, 1] });
    m.quad([-0.8, 1.2, 0.03], [-0.35, 1.25, 0.05], [-0.35, 1.6, 0.05], [-0.8, 1.56, 0.03], P.clothBrown, { both: true });
    m.quad([0.45, 1.25, 0.05], [0.9, 1.2, 0.03], [0.9, 1.6, 0.03], [0.45, 1.62, 0.05], P.clothBrown, { both: true });
    m.use('flat');
    m.ico(0.2, P.canvas, 0.08, 1.85, 0, { noise: 0.1, detail: 1 });
    m.cyl(0.08, 0.34, 0.2, P.wheat, 0.08, 1.98, 0, { seg: 7 });
  },
  'target-dummy': (m, rng) => {
    m.cyl(0.07, 0.09, 1.9, P.woodDark, 0, 0, 0, { seg: 5 });
    m.box(0.9, 0.1, 0.1, P.woodDark, 0, 0, 0, { ry: 0.78 });
    m.box(0.9, 0.1, 0.1, P.woodDark, 0, 0, 0, { ry: -0.78 });
    m.cyl(0.26, 0.2, 0.75, P.canvas, 0, 0.85, 0, { seg: 7, j: 0.05, g: [0.8, 1.05] });
    m.box(1.3, 0.08, 0.08, P.wood, 0, 1.42, 0);
    m.ico(0.19, P.canvas, 0, 1.82, 0, { detail: 1, noise: 0.08 });
    m.box(0.3, 0.3, 0.03, P.clothRed, 0, 1.08, 0.24);
  },
  bones: (m, rng) => {
    m.ico(0.16, P.bone, 0, 0.13, 0, { s: [1, 0.85, 1.15], detail: 1 });
    m.box(0.12, 0.07, 0.1, P.bone, 0, 0.03, 0.16);
    for (let i = 0; i < 5; i++) {
      m.box(0.04, 0.04, 0.5, P.bone, 0.45 + (i - 2) * 0.13, 0.06, -0.2, { rx: 0.9, rz: (i - 2) * 0.12, c: true });
    }
    m.cyl(0.04, 0.05, 0.6, P.bone, -0.5, 0.04, 0.2, { rz: 1.5, ry: 0.6, seg: 5 });
    m.cyl(0.04, 0.05, 0.5, P.bone, -0.3, 0.04, -0.4, { rz: 1.5, ry: -0.9, seg: 5 });
  },
  cage: (m, rng) => {
    m.box(1.7, 0.12, 1.7, P.woodDark, 0, 0.1, 0);
    m.box(1.7, 0.12, 1.7, P.woodDark, 0, 2.0, 0);
    for (let i = 0; i < 16; i++) {
      const side = Math.floor(i / 4), k = (i % 4) / 4 * 1.6 - 0.8 + 0.2;
      const x = side === 0 ? k : side === 1 ? 0.8 : side === 2 ? -k : -0.8;
      const z = side === 0 ? 0.8 : side === 1 ? -k : side === 2 ? -0.8 : k;
      m.cyl(0.035, 0.035, 1.85, P.iron, x, 0.18, z, { seg: 4 });
    }
    m.box(0.3, 0.06, 0.4, P.bone, 0.2, 0.22, 0.1, { ry: 0.5 });
  },
  barricade: (m, rng) => {
    for (let i = 0; i < 5; i++) {
      const x = -1.6 + i * 0.8;
      m.cyl(0.07, 0.09, 2.2, P.wood, x, 0, -0.5, { seg: 5, lean: [0, 1.0], j: 0.1 });
      m.cyl(0, 0.07, 0.3, P.woodLight, x, 2.2, 0.5, { seg: 5, rx: 0.42 });
      m.cyl(0.07, 0.09, 1.6, P.woodDark, x + 0.3, 0, 0.5, { seg: 5, lean: [0, -0.9], j: 0.1 });
    }
    m.cyl(0.11, 0.12, 4.2, P.bark, -2.1, 0.75, 0, { rz: -Math.PI / 2, seg: 6, bottom: true });
  },
  'fallen-tree': (m, rng) => {
    // ~9 m trunk lying across the road (along x), with a root plate and broken branches
    m.cyl(0.32, 0.5, 9, P.bark, -4.5, 0.48, 0, { rz: -Math.PI / 2, seg: 8, bottom: true, vj: 0.08, j: 0.04 });
    m.ico(1.1, P.barkDark, -4.7, 0.7, 0, { s: [0.35, 1, 1], noise: 0.35, detail: 1 });
    m.ico(0.9, P.dirt, -4.95, 0.5, 0, { s: [0.3, 0.9, 0.9], noise: 0.3 });
    for (let i = 0; i < 6; i++) {
      const x = -1.5 + i * 1.05, a = (rng() - 0.5) * 2.4;
      m.cyl(0.04, 0.11, 1.2 + rng() * 1.2, P.bark, x, 0.5, 0, { seg: 5, rx: a, rz: -0.5 + rng() * 0.3 });
    }
    m.use('foliage');
    for (let i = 0; i < 5; i++) m.ico(0.7 + rng() * 0.5, i % 2 ? P.leaf : P.leafDark, 1.2 + i * 0.75, 0.8 + rng() * 0.6, (rng() - 0.5) * 1.8, { noise: 0.3, s: [1.2, 0.8, 1.1], sway: 0.4 });
    m.use('flat');
  },
  rockslide: (m, rng) => {
    for (let i = 0; i < 16; i++) {
      const a = rng() * TAU, d = rng() * 3.6, r = 0.45 + rng() * 0.85 * (1 - d / 5);
      m.ico(r, i % 3 ? P.rock : P.rockWarm, Math.cos(a) * d * 1.25, r * 0.5, Math.sin(a) * d * 0.7, { noise: 0.3, s: [1.2, 0.8, 1], g: [0.7, 1.05], j: 0.08 });
    }
    m.ico(1.5, P.rock, 0.2, 0.7, 0, { noise: 0.3, s: [1.3, 0.85, 1.1], detail: 1, g: [0.7, 1.05] });
  },
  'mud-patch': (m, rng) => {
    m.use('ground');
    m.cyl(3.6, 4.0, 0.05, P.mud, 0, 0.01, 0, { seg: 11, vj: 0.1 });
    m.cyl(1.4, 1.7, 0.03, 0x3a3a34, 0.5, 0.06, 0.3, { seg: 8 });
    m.cyl(0.8, 1.0, 0.03, 0x3a3a34, -1.6, 0.06, -0.9, { seg: 7 });
    m.use('flat');
    for (let i = 0; i < 4; i++) m.box(1.6, 0.05, 0.22, P.woodDark, -1 + i * 0.6, 0.06, 1.2 - i * 0.7, { ry: 0.5 + i * 0.3, j: 0.1 });
  },
  'broken-bridge-planks': (m, rng) => {
    for (let i = 0; i < 7; i++) {
      m.box(0.34, 0.07, 2.2 + rng() * 1.2, P.woodLight, -1.4 + i * 0.45, 0.04 + rng() * 0.2, (rng() - 0.5) * 0.8, { ry: (rng() - 0.5) * 0.7, rx: (rng() - 0.5) * 0.3, j: 0.12 });
    }
    m.cyl(0.14, 0.16, 3.6, P.woodDark, -1.8, 0.2, 0.6, { rz: -Math.PI / 2 + 0.1, ry: 0.3, seg: 6, bottom: true });
    m.cyl(0.12, 0.14, 1.3, P.woodDark, 1.4, 0, -0.8, { seg: 6, lean: [0.2, 0.1] });
  },
};

Object.assign(PROPS, EXTRA_PROPS({ barrel, crate, sack, logs, wheel, lantern, flame }));

const ACROSS = new Set(['fallen-tree', 'rockslide', 'barricade', 'broken-bridge-planks']);

/** Names of all prop kinds. */
export const PROP_KINDS = Object.keys(PROPS);

/** Draw a prop into a mesher at (x, y, z) rotated by `rot`. Unknown kinds draw a crate. */
export function emitProp(m, kind, x = 0, y = 0, z = 0, rot = 0, opts = {}) {
  const fn = PROPS[kind] || PROPS.crate;
  const rng = makeRng(opts.seed || 7);
  m.push(x, y, z, rot, 0, 0, opts.scale || 1);
  m.use('flat');
  fn(m, rng, opts);
  m.use('flat');
  m.pop();
}

/**
 * Stand-alone prop as a THREE.Object3D (origin on the ground, facing +z).
 * opts: { seed, scale, color (banner), arms (signpost: yaw of each board) }.
 */
export function createProp(kind, opts = {}) {
  const m = new Mesher(opts.seed || 7);
  // road obstacles are placed with rotation.y = road yaw + 90°: stand-alone they span along local z (across the road)
  emitProp(m, kind, 0, 0, 0, ACROSS.has(kind) ? Math.PI / 2 : 0, opts);
  const group = m.toGroup();
  group.name = 'prop:' + kind;
  group.userData.kind = kind;
  return group;
}
