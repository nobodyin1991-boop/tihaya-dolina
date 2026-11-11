// Procedural tree models. Each species has 3 seeded variants, each variant 3 LODs built from ONE spec so the
// silhouette is identical across LODs: full (~250-700 triangles), low (~40-90), far (5-14 triangles).
// Budget: draws nothing itself — vegetation.js bakes these into per-cell / per-block static meshes.
import { ModelBuilder, lin, mixColor, scaleColor } from './veg-kit.js';
import { makeRng } from '../core/noise.js';

const BARK = lin(0x6a5540);
const BARK_DARK = lin(0x3d3026);
const BARK_PINE = lin(0x7d4c30);
const BARK_GREY = lin(0x6b6257);
const BIRCH_WHITE = lin(0xd9d5c6);
const BIRCH_MARK = lin(0x3a342c);

const LEAF = {
  oak:      { bottom: lin(0x2c4f2e), top: lin(0x70963f) },
  amber:    { bottom: lin(0x7a4a1e), top: lin(0xd09a3a) },
  birch:    { bottom: lin(0x55783a), top: lin(0xa6ba5e) },
  linden:   { bottom: lin(0x2a5636), top: lin(0x619a4a) },
  pine:     { bottom: lin(0x20402e), top: lin(0x4f7652) },
  fir:      { bottom: lin(0x18342a), top: lin(0x3f6b4d) },
  giant:    { bottom: lin(0x1d3a29), top: lin(0x55813e) },
  willow:   { bottom: lin(0x4b6b3a), top: lin(0x98ad64) },
  acacia:   { bottom: lin(0x5c6632), top: lin(0xa0a455) },
};
for (const key of Object.keys(LEAF)) {
  LEAF[key].bottom = scaleColor(LEAF[key].bottom, 1.45);
  LEAF[key].top = scaleColor(LEAF[key].top, 1.3);
}
const SNOW = lin(0xe3eaf0);

/** Tree species ids (stable; vegetation rules refer to them). */
export const TREE_KINDS = ['oak', 'amberoak', 'birch', 'linden', 'pine', 'fir', 'snowfir', 'giantoak', 'willow', 'dead', 'acacia'];
const VARIANTS = 3;

// ───────────────────────── specs ─────────────────────────
// spec = { height, trunk (collider radius), tubes:[{points, a, b, main, flex}], blobs:[{…, keep}], cones:[…], far:[…] }

function leanTrunk(rng, r, trunkH, lean, extra = 1.4) {
  const lx = (rng() - 0.5) * lean;
  const lz = (rng() - 0.5) * lean;
  return {
    lx, lz,
    points: [
      { x: 0, y: -0.6, z: 0, r: r * 1.5 },
      { x: 0, y: 0.45, z: 0, r: r * 1.06 },
      { x: lx * 0.4, y: trunkH * 0.6, z: lz * 0.4, r: r * 0.9 },
      { x: lx, y: trunkH, z: lz, r: r * 0.74 },
      { x: lx * 1.25, y: trunkH + extra, z: lz * 1.25, r: r * 0.38 },
    ],
  };
}

