// Procedural buildings of the three cities. emitBuilding() draws one layout building (see city-layout.js) into a
// Mesher in the building's local frame: x across the facade, front (door) towards +z, ground at y = 0.
import { PALETTE as P } from './materials.js';
import { makeRng } from '../core/noise.js';
import { block, canopy, openFront, signAt, bannerAt, flagPole, pick, faces, doorAt } from './building-kit.js';
import { timberStyle } from './buildings-timber.js';
import { stoneStyle } from './buildings-stone.js';
import { harborStyle } from './buildings-harbor.js';

export const STYLES = { timber: timberStyle, stone: stoneStyle, harbor: harborStyle };

/** Sign-board colours per NPC role: [board, emblem]. */
const SIGNS = {
  weaponsmith: [P.woodDark, P.steel], armorer: [P.woodDark, P.guardBlue], grocer: [P.woodLight, P.clothGreen],
  trader: [P.woodLight, P.gold], smith: [P.woodDark, P.ember], carpenter: [P.woodLight, P.wood],
  leatherworker: [P.woodLight, P.leather], tailor: [P.woodLight, P.clothPurple], mason: [P.stoneLight, P.stoneDark],
  apothecary: [P.woodLight, P.leaf], farmer: [P.woodLight, P.wheat], innkeeper: [P.woodDark, P.amber],
  banker: [P.woodDark, P.gold], quartermaster: [P.woodLight, P.clothRed],
};
const AWNINGS = [P.clothRed, P.clothGreen, P.clothBlue, P.clothAmber, P.clothBrown];

function house(m, rng, b, st, pal) {
  const v = rng();
  if (b.w >= 8.5 && v < 0.34) {
    // a taller main part and a lower side wing under its own roof
    const mainW = Math.round(b.w * 0.6 * 10) / 10, wingW = b.w - mainW;
    const side = rng() < 0.5 ? -1 : 1;
    const doorInMain = Math.abs(b.door) < mainW / 2 - 0.9;
    block(m, rng, st, pal, { w: mainW, d: b.d, floors: Math.max(2, b.floors), x: side * wingW / 2, door: doorInMain ? b.door - side * wingW / 2 : 0, ridge: 'z', blind: [side > 0 ? 'left' : 'right'], dormers: false });
    block(m, rng, st, pal, { w: wingW, d: b.d - 1.2, floors: Math.max(1, b.floors - 1), x: -side * mainW / 2, z: -0.6, door: null, ridge: 'x', blind: [side > 0 ? 'right' : 'left'], chimney: false });
    return;
  }
  const ridge = b.w < b.d + 0.5 && v > 0.5 ? 'z' : (v > 0.88 ? 'z' : 'x');
  block(m, rng, st, pal, { w: b.w, d: b.d, floors: b.floors, door: b.door, ridge, dormers: rng() < 0.4 });
  // lean-to shed or a porch roof
  if (rng() < 0.3) {
    m.push(0, 0, b.d / 2);
    m.box(1.9, 0.1, 1.0, pal.roof, b.door, 2.45, 0.5, { rx: 0.3, j: 0.05 });
    for (const s of [-1, 1]) m.box(0.1, 2.3, 0.1, pal.beam, b.door + s * 0.85, 0.1, 0.85, { nb: true });
    m.pop();
  }
}

/** Open-front workshop / shop: a closed back room, a wide dark opening and a canopy on posts over the work area. */
function roleShop(m, rng, b, st, pal) {
  const isShop = b.type === 'shop';
  const res = block(m, rng, st, pal, { w: b.w, d: b.d, floors: b.floors, door: null, ridge: rng() < 0.5 ? 'x' : 'z', blind: [], chimney: b.type !== 'smithy', lit: 0.7 });
  openFront(m, b.w, b.d, { beam: pal.beam });
  const cloth = isShop || st.key === 'harbor';
  canopy(m, rng, b.w, b.d, b.canopy, {
    kind: cloth ? 'cloth' : st.canopyKind, color: cloth ? pick(rng, AWNINGS) : (st.key === 'stone' ? pal.roof : pal.roof),
    post: pal.beam, y1: st.h0 + 0.1, y0: 2.35,
  });
  const sign = SIGNS[b.role];
  if (sign) {
    m.push(0, 0, b.d / 2 + b.canopy);
    signAt(m, rng, b.w / 2 - 0.25, 2.5, sign[0], sign[1]);
    m.pop();
  }
  if (b.type === 'smithy') {
    // big forge chimney and the glow of the hearth inside
    m.box(1.5, res.ridge + 1.6, 1.5, P.stoneDark, -b.w / 2 + 1.2, 0, -b.d / 2 + 1.2, { nb: true, vj: 0.08, top: [0.7, 0.7], g: [0.8, 1] });
    m.use('ember').box(0.9, 0.5, 0.08, P.ember, -b.w * 0.2, 0.7, b.d / 2 + 0.04, { nb: true });
    m.use('flat');
  }
  return res;
}

