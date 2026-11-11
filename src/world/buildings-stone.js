// «Каменный Брод» architecture: grey rubble walls with pale quoins, steep slate roofs, crow-stepped gables,
// a keep for a town hall and a foundry with a tall chimney.
import { PALETTE as P } from './materials.js';
import { faces, slots, windowAt, doorAt, gableRoof, hipRoof, block, pick, stepsAt, flagPole, bannerAt, battlement } from './building-kit.js';

const WALLS = [0x7b7d7c, 0x858887, 0x6c6f70, 0x8a8a84, 0x74777a, 0x7f7c74];
const ROOFS = [P.roofSlate, P.slate, 0x3c4650, 0x505a60, 0x46505a];

function storey(m, rng, c) {
  const { w, d, y, h, level, pal } = c;
  const plaster = level > 0 && pal.plasterUpper;
  const wall = plaster ? pal.upper : pal.wall;
  m.box(w, h, d, wall, 0, y, 0, { nb: level === 0, g: level === 0 ? [0.78, 1.02] : [0.95, 1.04], vj: plaster ? 0.02 : 0.07, top: level === 0 ? [0.985, 0.985] : null });
  if (level > 0) m.box(w + 0.18, 0.16, d + 0.18, pal.trim, 0, y - 0.08, 0, { j: 0.04 });
  for (const f of faces(w, d)) {
    m.push(f.x, y, f.z, f.ry);
    // quoins and a few proud stones give the wall its masonry feel
    if (!plaster) {
      const rowsQ = Math.floor(h / 0.62);
      for (const s of [-1, 1]) {
        for (let i = 0; i < rowsQ; i++) {
          const long = (i + (s > 0 ? 1 : 0)) % 2;
          m.box(long ? 0.62 : 0.4, 0.4, 0.09, pal.trim, s * (f.len / 2 - (long ? 0.29 : 0.18)), 0.1 + i * 0.62, 0, { nb: true, j: 0.1 });
        }
      }
      const stones = Math.round(f.len * 0.7);
      for (let i = 0; i < stones; i++) {
        m.box(0.4 + rng() * 0.5, 0.26 + rng() * 0.16, 0.05, wall, (rng() - 0.5) * (f.len - 1.6), 0.2 + rng() * (h - 0.7), 0.005, { nb: true, j: 0.22 });
      }
    } else {
      m.box(f.len + 0.06, 0.16, 0.08, pal.beam, 0, h - 0.16, 0.01, { nb: true });
      for (const s of [-1, 1]) m.box(0.18, h, 0.08, pal.beam, s * (f.len / 2 - 0.08), 0, 0.01, { nb: true });
    }
    const us = slots(f.len, 2.7, 0.9);
    const blind = c.blind.includes(f.name);
    const isFront = f.name === 'front';
    for (const u of us) {
      if (blind) continue;
      if (isFront && c.door !== null && c.door !== undefined && Math.abs(u - c.door) < 1.25) continue;
      if (!isFront && level === 0 && rng() < 0.45) continue;
      windowAt(m, rng, u, level === 0 ? 1.15 : 0.85, { w: 0.68, h: 1.1, frame: pal.beam, shutter: rng() < 0.35 ? pal.shutter : null, lit: c.lit ?? 0.5, lintel: pal.trim, sillColor: pal.trim });
    }
    if (isFront && c.door !== null && c.door !== undefined) {
      const dw = c.wideDoor ? 2.5 : 1.1;
      m.box(dw + 0.6, 0.3, 0.12, pal.trim, c.door, (c.wideDoor ? 2.5 : 2.05) + 0.12, 0.02, { nb: true, j: 0.06 });
      doorAt(m, rng, c.door, { color: pal.door, frame: pal.beam, w: dw, h: c.wideDoor ? 2.5 : 2.05, step: pal.trim });
    }
    m.pop();
  }
}

/** Crow-stepped parapets on both gable ends of a roof whose ridge runs along x. */
function crowSteps(m, w, d, y, h, color) {
  const steps = 4;
  for (const end of [-1, 1]) {
    for (let i = 0; i < steps; i++) {
      const half = d / 2 * (1 - i / steps) + 0.12;
      const top = y + h * (i + 1) / steps + 0.32;
      const bottom = y + h * i / steps - 0.1;
      m.box(0.36, top - bottom, half * 2, color, end * (w / 2 + 0.05), bottom, 0, { vj: 0.07, nb: true });
    }
    m.box(0.46, 0.18, 0.7, color, end * (w / 2 + 0.05), y + h + 0.32, 0, { j: 0.05 });
  }
}

function roof(m, rng, w, d, y, pal, o) {
  if (o.ridge === 'hip') {
    return hipRoof(m, rng, w, d, y, Math.min(w, d) * 0.7 * (o.roofScale || 1), { color: pal.roof, color2: pal.roof2, edge: pal.trim, eave: 0.3, rows: 4 });
  }
  const h = (d / 2 + 0.3) * 1.12 * (o.roofScale || 1);
  const stepped = pal.stepped && o.steps !== false;
  gableRoof(m, rng, w, d, y, h, {
    color: pal.roof, edge: pal.roof2, wall: pal.plasterUpper ? pal.upper : pal.wall, t: 0.12, rows: 4,
    eave: 0.3, verge: stepped ? -0.1 : 0.25, sag: rng() * 0.08, ridge: 0.18, barge: !stepped,
  });
  if (stepped) crowSteps(m, w, d, y, h, pal.wall);
  return y + h;
}