function specBroadleaf(rng, pal, bark) {
  const height = 9 + rng() * 3;
  const trunkH = 3.1 + rng() * 1.2;
  const r = 0.36 + rng() * 0.14;
  const t = leanTrunk(rng, r, trunkH, 1.0);
  const spec = { height, trunk: r, tubes: [{ points: t.points, a: BARK_DARK, b: bark, main: true }], blobs: [], cones: [], far: [] };
  const ring = 4 + Math.floor(rng() * 2);
  const start = rng() * 6.283;
  for (let i = 0; i < ring; i++) {
    const ang = start + i / ring * 6.283 + (rng() - 0.5) * 0.5;
    const dist = 1.5 + rng() * 0.8;
    const R = 1.9 + rng() * 0.8;
    const bx = t.lx + Math.cos(ang) * dist;
    const bz = t.lz + Math.sin(ang) * dist;
    const by = trunkH + 0.9 + rng() * 1.5;
    spec.blobs.push({ x: bx, y: by, z: bz, rx: R, ry: R * 0.78, rz: R, bottom: pal.bottom, top: mixColor(pal.bottom, pal.top, 0.8), lump: 0.2, seed: rng() * 50, keep: i < 2 });
    if (i < 3) {
      spec.tubes.push({ points: [{ x: t.lx, y: trunkH * 0.82, z: t.lz, r: r * 0.36 }, { x: (t.lx + bx) / 2, y: (trunkH + by) / 2 + 0.2, z: (t.lz + bz) / 2, r: r * 0.26 }, { x: bx, y: by, z: bz, r: r * 0.14 }], a: bark, b: bark });
    }
  }
  const topR = 2.3 + rng() * 0.6;
  const topY = Math.min(height - topR * 0.8, trunkH + 2.9 + rng() * 0.8);
  spec.blobs.push({ x: t.lx * 1.2, y: topY, z: t.lz * 1.2, rx: topR, ry: topR * 0.82, rz: topR, bottom: mixColor(pal.bottom, pal.top, 0.25), top: pal.top, lump: 0.2, seed: rng() * 50, keep: true });
  spec.height = topY + topR * 0.82;
  spec.far.push({ type: 'diamond', x: t.lx, y: trunkH + 2.0, z: t.lz, rx: 3.9, ry: 3.0, bottom: pal.bottom, top: pal.top });
  return spec;
}

function specBirch(rng) {
  const pal = LEAF.birch;
  const height = 10 + rng() * 3.5;
  const r = 0.13 + rng() * 0.05;
  const lx = (rng() - 0.5) * 1.6;
  const lz = (rng() - 0.5) * 1.6;
  const points = [];
  const rings = 7;
  for (let i = 0; i <= rings; i++) {
    const f = i / rings;
    points.push({ x: lx * f * f, y: -0.4 + f * (height - 0.8), z: lz * f * f, r: r * (1.25 - f * 0.9), color: i % 3 === 2 ? BIRCH_MARK : (i === 0 ? scaleColor(BIRCH_WHITE, 0.6) : BIRCH_WHITE) });
  }
  const spec = { height, trunk: r, tubes: [{ points, a: BIRCH_WHITE, b: BIRCH_WHITE, main: true }], blobs: [], cones: [], far: [] };
  const n = 4 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const f = 0.5 + 0.42 * (i / (n - 1));
    const ang = rng() * 6.283;
    const off = 0.5 + rng() * 0.7;
    const R = 1.05 + rng() * 0.5;
    spec.blobs.push({ x: lx * f * f + Math.cos(ang) * off, y: f * height, z: lz * f * f + Math.sin(ang) * off, rx: R, ry: R * 1.45, rz: R, bottom: pal.bottom, top: pal.top, lump: 0.22, seed: rng() * 50, keep: i % 2 === 0 });
  }
  spec.blobs.push({ x: lx, y: height - 0.9, z: lz, rx: 1.0, ry: 1.5, rz: 1.0, bottom: pal.bottom, top: pal.top, lump: 0.2, seed: rng() * 50, keep: true });
  spec.height = height + 0.6;
  spec.far.push({ type: 'diamond', x: lx * 0.6, y: height * 0.7, z: lz * 0.6, rx: 1.9, ry: height * 0.33, bottom: pal.bottom, top: pal.top });
  spec.far.push({ type: 'trunk', x: 0, z: 0, tx: lx * 0.4, tz: lz * 0.4, h: height * 0.5, r: r * 1.6, color: BIRCH_WHITE });
  return spec;
}

