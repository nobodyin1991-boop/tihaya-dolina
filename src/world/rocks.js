// Procedural ground props: rocks and boulders (plain / mossy / snow-capped), bushes, dry scrub, heather, ferns,
// reeds, fallen logs, stumps and mushrooms. ~20-170 triangles each, 2-3 seeded variants.
// Budget: draws nothing itself — vegetation.js bakes these into the per-cell static meshes (near cells only).
import { ModelBuilder, lin, mixColor, scaleColor } from './veg-kit.js';
import { makeRng } from '../core/noise.js';

const ROCK_DARK = lin(0x5e5c55);
const ROCK_LIGHT = lin(0x9d978a);
const ROCK_WARM = lin(0x97836a);
const MOSS = lin(0x5a7038);
const SNOW = lin(0xe3eaf0);
const BARK = lin(0x55432f);
const BARK_DARK = lin(0x2c2219);
const WOOD_CUT = lin(0xa08860);

function rock(rng, top, capAmount) {
  const b = new ModelBuilder();
  const rx = 0.7 + rng() * 0.5;
  const rz = 0.6 + rng() * 0.5;
  const ry = 0.45 + rng() * 0.35;
  const light = mixColor(ROCK_LIGHT, ROCK_WARM, rng() * 0.5);
  b.blob({ x: 0, y: ry * 0.45, z: 0, rx, ry, rz, detail: 1, bottom: ROCK_DARK, top: mixColor(light, top, capAmount), lump: 0.32, seed: rng() * 80, flat: 1, flex: -1, jitter: 0.14 });
  if (rng() < 0.6) {
    const s = 0.45 + rng() * 0.25;
    b.blob({ x: rx * 0.8, y: ry * 0.2, z: (rng() - 0.5) * rz, rx: rx * s, ry: ry * s, rz: rz * s, detail: 0, bottom: ROCK_DARK, top: mixColor(light, top, capAmount * 0.7), lump: 0.3, seed: rng() * 80, flat: 1, flex: -1, jitter: 0.14 });
  }
  const model = b.finish(0);
  return { model, radius: Math.max(rx, rz) * 0.85, height: ry * 1.4 };
}

function bush(rng, bottom, top, flatness) {
  const b = new ModelBuilder();
  const n = 2 + Math.floor(rng() * 2);
  let height = 0;
  for (let i = 0; i < n; i++) {
    const r = 0.45 + rng() * 0.35;
    const ang = rng() * 6.283;
    const d = i === 0 ? 0 : 0.4 + rng() * 0.3;
    const y = r * 0.7 * flatness;
    b.blob({ x: Math.cos(ang) * d, y, z: Math.sin(ang) * d, rx: r, ry: r * 0.8 * flatness, rz: r, detail: i === 0 ? 1 : 0, bottom, top, lump: 0.25, seed: rng() * 60, flat: 0.5, flex: 1, jitter: 0.14 });
    height = Math.max(height, y + r * 0.8 * flatness);
  }
  return { model: b.finish(height * 1.6, 0.5), radius: 0, height };
}

function dryBush(rng) {
  const b = new ModelBuilder();
  const twig = lin(0x6e5c40);
  for (let i = 0; i < 5; i++) {
    const ang = i / 5 * 6.283 + rng();
    const len = 0.5 + rng() * 0.45;
    b.tube([{ x: 0, y: 0, z: 0, r: 0.03 }, { x: Math.cos(ang) * len * 0.5, y: len * 0.7, z: Math.sin(ang) * len * 0.5, r: 0.02 }, { x: Math.cos(ang) * len, y: len * 1.1, z: Math.sin(ang) * len, r: 0.008 }], 3, twig, twig, { flex: 0.6 });
  }
  b.blob({ x: 0, y: 0.55, z: 0, rx: 0.6, ry: 0.36, rz: 0.6, detail: 0, bottom: lin(0x59562c), top: lin(0x9c9550), lump: 0.3, seed: rng() * 60, flat: 0.6, flex: 1, jitter: 0.16 });
  return { model: b.finish(1.3, 0.5), radius: 0, height: 0.9 };
}

function heather(rng) {
  const b = new ModelBuilder();
  const n = 3;
  for (let i = 0; i < n; i++) {
    const ang = rng() * 6.283;
    const d = i === 0 ? 0 : 0.35 + rng() * 0.3;
    const r = 0.4 + rng() * 0.25;
    const purple = mixColor(lin(0x8a5f86), lin(0xa0668f), rng());
    b.blob({ x: Math.cos(ang) * d, y: 0.14, z: Math.sin(ang) * d, rx: r, ry: 0.26 + rng() * 0.1, rz: r, detail: 0, bottom: lin(0x3c4a30), top: purple, lump: 0.3, seed: rng() * 60, flat: 0.55, flex: 1, jitter: 0.18 });
  }
  return { model: b.finish(0.7, 0.35), radius: 0, height: 0.45 };
}

function fern(rng) {
  const b = new ModelBuilder();
  const dark = lin(0x2e5230);
  const light = lin(0x6f9a48);
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const ang = i / fronds * 6.283 + rng() * 0.5;
    const len = 0.55 + rng() * 0.35;
    const cx = Math.cos(ang), cz = Math.sin(ang);
    const side = [-cz, 0, cx];
    const mid = [cx * len * 0.55, 0.42 + rng() * 0.12, cz * len * 0.55];
    const tip = [cx * len, 0.22, cz * len];
    b.blade([0, 0.02, 0], mid, 0.03, 0.13, side, dark, mixColor(dark, light, 0.7), 0.8);
    b.blade(mid, tip, 0.13, 0.01, side, mixColor(dark, light, 0.7), light, 1);
  }
  return { model: b.finish(0.6, 0.45), radius: 0, height: 0.5 };
}

