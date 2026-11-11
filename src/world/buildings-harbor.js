// «Янтарная Гавань» architecture: pale sandstone and warm plaster, amber-tiled low roofs, arcades, balconies,
// bright shutters and awnings.
import { PALETTE as P } from './materials.js';
import { faces, slots, windowAt, doorAt, gableRoof, hipRoof, block, pick, stepsAt, flagPole, bannerAt } from './building-kit.js';

const WALLS = [0xd8c49a, 0xcdb588, 0xe0d2ae, 0xc9a877, 0xd9b98c, 0xdccaa2, 0xcf9f78];
const ROOFS = [P.roofAmber, 0xb56a2e, P.roofTile, 0xc98a40, 0xa85a30];
const SHUTTERS = [0x3f6a7a, P.clothBlue, 0x4d7a5a, P.clothRed, 0x2f5a6a, 0x7a5a8a];

/** An arched opening on the facade frame: dark recess with haunches at the top corners. */
export function archAt(m, u, w, h, trim, dark = 0x1f1b17) {
  m.box(w, h, 0.1, dark, u, 0.02, -0.02, { nb: true, g: [1.5, 0.7] });
  for (const s of [-1, 1]) {
    m.box(w * 0.36, w * 0.36, 0.12, trim, u + s * w / 2, h - w * 0.02, -0.02, { c: true, rz: Math.PI / 4, nb: true });
  }
  m.box(w + 0.5, 0.2, 0.14, trim, u, h + 0.02, 0, { nb: true, j: 0.04 });
}

function storey(m, rng, c) {
  const { w, d, y, h, level, pal } = c;
  m.box(w, h, d, level === 0 && pal.stoneGround ? pal.base : pal.wall, 0, y, 0, { nb: level === 0, g: level === 0 ? [0.8, 1.03] : [0.96, 1.04], vj: 0.03 });
  m.box(w + 0.24, 0.18, d + 0.24, pal.trim, 0, y + h - 0.18, 0, { j: 0.03 });
  for (const f of faces(w, d)) {
    m.push(f.x, y, f.z, f.ry);
    for (const s of [-1, 1]) m.box(0.42, h - 0.18, 0.1, pal.trim, s * (f.len / 2 - 0.19), 0, 0, { nb: true, j: 0.04 });
    const us = slots(f.len, 2.6, 0.9);
    const blind = c.blind.includes(f.name);
    const isFront = f.name === 'front';
    const balcony = isFront && level > 0 && pal.balcony && !blind;
    for (const u of us) {
      if (blind) continue;
      if (isFront && c.door !== null && c.door !== undefined && Math.abs(u - c.door) < 1.3) continue;
      if (!isFront && level === 0 && rng() < 0.4) continue;
      const tall = balcony || (level > 0 && rng() < 0.3);
      windowAt(m, rng, u, level === 0 ? 1.1 : (tall ? 0.25 : 0.8), { w: 0.78, h: tall ? 1.75 : 1.2, frame: pal.beam, shutter: pal.shutter, lit: c.lit ?? 0.55, sillColor: pal.trim, box: isFront && !tall ? 0.25 : 0 });
      if (isFront && level === 0 && pal.awnings) {
        m.use('cloth');
        m.quad([u - 0.6, 2.05, 0.75], [u + 0.6, 2.05, 0.75], [u + 0.6, 2.5, 0.04], [u - 0.6, 2.5, 0.04], pal.awning, { g: [0.85, 1.05] });
        m.use('flat');
      }
    }
    if (balcony) {
      const bw = Math.min(f.len - 1.2, us.length * 2.4);
      m.box(bw, 0.14, 0.85, pal.trim, 0, 0.05, 0.42, { j: 0.04 });
      m.box(bw, 0.07, 0.07, pal.beam, 0, 1.0, 0.8, { nb: true });
      const n = Math.round(bw / 0.36);
      for (let i = 0; i <= n; i++) m.box(0.05, 0.86, 0.05, pal.beam, -bw / 2 + bw * i / n, 0.16, 0.8, { nb: true });
      for (const s of [-1, 1]) m.box(0.14, 0.4, 0.6, pal.trim, s * (bw / 2 - 0.3), -0.3, 0.3, { top: [1, 1.2] });
    }
    if (isFront && c.door !== null && c.door !== undefined) {
      const dw = c.wideDoor ? 2.5 : 1.15, dh = c.wideDoor ? 2.6 : 2.1;
      m.box(dw + 0.5, dh + 0.3, 0.12, pal.trim, c.door, 0, 0, { nb: true, top: [0.8, 1] });
      doorAt(m, rng, c.door, { color: pal.door, frame: pal.beam, w: dw, h: dh, step: pal.trim });
    }
    m.pop();
  }
}

