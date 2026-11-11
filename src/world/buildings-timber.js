// «Тихая долина» architecture: half-timbered walls on stone plinths, jettied upper floors, thick sagging thatch.
import { PALETTE as P } from './materials.js';
import { faces, slots, windowAt, doorAt, gableRoof, hipRoof, block, pick, stepsAt, flagPole, bannerAt } from './building-kit.js';

const WALLS = [P.plaster, P.plasterWarm, 0xc8b78f, 0xd9ceb0, 0xbba886, 0xcfc0a0];
const BEAMS = [P.woodDark, 0x3e2d20, 0x5a4230];
const ROOFS = [P.thatch, 0xa8914f, 0x98864e, 0xbfa560, 0xa89a5c];
const SHUTTERS = [P.clothGreen, P.clothRed, P.clothBlue, 0x6a5a34, P.wood, 0x7a4a2e];

function storey(m, rng, c) {
  const { w, d, y, h, level, pal } = c;
  const stoneGround = level === 0 && pal.stoneGround;
  const logGround = level === 0 && pal.logGround;
  const wall = stoneGround ? pal.base : (logGround ? pal.beam : pal.wall);
  m.box(w, h, d, wall, 0, y, 0, { nb: level === 0, g: level === 0 ? [0.8, 1.03] : [0.94, 1.05], vj: stoneGround ? 0.08 : 0.025 });
  for (const f of faces(w, d)) {
    m.push(f.x, y, f.z, f.ry);
    const us = slots(f.len, 2.4, 0.7);
    if (logGround) {
      for (let i = 0; i < 7; i++) m.box(f.len + 0.16, h / 7 - 0.03, 0.1, pal.beam, 0, i * h / 7, 0, { nb: true, j: 0.12 });
    } else if (!stoneGround) {
      m.box(f.len + 0.08, 0.18, 0.09, pal.beam, 0, 0, 0.01, { nb: true, j: 0.06 });
      m.box(f.len + 0.08, 0.18, 0.09, pal.beam, 0, h - 0.18, 0.01, { nb: true, j: 0.06 });
      for (const s of [-1, 1]) m.box(0.2, h, 0.1, pal.beam, s * (f.len / 2 - 0.08), 0, 0.01, { nb: true, j: 0.06 });
      for (let i = 0; i + 1 < us.length; i++) {
        m.box(0.13, h, 0.08, pal.beam, (us[i] + us[i + 1]) / 2 + (rng() - 0.5) * 0.1, 0, 0.01, { nb: true, j: 0.06, rz: (rng() - 0.5) * 0.03 });
      }
      const bay = Math.min(1.25, f.len * 0.2);
      if (level > 0 || rng() < 0.5) {
        for (const s of [-1, 1]) {
          const ua = s * (f.len / 2 - 0.2), ub = s * (f.len / 2 - 0.2 - bay);
          m.box(0.12, Math.hypot(bay, h - 0.3), 0.07, pal.beam, ua, 0.15, 0.015, { nb: true, rz: Math.atan2(-(ub - ua), h - 0.3) });
        }
      }
    }
    const blind = c.blind.includes(f.name);
    const isFront = f.name === 'front';
    for (const u of us) {
      if (blind) continue;
      if (isFront && c.door !== null && c.door !== undefined && Math.abs(u - c.door) < 1.2) continue;
      if (!isFront && level === 0 && rng() < 0.3) continue;
      windowAt(m, rng, u, level === 0 ? 1.05 : 0.8, { w: 0.8, h: 1.05, frame: pal.beam, shutter: pal.shutter, lit: c.lit ?? 0.5, box: isFront ? 0.3 : 0 });
    }
    if (isFront && c.door !== null && c.door !== undefined) {
      doorAt(m, rng, c.door, { color: pal.door, frame: pal.beam, w: c.wideDoor ? 2.4 : 1.1, h: c.wideDoor ? 2.4 : 2.0, step: P.stone });
    }
    if (level > 0 && (f.name === 'front' || f.name === 'back')) {
      const n = Math.round(f.len / 1.1);
      for (let i = 0; i <= n; i++) m.box(0.14, 0.2, 0.34, pal.beam, -f.len / 2 + 0.1 + (f.len - 0.2) * i / n, -0.2, -0.12, { j: 0.08 });
    }
    m.pop();
  }
}

function roof(m, rng, w, d, y, pal, o) {
  if (o.ridge === 'hip') {
    return hipRoof(m, rng, w, d, y, Math.min(w, d) * 0.62 * (o.roofScale || 1), { color: pal.roof, color2: pal.roof2, edge: pal.beam, eave: 0.6, rows: 3 });
  }
  const shingle = pal.shingle;
  return gableRoof(m, rng, w, d, y, (d / 2 + 0.6) * (shingle ? 0.9 : 1.08) * (o.roofScale || 1), {
    color: pal.roof, edge: shingle ? pal.beam : pal.roof2, wall: pal.wall, t: shingle ? 0.14 : 0.36, rows: shingle ? 3 : 2,
    eave: 0.62, verge: 0.45, sag: 0.12 + rng() * 0.22, ridge: shingle ? 0.2 : 0.42,
  });
}

function townhall(m, rng, b, pal) {
  // the elder's long house: a big hall, and a gabled porch tower with an open belfry-like lookout
  const hallD = b.d - 1.8;
  const hall = block(m, rng, timberStyle, pal, { w: b.w, d: hallD, floors: 2, z: -0.9, door: null, ridge: 'x', dormers: true, lit: 0.8 });
  const tw = 4.6;
  m.push(0, 0, b.d / 2 - 1.6);
  const tower = block(m, rng, timberStyle, { ...pal, stoneGround: true }, { w: tw, d: 3.2, floors: 3, door: 0, ridge: 'z', chimney: false, blind: ['back', 'left', 'right'], wideDoor: false, roofScale: 1.15 });
  m.pop();
  m.push(0, 0, b.d / 2);
  stepsAt(m, 0, 2.2, 2, P.stoneLight);
  bannerAt(m, -tw / 2 - 1.6, 5.4, 0.9, 2.6, P.clothGreen, P.wheat);
  bannerAt(m, tw / 2 + 1.6, 5.4, 0.9, 2.6, P.clothGreen, P.wheat);
  m.pop();
  flagPole(m, 0, tower.ridge - 0.2, b.d / 2 - 1.6, 2.6, P.clothGreen);
  return hall;
}

export const timberStyle = {
  key: 'timber',
  h0: 2.8, h1: 2.55, jetty: 0.28,
  canopyKind: 'thatch',
  palette(rng) {
    const roofColor = pick(rng, ROOFS);
    const shingle = rng() < 0.14;
    return {
      wall: pick(rng, WALLS), beam: pick(rng, BEAMS), base: pick(rng, [P.stone, P.stoneDark, 0x6f6c62]),
      roof: shingle ? P.roofWood : roofColor, roof2: shingle ? P.woodDark : 0x8a763e, shingle,
      shutter: pick(rng, SHUTTERS), door: pick(rng, [P.wood, P.woodLight, 0x5d4a34, P.clothGreen]),
      stoneGround: rng() < 0.28, logGround: rng() < 0.12, chimney: P.stone, trim: P.wood,
    };
  },
  storey, roof, townhall,
};