function specLinden(rng) {
  const pal = LEAF.linden;
  const height = 11 + rng() * 3.5;
  const trunkH = 2.6 + rng() * 0.8;
  const r = 0.28 + rng() * 0.1;
  const t = leanTrunk(rng, r, trunkH, 0.5, 2.5);
  const spec = { height, trunk: r, tubes: [{ points: t.points, a: BARK_DARK, b: BARK, main: true }], blobs: [], cones: [], far: [] };
  const crownH = (height - trunkH) / 2;
  spec.blobs.push({ x: t.lx, y: trunkH + crownH + 0.2, z: t.lz, rx: 2.5 + rng() * 0.4, ry: crownH + 0.4, rz: 2.5 + rng() * 0.4, bottom: pal.bottom, top: pal.top, lump: 0.16, seed: rng() * 50, keep: true });
  for (let i = 0; i < 3; i++) {
    const ang = rng() * 6.283;
    const R = 1.5 + rng() * 0.5;
    spec.blobs.push({ x: t.lx + Math.cos(ang) * 1.7, y: trunkH + 1.2 + rng() * 2.2, z: t.lz + Math.sin(ang) * 1.7, rx: R, ry: R * 0.9, rz: R, bottom: pal.bottom, top: mixColor(pal.bottom, pal.top, 0.7), lump: 0.2, seed: rng() * 50, keep: i === 0 });
  }
  spec.far.push({ type: 'diamond', x: t.lx, y: trunkH + crownH, z: t.lz, rx: 2.9, ry: crownH + 0.6, bottom: pal.bottom, top: pal.top });
  return spec;
}

function specPine(rng) {
  const pal = LEAF.pine;
  const height = 13 + rng() * 5;
  const r = 0.26 + rng() * 0.1;
  const lx = (rng() - 0.5) * 2.2;
  const lz = (rng() - 0.5) * 2.2;
  const points = [];
  for (let i = 0; i <= 5; i++) {
    const f = i / 5;
    points.push({ x: lx * f * f, y: -0.5 + f * (height - 1.2), z: lz * f * f, r: r * (1.35 - f * 0.95) });
  }
  const spec = { height, trunk: r, tubes: [{ points, a: BARK_DARK, b: BARK_PINE, main: true }], blobs: [], cones: [], far: [] };
  const n = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const f = 0.72 + 0.26 * (i / (n - 1));
    const ang = rng() * 6.283;
    const off = i === n - 1 ? 0.2 : 0.9 + rng() * 1.1;
    const R = (i === n - 1 ? 2.0 : 2.3) + rng() * 0.8;
    const bx = lx * f * f + Math.cos(ang) * off;
    const bz = lz * f * f + Math.sin(ang) * off;
    spec.blobs.push({ x: bx, y: f * height, z: bz, rx: R, ry: R * 0.55, rz: R, bottom: pal.bottom, top: pal.top, lump: 0.22, seed: rng() * 50, squashBottom: 0.45, keep: i !== 1 });
    if (off > 0.5) spec.tubes.push({ points: [{ x: lx * f * f, y: f * height - 0.9, z: lz * f * f, r: r * 0.3 }, { x: bx, y: f * height - 0.1, z: bz, r: r * 0.16 }], a: BARK_PINE, b: BARK_PINE });
  }
  // a dead stub or two on the bare trunk
  for (let i = 0; i < 2; i++) {
    const f = 0.35 + rng() * 0.25;
    const ang = rng() * 6.283;
    spec.tubes.push({ points: [{ x: lx * f * f, y: f * height, z: lz * f * f, r: r * 0.22 }, { x: lx * f * f + Math.cos(ang) * 1.1, y: f * height + 0.35, z: lz * f * f + Math.sin(ang) * 1.1, r: 0.04 }], a: BARK_GREY, b: BARK_GREY });
  }
  spec.height = height + 0.8;
  spec.far.push({ type: 'diamond', x: lx * 0.8, y: height * 0.86, z: lz * 0.8, rx: 3.0, ry: height * 0.15, bottom: pal.bottom, top: pal.top });
  spec.far.push({ type: 'trunk', x: 0, z: 0, tx: lx * 0.6, tz: lz * 0.6, h: height * 0.8, r: r * 1.5, color: mixColor(BARK_DARK, BARK_PINE, 0.6) });
  return spec;
}

