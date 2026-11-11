// City fortifications drawn from a city layout: timber palisade, grey stone curtain wall, sandstone harbour wall,
// their gates and towers, and the harbour quay with piers and moored boats.
import { PALETTE as P } from './materials.js';
import { makeRng, seedFrom } from '../core/noise.js';
import { battlement, hipRoof, bannerAt, flagPole } from './building-kit.js';
import { lantern, emitProp } from './props.js';
import { heightAt } from './terrain.js';

const GATE_HALF = 5.5;

function sectorOf(layout, x, z) {
  let az = Math.atan2(x - layout.city.x, z - layout.city.z) * 180 / Math.PI;
  if (az < 0) az += 360;
  return 's' + Math.floor(az / 60);
}

/** Enter the frame of a wall segment: x along it, +z pointing out of the city. Returns its length. */
function pushSegment(m, layout, s, y) {
  const dx = s.x1 - s.x0, dz = s.z1 - s.z0;
  const len = Math.hypot(dx, dz);
  const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2;
  let rot = Math.atan2(-dz, dx);
  const outward = Math.sin(rot) * (mx - layout.city.x) + Math.cos(rot) * (mz - layout.city.z);
  if (outward < 0) rot += Math.PI;
  m.setChunk(sectorOf(layout, mx, mz));
  m.push(mx, y, mz, rot);
  return len;
}

// ───────────────────────── timber ─────────────────────────

function palisadeSegment(m, rng, len) {
  const n = Math.max(2, Math.round(len / 0.54));
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * len / n;
    const post = i % 9 === 4;
    const h = post ? 5.3 : 4.1 + rng() * 0.75;
    const r = post ? 0.3 : 0.23 + rng() * 0.04;
    const lean = [(rng() - 0.5) * 0.1, (rng() - 0.5) * 0.16];
    m.cyl(r * 0.9, r, h, i % 3 ? P.bark : (i % 2 ? P.wood : 0x5e4a36), x, -0.2, (rng() - 0.5) * 0.12, { seg: 5, j: 0.14, g: [0.62, 1.08], lean, a0: rng() });
    m.cyl(0, r * 0.9, 0.55, P.woodLight, x + lean[0], h - 0.2, lean[1], { seg: 5, j: 0.1, a0: rng() });
  }
  m.box(len + 0.2, 0.2, 0.14, P.woodDark, 0, 1.3, -0.3, { j: 0.06 });
  m.box(len + 0.2, 0.2, 0.14, P.woodDark, 0, 3.1, -0.3, { j: 0.06 });
  // fighting step on the inside
  m.box(len + 0.2, 0.1, 1.0, P.wood, 0, 2.5, -0.85, { j: 0.08 });
  for (const sx of [-1, 1]) m.box(0.14, 2.5, 0.14, P.woodDark, sx * (len / 2 - 0.4), 0, -1.25, { nb: true, lean: [0, 0.1] });
}

function timberGateTower(m, rng, size, wallH) {
  const hw = size;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) m.cyl(0.26, 0.32, wallH + 4.6, P.bark, sx * (hw - 0.25), -0.2, sz * (hw - 0.25), { seg: 6, g: [0.65, 1.05], j: 0.08 });
  }
  const rows = 9;
  for (let i = 0; i < rows; i++) {
    const y = i * wallH / rows;
    m.box(hw * 2 - 0.3, wallH / rows - 0.04, hw * 2 - 0.3, i % 2 ? P.wood : P.woodLight, 0, y, 0, { nb: true, j: 0.12, top: [1.003, 1.003], g: [0.85, 1.05] });
  }
  m.box(hw * 2 + 0.9, 0.2, hw * 2 + 0.9, P.woodDark, 0, wallH, 0);
  for (const sx of [-1, 1]) {
    m.box(0.1, 1.0, hw * 2 + 0.8, P.wood, sx * (hw + 0.4), wallH + 0.2, 0, { nb: true, j: 0.06 });
    m.box(hw * 2 + 0.8, 1.0, 0.1, P.wood, 0, wallH + 0.2, sx * (hw + 0.4), { nb: true, j: 0.06 });
  }
  hipRoof(m, rng, hw * 2 + 0.6, hw * 2 + 0.6, wallH + 3.7, 2.4, { color: P.thatch, color2: 0xa8914f, edge: P.woodDark, eave: 0.5, rows: 3 });
}

