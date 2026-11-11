// Gatherable resource nodes: one distinctive model per nodeType (see CLAUDE.md, 24 types).
// Ores differ by the colour of crystals / inclusions, herbs by leaf and bloom shape, crops are small plots,
// wood types are young trees, stone types are outcrops. 1–3 draw calls each, `userData.height` for labels.
import { PALETTE as P } from './materials.js';
import { makeRng } from '../core/noise.js';
import { Mesher } from './mesher.js';

const TAU = Math.PI * 2;

function rockBase(m, rng, r, colors, o = {}) {
  m.ico(r, colors[0], 0, r * 0.38, 0, { detail: 1, noise: 0.26, s: o.s || [1.2, 0.8, 1], g: [0.6, 1.08], j: 0.06 });
  m.ico(r * 0.62, colors[1] || colors[0], r * 0.85, r * 0.2, r * 0.3, { noise: 0.3, s: [1, 0.8, 1.1], g: [0.6, 1.08] });
  m.ico(r * 0.5, colors[0], -r * 0.8, r * 0.15, -r * 0.4, { noise: 0.3, g: [0.6, 1.08] });
}

/** Chunky inclusions stuck into the rock surface. */
function inclusions(m, rng, r, color, count, size, bucket = 'flat') {
  m.use(bucket);
  for (let i = 0; i < count; i++) {
    const a = rng() * TAU, up = 0.25 + rng() * 0.6;
    const d = r * (1.05 - up * 0.55);
    m.box(size * (0.7 + rng() * 0.6), size * (0.6 + rng() * 0.5), size * (0.7 + rng() * 0.6), color, Math.cos(a) * d, r * up * 0.9, Math.sin(a) * d * 0.85, { ry: rng() * 3, rx: rng(), rz: rng(), c: true, g: [0.8, 1.25] });
  }
  m.use('flat');
}

function crystals(m, rng, r, colors, count, len, bucket = 'flat') {
  m.use(bucket);
  for (let i = 0; i < count; i++) {
    const a = i / count * TAU + rng() * 0.5, d = r * (0.25 + rng() * 0.55);
    m.cyl(0, len * 0.16, len * (0.6 + rng() * 0.6), colors[i % colors.length], Math.cos(a) * d, r * 0.45, Math.sin(a) * d, { seg: 5, lean: [Math.cos(a) * len * 0.35, Math.sin(a) * len * 0.35], g: [0.7, 1.5] });
  }
  m.use('flat');
}

function stalks(m, rng, o) {
  m.use('foliage');
  for (let i = 0; i < o.count; i++) {
    const x = (rng() - 0.5) * o.spread, z = (rng() - 0.5) * o.spread, h = o.h * (0.75 + rng() * 0.5);
    const lean = [(rng() - 0.5) * 0.25, (rng() - 0.5) * 0.25];
    m.cyl(0.012, 0.03, h, o.stem, x, 0, z, { seg: 3, lean, sway: 0.5 });
    if (o.head) o.head(x + lean[0], h, z + lean[1], i);
  }
  m.use('flat');
}

function plotBed(m, w = 1.9, d = 1.5) {
  m.box(w, 0.14, d, 0x5a4a34, 0, -0.02, 0, { top: [0.94, 0.9], vj: 0.08, nb: true });
}