function specFir(rng, snowy) {
  const pal = LEAF.fir;
  const height = 12 + rng() * 8;
  const r = 0.24 + rng() * 0.1;
  const spec = { height, trunk: r, tubes: [], blobs: [], cones: [], far: [] };
  spec.tubes.push({ points: [{ x: 0, y: -0.5, z: 0, r: r * 1.35 }, { x: 0, y: height * 0.35, z: 0, r: r * 0.85 }, { x: 0, y: height * 0.8, z: 0, r: r * 0.3 }], a: BARK_DARK, b: BARK, main: true });
  const tiers = 5;
  const baseY = 1.3 + rng() * 0.9;
  const baseR = 2.6 + rng() * 1.0 + height * 0.04;
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1);
    const y = baseY + (height - baseY - 2.4) * f;
    const radius = baseR * (1 - f * 0.78);
    const tierH = (height - baseY) / tiers * 1.75;
    const rim = snowy ? mixColor(SNOW, pal.top, 0.12) : mixColor(pal.top, pal.bottom, 0.15 + f * 0.1);
    const apex = snowy ? mixColor(pal.bottom, SNOW, 0.35) : pal.bottom;
    spec.cones.push({ x: (rng() - 0.5) * 0.3, y, z: (rng() - 0.5) * 0.3, radius, height: tierH, rim, apex, under: scaleColor(pal.bottom, 0.7), droop: 0.22, seed: Math.floor(rng() * 90) + 1, keep: i % 2 === 0 });
  }
  const farTop = snowy ? mixColor(SNOW, pal.top, 0.3) : pal.top;
  spec.far.push({ type: 'cone', x: 0, y: baseY * 0.8, z: 0, radius: baseR * 0.95, height: height - baseY * 0.8, rim: mixColor(farTop, pal.bottom, 0.3), apex: snowy ? SNOW : mixColor(pal.bottom, pal.top, 0.35) });
  return spec;
}

function specGiantOak(rng) {
  const pal = LEAF.giant;
  const trunkH = 8.5 + rng() * 2;
  const r = 1.35 + rng() * 0.35;
  const t = leanTrunk(rng, r, trunkH, 1.6, 3.5);
  const bark = lin(0x4a3d30);
  const spec = { height: 26, trunk: r * 1.1, tubes: [{ points: t.points, a: BARK_DARK, b: bark, main: true, sides: 9 }], blobs: [], cones: [], far: [] };
  // root flares
  for (let i = 0; i < 6; i++) {
    const ang = i / 6 * 6.283 + rng() * 0.5;
    const cx = Math.cos(ang), cz = Math.sin(ang);
    spec.tubes.push({ points: [{ x: cx * r * 2.3, y: -0.7, z: cz * r * 2.3, r: r * 0.2 }, { x: cx * r * 1.3, y: 0.5, z: cz * r * 1.3, r: r * 0.36 }, { x: cx * r * 0.7, y: 2.4, z: cz * r * 0.7, r: r * 0.3 }], a: BARK_DARK, b: bark, sides: 5 });
  }
  const boughs = 5;
  let top = 0;
  for (let i = 0; i < boughs; i++) {
    const ang = i / boughs * 6.283 + rng() * 0.6;
    const len = 6 + rng() * 2.5;
    const bx = t.lx + Math.cos(ang) * len;
    const bz = t.lz + Math.sin(ang) * len;
    const by = trunkH + 2.5 + rng() * 3.5;
    spec.tubes.push({
      points: [{ x: t.lx * 0.9, y: trunkH * 0.86, z: t.lz * 0.9, r: r * 0.5 }, { x: t.lx + Math.cos(ang) * len * 0.5, y: trunkH + 1.6, z: t.lz + Math.sin(ang) * len * 0.5, r: r * 0.36 }, { x: bx, y: by, z: bz, r: r * 0.16 }],
      a: bark, b: bark, sides: 6, main: i < 3,
    });
    const R = 4.4 + rng() * 1.3;
    spec.blobs.push({ x: bx, y: by + 1.2, z: bz, rx: R, ry: R * 0.72, rz: R, bottom: pal.bottom, top: mixColor(pal.bottom, pal.top, 0.75), lump: 0.22, seed: rng() * 50, keep: i < 3 });
    top = Math.max(top, by + 1.2 + R * 0.72);
  }
  for (let i = 0; i < 3; i++) {
    const ang = rng() * 6.283;
    const R = 5 + rng() * 1.4;
    const y = trunkH + 8 + rng() * 3.5;
    spec.blobs.push({ x: t.lx + Math.cos(ang) * 2.5, y, z: t.lz + Math.sin(ang) * 2.5, rx: R, ry: R * 0.78, rz: R, bottom: mixColor(pal.bottom, pal.top, 0.2), top: pal.top, lump: 0.2, seed: rng() * 50, keep: i === 0 });
    top = Math.max(top, y + R * 0.78);
  }
  spec.height = top;
  spec.far.push({ type: 'diamond', x: t.lx, y: trunkH + 6.5, z: t.lz, rx: 10.5, ry: 8.5, bottom: pal.bottom, top: pal.top });
  spec.far.push({ type: 'trunk', x: 0, z: 0, tx: t.lx, tz: t.lz, h: trunkH, r: r * 1.2, color: bark });
  return spec;
}