function tavern(m, rng, b, st, pal) {
  const res = block(m, rng, st, pal, { w: b.w, d: b.d, floors: b.floors, door: 0, ridge: 'x', dormers: true, lit: 0.95 });
  // terrace: pergola posts, beams and rafters, a low fence at both ends, hanging lanterns
  const z0 = b.d / 2, dep = b.canopy, hw = b.w / 2;
  for (const s of [-1, 1]) {
    m.box(0.2, 2.5, 0.2, pal.beam, s * (hw - 0.2), 0, z0 + dep - 0.2, { nb: true, g: [0.8, 1.05] });
    m.box(0.16, 0.16, dep, pal.beam, s * (hw - 0.2), 2.5, z0 + dep / 2);
    m.box(0.1, 0.9, dep - 0.3, pal.beam, s * (hw - 0.2), 0, z0 + dep / 2, { nb: true, j: 0.06 });
  }
  m.box(b.w, 0.18, 0.18, pal.beam, 0, 2.42, z0 + dep - 0.2);
  const rafters = Math.round(b.w / 1.3);
  for (let i = 0; i <= rafters; i++) m.box(0.09, 0.1, dep + 0.5, pal.beam, -hw + b.w * i / rafters, 2.62, z0 + dep / 2 + 0.1, { j: 0.08 });
  for (const u of [-hw * 0.5, hw * 0.5]) {
    m.box(0.03, 0.4, 0.03, P.iron, u, 2.05, z0 + dep * 0.55, { nb: true });
    m.use('lamp').box(0.2, 0.26, 0.2, P.lantern, u, 1.82, z0 + dep * 0.55);
    m.use('flat');
  }
  m.push(0, 0, z0);
  signAt(m, rng, 1.4, 2.7, SIGNS.innkeeper[0], SIGNS.innkeeper[1]);
  m.pop();
  return res;
}

function barracks(m, rng, b, st, pal) {
  const res = block(m, rng, st, { ...pal, stoneGround: true, balcony: false, awnings: false }, { w: b.w, d: b.d, floors: b.floors, door: 0, wideDoor: true, ridge: st.key === 'harbor' ? 'hip' : 'x', dormers: false, lit: 0.6 });
  m.push(0, 0, b.d / 2);
  bannerAt(m, -b.w * 0.32, st.h0 + 2.2, 0.9, 2.4, P.guardBlue, P.steel);
  bannerAt(m, b.w * 0.32, st.h0 + 2.2, 0.9, 2.4, P.guardBlue, P.steel);
  // spear rack by the door
  m.box(1.6, 0.08, 0.1, P.woodDark, -3.2, 1.2, 0.15);
  for (let i = 0; i < 4; i++) {
    m.box(0.045, 2.3, 0.045, P.woodLight, -3.8 + i * 0.4, 0.1, 0.2, { nb: true, rx: -0.08 });
    m.cyl(0, 0.05, 0.26, P.steel, -3.8 + i * 0.4, 2.38, 0.02, { seg: 4 });
  }
  m.pop();
  flagPole(m, b.w / 2 - 0.6, res.top - 0.2, b.d / 2 - 0.4, 3.4, P.guardBlue);
  return res;
}

function stable(m, rng, b, st, pal) {
  const res = block(m, rng, st, { ...pal, logGround: st.key === 'timber', stoneGround: false, balcony: false, awnings: false }, { w: b.w, d: b.d, floors: 1, door: null, ridge: 'x', chimney: false, blind: ['front'] });
  openFront(m, b.w, b.d, { beam: pal.beam, margin: 1.2 });
  canopy(m, rng, b.w, b.d, b.canopy, { kind: st.canopyKind, color: pal.roof, post: pal.beam, y1: st.h0 + 0.1, y0: 2.4 });
  // stall partitions seen through the opening
  for (let i = -1; i <= 1; i++) m.box(0.12, 1.3, 1.1, pal.beam, i * b.w * 0.24, 0.1, b.d / 2 + 0.4, { nb: true, j: 0.08 });
  return res;
}