function townhall(m, rng, b, pal) {
  // a squat keep: battlemented hall, a taller corner tower with a slate cap, an arched gate and wide steps
  const keepPal = { ...pal, plasterUpper: false, stepped: false };
  const main = block(m, rng, stoneStyle, keepPal, { w: b.w, d: b.d - 1.4, floors: 3, z: -0.7, door: 0, wideDoor: true, ridge: 'flat', chimney: false, lit: 0.75 });
  m.push(0, 0, -0.7);
  battlement(m, b.w + 0.5, b.d - 0.9, main.ridge - 0.05, pal.wall, { pitch: 1.4 });
  m.pop();
  const tw = 4.8, tx = -b.w / 2 + tw / 2 - 0.3, tz = b.d / 2 - tw / 2;
  m.push(tx, 0, tz);
  const tower = block(m, rng, stoneStyle, keepPal, { w: tw, d: tw, floors: 5, door: null, ridge: 'flat', chimney: false, blind: ['back', 'right'], lit: 0.6 });
  battlement(m, tw + 0.6, tw + 0.6, tower.ridge - 0.05, pal.wall, { pitch: 1.2 });
  hipRoof(m, rng, tw - 1.2, tw - 1.2, tower.ridge + 0.1, 3.2, { color: pal.roof, color2: pal.roof2, edge: pal.trim, eave: 0.2, rows: 4 });
  flagPole(m, 0, tower.ridge + 3.1, 0, 2.8, P.guardBlue);
  m.pop();
  m.push(0, 0, b.d / 2 - 1.4);
  stepsAt(m, 0, 3.2, 3, pal.trim);
  bannerAt(m, 3.4, 7.4, 1.1, 3.6, P.guardBlue, P.steel);
  bannerAt(m, 6.2, 7.4, 1.1, 3.6, P.guardBlue, P.steel);
  m.pop();
  return main;
}

/** The foundry: a long smelting hall with glowing furnace mouths, a roof vent and a tall round chimney. */
function foundry(m, rng, b, pal) {
  const hallPal = { ...pal, plasterUpper: false, stepped: true };
  const hall = block(m, rng, stoneStyle, hallPal, { w: b.w - 4, d: b.d, floors: 2, x: -2, door: -3.2, wideDoor: true, ridge: 'x', chimney: false, lit: 0.9 });
  // roof vent
  m.box(4.2, 0.9, 1.4, pal.beam, -2, hall.ridge - 0.4, 0, { j: 0.05 });
  m.gable(4.8, 0.8, 2.0, pal.roof, -2, hall.ridge + 0.5, 0, { ry: Math.PI / 2 });
  // furnace mouths on the front
  m.push(0, 0, b.d / 2);
  for (const u of [1.2, 3.6]) {
    m.box(1.7, 2.0, 0.16, pal.trim, u, 0.2, 0, { nb: true, top: [0.75, 1] });
    m.box(1.2, 1.5, 0.14, 0x140f0c, u, 0.3, 0.05, { nb: true, top: [0.7, 1] });
    m.use('furnace').box(0.9, 0.5, 0.1, P.ember, u, 0.36, 0.13, { nb: true, top: [0.7, 1] });
    m.use('flat');
  }
  m.pop();
  // the stack
  const cx = b.w / 2 - 2.2, cz = -b.d / 2 + 2.4;
  m.box(3.6, 3.4, 3.6, pal.wall, cx, 0, cz, { vj: 0.08, nb: true, top: [0.9, 0.9], g: [0.75, 1] });
  m.cyl(0.95, 1.5, 13.5, 0x7a6f66, cx, 3.2, cz, { seg: 9, vj: 0.07, g: [0.8, 1.02], lean: [0.12, -0.08] });
  for (const k of [0.3, 0.62, 0.92]) m.cyl(1.5 - 0.55 * k + 0.1, 1.5 - 0.55 * k + 0.12, 0.22, pal.trim, cx + 0.12 * k, 3.2 + 13.5 * k, cz - 0.08 * k, { seg: 9, j: 0.05 });
  m.use('furnace').cyl(0.82, 0.86, 0.14, P.ember, cx + 0.12, 16.72, cz - 0.08, { seg: 9 });
  m.use('flat');
  // side shed with coal
  m.box(3.4, 2.3, b.d - 4.2, pal.beam, b.w / 2 - 1.9, 0, 1.8, { nb: true, j: 0.06, g: [0.8, 1.05] });
  m.box(3.9, 0.14, b.d - 3.6, pal.roof, b.w / 2 - 1.9, 2.5, 1.8, { rz: -0.16, j: 0.05 });
  m.ico(1.2, 0x23211f, b.w / 2 - 1.2, 0.2, b.d / 2 - 0.9, { s: [1.3, 0.6, 0.9], noise: 0.25, detail: 1 });
  return hall;
}

export const stoneStyle = {
  key: 'stone',
  h0: 3.0, h1: 2.7, jetty: 0,
  canopyKind: 'slate',
  palette(rng) {
    const wall = pick(rng, WALLS);
    return {
      wall, upper: pick(rng, [P.plasterGrey, 0xa9a595, 0xc1b9a2]), plasterUpper: rng() < 0.28, stepped: rng() < 0.42,
      beam: pick(rng, [P.woodDark, 0x3a2e24]), base: P.stoneDark, trim: pick(rng, [P.stoneLight, 0x9a978c, 0xb0ab9c]),
      roof: pick(rng, ROOFS), roof2: 0x353e46, shutter: pick(rng, [0x4a3524, 0x3d5068, 0x5a3a30]),
      door: pick(rng, [P.woodDark, P.wood, 0x4e3a2a]), chimney: wall,
    };
  },
  storey, roof, townhall, foundry,
};