function timberGate(m, rng, layout) {
  const { height, gateTower } = layout.walls;
  const off = GATE_HALF + gateTower;
  for (const s of [-1, 1]) {
    m.push(s * off, 0, 0);
    timberGateTower(m, rng, gateTower, height);
    m.pop();
    // open leaves folded back against the inside
    m.push(s * (GATE_HALF + 0.1), 0, -0.4, -s * 0.16);
    m.box(0.16, 4.4, 5.0, P.wood, 0, 0.15, -2.6, { j: 0.05, g: [0.75, 1.05] });
    for (const k of [0.9, 2.3, 3.7]) m.box(0.2, 0.16, 5.0, P.iron, 0, k, -2.6);
    m.pop();
    lantern(m, s * (GATE_HALF - 0.4), 3.9, -2.2, 1.5);
    m.box(0.08, 0.08, 0.7, P.woodDark, s * (GATE_HALF - 0.1), 4.42, -2.2, { ry: Math.PI / 2 });
  }
  // the bridge between the towers
  m.box(GATE_HALF * 2 + 0.6, 0.3, 0.4, P.woodDark, 0, height + 0.5, 0.9);
  m.box(GATE_HALF * 2 + 0.6, 0.3, 0.4, P.woodDark, 0, height + 0.5, -0.9);
  m.box(GATE_HALF * 2 + 0.4, 0.12, 2.4, P.wood, 0, height + 0.8, 0, { j: 0.05 });
  for (const sz of [-1, 1]) m.box(GATE_HALF * 2, 0.9, 0.1, P.woodLight, 0, height + 0.92, sz * 1.15, { nb: true, j: 0.06 });
  m.push(0, 0, 1.25);
  bannerAt(m, 0, height + 1.75, 1.3, 1.5, P.clothGreen, P.wheat);
  m.pop();
}

// ───────────────────────── stone & sandstone ─────────────────────────

function masonrySegment(m, rng, len, w) {
  const H = w.height, T = w.thickness;
  const harbor = w.style === 'harbor';
  const col = harbor ? [0xc9b184, 0xd4bf94, 0xbfa678] : [0x7b7d7c, 0x858887, 0x6e7172];
  const pieces = Math.max(1, Math.round(len / 6.5));
  for (let i = 0; i < pieces; i++) {
    const x = -len / 2 + (i + 0.5) * len / pieces;
    m.box(len / pieces + 0.02, H + 0.3, T, col[i % 3], x, -0.3, 0, { nb: true, top: [1, 0.82], vj: 0.08, g: [0.68, 1.04], j: 0.04 });
  }
  const stones = Math.round(len * 0.9);
  for (let i = 0; i < stones; i++) {
    const yy = 0.3 + rng() * (H - 1.2);
    const zz = T / 2 * (1 - 0.18 * (yy + 0.3) / (H + 0.3)) - 0.02;
    m.box(0.5 + rng() * 0.7, 0.3 + rng() * 0.2, 0.08, col[i % 3], (rng() - 0.5) * (len - 1), yy, zz, { nb: true, j: 0.22, rx: -0.03 });
  }
  // wall-walk and crenellations
  m.box(len + 0.04, 0.22, T * 0.82 + 0.5, harbor ? 0xdccaa2 : P.stoneLight, 0, H, -0.1, { j: 0.03 });
  const n = Math.max(2, Math.round(len / 1.7));
  m.box(len + 0.04, 0.55, 0.42, col[1], 0, H + 0.22, T * 0.41 - 0.08, { vj: 0.06, nb: true });
  for (let i = 0; i < n; i++) {
    m.box(len / n * 0.56, 0.72, 0.42, col[i % 3], -len / 2 + (i + 0.5) * len / n, H + 0.77, T * 0.41 - 0.08, { j: 0.08, nb: true, top: harbor ? [0.6, 1] : null });
  }
  m.box(len + 0.04, 0.3, 0.14, P.woodDark, 0, H + 0.22, -T * 0.41 - 0.2, { nb: true });
}