function specWillow(rng) {
  const pal = LEAF.willow;
  const trunkH = 2.3 + rng() * 0.8;
  const r = 0.4 + rng() * 0.12;
  const t = leanTrunk(rng, r, trunkH, 1.8, 1.2);
  const spec = { height: trunkH + 4.2, trunk: r, tubes: [{ points: t.points, a: BARK_DARK, b: BARK_GREY, main: true }], blobs: [], cones: [], far: [] };
  const R = 2.6 + rng() * 0.6;
  const cy = trunkH + 1.7;
  spec.blobs.push({ x: t.lx, y: cy, z: t.lz, rx: R, ry: R * 0.62, rz: R, bottom: pal.bottom, top: pal.top, lump: 0.18, seed: rng() * 50, keep: true });
  const n = 10;
  for (let i = 0; i < n; i++) {
    const ang = i / n * 6.283 + rng() * 0.4;
    const dist = R * (0.8 + rng() * 0.22);
    const hang = 1.5 + rng() * 1.1;
    spec.blobs.push({ x: t.lx + Math.cos(ang) * dist, y: cy - hang * 0.6, z: t.lz + Math.sin(ang) * dist, rx: 0.42 + rng() * 0.2, ry: hang, rz: 0.42 + rng() * 0.2, bottom: mixColor(pal.bottom, pal.top, 0.55), top: pal.bottom, lump: 0.25, seed: rng() * 50, detail: 0, keep: i % 3 === 0 });
  }
  spec.far.push({ type: 'diamond', x: t.lx, y: cy - 0.6, z: t.lz, rx: R * 1.25, ry: 2.6, bottom: pal.bottom, top: pal.top });
  return spec;
}