function warehouse(m, rng, b, st, pal) {
  const plain = { ...pal, balcony: false, awnings: false, plasterUpper: false, stoneGround: st.key !== 'timber' };
  const ridge = b.w > b.d + 2 ? 'x' : 'z';
  const res = block(m, rng, st, plain, { w: b.w, d: b.d, floors: b.floors, door: 0, wideDoor: true, ridge, chimney: false, lit: 0.25, dormers: false });
  m.push(0, 0, b.d / 2);
  if (b.variant === 'vault') {
    // the banker's strong-house: iron-bound door, barred windows, a gilded sign
    for (const k of [0.5, 1.1, 1.7]) m.box(2.5, 0.09, 0.05, P.iron, 0, k, 0.16, { nb: true });
    signAt(m, rng, 2.1, 2.9, SIGNS.banker[0], SIGNS.banker[1]);
    m.box(1.0, 0.7, 0.7, P.woodDark, -2.6, 0.1, 0.5, { j: 0.05 });
    m.box(1.04, 0.1, 0.74, P.iron, -2.6, 0.5, 0.5);
  } else if (b.variant === 'office') {
    signAt(m, rng, 2.0, 2.8, SIGNS.quartermaster[0], SIGNS.quartermaster[1]);
    m.box(1.3, 1.0, 0.08, P.woodLight, -2.6, 1.2, 0.08, { j: 0.04 });
    m.box(0.3, 0.38, 0.02, P.clothCream, -2.85, 1.6, 0.13);
    m.box(0.3, 0.38, 0.02, P.clothCream, -2.4, 1.45, 0.13, { rz: 0.1 });
  }
  // hoist beam with a rope and hook under the gable
  const hy = res.top + (ridge === 'z' ? 0.9 : -0.4);
  m.box(0.16, 0.16, 1.5, pal.beam, ridge === 'z' ? 0 : b.w * 0.3, hy, 0.6);
  m.box(0.035, 1.6, 0.035, P.canvas, ridge === 'z' ? 0 : b.w * 0.3, hy - 1.6, 1.2, { nb: true });
  m.box(0.14, 0.16, 0.06, P.iron, ridge === 'z' ? 0 : b.w * 0.3, hy - 1.75, 1.2);
  m.pop();
  return res;
}

function granary(m, rng, b, st, pal) {
  // a raised store on staddle stones under a pyramid of thatch
  const w = b.w - 1.2;
  for (const sx of [-1, 0, 1]) {
    for (const sz of [-1, 0, 1]) {
      m.cyl(0.22, 0.32, 0.75, P.stone, sx * (w / 2 - 0.4), 0, sz * (w / 2 - 0.4), { seg: 6, j: 0.1 });
      m.cyl(0.45, 0.45, 0.12, P.stoneLight, sx * (w / 2 - 0.4), 0.75, sz * (w / 2 - 0.4), { seg: 6, bottom: true });
    }
  }
  m.box(w + 0.3, 0.2, w + 0.3, pal.beam, 0, 0.87, 0);
  for (let i = 0; i < 8; i++) m.box(w, 0.4, w, i % 2 ? P.wood : P.woodLight, 0, 1.07 + i * 0.4, 0, { nb: true, j: 0.08, top: [1.004, 1.004] });
  m.push(0, 1.07, w / 2);
  doorAt(m, rng, 0, { color: pal.door, frame: pal.beam, w: 1.0, h: 1.7, step: null });
  m.pop();
  for (let i = 0; i < 4; i++) m.box(1.1, 0.07, 0.3, P.woodLight, 0, 0.2 + i * 0.22, w / 2 + 1.2 - i * 0.3);
  st.roof(m, rng, w + 0.2, w + 0.2, 4.27, pal, { ridge: 'hip', roofScale: 1.1 });
}

function barn(m, rng, b, st, pal) {
  const barnPal = { ...pal, logGround: true, stoneGround: false };
  const res = block(m, rng, st, barnPal, { w: b.w, d: b.d, floors: 1, door: 0, wideDoor: true, ridge: 'z', chimney: false, blind: ['left', 'right', 'back', 'front'], roofScale: 1.25 });
  m.push(0, 0, b.d / 2);
  m.box(1.5, 1.2, 0.08, P.woodDark, 0, st.h0 + 0.9, 0.05, { nb: true });
  m.box(0.16, 0.16, 1.2, pal.beam, 0, st.h0 + 2.4, 0.5);
  m.pop();
  return res;
}

