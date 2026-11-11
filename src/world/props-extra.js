// More props: workshop furniture, yard piles, town trees, gardens, square features.
// Registered into props.js (which passes its shared helpers to avoid a circular import).
import { PALETTE as P } from './materials.js';

const TAU = Math.PI * 2;

/** Broadleaf tree: leaning trunk, a few boughs, lumpy crown blobs that sway. */
export function tree(m, rng, o = {}) {
  const h = o.h || 5.5, r = o.r || 2.4;
  const leaf = o.leaf || [P.leaf, P.leafDark, P.leafPale];
  const lean = [(rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5];
  m.use('flat');
  m.cyl(o.trunk ? o.trunk * 0.6 : 0.16, o.trunk || 0.3, h * 0.62, P.bark, 0, 0, 0, { seg: 7, lean, g: [0.7, 1.05], vj: 0.06 });
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + rng();
    m.cyl(0.06, 0.13, h * 0.36, P.bark, lean[0] * 0.8, h * 0.45, lean[1] * 0.8, { seg: 5, lean: [Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5] });
  }
  m.use('foliage');
  const blobs = o.blobs || 6;
  for (let i = 0; i < blobs; i++) {
    const a = i / blobs * TAU + rng(), d = i === 0 ? 0 : r * (0.35 + rng() * 0.3);
    m.ico(r * (i === 0 ? 0.72 : 0.5 + rng() * 0.16), leaf[i % leaf.length], lean[0] + Math.cos(a) * d, h * (i === 0 ? 0.88 : 0.66 + rng() * 0.16), lean[1] + Math.sin(a) * d, {
      detail: 1, noise: 0.22, s: [1, 0.78, 1], g: [0.68, 1.12], sway: 0.6, j: 0.05,
    });
  }
  m.use('flat');
}