function squareTower(m, rng, size, H, w, roofed) {
  m.box(size * 2, H + 0.3, size * 2, 0x7b7d7c, 0, -0.3, 0, { nb: true, top: [0.9, 0.9], vj: 0.09, g: [0.66, 1.04] });
  const tw = size * 2 * 0.9;
  for (let i = 0; i < 14; i++) {
    const side = i % 4, yy = 0.5 + rng() * (H - 1.5);
    const k = (1 - 0.1 * yy / H) * size;
    m.push(0, 0, 0, side * Math.PI / 2);
    m.box(0.6 + rng() * 0.6, 0.34, 0.08, i % 2 ? 0x86837a : 0x716f68, (rng() - 0.5) * (tw - 1.4), yy, k - 0.03, { nb: true, j: 0.2 });
    m.pop();
  }
  for (const side of [0, 1, 2, 3]) {
    m.push(0, H * 0.62, 0, side * Math.PI / 2);
    m.use('win').box(0.22, 1.0, 0.06, P.lantern, 0, 0, size * 0.94, { nb: true });
    m.use('flat');
    m.pop();
  }
  m.box(tw + 0.7, 0.3, tw + 0.7, P.stoneLight, 0, H, 0, { j: 0.03 });
  battlement(m, tw + 0.7, tw + 0.7, H + 0.3, 0x86837a, { pitch: 1.5, t: 0.45, h: 0.8 });
  if (roofed) hipRoof(m, rng, tw - 1.2, tw - 1.2, H + 0.4, size * 1.1, { color: P.roofSlate, color2: P.slate, edge: P.stoneLight, eave: 0.25, rows: 4 });
}

function roundTower(m, rng, r, H) {
  m.cyl(r * 0.9, r, H + 0.3, 0xcdb588, 0, -0.3, 0, { seg: 11, vj: 0.07, g: [0.68, 1.04] });
  m.cyl(r * 0.98, r * 0.98, 0.3, 0xe0d2ae, 0, H * 0.5, 0, { seg: 11 });
  m.cyl(r * 1.05, r * 0.9, 0.5, 0xe0d2ae, 0, H, 0, { seg: 11, bottom: true });
  for (let i = 0; i < 11; i++) {
    const a = (i + 0.5) / 11 * Math.PI * 2;
    m.box(0.8, 0.8, 0.4, i % 2 ? 0xd4bf94 : 0xc9b184, Math.cos(a) * r * 0.98, H + 0.5, Math.sin(a) * r * 0.98, { ry: -a + Math.PI / 2, nb: true, top: [0.6, 1] });
    if (i % 3 === 0) {
      m.use('win').box(0.24, 0.9, 0.08, P.lantern, Math.cos(a) * r * 0.94, H * 0.68, Math.sin(a) * r * 0.94, { ry: -a + Math.PI / 2, nb: true });
      m.use('flat');
    }
  }
  m.cyl(0, r * 0.92, r * 1.25, P.roofAmber, 0, H + 0.9, 0, { seg: 11, vj: 0.06, g: [0.82, 1.08] });
  m.ico(0.2, P.gold, 0, H + 0.9 + r * 1.25, 0);
}