function reeds(rng) {
  const b = new ModelBuilder();
  const dark = lin(0x4d5a2c);
  const light = lin(0x9a9a52);
  const head = lin(0x4a3220);
  const n = 9;
  let height = 0;
  for (let i = 0; i < n; i++) {
    const x = (rng() - 0.5) * 0.9;
    const z = (rng() - 0.5) * 0.9;
    const h = 1.2 + rng() * 1.0;
    const lean = [(rng() - 0.5) * 0.35, 0, (rng() - 0.5) * 0.35];
    const ang = rng() * 3.14;
    const side = [Math.cos(ang), 0, Math.sin(ang)];
    b.blade([x, -0.4, z], [x + lean[0], h, z + lean[2]], 0.035, 0.008, side, dark, light, 1);
    if (i % 3 === 0) {
      b.tube([{ x: x + lean[0] * 0.9, y: h * 0.86, z: z + lean[2] * 0.9, r: 0.035 }, { x: x + lean[0], y: h * 0.86 + 0.24, z: z + lean[2], r: 0.035 }], 4, head, head, { flex: 1 });
    }
    height = Math.max(height, h);
  }
  return { model: b.finish(height, 0.6), radius: 0, height };
}

function log(rng) {
  const b = new ModelBuilder();
  const len = 2.6 + rng() * 2.2;
  const r = 0.2 + rng() * 0.14;
  const mossy = mixColor(BARK, MOSS, 0.45);
  b.tube([{ x: -len / 2, y: r * 0.8, z: 0, r: r * 1.1, color: BARK_DARK }, { x: -len * 0.1, y: r * 0.85, z: 0.05, r, color: mossy }, { x: len / 2, y: r * 0.75, z: -0.04, r: r * 0.85, color: BARK }],
    7, BARK_DARK, BARK, { flex: -1, capTop: true, capBottom: true, flat: 0.25 });
  const stubX = (rng() - 0.5) * len * 0.5;
  b.tube([{ x: stubX, y: r * 1.2, z: 0, r: r * 0.3 }, { x: stubX + 0.2, y: r * 1.2 + 0.5, z: 0.25, r: r * 0.12 }], 4, BARK, BARK, { flex: -1 });
  return { model: b.finish(0), radius: 0, height: r * 2 };
}

function stump(rng) {
  const b = new ModelBuilder();
  const r = 0.32 + rng() * 0.16;
  const h = 0.4 + rng() * 0.35;
  b.tube([{ x: 0, y: -0.3, z: 0, r: r * 1.5, color: BARK_DARK }, { x: 0, y: 0.12, z: 0, r: r * 1.08, color: BARK }, { x: 0, y: h, z: 0, r: r * 0.95, color: BARK }, { x: 0, y: h + 0.01, z: 0, r: r * 0.8, color: WOOD_CUT }],
    7, BARK_DARK, BARK, { flex: -1, flat: 0.3 });
  return { model: b.finish(0), radius: r * 0.9, height: h };
}

function mushrooms(rng) {
  const b = new ModelBuilder();
  const red = rng() < 0.5;
  const cap = red ? lin(0xa5342a) : lin(0x9a7448);
  const stem = lin(0xd8cfb4);
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const x = (rng() - 0.5) * 0.6;
    const z = (rng() - 0.5) * 0.6;
    const h = 0.1 + rng() * 0.12;
    const r = 0.05 + rng() * 0.05;
    b.tube([{ x, y: -0.03, z, r: r * 0.4 }, { x, y: h, z, r: r * 0.32 }], 4, stem, stem, { flex: -1, capTop: false });
    b.blob({ x, y: h + r * 0.25, z, rx: r, ry: r * 0.6, rz: r, detail: 0, bottom: scaleColor(cap, 0.7), top: cap, lump: 0.05, seed: i, flat: 0.2, flex: -1, jitter: 0.05, squashBottom: 0.7 });
  }
  return { model: b.finish(0), radius: 0, height: 0.25 };
}

/** Prop ids (stable; vegetation rules refer to them). */
export const PROP_KINDS = ['rock', 'mossrock', 'snowrock', 'bush', 'drybush', 'heather', 'fern', 'reeds', 'log', 'stump', 'mushroom'];

/**
 * Build every prop model.
 * @returns {Record<string, Array<{model: object, radius: number, height: number}>>} kind -> variants
 */
export function buildPropModels() {
  const make = (count, seed, fn) => {
    const list = [];
    for (let v = 0; v < count; v++) list.push(fn(makeRng(seed + v * 31)));
    return list;
  };
  return {
    rock: make(3, 11, rng => rock(rng, ROCK_LIGHT, 0)),
    mossrock: make(3, 23, rng => rock(rng, MOSS, 0.8)),
    snowrock: make(3, 37, rng => rock(rng, SNOW, 0.95)),
    bush: make(3, 41, rng => bush(rng, lin(0x2f5230), lin(0x6e9442), 1)),
    drybush: make(2, 53, dryBush),
    heather: make(3, 67, heather),
    fern: make(2, 71, fern),
    reeds: make(2, 83, reeds),
    log: make(2, 97, log),
    stump: make(2, 101, stump),
    mushroom: make(2, 113, mushrooms),
  };
}