function roof(m, rng, w, d, y, pal, o) {
  const hip = o.ridge === 'hip' || pal.hip;
  if (hip) {
    return hipRoof(m, rng, w, d, y, Math.min(w, d) * 0.36 * (o.roofScale || 1) + 0.4, { color: pal.roof, color2: pal.roof2, edge: pal.trim, eave: 0.5, rows: 5 });
  }
  return gableRoof(m, rng, w, d, y, (d / 2 + 0.45) * 0.52 * (o.roofScale || 1), {
    color: pal.roof, edge: pal.roof2, wall: pal.wall, t: 0.13, rows: 4, eave: 0.45, verge: 0.3, sag: rng() * 0.06, ridge: 0.2,
  });
}

/** A square tower with an open loggia and an amber pyramid cap (town hall, guild hall). */
function loggiaTower(m, rng, pal, size, height, flag) {
  m.box(size, height, size, pal.wall, 0, 0, 0, { nb: true, g: [0.85, 1.03], vj: 0.03 });
  for (const f of faces(size, size)) {
    m.push(f.x, 0, f.z, f.ry);
    for (const s of [-1, 1]) m.box(0.4, height, 0.1, pal.trim, s * (size / 2 - 0.18), 0, 0, { nb: true });
    windowAt(m, rng, 0, height * 0.45, { w: 0.7, h: 1.5, frame: pal.beam, shutter: null, lit: 0.7, sillColor: pal.trim });
    m.pop();
  }
  m.box(size + 0.5, 0.25, size + 0.5, pal.trim, 0, height, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) m.box(0.34, 1.9, 0.34, pal.trim, sx * (size / 2 - 0.1), height + 0.25, sz * (size / 2 - 0.1), { nb: true });
  }
  m.use('lamp').box(0.5, 0.6, 0.5, P.lantern, 0, height + 0.9, 0);
  m.use('flat');
  m.box(size + 0.5, 0.2, size + 0.5, pal.trim, 0, height + 2.15, 0);
  hipRoof(m, rng, size, size, height + 2.35, size * 0.75, { color: pal.roof, color2: pal.roof2, edge: pal.trim, eave: 0.45, rows: 4 });
  m.ico(0.2, P.gold, 0, height + 2.45 + size * 0.75, 0);
  if (flag) flagPole(m, 0, height + 2.4 + size * 0.75, 0, 2.2, flag);
}

/** Arcade along the front: pillars at the outer edge of the canopy zone, arches between, a flat terrace above. */
function arcade(m, rng, w, d, depth, pal, y1 = 3.1) {
  const z0 = d / 2;
  const bays = Math.max(3, Math.round(w / 3.2));
  const step = w / bays;
  for (let i = 0; i <= bays; i++) {
    const u = -w / 2 + i * step;
    const centreGap = Math.abs(u) < 0.6;
    if (centreGap) continue;
    m.box(0.5, y1 - 0.5, 0.5, pal.trim, u, 0, z0 + depth - 0.3, { nb: true, top: [0.85, 0.85], g: [0.8, 1.02], j: 0.03 });
    m.box(0.7, 0.2, 0.7, pal.trim, u, y1 - 0.55, z0 + depth - 0.3);
  }
  m.box(w + 0.3, 0.55, 0.5, pal.wall, 0, y1 - 0.35, z0 + depth - 0.3, { j: 0.02 });
  m.box(w + 0.4, 0.2, depth + 0.2, pal.trim, 0, y1 + 0.2, z0 + depth / 2, { j: 0.03 });
  // balustrade of the terrace
  m.box(w + 0.3, 0.08, 0.1, pal.trim, 0, y1 + 1.2, z0 + depth - 0.1, { nb: true });
  const n = Math.round(w / 0.5);
  for (let i = 0; i <= n; i++) m.box(0.09, 0.8, 0.09, pal.trim, -w / 2 + w * i / n, y1 + 0.4, z0 + depth - 0.1, { nb: true });
}

