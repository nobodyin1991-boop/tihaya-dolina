// Shared parts of procedural buildings: facade frames, windows, doors, roofs, chimneys, canopies, signs.
// Everything writes into a Mesher (see mesher.js). A building is drawn in its own local frame:
// x across the facade (width w), z depth (d), the front (door) faces +z, y = 0 is the ground.
import { PALETTE as P } from './materials.js';

export const pick = (rng, list) => list[Math.floor(rng() * list.length)];
export const range = (rng, a, b) => a + rng() * (b - a);
const GLASS_DARK = 0x222b33;

/** The four facade frames of a w×d box: inside a frame x runs along the wall, y up, z outwards. */
export function faces(w, d) {
  return [
    { name: 'front', x: 0, z: d / 2, ry: 0, len: w },
    { name: 'right', x: w / 2, z: 0, ry: Math.PI / 2, len: d },
    { name: 'back', x: 0, z: -d / 2, ry: Math.PI, len: w },
    { name: 'left', x: -w / 2, z: 0, ry: -Math.PI / 2, len: d },
  ];
}

/** Evenly spread window positions along a facade of length len. */
export function slots(len, pitch = 2.5, margin = 0.6) {
  const n = Math.max(1, Math.floor((len - margin * 2) / pitch));
  const out = [];
  for (let i = 0; i < n; i++) out.push((i + 0.5) / n * (len - margin * 2) - (len - margin * 2) / 2);
  return out;
}

/**
 * Window on the current facade frame at (u, v = sill height). o: { w, h, frame, shutter (colour|null), lit (0..1 chance),
 * sillColor, lintel (stone colour|null), arch: bool }.
 */
export function windowAt(m, rng, u, v, o) {
  const w = o.w || 0.85, h = o.h || 1.1;
  const frame = o.frame || P.woodDark;
  m.box(w + 0.18, h + 0.18, 0.07, frame, u, v - 0.09, 0, { nb: true });
  const lit = rng() < (o.lit ?? 0.55);
  m.use(lit ? 'win' : 'flat');
  m.box(w, h, 0.05, GLASS_DARK, u, v, 0.045, { nb: true, g: [0.8, 1.25] });
  m.use('flat');
  m.box(0.05, h, 0.03, frame, u, v, 0.085, { nb: true });
  m.box(w, 0.05, 0.03, frame, u, v + h * 0.56, 0.085, { nb: true });
  m.box(w + 0.34, 0.08, 0.2, o.sillColor || frame, u, v - 0.16, 0.04, { j: 0.08 });
  if (o.lintel) m.box(w + 0.42, 0.22, 0.1, o.lintel, u, v + h + 0.06, 0.02, { j: 0.08, nb: true });
  if (o.shutter) {
    const sw = w * 0.5 - 0.01;
    const open = rng() < 0.8;
    for (const s of [-1, 1]) {
      const off = open ? (w / 2 + sw / 2 + 0.06) : sw / 2 + 0.01;
      m.box(sw, h + 0.04, 0.05, o.shutter, u + s * off, v - 0.02, open ? 0.05 : 0.1, { nb: true, j: 0.1, rz: open ? s * (rng() - 0.5) * 0.06 : 0 });
    }
  }
  if (o.box && rng() < o.box) {
    m.box(w + 0.2, 0.2, 0.26, P.woodDark, u, v - 0.38, 0.14, { j: 0.1 });
    for (let k = 0; k < 3; k++) m.ico(0.14, pick(rng, [P.clothRed, P.heather, P.wheat, P.leaf]), u + (k - 1) * w * 0.33, v - 0.12, 0.2, { noise: 0.3, s: [1.2, 0.9, 1] });
  }
}