function masonryGate(m, rng, layout) {
  const w = layout.walls;
  const H = w.height, off = GATE_HALF + w.gateTower;
  const harbor = w.style === 'harbor';
  const stone = harbor ? 0xcdb588 : 0x7b7d7c, trim = harbor ? 0xe6d9b8 : P.stoneLight;
  for (const s of [-1, 1]) {
    m.push(s * off, 0, 0);
    if (harbor) roundTower(m, rng, w.gateTower, H + 3.2);
    else squareTower(m, rng, w.gateTower, H + 3.6, w, true);
    m.pop();
    // gate leaves swung open inside
    m.push(s * (GATE_HALF + 0.05), 0, -w.thickness / 2 - 0.5, -s * 0.14);
    m.box(0.2, 4.9, 5.0, P.wood, 0, 0.1, -2.6, { j: 0.05, g: [0.72, 1.05] });
    for (const k of [0.8, 2.4, 4.0]) m.box(0.26, 0.2, 5.0, P.iron, 0, k, -2.6);
    m.pop();
    lantern(m, s * (GATE_HALF - 0.45), 3.9, -w.thickness / 2 - 1.2, 1.5);
    m.box(0.08, 0.08, 0.8, P.iron, s * (GATE_HALF - 0.1), 4.42, -w.thickness / 2 - 1.2, { ry: Math.PI / 2 });
  }
  // gate house over the passage: lintel block, arch haunches, battlements, a raised portcullis
  const top = H + 1.4;
  m.box(GATE_HALF * 2 + 0.4, top - 5.4, w.thickness + 1.2, stone, 0, 5.4, 0, { vj: 0.07, g: [0.85, 1.04] });
  for (const s of [-1, 1]) {
    m.box(2.2, 2.2, w.thickness + 1.25, stone, s * GATE_HALF, 5.4, 0, { c: true, rz: Math.PI / 4, vj: 0.06 });
    m.box(0.5, 5.4, w.thickness + 1.3, trim, s * (GATE_HALF - 0.1), 0, 0, { nb: true, j: 0.04 });
  }
  m.box(GATE_HALF * 2 + 1, 0.3, w.thickness + 1.6, trim, 0, top, 0);
  battlement(m, GATE_HALF * 2 + 0.6, w.thickness + 1.6, top + 0.3, stone, { pitch: 1.5 });
  for (let i = -4; i <= 4; i++) m.box(0.1, 1.5, 0.1, P.iron, i * 1.0, 4.5, w.thickness / 2 + 0.2, { nb: true });
  m.box(GATE_HALF * 2 - 1.4, 0.1, 0.1, P.iron, 0, 4.9, w.thickness / 2 + 0.2);
  m.push(0, 0, w.thickness / 2 + 0.62);
  const color = harbor ? P.clothAmber : P.guardBlue;
  bannerAt(m, -3.2, top - 0.2, 1.1, 2.6, color, harbor ? P.clothCream : P.steel);
  bannerAt(m, 3.2, top - 0.2, 1.1, 2.6, color, harbor ? P.clothCream : P.steel);
  m.pop();
  flagPole(m, 0, top + 0.3, 0, 3.2, color);
}

// ───────────────────────── harbour quay ─────────────────────────

function ship(m, rng) {
  // a small trading cog seen from the quay: hull, castle, mast with a furled sail
  m.box(4.2, 2.2, 11, P.wood, 0, -0.9, 0, { top: [1.3, 1.06], g: [0.6, 1.05], j: 0.04 });
  m.cyl(0, 2.7, 3.6, P.wood, 0, 0.2, 5.5, { rx: Math.PI / 2, seg: 4, a0: Math.PI / 4, g: [0.7, 1] });
  m.box(5.0, 1.3, 3.0, P.woodDark, 0, 1.3, -4.2, { top: [1.05, 1], j: 0.04 });
  m.box(5.3, 0.12, 3.3, P.woodLight, 0, 2.6, -4.2);
  m.box(5.5, 0.14, 11.3, P.woodDark, 0, 1.25, 0, { j: 0.03 });
  m.cyl(0.14, 0.2, 11, P.woodDark, 0, 1.2, 0.6, { seg: 6 });
  m.box(7.2, 0.16, 0.16, P.woodDark, 0, 9.2, 0.6);
  m.use('cloth');
  m.box(6.6, 0.7, 0.5, P.clothCream, 0, 8.5, 0.6, { j: 0.04, g: [0.8, 1.05] });
  m.quad([0, 10.8, 0.6], [1.6, 11.0, 0.6], [1.6, 11.6, 0.6], [0, 11.7, 0.6], P.clothAmber, { both: true });
  m.use('flat');
  for (const s of [-1, 1]) m.box(0.03, 9.6, 0.03, P.canvas, s * 1.3, 1.3, 0.2, { rz: s * 0.25, nb: true });
  m.cyl(0.4, 0.4, 0.7, P.wood, 0, 9.6, 0.6, { seg: 7 });
}