function specDead(rng) {
  const height = 6 + rng() * 3.5;
  const r = 0.26 + rng() * 0.1;
  const a = scaleColor(BARK_GREY, 0.55);
  const b = lin(0x8d8474);
  const lx = (rng() - 0.5) * 2.4;
  const lz = (rng() - 0.5) * 2.4;
  const points = [
    { x: 0, y: -0.5, z: 0, r: r * 1.4 }, { x: lx * 0.1, y: height * 0.3, z: lz * 0.1, r: r * 0.9 },
    { x: lx * 0.45, y: height * 0.62, z: lz * 0.45, r: r * 0.6 }, { x: lx, y: height, z: lz, r: 0.05 },
  ];
  const spec = { height, trunk: r, tubes: [{ points, a, b, main: true }], blobs: [], cones: [], far: [], swayMax: 0.25 };
  for (let i = 0; i < 5; i++) {
    const f = 0.35 + rng() * 0.5;
    const ang = rng() * 6.283;
    const len = 1.4 + rng() * 1.8;
    const px = lx * f * f, pz = lz * f * f, py = f * height;
    spec.tubes.push({
      points: [{ x: px, y: py, z: pz, r: r * 0.36 * (1 - f * 0.5) }, { x: px + Math.cos(ang) * len * 0.6, y: py + len * 0.35, z: pz + Math.sin(ang) * len * 0.6, r: r * 0.2 * (1 - f * 0.5) }, { x: px + Math.cos(ang) * len, y: py + len * 0.9, z: pz + Math.sin(ang) * len, r: 0.025 }],
      a: b, b, sides: 4, main: i < 2,
    });
  }
  spec.far.push({ type: 'trunk', x: 0, z: 0, tx: lx, tz: lz, h: height, r: r * 1.2, color: mixColor(a, b, 0.6) });
  return spec;
}

function specAcacia(rng) {
  const pal = LEAF.acacia;
  const height = 6 + rng() * 1.8;
  const r = 0.2 + rng() * 0.06;
  const forkY = 2.2 + rng() * 0.6;
  const bark = lin(0x6a5a44);
  const spec = { height, trunk: r, tubes: [], blobs: [], cones: [], far: [] };
  spec.tubes.push({ points: [{ x: 0, y: -0.4, z: 0, r: r * 1.4 }, { x: 0.15, y: forkY * 0.6, z: 0.1, r }, { x: 0.2, y: forkY, z: 0.15, r: r * 0.85 }], a: BARK_DARK, b: bark, main: true, capTop: false });
  const forks = 3;
  for (let i = 0; i < forks; i++) {
    const ang = i / forks * 6.283 + rng() * 0.8;
    const len = 1.9 + rng() * 0.9;
    const bx = Math.cos(ang) * len, bz = Math.sin(ang) * len;
    const by = height - 0.9 - rng() * 0.5;
    spec.tubes.push({ points: [{ x: 0.2, y: forkY - 0.1, z: 0.15, r: r * 0.7 }, { x: bx * 0.55, y: forkY + (by - forkY) * 0.7, z: bz * 0.55, r: r * 0.5 }, { x: bx, y: by, z: bz, r: r * 0.25 }], a: bark, b: bark, sides: 5, main: true });
    const R = 2.3 + rng() * 0.7;
    spec.blobs.push({ x: bx, y: by + 0.35, z: bz, rx: R, ry: 0.62, rz: R, bottom: pal.bottom, top: pal.top, lump: 0.2, seed: rng() * 50, squashBottom: 0.4, keep: i < 2 });
  }
  spec.blobs.push({ x: 0, y: height - 0.2, z: 0, rx: 2.6, ry: 0.7, rz: 2.6, bottom: pal.bottom, top: pal.top, lump: 0.18, seed: rng() * 50, squashBottom: 0.4, keep: true });
  spec.height = height + 0.5;
  spec.far.push({ type: 'diamond', x: 0, y: height - 0.3, z: 0, rx: 4.0, ry: 1.1, bottom: pal.bottom, top: pal.top });
  spec.far.push({ type: 'trunk', x: 0, z: 0, tx: 0.2, tz: 0.15, h: height - 0.6, r: r * 1.6, color: bark });
  return spec;
}

const SPEC = {
  oak: rng => specBroadleaf(rng, LEAF.oak, BARK),
  amberoak: rng => specBroadleaf(rng, LEAF.amber, BARK),
  birch: specBirch,
  linden: specLinden,
  pine: specPine,
  fir: rng => specFir(rng, false),
  snowfir: rng => specFir(rng, true),
  giantoak: specGiantOak,
  willow: specWillow,
  dead: specDead,
  acacia: specAcacia,
};