/** Door on the current facade frame at u. o: { w, h, color, frame, step (colour|null), arch } */
export function doorAt(m, rng, u, o = {}) {
  const w = o.w || 1.1, h = o.h || 2.05;
  const frame = o.frame || P.woodDark;
  m.box(w + 0.3, h + 0.16, 0.1, frame, u, 0, 0, { nb: true });
  m.box(w, h, 0.07, o.color || P.wood, u, 0, 0.06, { nb: true, g: [0.8, 1.05], j: 0.08 });
  const planks = Math.max(2, Math.round(w / 0.32));
  for (let i = 1; i < planks; i++) m.box(0.025, h - 0.1, 0.02, frame, u - w / 2 + i * w / planks, 0.05, 0.125, { nb: true });
  m.box(w - 0.1, 0.08, 0.03, P.iron, u, h * 0.28, 0.13, { nb: true });
  m.box(w - 0.1, 0.08, 0.03, P.iron, u, h * 0.74, 0.13, { nb: true });
  m.box(0.07, 0.07, 0.08, P.bronze, u + w * 0.34, h * 0.48, 0.14, { nb: true });
  if (o.step !== null) {
    m.box(w + 0.7, 0.16, 0.6, o.step || P.stone, u, 0, 0.3, { j: 0.08, nb: true, top: [0.96, 0.92] });
  }
}

/**
 * Gable roof whose ridge runs along local x. w = wall length along x, d = wall depth, y = wall-top height,
 * h = ridge rise. o: { color, edge (ridge/barge colour), wall (gable wall colour), t thickness, rows, eave, verge, sag }.
 * Returns the ridge height.
 */
export function gableRoof(m, rng, w, d, y, h, o) {
  const eave = o.eave ?? 0.5, verge = o.verge ?? 0.4, t = o.t ?? 0.16, rows = o.rows || 3;
  const L = w + verge * 2, D = d + eave * 2;
  const run = D / 2, S = Math.hypot(run, h), alpha = Math.atan2(h, run);
  const sag = o.sag ?? 0;
  const beta = Math.atan2(sag, L / 2);
  // wall band + gable triangles under the roof
  const lift = h * eave / run;
  if (o.wall !== null) {
    m.box(w, lift + 0.02, d, o.wall, 0, y - 0.02, 0, { nb: true });
    m.gable(d, h - lift - t * 0.5 - sag, w - 0.04, o.wall, 0, y + lift, 0, { ry: Math.PI / 2, nb: true, g: [1, 0.92] });
  }
  for (const half of [-1, 1]) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < rows; k++) {
        const sc = (k + 0.5) * S / rows;
        const nOff = (rows - 1 - k) * 0.045 + t / 2;
        const z = side * (sc * Math.cos(alpha) + nOff * Math.sin(alpha));
        const yy = y + h - sc * Math.sin(alpha) + nOff * Math.cos(alpha) - sag / 2;
        m.box(L / 2 + 0.02, t, S / rows + 0.14, o.color, half * L / 4, yy, z, {
          c: true, rx: side * alpha, rz: half * beta, j: 0.07, g: [0.86, 1.04],
        });
      }
    }
    // ridge cap
    const rc = o.ridge ?? 0.2;
    m.box(L / 2 + 0.06, rc, rc, o.edge, half * L / 4, y + h + t * 0.7 - sag / 2, 0, { c: true, rx: Math.PI / 4, rz: half * beta, j: 0.06 });
  }
  // barge boards on the gable ends
  if (o.barge !== false) {
    for (const end of [-1, 1]) {
      for (const side of [-1, 1]) {
        m.box(0.09, 0.24, S + 0.1, o.edge, end * (L / 2 - 0.02), y + h / 2 + 0.02, side * run / 2, { c: true, rx: side * alpha });
      }
    }
  }
  return y + h;
}

/** Hip roof (pyramid when w ≈ d) with tile bands. o: { color, color2, edge, eave, rows }. */
export function hipRoof(m, rng, w, d, y, h, o) {
  const eave = o.eave ?? 0.45, rows = o.rows || 4;
  if (d > w) {
    m.push(0, 0, 0, Math.PI / 2);
    hipRoof(m, rng, d, w, y, h, o);
    m.pop();
    return y + h;
  }
  const W = w / 2 + eave, D = d / 2 + eave;
  const rl = Math.max(0.02, W - D);
  m.box(w + eave * 1.2, 0.16, d + eave * 1.2, o.edge, 0, y - 0.14, 0, { j: 0.04 });
  const band = (a, b, c, e) => {
    // a,b = eave edge (left,right seen from outside), c,e = ridge edge (right,left)
    for (let k = 0; k < rows; k++) {
      const t0 = k / rows, t1 = (k + 1) / rows;
      const lerp3 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t + (k % 2 ? 0 : 0.03), p[2] + (q[2] - p[2]) * t];
      m.quad(lerp3(a, e, t0), lerp3(b, c, t0), lerp3(b, c, t1), lerp3(a, e, t1), k % 2 ? o.color : (o.color2 || o.color), { j: 0.07, g: [0.9, 1.05] });
    }
  };
  const A = [-W, y, D], B = [W, y, D], C = [W, y, -D], E = [-W, y, -D], R1 = [-rl, y + h, 0], R2 = [rl, y + h, 0];
  band(A, B, R2, R1);
  band(C, E, R1, R2);
  band(B, C, R2, R2);
  band(E, A, R1, R1);
  m.box(rl * 2 + 0.3, 0.16, 0.22, o.edge, 0, y + h - 0.04, 0);
  return y + h;
}