export const EXTRA_PROPS = ({ barrel, crate, sack, logs, wheel }) => ({
  'goods-table': (m, rng) => {
    m.box(1.7, 0.08, 0.8, P.woodLight, 0, 0.8, 0, { j: 0.05 });
    for (const sx of [-1, 1]) m.box(0.1, 0.8, 0.7, P.wood, sx * 0.7, 0, 0, { nb: true, top: [1, 0.3] });
    m.use('cloth').quad([-0.86, 0.5, 0.41], [0.86, 0.5, 0.41], [0.86, 0.89, 0.41], [-0.86, 0.89, 0.41], P.clothRed, { g: [0.8, 1] });
    m.use('flat');
    const goods = [P.clay, P.wheat, P.clothBlue, P.leaf, P.bone, P.amber];
    for (let i = 0; i < 5; i++) {
      const x = -0.64 + i * 0.32;
      if (i % 2) m.cyl(0.11, 0.09, 0.2, goods[i], x, 0.88, (rng() - 0.5) * 0.3, { seg: 6 });
      else m.box(0.24, 0.14, 0.24, goods[i], x, 0.88, (rng() - 0.5) * 0.3, { ry: rng(), j: 0.1 });
    }
  },
  'tanning-rack': (m, rng) => {
    for (const sx of [-1, 1]) m.cyl(0.05, 0.06, 1.9, P.woodDark, sx * 0.8, 0, 0, { seg: 5, lean: [0, 0.35] });
    m.box(1.8, 0.06, 0.06, P.wood, 0, 1.8, 0.33);
    m.box(1.8, 0.06, 0.06, P.wood, 0, 0.5, 0.09);
    m.use('cloth').quad([-0.6, 0.58, 0.12], [0.6, 0.58, 0.12], [0.68, 1.74, 0.33], [-0.68, 1.74, 0.33], P.leather, { both: true, g: [0.8, 1.05] });
    m.use('flat');
  },
  'cloth-rack': (m, rng) => {
    for (const sx of [-1, 1]) m.box(0.08, 1.7, 0.4, P.wood, sx * 0.8, 0, 0, { nb: true, top: [1, 0.2] });
    m.use('cloth');
    const cols = [P.clothBlue, P.clothRed, P.clothCream, P.clothGreen, P.clothPurple];
    for (let i = 0; i < 4; i++) {
      m.box(1.5, 0.05, 0.05, P.woodDark, 0, 1.6 - i * 0.02, -0.15 + i * 0.1);
      m.quad([-0.7 + i * 0.05, 0.5 + i * 0.12, -0.15 + i * 0.1], [0.7, 0.5 + i * 0.12, -0.15 + i * 0.1], [0.7, 1.6, -0.15 + i * 0.1], [-0.7 + i * 0.05, 1.6, -0.15 + i * 0.1], cols[i], { both: true, g: [0.8, 1.05] });
    }
    m.use('flat');
  },
  'herb-rack': (m, rng) => {
    for (const sx of [-1, 1]) m.box(0.08, 1.9, 0.08, P.woodDark, sx * 0.8, 0, 0, { nb: true });
    for (const y of [1.85, 1.3]) {
      m.box(1.7, 0.05, 0.05, P.wood, 0, y, 0);
      for (let i = 0; i < 6; i++) {
        m.use('foliage').cyl(0.02, 0.12, 0.36, [P.leaf, P.leafPale, P.heather, P.moss][i % 4], -0.65 + i * 0.26, y - 0.38, 0, { seg: 5, sway: 0 });
        m.use('flat');
      }
    }
    m.box(1.5, 0.06, 0.4, P.woodLight, 0, 0.7, 0);
    for (let i = 0; i < 4; i++) m.cyl(0.07, 0.08, 0.2, [P.clay, 0x6a8a6a, P.clothBlue, P.bone][i], -0.5 + i * 0.33, 0.76, 0, { seg: 6 });
  },
  'weapon-rack': (m, rng) => {
    for (const sx of [-1, 1]) m.box(0.1, 1.5, 0.5, P.woodDark, sx * 0.75, 0, 0, { nb: true, top: [1, 0.3] });
    m.box(1.6, 0.08, 0.1, P.wood, 0, 1.3, 0);
    m.box(1.6, 0.08, 0.3, P.wood, 0, 0.15, 0);
    for (let i = 0; i < 5; i++) {
      const x = -0.6 + i * 0.3;
      m.box(0.07, 1.0, 0.025, P.steel, x, 0.42, 0.08, { rx: -0.07, top: [0.2, 1] });
      m.box(0.24, 0.045, 0.05, P.bronze, x, 0.4, 0.08);
      m.box(0.045, 0.2, 0.045, P.leatherDark, x, 0.2, 0.08);
    }
  },
  'armor-stand': (m, rng) => {
    m.cyl(0.04, 0.05, 1.5, P.woodDark, 0, 0, 0, { seg: 5 });
    m.box(0.6, 0.06, 0.06, P.woodDark, 0, 0, 0, { ry: 0.78 });
    m.box(0.6, 0.06, 0.06, P.woodDark, 0, 0, 0, { ry: -0.78 });
    m.box(0.56, 0.62, 0.3, P.steel, 0, 0.9, 0, { top: [1.15, 1], g: [0.75, 1.1] });
    m.box(0.9, 0.12, 0.2, P.iron, 0, 1.42, 0);
    m.ico(0.17, P.steel, 0, 1.72, 0, { detail: 1, s: [1, 1.1, 1.1] });
    m.cyl(0.36, 0.36, 0.05, P.guardBlue, 0.4, 0.5, 0.2, { rx: 1.3, seg: 8, bottom: true });
  },
  'saw-horse': (m, rng) => {
    m.box(1.6, 0.12, 0.14, P.woodLight, 0, 0.7, 0);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) m.box(0.08, 0.78, 0.08, P.wood, sx * 0.6, 0, sz * 0.3, { lean: [0, -sz * 0.26], nb: true });
    }
    m.cyl(0.13, 0.15, 1.9, P.bark, -0.95, 0.95, 0.02, { rz: -Math.PI / 2, seg: 6, bottom: true });
  },
  trough: (m, rng) => {
    m.box(1.8, 0.45, 0.6, P.wood, 0, 0.2, 0, { top: [1.06, 1.2], j: 0.05 });
    m.box(1.6, 0.04, 0.5, P.water, 0, 0.62, 0);
    for (const sx of [-1, 1]) m.box(0.12, 0.3, 0.6, P.woodDark, sx * 0.7, 0, 0, { nb: true });
  },
  'stone-stack': (m, rng) => {
    for (let i = 0; i < 6; i++) {
      const layer = i < 3 ? 0 : i < 5 ? 1 : 2;
      const k = i < 3 ? i - 1 : i < 5 ? i - 3.5 : 0;
      m.box(0.56, 0.34, 0.8, i % 2 ? P.stoneLight : P.stone, k * 0.6, layer * 0.35, (rng() - 0.5) * 0.1, { ry: (rng() - 0.5) * 0.12, j: 0.12, vj: 0.04 });
    }
  },
  'ore-pile': (m, rng) => {
    for (let i = 0; i < 9; i++) {
      const a = rng() * TAU, d = rng() * 1.1;
      m.ico(0.35 + rng() * 0.3, i % 3 ? 0x5f5650 : 0x74584a, Math.cos(a) * d, 0.2 + (1.1 - d) * 0.45, Math.sin(a) * d, { noise: 0.3, g: [0.7, 1.05], j: 0.1 });
    }
    for (let i = 0; i < 4; i++) m.ico(0.12, P.copper, (rng() - 0.5) * 1.4, 0.5 + rng() * 0.3, (rng() - 0.5) * 1.4, { noise: 0.3 });
  },
  'ore-cart': (m, rng) => {
    m.box(1.2, 0.7, 1.7, P.wood, 0, 0.45, 0, { top: [1.25, 1.15], j: 0.05, g: [0.75, 1.05] });
    for (const sz of [-0.82, 0.82]) m.box(1.3, 0.08, 0.06, P.iron, 0, 0.8, sz);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) m.cyl(0.24, 0.24, 0.1, P.iron, sx * 0.6 - (sx > 0 ? 0 : 0.1), 0.24, sz * 0.5, { rz: -Math.PI / 2, seg: 8, bottom: true });
    }
    for (let i = 0; i < 5; i++) m.ico(0.3, i % 2 ? 0x5f5650 : 0x74584a, (rng() - 0.5) * 0.7, 1.15, (rng() - 0.5) * 1.1, { noise: 0.3 });
  },
  statue: (m, rng) => {
    // a miner with a sledgehammer — the founder of the town
    m.box(1.9, 0.4, 1.9, P.stoneDark, 0, 0, 0, { vj: 0.05, nb: true });
    m.box(1.4, 1.3, 1.4, P.stone, 0, 0.4, 0, { vj: 0.05, top: [0.9, 0.9] });
    const c = 0x8f8d84;
    m.box(0.2, 0.95, 0.24, c, -0.16, 1.7, 0, { nb: true });
    m.box(0.2, 0.95, 0.24, c, 0.16, 1.7, 0.08, { nb: true });
    m.box(0.62, 0.8, 0.34, c, 0, 2.6, 0.02, { top: [1.15, 1] });
    m.ico(0.2, c, 0, 3.62, 0.03, { detail: 1 });
    m.box(0.16, 0.7, 0.16, c, -0.42, 2.72, 0.05, { rz: -0.25 });
    m.box(0.16, 0.75, 0.16, c, 0.44, 3.0, 0.1, { rz: 2.4 });
    m.box(0.07, 1.5, 0.07, c, 0.8, 2.5, 0.12, { rz: 0.3 });
    m.box(0.34, 0.26, 0.26, c, 0.58, 3.2, 0.12, { rz: 0.3 });
  },
  fountain: (m, rng) => {
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      m.box(1.12, 0.7, 0.4, i % 2 ? 0xd9c9a0 : 0xcdb588, Math.cos(a) * 2.0, 0, Math.sin(a) * 2.0, { ry: -a + Math.PI / 2, nb: true, j: 0.06, top: [0.97, 0.85] });
    }
    m.cyl(1.9, 1.9, 0.05, P.water, 0, 0.5, 0, { seg: 12 });
    m.cyl(0.3, 0.45, 1.5, 0xd9c9a0, 0, 0, 0, { seg: 8, g: [0.8, 1.05] });
    m.cyl(0.95, 0.3, 0.3, 0xe6d9b8, 0, 1.5, 0, { seg: 10 });
    m.cyl(0.85, 0.85, 0.04, P.water, 0, 1.76, 0, { seg: 10 });
    m.cyl(0.14, 0.2, 0.8, 0xd9c9a0, 0, 1.78, 0, { seg: 6 });
    m.ico(0.24, P.amber, 0, 2.75, 0, { detail: 1 });
  },
  linden: (m, rng) => tree(m, rng, { h: 9.5, r: 4.6, trunk: 0.62, blobs: 9, leaf: [P.leaf, P.leafPale, P.leafDark] }),
  tree: (m, rng) => tree(m, rng, { h: 5 + rng() * 2, r: 2.2 + rng() * 0.6 }),
  'fruit-tree': (m, rng) => {
    tree(m, rng, { h: 3.6, r: 1.7, trunk: 0.2, blobs: 5, leaf: [P.leafPale, P.leaf] });
    for (let i = 0; i < 7; i++) {
      const a = rng() * TAU;
      m.ico(0.09, i % 2 ? P.clothRed : P.amber, Math.cos(a) * 1.2, 2.2 + rng() * 1.2, Math.sin(a) * 1.2);
    }
  },
  cypress: (m, rng) => {
    m.cyl(0.1, 0.16, 1.2, P.bark, 0, 0, 0, { seg: 6 });
    m.use('foliage');
    m.cyl(0, 0.75, 6.2 + rng() * 1.5, P.pine, 0, 0.8, 0, { seg: 7, sway: 0.5, g: [0.7, 1.15], vj: 0.06 });
    m.cyl(0, 0.9, 2.6, P.leafDark, 0, 0.7, 0, { seg: 7, sway: 0.2, g: [0.7, 1.05] });
    m.use('flat');
  },
  plot: (m, rng) => {
    // vegetable beds inside a low wattle fence
    m.use('ground').box(6.4, 0.06, 5.0, P.dirt, 0, 0.0, 0, { vj: 0.06 });
    m.use('flat');
    const crops = [P.leaf, P.leafPale, P.grassDark, P.wheat, P.clothRed];
    for (let row = 0; row < 4; row++) {
      m.box(5.6, 0.14, 0.62, 0x5a4a34, 0, 0, -1.65 + row * 1.1, { top: [0.98, 0.6], vj: 0.06, nb: true });
      const crop = crops[Math.floor(rng() * crops.length)];
      m.use('foliage');
      for (let i = 0; i < 9; i++) m.ico(0.18 + rng() * 0.09, crop, -2.5 + i * 0.62 + (rng() - 0.5) * 0.15, 0.24, -1.65 + row * 1.1, { noise: 0.3, s: [1, 0.9 + rng() * 0.6, 1], sway: 0.25, g: [0.75, 1.1] });
      m.use('flat');
    }
    for (let i = 0; i < 14; i++) {
      const t = i / 14 * 22.8;
      const along = t < 6.4 ? [t - 3.2, -2.5] : t < 11.4 ? [3.2, t - 6.4 - 2.5] : t < 17.8 ? [3.2 - (t - 11.4), 2.5] : [-3.2, 2.5 - (t - 17.8)];
      if (i === 9) continue;
      m.box(0.07, 0.72, 0.07, P.wood, along[0], 0, along[1], { nb: true, lean: [(rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08] });
    }
    m.box(6.4, 0.06, 0.04, P.woodLight, 0, 0.5, -2.5);
    m.box(0.04, 0.06, 5.0, P.woodLight, 3.2, 0.5, 0);
    m.box(0.04, 0.06, 5.0, P.woodLight, -3.2, 0.5, 0);
  },
  pen: (m, rng) => {
    m.use('ground').box(6.0, 0.05, 4.8, P.mud, 0, 0, 0, { vj: 0.08 });
    m.use('flat');
    for (let i = 0; i < 12; i++) {
      const t = i / 12 * 21.6;
      const p = t < 6 ? [t - 3, -2.4] : t < 10.8 ? [3, t - 6 - 2.4] : t < 16.8 ? [3 - (t - 10.8), 2.4] : [-3, 2.4 - (t - 16.8)];
      m.box(0.11, 1.05, 0.11, P.wood, p[0], 0, p[1], { nb: true, lean: [(rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08], j: 0.1 });
    }
    for (const y of [0.45, 0.85]) {
      m.box(6.0, 0.08, 0.05, P.woodLight, 0, y, -2.4, { j: 0.1 });
      m.box(6.0, 0.08, 0.05, P.woodLight, 0, y, 2.4, { j: 0.1 });
      m.box(0.05, 0.08, 4.8, P.woodLight, 3, y, 0, { j: 0.1 });
      m.box(0.05, 0.08, 4.8, P.woodLight, -3, y, 0, { j: 0.1 });
    }
    m.box(1.2, 0.3, 0.4, P.woodDark, 1.6, 0, -1.9, { top: [1.05, 1.2] });
    // pigs or sheep, as simple chunky shapes
    const sheep = rng() < 0.5;
    for (let i = 0; i < 3; i++) {
      const x = -1.7 + i * 1.4 + (rng() - 0.5) * 0.5, z = (rng() - 0.5) * 2.4, ry = rng() * TAU;
      m.push(x, 0, z, ry);
      m.ico(0.36, sheep ? 0xd8d2c0 : 0xc49a8a, 0, 0.45, 0, { s: [0.85, 0.8, 1.35], detail: 1, noise: sheep ? 0.14 : 0.04, g: [0.8, 1.05] });
      m.box(0.2, 0.2, 0.26, sheep ? 0x3a332c : 0xb98a7a, 0, 0.44, 0.52);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) m.box(0.08, 0.26, 0.08, sheep ? 0x3a332c : 0xb98a7a, sx * 0.15, 0, sz * 0.25, { nb: true });
      }
      m.pop();
    }
  },
  haystack: (m, rng) => {
    m.use('smooth');
    m.cyl(0.9, 1.25, 1.1, P.wheat, 0, 0, 0, { seg: 9, vj: 0.07, g: [0.8, 1.02] });
    m.cyl(0, 1.0, 1.5, P.thatch, 0, 1.05, 0, { seg: 9, vj: 0.07, lean: [0.1, 0.05] });
    m.use('flat');
    m.cyl(0.03, 0.03, 0.5, P.woodDark, 0.1, 2.5, 0.05, { seg: 4 });
  },
  crates: (m, rng) => {
    crate(m, rng, -0.5, 0, 0.1, 0.8, 0.2);
    crate(m, rng, 0.45, 0, -0.2, 0.7, -0.3);
    crate(m, rng, -0.2, 0.8, 0, 0.6, 0.6);
    sack(m, rng, 0.5, 0, 0.65, 0.9);
  },
  barrels: (m, rng) => {
    barrel(m, rng, -0.4, 0, 0);
    barrel(m, rng, 0.35, 0, 0.25);
    barrel(m, rng, 0.05, 0, -0.55, 0.9);
    barrel(m, rng, -0.1, 0.84, -0.05, 0.8);
  },
  'archery-target': (m, rng) => {
    for (const sx of [-1, 1]) m.cyl(0.05, 0.06, 1.9, P.woodDark, sx * 0.5, 0, -0.2, { seg: 5, lean: [-sx * 0.2, 0.3] });
    m.cyl(0.05, 0.06, 1.8, P.woodDark, 0, 0, -0.9, { seg: 5, lean: [0, 0.9] });
    m.push(0, 1.25, 0.12, 0, -0.16);
    m.cyl(0.62, 0.62, 0.16, P.wheat, 0, 0, 0, { rx: Math.PI / 2, seg: 12, bottom: true, c: true });
    m.cyl(0.45, 0.45, 0.02, P.clothCream, 0, 0, 0.09, { rx: Math.PI / 2, seg: 12, c: true });
    m.cyl(0.28, 0.28, 0.02, P.clothBlue, 0, 0, 0.1, { rx: Math.PI / 2, seg: 10, c: true });
    m.cyl(0.11, 0.11, 0.02, P.clothRed, 0, 0, 0.11, { rx: Math.PI / 2, seg: 8, c: true });
    m.box(0.02, 0.02, 0.5, P.woodPale, 0.14, 0.1, 0.34);
    m.pop();
  },
});