// ───────────────────────── emit ─────────────────────────

function emit(spec, lod) {
  const b = new ModelBuilder();
  if (lod === 2) {
    for (const f of spec.far) {
      if (f.type === 'diamond') {
        const mid = mixColor(f.bottom, f.top, 0.55);
        const base = b.pos.length / 3;
        const ring = 5;
        for (let s = 0; s < ring; s++) {
          const ang = s / ring * 6.283 + 0.3;
          b.vertex(f.x + Math.cos(ang) * f.rx, f.y - f.ry * 0.15, f.z + Math.sin(ang) * f.rx, Math.cos(ang) * 0.85, 0.3, Math.sin(ang) * 0.85, 0.35, mid, 1);
        }
        const top = b.vertex(f.x, f.y + f.ry, f.z, 0, 1, 0, 0.35, f.top, 1);
        const bottom = b.vertex(f.x, f.y - f.ry * 0.9, f.z, 0, -1, 0, 0.35, scaleColor(f.bottom, 0.8), 1);
        for (let s = 0; s < ring; s++) {
          const s1 = (s + 1) % ring;
          b.idx.push(base + s, top, base + s1, base + s1, bottom, base + s);
        }
      } else if (f.type === 'cone') {
        b.cone({ x: f.x, y: f.y, z: f.z, radius: f.radius, height: f.height, sides: 5, rim: f.rim, apex: f.apex, under: f.rim, droop: 0, ragged: 0.1, underside: false, flat: 0.35 });
      } else if (f.type === 'trunk') {
        b.tube([{ x: f.x, y: -0.5, z: f.z, r: f.r }, { x: f.tx, y: f.h, z: f.tz, r: f.r * 0.6 }], 3, f.color, f.color, { capTop: false, flat: 0 });
      }
    }
    return b.finish(0);
  }
  for (const t of spec.tubes) {
    if (lod === 1 && !t.main) continue;
    const sides = lod === 0 ? (t.sides || 7) : 4;
    let points = t.points;
    if (lod === 1 && points.length > 3) points = [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]];
    b.tube(points, sides, t.a, t.b, { flat: 0.2, flex: 0, capTop: t.capTop !== false });
  }
  for (const s of spec.blobs) {
    if (lod === 1 && !s.keep) continue;
    const grow = lod === 1 ? 1.2 : 1;
    b.blob({ ...s, rx: s.rx * grow, ry: s.ry * grow, rz: s.rz * grow, detail: lod === 0 ? (s.detail ?? 1) : 0, flat: 0.5, flex: 1, jitter: 0.12 });
  }
  for (const c of spec.cones) {
    if (lod === 1 && !c.keep) continue;
    const grow = lod === 1 ? 1.5 : 1;
    b.cone({ ...c, height: c.height * grow, sides: lod === 0 ? 8 : 6, underside: lod === 0, flat: 0.55, flex: 1 });
  }
  return b.finish(spec.height, spec.swayMax || 1);
}

/**
 * Build every species.
 * @returns {Record<string, Array<{lods: object[], height: number, trunk: number}>>} kind -> variants; lods = [full, low, far]
 */
export function buildTreeModels() {
  const out = {};
  for (let k = 0; k < TREE_KINDS.length; k++) {
    const kind = TREE_KINDS[k];
    out[kind] = [];
    for (let v = 0; v < VARIANTS; v++) {
      const spec = SPEC[kind](makeRng(1000 + k * 97 + v * 13));
      // giants are rare landmarks: they keep their low-poly crown even in the far tier
      const far = kind === 'giantoak' ? emit(spec, 1) : emit(spec, 2);
      out[kind].push({ lods: [emit(spec, 0), emit(spec, 1), far], height: spec.height, trunk: spec.trunk });
    }
  }
  return out;
}