function townhall(m, rng, b, pal) {
  const hallPal = { ...pal, balcony: true, hip: true, awnings: false };
  const hall = block(m, rng, harborStyle, hallPal, { w: b.w, d: b.d - 1.2, floors: 3, z: -0.6, door: 0, wideDoor: true, ridge: 'hip', chimney: false, lit: 0.8 });
  m.push(b.w / 2 - 2.4, 0, -b.d / 2 + 2.6);
  loggiaTower(m, rng, pal, 3.8, hall.top + 3.2, P.clothAmber);
  m.pop();
  m.push(0, 0, b.d / 2 - 1.2);
  stepsAt(m, 0, 3.2, 3, pal.trim);
  bannerAt(m, -3.6, 6.6, 1.0, 3.0, P.clothAmber, P.clothCream);
  bannerAt(m, 3.6, 6.6, 1.0, 3.0, P.clothAmber, P.clothCream);
  m.pop();
  return hall;
}

/** Merchant guild hall: three storeys over an arcade, a loggia tower, banners. The trader stands under the arcade. */
function guildhall(m, rng, b, pal) {
  const hallPal = { ...pal, balcony: false, hip: true, awnings: false, wall: 0xe0cfa6, roof: P.roofAmber };
  const hall = block(m, rng, harborStyle, hallPal, { w: b.w, d: b.d, floors: 3, door: 0, wideDoor: true, ridge: 'hip', chimney: false, lit: 0.85 });
  arcade(m, rng, b.w, b.d, b.canopy, hallPal);
  m.push(-b.w / 2 + 2.3, 0, -b.d / 2 + 2.5);
  loggiaTower(m, rng, hallPal, 3.6, hall.top + 2.6, P.clothBlue);
  m.pop();
  m.push(0, 0, b.d / 2);
  bannerAt(m, -b.w / 2 + 1.4, 8.2, 1.0, 3.2, P.clothBlue, P.gold);
  bannerAt(m, b.w / 2 - 1.4, 8.2, 1.0, 3.2, P.clothBlue, P.gold);
  m.pop();
  return hall;
}

export const harborStyle = {
  key: 'harbor',
  h0: 3.1, h1: 2.8, jetty: 0,
  canopyKind: 'tile',
  palette(rng) {
    const shutter = pick(rng, SHUTTERS);
    return {
      wall: pick(rng, WALLS), beam: pick(rng, [0x5a4230, P.woodDark, 0x6e5034]), base: pick(rng, [0x9c8660, 0xa8946c, P.sandstone]),
      trim: pick(rng, [0xe6d9b8, 0xd9c9a0, 0xefe4c8]), roof: pick(rng, ROOFS), roof2: pick(rng, [0xa85a2a, 0xd08a44, 0xb8703a]),
      shutter, door: pick(rng, [shutter, P.wood, 0x5d4a34]), stoneGround: rng() < 0.35, hip: rng() < 0.45,
      balcony: rng() < 0.4, awnings: rng() < 0.3, awning: pick(rng, [P.clothRed, P.clothAmber, 0x3f6a7a, P.clothCream]), chimney: 0xc9b48a,
    };
  },
  storey, roof, townhall, guildhall, arcade,
};