function sapling(m, rng, o) {
  const lean = [(rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3];
  m.cyl(o.r * 0.5, o.r, o.h * 0.7, o.bark, 0, 0, 0, { seg: 6, lean, g: [0.72, 1.06], vj: 0.06 });
  if (o.stripes) {
    for (let i = 0; i < 4; i++) m.box(o.r * 1.5, 0.05, o.r * 1.5, 0x2e2a26, lean[0] * (0.2 + i * 0.2), o.h * (0.14 + i * 0.14), lean[1] * (0.2 + i * 0.2), { ry: rng() });
  }
  m.use('foliage');
  for (let i = 0; i < o.blobs; i++) {
    const a = i / o.blobs * TAU + rng(), d = i === 0 ? 0 : o.crown * 0.5;
    m.ico(o.crown * (i === 0 ? 0.75 : 0.5), o.leaf[i % o.leaf.length], lean[0] + Math.cos(a) * d, o.h * (i === 0 ? 0.92 : 0.72 + rng() * 0.12), lean[1] + Math.sin(a) * d, { detail: 1, noise: 0.24, s: o.tall ? [0.8, 1.2, 0.8] : [1, 0.8, 1], g: [0.66, 1.12], sway: 0.6 });
  }
  m.use('flat');
  // a cut stump and a log beside it tell "this can be chopped"
  m.cyl(o.r * 0.9, o.r * 1.1, 0.3, o.bark, o.r * 4.5, 0, 0.3, { seg: 6 });
  m.cyl(o.r * 0.8, o.r * 0.8, 0.02, P.woodPale, o.r * 4.5, 0.3, 0.3, { seg: 6 });
}

const NODES = {
  // ── herbs ──
  herb: (m, rng) => {
    m.use('foliage');
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      m.ico(0.3, i % 2 ? P.leaf : P.leafPale, Math.cos(a) * 0.3, 0.16, Math.sin(a) * 0.3, { s: [1.2, 0.3, 0.6], ry: -a, noise: 0.15, sway: 0.3, rz: 0.4 });
    }
    m.use('flat');
    stalks(m, rng, { count: 5, spread: 0.5, h: 0.6, stem: P.leaf, head: (x, y, z) => m.ico(0.08, 0xf0ead8, x, y, z, { sway: 0.6 }) });
    return 0.9;
  },
  rareHerb: (m, rng) => {
    stalks(m, rng, { count: 6, spread: 0.7, h: 1.0, stem: 0x4d7a5a, head: (x, y, z) => {
      for (let k = 0; k < 3; k++) m.cyl(0.11, 0.03, 0.16, k % 2 ? 0x6a5acd : 0x8a6ae0, x + (k - 1) * 0.04, y - 0.12 - k * 0.2, z, { seg: 5, sway: 0.6 });
    } });
    m.use('foliage');
    for (let i = 0; i < 5; i++) m.ico(0.26, 0x4d7a5a, Math.cos(i * 1.3) * 0.28, 0.14, Math.sin(i * 1.3) * 0.28, { s: [1.3, 0.35, 0.5], ry: -i * 1.3, sway: 0.3 });
    m.use('flat');
    return 1.3;
  },
  mountainHerb: (m, rng) => {
    m.ico(0.3, P.rock, 0.45, 0.1, 0.2, { noise: 0.3 });
    m.ico(0.22, 0x7a766e, -0.4, 0.06, -0.3, { noise: 0.3 });
    m.use('foliage');
    m.ico(0.48, 0x9db8a0, 0, 0.18, 0, { detail: 1, noise: 0.25, s: [1.1, 0.5, 1.1], sway: 0.15, g: [0.7, 1.1] });
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + rng();
      m.cyl(0, 0.09, 0.07, 0xf2d24a, Math.cos(a) * 0.3, 0.42, Math.sin(a) * 0.3, { seg: 5, sway: 0.2, rx: Math.PI });
    }
    m.use('flat');
    return 0.8;
  },
  moonHerb: (m, rng) => {
    m.use('foliage');
    for (let i = 0; i < 6; i++) m.ico(0.3, 0x5f8f8a, Math.cos(i) * 0.25, 0.2, Math.sin(i) * 0.25, { s: [0.5, 1.2, 0.2], ry: -i, sway: 0.4, g: [0.7, 1.2] });
    m.use('flat');
    for (let i = 0; i < 4; i++) {
      const x = (rng() - 0.5) * 0.5, z = (rng() - 0.5) * 0.5, h = 0.8 + rng() * 0.6;
      m.cyl(0.012, 0.025, h, 0x7fb8b0, x, 0, z, { seg: 3 });
      m.use('moon').ico(0.1 + rng() * 0.05, 0xbff4f8, x, h + 0.06, z, { s: [1, 1.3, 1] });
      m.use('flat');
    }
    return 1.5;
  },
  // ── ores ──
  ore: (m, rng) => {
    rockBase(m, rng, 0.85, [0x6a625a, 0x5c564f]);
    inclusions(m, rng, 0.85, 0xa8542c, 9, 0.2);
    return 1.3;
  },
  richOre: (m, rng) => {
    rockBase(m, rng, 1.05, [0x5f5852, 0x6e655c]);
    inclusions(m, rng, 1.05, 0xb85a2a, 8, 0.24);
    inclusions(m, rng, 1.05, P.steel, 8, 0.2, 'metal');
    return 1.6;
  },
  copperOre: (m, rng) => {
    rockBase(m, rng, 0.9, [0x6b6a60, 0x5d6058]);
    inclusions(m, rng, 0.9, P.copper, 8, 0.2, 'metal');
    inclusions(m, rng, 0.9, 0x4f9a86, 7, 0.16);
    return 1.4;
  },
  coal: (m, rng) => {
    for (let i = 0; i < 9; i++) {
      const a = rng() * TAU, d = rng() * 0.75;
      m.ico(0.3 + rng() * 0.28, i % 3 ? 0x1c1b1c : 0x2a292b, Math.cos(a) * d, 0.18 + (0.8 - d) * 0.5, Math.sin(a) * d, { noise: 0.35, g: [0.7, 1.4], j: 0.15 });
    }
    inclusions(m, rng, 0.7, 0x3f4046, 5, 0.14, 'metal');
    return 1.2;
  },
  cobaltOre: (m, rng) => {
    rockBase(m, rng, 0.9, [0x4a4c54, 0x55575e]);
    crystals(m, rng, 0.9, [P.cobalt, 0x5f8fd0, 0x2f5290], 8, 0.8);
    return 1.5;
  },
  mithrilOre: (m, rng) => {
    rockBase(m, rng, 0.9, [0x8a8f94, 0x7a8086]);
    crystals(m, rng, 0.9, [P.mithril, 0xd8f4f4], 6, 0.9);
    crystals(m, rng, 0.9, [0xd8f8f8], 3, 0.6, 'moon');
    return 1.6;
  },
  // ── wood ──
  wood: (m, rng) => {
    sapling(m, rng, { h: 3.4, r: 0.11, crown: 1.1, blobs: 4, bark: 0xd8d2c0, leaf: [P.leafPale, P.leaf], stripes: true, tall: true });
    return 3.6;
  },
  hardwood: (m, rng) => {
    sapling(m, rng, { h: 3.6, r: 0.2, crown: 1.6, blobs: 5, bark: P.bark, leaf: [P.leaf, P.leafDark] });
    return 3.9;
  },
  ancientWood: (m, rng) => {
    m.cyl(0.3, 0.55, 2.6, 0x4a4038, 0, 0, 0, { seg: 7, lean: [0.5, 0.2], vj: 0.1, g: [0.65, 1.05] });
    m.cyl(0.08, 0.2, 1.6, 0x4a4038, 0.4, 2.3, 0.15, { seg: 5, lean: [0.9, 0.3] });
    m.cyl(0.07, 0.18, 1.4, 0x4a4038, 0.3, 2.0, 0.1, { seg: 5, lean: [-0.8, -0.5] });
    for (let i = 0; i < 5; i++) m.cyl(0.05, 0.2, 1.0, P.barkDark, Math.cos(i * 1.3) * 0.75, 0, Math.sin(i * 1.3) * 0.75, { seg: 4, lean: [-Math.cos(i * 1.3) * 0.55, -Math.sin(i * 1.3) * 0.55] });
    m.use('foliage');
    m.ico(0.8, P.moss, 0.2, 1.3, 0.3, { noise: 0.3, s: [0.9, 1.3, 0.5], sway: 0.1 });
    m.ico(0.9, 0x6a7a3a, 1.3, 3.6, 0.5, { detail: 1, noise: 0.25, s: [1.1, 0.7, 1], sway: 0.6, g: [0.7, 1.1] });
    m.ico(0.7, P.leafAutumn, -0.6, 3.2, -0.4, { detail: 1, noise: 0.25, s: [1.1, 0.7, 1], sway: 0.6, g: [0.7, 1.1] });
    m.use('flat');
    return 4.2;
  },
  ironwood: (m, rng) => {
    sapling(m, rng, { h: 4.2, r: 0.18, crown: 1.2, blobs: 4, bark: 0x26282c, leaf: [0x4a6470, 0x3a525e], tall: true });
    for (let i = 0; i < 3; i++) m.box(0.42, 0.05, 0.42, P.iron, 0, 0.6 + i * 0.7, 0, { ry: i });
    return 4.5;
  },
  // ── crops (small plots) ──
  wheat: (m, rng) => {
    plotBed(m);
    stalks(m, rng, { count: 26, spread: 1.6, h: 0.95, stem: 0xc9a646, head: (x, y, z) => m.cyl(0.02, 0.05, 0.22, P.wheat, x, y - 0.04, z, { seg: 4, sway: 0.7 }) });
    return 1.3;
  },
  rye: (m, rng) => {
    plotBed(m);
    stalks(m, rng, { count: 24, spread: 1.6, h: 1.35, stem: 0x9a9060, head: (x, y, z) => m.cyl(0.015, 0.04, 0.3, 0xb9a878, x, y - 0.1, z, { seg: 4, sway: 0.7, rz: 0.5 }) });
    return 1.7;
  },
  saffron: (m, rng) => {
    plotBed(m);
    stalks(m, rng, { count: 14, spread: 1.5, h: 0.3, stem: P.leaf, head: (x, y, z) => {
      m.cyl(0.13, 0.03, 0.16, 0x8a4fc0, x, y, z, { seg: 6, sway: 0.4 });
      m.cyl(0.02, 0.02, 0.14, 0xf07a1a, x, y + 0.06, z, { seg: 3, sway: 0.4 });
    } });
    return 0.8;
  },
  flax: (m, rng) => {
    plotBed(m);
    stalks(m, rng, { count: 24, spread: 1.6, h: 0.85, stem: 0x6f9a5a, head: (x, y, z) => m.cyl(0.09, 0.02, 0.06, P.flax, x, y, z, { seg: 5, sway: 0.7 }) });
    return 1.2;
  },
  silkFiber: (m, rng) => {
    m.cyl(0.05, 0.09, 0.9, P.bark, 0, 0, 0, { seg: 5, lean: [0.1, 0] });
    m.use('foliage');
    for (let i = 0; i < 5; i++) m.ico(0.5, i % 2 ? 0x5a8a4a : 0x6f9a52, Math.cos(i * 1.3) * 0.4, 0.9 + (i % 2) * 0.3, Math.sin(i * 1.3) * 0.4, { noise: 0.3, sway: 0.4, g: [0.7, 1.1] });
    m.use('flat');
    for (let i = 0; i < 9; i++) {
      const a = rng() * TAU, d = 0.5 + rng() * 0.3;
      m.ico(0.1, 0xf4f0e2, Math.cos(a) * d, 0.7 + rng() * 0.8, Math.sin(a) * d, { s: [0.8, 1.4, 0.8] });
    }
    return 1.8;
  },
  starFlax: (m, rng) => {
    plotBed(m);
    stalks(m, rng, { count: 16, spread: 1.5, h: 1.0, stem: 0x8ab0a8, head: (x, y, z) => {
      m.use('moon');
      m.box(0.2, 0.03, 0.05, 0xe8fbff, x, y, z, { ry: rng() * 3 });
      m.box(0.05, 0.03, 0.2, 0xe8fbff, x, y, z);
      m.use('foliage');
    } });
    return 1.4;
  },
  // ── stone ──
  stone: (m, rng) => {
    rockBase(m, rng, 0.95, [0x85837b, 0x77756d]);
    return 1.3;
  },
  granite: (m, rng) => {
    for (const [x, z, w, h, d] of [[0, 0, 1.3, 1.0, 1.0], [0.9, 0.4, 0.8, 0.6, 0.7], [-0.8, -0.3, 0.7, 0.75, 0.8], [0.1, -0.8, 0.9, 0.45, 0.6]]) {
      m.box(w, h, d, rng() < 0.5 ? 0x9a857e : 0x8c7a76, x, -0.05, z, { ry: rng() * 0.6, top: [0.85, 0.8], vj: 0.14, g: [0.7, 1.06], lean: [(rng() - 0.5) * 0.2, 0] });
    }
    inclusions(m, rng, 0.8, 0x4a4442, 10, 0.07);
    return 1.4;
  },
  marble: (m, rng) => {
    for (const [x, z, w, h, d, r] of [[0, 0, 1.2, 0.8, 0.9, 0.1], [0.3, 0.1, 0.9, 0.6, 0.7, 0.5], [-0.9, 0.5, 0.7, 0.5, 0.6, -0.3]]) {
      m.box(w, h, d, 0xe8e6de, x, x === 0.3 ? 0.78 : -0.04, z, { ry: r, vj: 0.03, g: [0.82, 1.05] });
    }
    for (let i = 0; i < 6; i++) m.box(0.9, 0.02, 0.03, 0x9aa0a8, (rng() - 0.5) * 0.4, 0.25 + rng() * 1.0, 0.46 - (i % 2) * 0.05, { rz: (rng() - 0.5) * 1.2, nb: true });
    return 1.6;
  },
  basalt: (m, rng) => {
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU, d = i === 0 ? 0 : 0.42 + (i % 2) * 0.4;
      m.cyl(0.24, 0.26, 0.7 + rng() * 1.3 - d * 0.5, i % 2 ? 0x34363a : 0x3e4044, Math.cos(a) * d, -0.05, Math.sin(a) * d, { seg: 6, g: [0.7, 1.15], j: 0.1 });
    }
    return 2.0;
  },
};

/** All 24 resource node types. */
export const NODE_TYPES = Object.keys(NODES);

/**
 * Model of a resource node (origin on the ground). `userData.height` = where to put a label, `userData.nodeType`.
 */
export function createResourceNode(nodeType, seed = 1) {
  const m = new Mesher(seed);
  const rng = makeRng(seed || 1);
  const draw = NODES[nodeType] || NODES.stone;
  const height = draw(m, rng);
  const group = m.toGroup();
  group.rotation.y = rng() * TAU;
  group.name = 'node:' + nodeType;
  group.userData.nodeType = nodeType;
  group.userData.height = height;
  return group;
}