function quay(m, rng, layout) {
  const y = layout.city.y;
  const q = layout.walls.quay;
  for (const s of q.segments) {
    const len = pushSegment(m, layout, s, y);
    m.box(len + 0.3, 2.6, 1.0, 0xbfa678, 0, -1.6, 0, { vj: 0.07, g: [0.7, 1.03], nb: true });
    m.box(len + 0.3, 0.16, 1.3, 0xe0d2ae, 0, 1.0, 0, { j: 0.03 });
    m.cyl(0.2, 0.26, 0.6, P.iron, len * 0.25, 1.1, 0, { seg: 6 });
    m.ico(0.28, P.iron, len * 0.25, 1.75, 0, { s: [1, 0.6, 1] });
    m.pop();
  }
  q.piers.forEach((p, i) => {
    m.setChunk('pier');
    m.push(p.x, 0, p.z, p.yaw);
    // stone steps over the parapet, then a boardwalk laid on the beach that becomes a pier over the water
    const low = 1.3, step = 2.6;
    m.box(p.width * 0.7, 1.12, 1.5, 0xcdb588, 0, y, 0, { nb: true, j: 0.04 });
    for (const sz of [-1, 1]) {
      m.box(p.width * 0.7, 0.75, 0.6, 0xd4bf94, 0, y, sz * 1.0, { nb: true, j: 0.04 });
      m.box(p.width * 0.7, 0.38, 0.6, 0xc9b184, 0, y, sz * 1.55, { nb: true, j: 0.04 });
    }
    let prev = null, k = 0;
    for (let d = 2.0; d <= p.length + 0.01; d += step, k++) {
      const ground = heightAt(p.x + Math.sin(p.yaw) * d, p.z + Math.cos(p.yaw) * d);
      const deck = Math.max(ground + 0.12, low);
      if (prev !== null) {
        m.box(p.width, 0.16, Math.hypot(step, deck - prev) + 0.06, k % 2 ? P.wood : P.woodLight, 0, (deck + prev) / 2 - 0.08, d - step / 2, { c: true, rx: Math.atan2(prev - deck, step), j: 0.1 });
      }
      if (deck - ground > 0.7 && k % 2 === 0) {
        for (const sx of [-1, 1]) {
          m.cyl(0.2, 0.24, deck - ground + 2.0, P.bark, sx * (p.width / 2 - 0.1), ground - 1.2, d, { seg: 6, j: 0.1, g: [0.55, 1.05], lean: [sx * 0.08, 0] });
        }
        m.box(p.width + 0.3, 0.2, 0.22, P.woodDark, 0, deck - 0.36, d);
      }
      prev = deck;
    }
    emitProp(m, 'crates', 1.2, low, p.length - 6, 0.5, { seed: i + 3 });
    emitProp(m, 'barrels', -1.3, low, p.length - 12, 1.1, { seed: i + 9 });
    emitProp(m, 'lantern-post', p.width / 2 - 0.3, low, p.length - 1.5, 0, { seed: i });
    emitProp(m, 'boat', p.width / 2 + 1.4, -0.15, p.length - 16, 0.1, { seed: i });
    emitProp(m, 'boat', -p.width / 2 - 1.5, -0.15, p.length - 27, Math.PI + 0.15, { seed: i + 1 });
    if (i % 2 === 0) {
      m.push(i % 4 === 0 ? 5.6 : -5.6, 0.2, p.length - 3, i % 4 === 0 ? 0.04 : Math.PI - 0.06);
      ship(m, rng);
      m.pop();
    }
    m.pop();
  });
}

/** Draw the walls, towers, gates (and quay) of a city layout into the mesher (world coordinates). */
export function emitWalls(m, layout) {
  const w = layout.walls;
  const y = layout.city.y;
  const rng = makeRng(seedFrom('walls:' + layout.city.key));
  m.use('flat');
  for (const s of w.segments) {
    const len = pushSegment(m, layout, s, y);
    if (w.style === 'timber') palisadeSegment(m, rng, len);
    else masonrySegment(m, rng, len, w);
    m.pop();
  }
  w.towers.forEach((t, i) => {
    m.setChunk(sectorOf(layout, t.x, t.z));
    m.push(t.x, y, t.z, Math.atan2(t.x - layout.city.x, t.z - layout.city.z));
    if (w.style === 'harbor') roundTower(m, rng, w.tower, w.height + 2.6);
    else if (w.style === 'stone') squareTower(m, rng, w.tower, w.height + 2.8, w, i % 3 === 0);
    m.pop();
  });
  for (const g of w.gates) {
    m.setChunk(sectorOf(layout, g.x, g.z));
    m.push(g.x, y, g.z, g.yaw);
    if (w.style === 'timber') timberGate(m, rng, layout);
    else masonryGate(m, rng, layout);
    m.pop();
  }
  if (w.quay) quay(m, rng, layout);
  m.setChunk('');
}