/** Chimney rising from wall-top height through the roof. */
export function chimney(m, rng, x, z, y, h, color = P.stone) {
  m.box(0.72, h, 0.72, color, x, y, z, { top: [0.88, 0.88], vj: 0.08, g: [0.95, 0.8], nb: true, lean: [(rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08] });
  m.box(0.8, 0.12, 0.8, color, x, y + h, z, { j: 0.1 });
  m.cyl(0.14, 0.17, 0.3, P.clay, x - 0.14, y + h + 0.12, z, { seg: 5, j: 0.1 });
  if (rng() < 0.5) m.cyl(0.12, 0.15, 0.22, P.clay, x + 0.16, y + h + 0.12, z + 0.05, { seg: 5, j: 0.1 });
}

/** Small roofed dormer with a window, sitting on a roof slope at (x, y, z); `side` = +1 front slope, -1 back. */
export function dormer(m, rng, x, y, z, side, o) {
  m.push(x, y, z, side > 0 ? 0 : Math.PI);
  m.box(1.15, 1.05, 1.5, o.wall, 0, 0, -0.35, { nb: true });
  m.gable(1.5, 0.6, 1.9, o.roof, 0, 1.05, -0.3, { j: 0.06 });
  m.push(0, 0, 0.4);
  windowAt(m, rng, 0, 0.2, { w: 0.6, h: 0.7, frame: o.frame, lit: 0.7 });
  m.pop();
  m.pop();
}

/** Hanging shop sign on an iron bracket, perpendicular to the facade frame at (u, v). */
export function signAt(m, rng, u, v, color, emblem) {
  m.box(0.06, 0.06, 1.0, P.iron, u, v + 0.62, 0.5, { nb: true });
  m.box(0.05, 0.5, 0.05, P.iron, u, v + 0.22, 0.12, { nb: true, rx: -0.8 });
  m.box(0.07, 0.62, 0.8, color, u, v - 0.06, 0.55, { j: 0.05, rx: (rng() - 0.5) * 0.08 });
  m.box(0.1, 0.3, 0.3, emblem, u, v + 0.1, 0.55, { rx: Math.PI / 4, c: true });
}

/** Banner hanging down a wall (cloth bucket) on the facade frame. */
export function bannerAt(m, u, v, w, h, color, trim = P.gold) {
  m.box(w + 0.3, 0.07, 0.07, P.woodDark, u, v, 0.14, { nb: true });
  m.use('cloth');
  m.quad([u - w / 2, v - h, 0.1], [u + w / 2, v - h, 0.1], [u + w / 2, v, 0.12], [u - w / 2, v, 0.12], color, { g: [0.8, 1.05] });
  m.tri([u - w / 2, v - h, 0.1], [u, v - h - w * 0.5, 0.1], [u + w / 2, v - h, 0.1], color, { g: [0.7, 0.8] });
  m.quad([u - w * 0.18, v - h * 0.62, 0.115], [u + w * 0.18, v - h * 0.62, 0.115], [u + w * 0.18, v - h * 0.3, 0.125], [u - w * 0.18, v - h * 0.3, 0.125], trim);
  m.use('flat');
}

/**
 * Open canopy in front of a building: posts at the outer corners and a sloping roof from height y1 at the wall
 * down to y0 at the outer edge. kind: 'thatch' | 'shingle' | 'slate' | 'tile' | 'cloth'. Front wall is at z = d/2.
 */
export function canopy(m, rng, w, d, depth, o) {
  const y1 = o.y1 ?? 2.9, y0 = o.y0 ?? 2.3;
  const z0 = d / 2, post = o.post || P.wood;
  const tilt = Math.atan2(y1 - y0, depth);
  const S = Math.hypot(depth + 0.4, y1 - y0);
  for (const s of [-1, 1]) {
    m.box(0.2, y0 + 0.05, 0.2, post, s * (w / 2 - 0.25), 0, z0 + depth - 0.25, { nb: true, g: [0.75, 1.05], lean: [(rng() - 0.5) * 0.08, (rng() - 0.5) * 0.06], j: 0.08 });
    m.box(0.12, 0.9, 0.12, post, s * (w / 2 - 0.25) - s * 0.3, y0 - 0.62, z0 + depth - 0.25, { rz: s * 0.8, nb: true });
  }
  m.box(w + 0.1, 0.16, 0.18, post, 0, y0 - 0.06, z0 + depth - 0.25, { j: 0.06 });
  for (const s of [-1, 1]) m.box(0.12, 0.14, depth, post, s * (w / 2 - 0.25), (y0 + y1) / 2 - 0.1, z0 + depth / 2, { c: true, rx: tilt });
  if (o.kind === 'cloth') {
    m.use('cloth');
    const n = Math.max(4, Math.round(w / 0.9));
    for (let i = 0; i < n; i++) {
      const xa = -w / 2 - 0.1 + (w + 0.2) * i / n, xb = -w / 2 - 0.1 + (w + 0.2) * (i + 1) / n;
      const c = i % 2 ? o.color : (o.color2 || P.clothCream);
      const sagY = 0.1;
      m.quad([xa, y0, z0 + depth + 0.15], [xb, y0, z0 + depth + 0.15], [xb, (y0 + y1) / 2 - sagY, z0 + depth / 2], [xa, (y0 + y1) / 2 - sagY, z0 + depth / 2], c, { g: [0.85, 1] });
      m.quad([xa, (y0 + y1) / 2 - sagY, z0 + depth / 2], [xb, (y0 + y1) / 2 - sagY, z0 + depth / 2], [xb, y1, z0 + 0.02], [xa, y1, z0 + 0.02], c, { g: [0.95, 1.05] });
      m.quad([xa, y0 - 0.28, z0 + depth + 0.17], [xb, y0 - 0.28, z0 + depth + 0.17], [xb, y0, z0 + depth + 0.15], [xa, y0, z0 + depth + 0.15], c, { g: [0.75, 0.9] });
    }
    m.use('flat');
    return;
  }
  const t = o.kind === 'thatch' ? 0.28 : 0.1;
  const rows = o.kind === 'thatch' ? 2 : 3;
  for (let k = 0; k < rows; k++) {
    const f = (k + 0.5) / rows;
    m.box(w + 0.5, t, S / rows + 0.12, o.color, 0, y1 - (y1 - y0) * f + t / 2 + (rows - 1 - k) * 0.04 + 0.06, z0 + (depth + 0.3) * f, { c: true, rx: tilt, j: 0.07, g: [0.86, 1.04] });
  }
}

/** Dark open-front recess on the front wall (workshop interior) with a lintel beam. Front wall at z = d/2. */
export function openFront(m, w, d, o = {}) {
  const ow = w - (o.margin ?? 2.2), oh = o.h || 2.25;
  m.box(ow, oh, 0.12, 0x1d1915, 0, 0.12, d / 2 - 0.03, { nb: true, g: [1.5, 0.7] });
  m.box(ow + 0.5, 0.24, 0.2, o.beam || P.woodDark, 0, oh + 0.1, d / 2 + 0.02, { j: 0.06 });
  for (const s of [-1, 1]) m.box(0.22, oh + 0.1, 0.2, o.beam || P.woodDark, s * (ow / 2 + 0.11), 0, d / 2 + 0.02, { nb: true });
  // a few things glimpsed inside
  m.box(ow * 0.3, 0.9, 0.1, P.wood, -ow * 0.22, 0.12, d / 2 + 0.01, { nb: true, j: 0.1 });
  m.box(ow * 0.22, 1.5, 0.1, P.woodLight, ow * 0.27, 0.12, d / 2 + 0.01, { nb: true, j: 0.1 });
}

/** Stone steps up to a door: `n` treads centred at u on the facade frame. */
export function stepsAt(m, u, w, n, color = P.stoneLight) {
  for (let i = 0; i < n; i++) {
    m.box(w + (n - i) * 0.5, 0.17, 0.34 * (n - i) + 0.2, color, u, i * 0.17, (0.34 * (n - i) + 0.2) / 2, { j: 0.06, nb: true });
  }
}

/** Crenellated parapet around a w×d rectangle at height y. */
export function battlement(m, w, d, y, color, o = {}) {
  const t = o.t || 0.4, h = o.h || 0.7, pitch = o.pitch || 1.5;
  for (const f of faces(w, d)) {
    m.push(f.x, y, f.z, f.ry);
    m.box(f.len + t, 0.5, t, color, 0, 0, -t / 2 + 0.12, { vj: 0.06 });
    const n = Math.max(2, Math.round(f.len / pitch));
    for (let i = 0; i < n; i++) {
      m.box(f.len / n * 0.55, h, t, color, (i + 0.5) / n * f.len - f.len / 2, 0.5, -t / 2 + 0.12, { j: 0.07, nb: true });
    }
    m.pop();
  }
}

/** A flag on a pole standing at (x, y, z). */
export function flagPole(m, x, y, z, h, color) {
  m.cyl(0.04, 0.06, h, P.woodDark, x, y, z, { seg: 5 });
  m.ico(0.09, P.gold, x, y + h + 0.05, z);
  m.use('cloth');
  m.quad([x, y + h - 0.9, z], [x + 1.3, y + h - 0.75, z + 0.12], [x + 1.25, y + h - 0.1, z + 0.1], [x, y + h - 0.05, z], color, { g: [0.85, 1.05] });
  m.use('flat');
}

/**
 * One rectangular building volume in the current frame: plinth, storeys (decorated by the style), roof, chimney,
 * dormers. o: { w, d, floors, door (u on the front | null), ridge 'x'|'z'|'hip'|'flat', blind: [face names without
 * windows], chimney: bool, x, z (offset of the volume), roofScale }. Returns { top, ridge } heights.
 */
export function block(m, rng, st, pal, o) {
  const { w, d, floors } = o;
  m.push(o.x || 0, 0, o.z || 0);
  m.box(w + 0.34, 0.5, d + 0.34, pal.base, 0, -0.1, 0, { nb: true, top: [0.97, 0.97], vj: 0.07, g: [0.75, 1] });
  let y = 0.3, ww = w, dd = d;
  for (let level = 0; level < floors; level++) {
    const jet = level > 0 ? st.jetty : 0;
    ww = w + jet * 2;
    dd = d + jet * 2;
    const h = level === 0 ? st.h0 : st.h1;
    st.storey(m, rng, { w: ww, d: dd, y, h, level, floors, pal, door: level === 0 ? o.door : null, blind: o.blind || [], wideDoor: o.wideDoor, lit: o.lit });
    y += h;
  }
  let ridge = y;
  const kind = o.ridge || 'x';
  if (kind === 'flat') {
    m.box(ww + 0.1, 0.2, dd + 0.1, pal.trim || pal.base, 0, y, 0, { vj: 0.05 });
    ridge = y + 0.2;
  } else if (kind === 'z') {
    m.push(0, 0, 0, Math.PI / 2);
    ridge = st.roof(m, rng, dd, ww, y, pal, { ...o, ridge: 'x' });
    m.pop();
  } else {
    ridge = st.roof(m, rng, ww, dd, y, pal, o);
  }
  if (o.chimney !== false && kind !== 'flat') {
    const cx = (rng() < 0.5 ? -1 : 1) * ww * (0.18 + rng() * 0.2), cz = (rng() - 0.5) * dd * 0.3;
    chimney(m, rng, kind === 'z' ? cz : cx, kind === 'z' ? cx : cz, y - 0.3, ridge - y + 0.9 + rng() * 0.5, pal.chimney || pal.base);
  }
  if (o.dormers && kind === 'x' && ww > 6) {
    const rise = ridge - y;
    const n = ww > 9 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      dormer(m, rng, (i - (n - 1) / 2) * ww * 0.42, y + rise * 0.3, dd * 0.27, 1, { wall: pal.wall, roof: pal.roof, frame: pal.beam });
    }
  }
  m.pop();
  return { top: y, ridge, w: ww, d: dd };
}