function mill(m, rng, b, st, pal) {
  const res = block(m, rng, st, { ...pal, stoneGround: true }, { w: b.w - 1.4, d: b.d, floors: 2, x: -0.7, door: 0, ridge: 'z', dormers: false });
  // an undershot wheel on the side wall with its trough
  const wx = b.w / 2 - 0.75, r = 2.3;
  m.push(wx, r + 0.15, 0.4);
  m.cyl(0.22, 0.22, 1.5, pal.beam, -0.75, 0, 0, { rz: -Math.PI / 2, seg: 6, bottom: true });
  for (const sx of [-0.32, 0.32]) {
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      m.box(0.09, 0.2, 1.25, P.wood, sx, Math.cos(a) * (r - 0.1), Math.sin(a) * (r - 0.1), { c: true, rx: a + Math.PI / 2, j: 0.08 });
    }
    for (let i = 0; i < 4; i++) m.box(0.08, r * 2 - 0.3, 0.14, P.woodDark, sx, 0, 0, { c: true, rx: i * Math.PI / 4 });
  }
  for (let i = 0; i < 12; i++) {
    const a = (i + 0.5) / 12 * Math.PI * 2;
    m.box(0.74, 0.5, 0.06, P.woodLight, 0, Math.cos(a) * (r - 0.05), Math.sin(a) * (r - 0.05), { c: true, rx: a, j: 0.1 });
  }
  m.pop();
  m.box(1.1, 0.5, 6.5, P.woodDark, wx, 0, 0.4, { nb: true, j: 0.05 });
  m.box(0.8, 0.06, 6.3, P.water, wx, 0.38, 0.4);
  return res;
}

function stall(m, rng, b) {
  const w = b.w, d = b.d;
  const cloth = pick(rng, AWNINGS);
  m.box(w, 0.9, d * 0.55, P.wood, 0, 0, d * 0.15, { nb: true, j: 0.08, g: [0.8, 1.05] });
  m.box(w + 0.16, 0.08, d * 0.55 + 0.16, P.woodLight, 0, 0.9, d * 0.15);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) m.box(0.1, sz > 0 ? 2.1 : 2.5, 0.1, P.woodDark, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), { nb: true, lean: [(rng() - 0.5) * 0.06, 0] });
  }
  m.use('cloth');
  const n = 5;
  for (let i = 0; i < n; i++) {
    const xa = -w / 2 - 0.2 + (w + 0.4) * i / n, xb = -w / 2 - 0.2 + (w + 0.4) * (i + 1) / n;
    const c = i % 2 ? cloth : P.clothCream;
    m.quad([xa, 2.08, d / 2 + 0.3], [xb, 2.08, d / 2 + 0.3], [xb, 2.52, -d / 2 - 0.1], [xa, 2.52, -d / 2 - 0.1], c, { g: [0.88, 1.04] });
    m.quad([xa, 1.86, d / 2 + 0.32], [xb, 1.86, d / 2 + 0.32], [xb, 2.08, d / 2 + 0.3], [xa, 2.08, d / 2 + 0.3], c, { g: [0.75, 0.9] });
  }
  m.use('flat');
  // goods on the counter
  const goods = [P.clothRed, P.wheat, P.leaf, P.amber, P.clay, P.clothBlue, P.bone];
  for (let i = 0; i < 5; i++) {
    const gx = -w / 2 + 0.4 + i * (w - 0.8) / 4;
    if (i % 2) m.box(0.42, 0.2, 0.36, P.woodLight, gx, 0.98, d * 0.15, { j: 0.1 });
    m.ico(0.16, pick(rng, goods), gx, 1.16 + (i % 2 ? 0.1 : 0), d * 0.15, { noise: 0.25, s: [1.3, 0.8, 1.1] });
  }
  m.box(0.5, 0.5, 0.5, P.woodLight, w / 2 - 0.4, 0, -d / 2 + 0.2, { nb: true, j: 0.1, ry: 0.3 });
}

/**
 * Draw one building of a city layout into the mesher. The mesher must already be in the building's frame
 * (m.push(b.x, groundY, b.z, b.rot)). `styleKey` ∈ timber | stone | harbor.
 */
export function emitBuilding(m, b, styleKey) {
  const st = STYLES[styleKey] || timberStyle;
  const rng = makeRng(b.seed || 1);
  const pal = st.palette(rng);
  m.use('flat');
  switch (b.type) {
    case 'house': return house(m, rng, b, st, pal);
    case 'shop': case 'workshop': case 'smithy': return roleShop(m, rng, b, st, pal);
    case 'tavern': return tavern(m, rng, b, st, pal);
    case 'townhall': return st.townhall(m, rng, b, pal);
    case 'guildhall': return (st.guildhall || st.townhall)(m, rng, b, pal);
    case 'foundry': return st.foundry ? st.foundry(m, rng, b, pal) : warehouse(m, rng, b, st, pal);
    case 'barracks': return barracks(m, rng, b, st, pal);
    case 'stable': return stable(m, rng, b, st, pal);
    case 'warehouse': return warehouse(m, rng, b, st, pal);
    case 'granary': return granary(m, rng, b, st, pal);
    case 'barn': return barn(m, rng, b, st, pal);
    case 'mill': return mill(m, rng, b, st, pal);
    case 'shop-stall': return stall(m, rng, b);
    default: return house(m, rng, b, st, pal);
  }
}

export { faces };
