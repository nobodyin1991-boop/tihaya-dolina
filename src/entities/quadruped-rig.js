// Procedural four-legged body: body(front + rear halves) → neck → head → jaw/ears, tail chain, four two-segment legs.
// Species differ by the proportion spec (see quadrupeds.js) and by optional features: antlers, horns, tusks, wool, mane…
import * as THREE from 'three';
import { glowMat } from '../world/materials.js';
import { tube, ball, slab, rod, hoop, part, joint, stiffLimb, shade, mix, xf, lerp } from './rig.js';

const _c = new THREE.Color();

/** Blend vertices whose normal points down towards the belly colour (countershading). */
function shadeBelly(geo, bellyHex, amount = 1) {
  const nor = geo.attributes.normal;
  const col = geo.attributes.color;
  _c.set(bellyHex);
  for (let i = 0; i < col.count; i++) {
    const ny = nor.getY(i);
    let t = (-ny - 0.15) / 0.6;
    t = Math.max(0, Math.min(1, t)) * amount;
    col.setXYZ(i, col.getX(i) + (_c.r - col.getX(i)) * t, col.getY(i) + (_c.g - col.getY(i)) * t, col.getZ(i) + (_c.b - col.getZ(i)) * t);
  }
  return geo;
}

function antlerGeos(a, color, side) {
  const s = a.size;
  const out = [];
  if (a.kind === 'palm') {
    out.push(tube([[side * 0.05 * s, 0, 0, 0.03 * s], [side * 0.3 * s, 0.16 * s, -0.04 * s, 0.028 * s]], color, { segs: 5 }));
    out.push(xf(ball(0.24 * s, color, [0, 0, 0], [1.25, 0.16, 0.8], { segs: 8, rings: 5, jitter: 0.05 }), [side * 0.56 * s, 0.3 * s, -0.08 * s], [0.25, 0, side * 0.6]));
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const bx = side * (0.42 + t * 0.4) * s;
      const by = (0.3 + t * 0.2) * s;
      out.push(tube([[bx, by, (0.08 - t * 0.22) * s, 0.022 * s], [bx + side * 0.07 * s, by + 0.2 * s, (0.14 - t * 0.3) * s, 0.004]], color, { segs: 4 }));
    }
    out.push(tube([[side * 0.2 * s, 0.1 * s, 0, 0.022 * s], [side * 0.28 * s, 0.14 * s, 0.22 * s, 0.004]], color, { segs: 4 }));
  } else {
    const main = [[side * 0.04 * s, 0, 0, 0.022 * s], [side * 0.16 * s, 0.2 * s, -0.08 * s, 0.019 * s], [side * 0.26 * s, 0.42 * s, -0.04 * s, 0.014 * s], [side * 0.22 * s, 0.6 * s, 0.08 * s, 0.004]];
    out.push(tube(main, color, { segs: 5 }));
    out.push(tube([[side * 0.1 * s, 0.1 * s, -0.03 * s, 0.014 * s], [side * 0.12 * s, 0.22 * s, 0.14 * s, 0.003]], color, { segs: 4 }));
    out.push(tube([[side * 0.2 * s, 0.3 * s, -0.07 * s, 0.013 * s], [side * 0.36 * s, 0.46 * s, -0.16 * s, 0.003]], color, { segs: 4 }));
    out.push(tube([[side * 0.26 * s, 0.42 * s, -0.04 * s, 0.012 * s], [side * 0.36 * s, 0.6 * s, -0.02 * s, 0.003]], color, { segs: 4 }));
  }
  return out;
}

function hornGeos(h, side) {
  const s = h.size;
  const c = h.color ?? 0x4a4238;
  if (h.kind === 'curl') {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * 3.6;
      pts.push([side * (0.04 + i * 0.022) * s, Math.cos(a) * 0.1 * s + 0.02 * s, -Math.sin(a) * 0.1 * s - 0.03 * s, (0.032 - i * 0.004) * s]);
    }
    return [tube(pts, c, { segs: 6, jitter: 0.05 })];
  }
  if (h.kind === 'back') {
    return [tube([[side * 0.035 * s, 0, 0, 0.022 * s], [side * 0.06 * s, 0.14 * s, -0.05 * s, 0.017 * s], [side * 0.09 * s, 0.24 * s, -0.16 * s, 0.004]], c, { segs: 5 })];
  }
  if (h.kind === 'wide') {
    return [tube([[side * 0.05 * s, 0, 0, 0.03 * s], [side * 0.22 * s, 0.02 * s, 0.0, 0.026 * s], [side * 0.33 * s, 0.12 * s, 0.05 * s, 0.006]], c, { segs: 5 })];
  }
  return [tube([[side * 0.03 * s, 0, 0, 0.016 * s], [side * 0.04 * s, 0.08 * s, -0.01 * s, 0.004]], c, { segs: 4 })];
}

function earGeos(e, col, side, hx, tuftColor) {
  const s = e.size;
  const inner = shade(col, 0.7);
  if (e.kind === 'round') return [ball(s, col, [side * hx * 0.8, s * 0.3, 0], [0.9, 1, 0.45], { segs: 6, rings: 4 })];
  if (e.kind === 'long') {
    return [tube([[side * hx * 0.45, 0, 0, s * 0.16, s * 0.08], [side * hx * 0.6, s * 0.55, -s * 0.08, s * 0.2, s * 0.07], [side * hx * 0.65, s, -s * 0.2, s * 0.05, s * 0.03]], col, { segs: 5, colors: [col, inner, col] })];
  }
  if (e.kind === 'droop') return [tube([[side * hx * 0.8, 0, 0, s * 0.3, s * 0.12], [side * (hx + s * 0.8), -s * 0.15, 0, s * 0.3, s * 0.1], [side * (hx + s * 1.3), -s * 0.45, 0, s * 0.08, s * 0.05]], col, { segs: 5 })];
  const out = [tube([[side * hx * 0.62, -s * 0.2, 0, s * 0.42, s * 0.22], [side * hx * 0.78, s * 0.45, -s * 0.05, s * 0.3, s * 0.12], [side * hx * 0.86, s * 1.05, -s * 0.08, s * 0.03, s * 0.02]], col, { segs: 5 })];
  if (e.tuft) out.push(tube([[side * hx * 0.86, s * 1.0, -s * 0.08, s * 0.05], [side * hx * 0.95, s * 1.5, -s * 0.14, 0.002]], tuftColor ?? 0x1c1a18, { segs: 4 }));
  return out;
}

/**
 * Build a quadruped model from a species spec.
 * @returns {{group, root, body, J, dims, sockets, tail:THREE.Group[], spec, height, radius, glowEyes}}
 */
export function buildQuadruped(sp) {
  const C = sp.col;
  const L = sp.len;
  const group = new THREE.Group();
  const scaler = joint(group, 0, 0, 0, 'scale');
  scaler.scale.setScalar(sp.scale || 1);
  const root = joint(scaler, 0, 0, 0, 'root');
  const yF = sp.hs - sp.chest[1];
  const yR = sp.hh - sp.rump[1];
  const H = (yF + yR) / 2;
  const dyF = yF - H;
  const dyR = yR - H;
  const dyB = (sp.hs + sp.hh) / 2 - H - sp.belly[1];
  const body = joint(root, 0, H, 0, 'body');
  const front = joint(body, 0, 0, 0, 'front');
  const rear = joint(body, 0, 0, 0, 'rear');
  const grad = [1.08, 0.92];
  const jit = sp.jitter ?? 0.04;
  const bellyCol = C.belly ?? shade(C.body, 1.2);
  const J = { root, body, front, rear };

  // ——— torso halves
  const mid = [lerp(sp.belly[0], sp.chest[0], 0.6), lerp(sp.belly[1], sp.chest[1], 0.6)];
  const midR = [lerp(sp.belly[0], sp.rump[0], 0.6), lerp(sp.belly[1], sp.rump[1], 0.6)];
  const frontGeo = [shadeBelly(tube([
    [0, dyB, -0.1 * L, sp.belly[0], sp.belly[1]],
    [0, lerp(dyB, dyF, 0.55), 0.15 * L, mid[0], mid[1]],
    [0, dyF, 0.4 * L, sp.chest[0], sp.chest[1]],
    [0, dyF + sp.chest[1] * 0.1, 0.5 * L + sp.chest[0] * 0.3, sp.chest[0] * 0.74, sp.chest[1] * 0.76],
  ], C.body, { segs: 10, gradient: grad, jitter: jit }), bellyCol, sp.bellyAmount ?? 0.8)];
  const rearGeo = [shadeBelly(tube([
    [0, dyB, 0.1 * L, sp.belly[0], sp.belly[1]],
    [0, lerp(dyB, dyR, 0.55), -0.15 * L, midR[0], midR[1]],
    [0, dyR, -0.4 * L, sp.rump[0], sp.rump[1]],
    [0, dyR - sp.rump[1] * 0.08, -0.5 * L - sp.rump[0] * 0.28, sp.rump[0] * 0.7, sp.rump[1] * 0.72],
  ], C.rear ?? C.body, { segs: 10, gradient: grad, jitter: jit }), bellyCol, sp.bellyAmount ?? 0.8)];
  const topF = dyF + sp.chest[1];
  const topR = dyR + sp.rump[1];
  const topAt = t => lerp(topR, topF, t) - Math.sin(t * Math.PI) * (lerp(topR, topF, 0.5) - (dyB + sp.belly[1])) * 0.6;
  const along = (t, fn) => { (t >= 0.5 ? frontGeo : rearGeo).push(fn((t - 0.5) * 0.9 * L, topAt(t))); };

  if (sp.hump) frontGeo.push(ball(sp.chest[0] * sp.hump, C.body, [0, dyF + sp.chest[1] * 0.42, 0.3 * L], [0.95, 0.8, 1.5], { jitter: jit, gradient: grad }));
  if (sp.wool) {
    const w = sp.wool;
    for (let i = 0; i < 16; i++) {
      const t = (i % 8) / 7;
      const a = (i < 8 ? 0.9 : -0.9) + ((i * 7) % 5) * 0.12 - 0.24;
      const r = lerp(sp.rump[0], sp.chest[0], t) * 0.72;
      const y = lerp(dyR, dyF, t) + Math.cos(a) * r * 0.75 + 0.02;
      (t >= 0.5 ? frontGeo : rearGeo).push(ball(r, w, [Math.sin(a) * r * 0.8, y, (t - 0.5) * L * 1.05], [1, 0.9, 1.1], { segs: 6, rings: 4, jitter: 0.06, gradient: [0.82, 1.06] }));
    }
    for (let i = 0; i < 6; i++) along(i / 5, (z, y) => ball(sp.chest[0] * 0.6, w, [0, y - 0.02, z], [1.1, 0.7, 1.2], { segs: 6, rings: 4, jitter: 0.06 }));
  }
  if (sp.ridge) {
    const rd = sp.ridge;
    const n = rd.n ?? 9;
    for (let i = 0; i < n; i++) {
      const t = 0.12 + (i / (n - 1)) * (rd.to ?? 0.85);
      const h = rd.h * (0.6 + 0.4 * Math.sin((i / (n - 1)) * Math.PI));
      along(t, (z, y) => tube([[0, y - 0.02, z - h * 0.2, 0.012, h * 0.3], [0, y + h, z - h * 0.5, 0.002, 0.004]], rd.color, { segs: 4, flat: true }));
    }
  }
  if (sp.spikes) {
    const sk = sp.spikes;
    for (let i = 0; i < sk.n; i++) {
      const t = 0.15 + (i / (sk.n - 1)) * 0.8;
      const sideX = ((i % 3) - 1) * sp.chest[0] * 0.5;
      const h = sk.size * (0.7 + ((i * 5) % 4) * 0.12);
      along(t, (z, y) => tube([[sideX, y - 0.03 - Math.abs(sideX) * 0.3, z, h * 0.2], [sideX * 1.5, y + h - Math.abs(sideX) * 0.5, z - h * 0.35, 0.003]], sk.color, { segs: 5 }));
    }
  }
  if (sp.crest) {
    const cr = sp.crest;
    for (let i = 0; i < cr.n; i++) {
      const t = 0.3 + (i / (cr.n - 1)) * 0.68;
      const h = cr.size * (0.6 + ((i * 3) % 4) * 0.2);
      along(t, (z, y) => tube([[0, y - 0.02, z, h * 0.22, h * 0.3], [((i % 2) - 0.5) * 0.04, y + h, z - h * 0.3, 0.002, 0.003]], cr.color, { segs: 4, flat: true, gradient: [0.8, 1.25] }));
    }
  }
  if (sp.stripe) {
    for (let i = 0; i < 6; i++) along(i / 5, (z, y) => ball(sp.chest[0] * 0.45, sp.stripe, [0, y - sp.chest[0] * 0.3, z], [0.8, 0.8, 1.6], { segs: 6, rings: 4, gradient: false }));
  }
  if (sp.harness) {
    const hc = sp.harness;
    frontGeo.push(xf(hoop(sp.chest[1] * 1.02, 0.035, hc.color ?? 0x4a3423, [0, 0, 0], [0, 0, 0], { segs: 14, tubeSegs: 5 }), [0, dyF, 0.36 * L], [0.15, 0, 0], [sp.chest[0] / sp.chest[1], 1, 1]));
    frontGeo.push(xf(hoop(lerp(sp.belly[1], sp.chest[1], 0.5) * 1.03, 0.018, hc.color ?? 0x4a3423, [0, 0, 0], [0, 0, 0], { segs: 12, tubeSegs: 4 }), [0, lerp(dyB, dyF, 0.5), 0.1 * L], [0, 0, 0], [mid[0] / mid[1], 1, 1]));
    for (const side of [1, -1]) {
      frontGeo.push(rod(0.012, 0.012, L * 0.5, 0x4a3423, [side * sp.chest[0] * 1.02, dyF - sp.chest[1] * 0.1, 0.12 * L], [Math.PI / 2, 0, 0]));
      frontGeo.push(ball(0.03, 0x9a6b3a, [side * sp.chest[0] * 0.95, dyF + sp.chest[1] * 0.3, 0.37 * L], 1, { metal: 1, segs: 5, rings: 4 }));
    }
    if (hc.blanket != null) rearGeo.push(xf(tube([[0, 0, -0.08 * L, sp.rump[0] * 1.06, sp.rump[1] * 1.04], [0, 0, 0.08 * L, sp.rump[0] * 1.06, sp.rump[1] * 1.04]], hc.blanket, { segs: 10, caps: 'none' }), [0, dyR * 0.9, -0.28 * L]));
  }
  const sockets = {};
  if (sp.saddle) {
    const sy = topAt(0.52);
    frontGeo.push(tube([[0, sy - sp.belly[1] * 0.75, -0.06 * L, sp.belly[0] * 1.08, sp.belly[1] * 0.85], [0, sy - sp.belly[1] * 0.75, 0.2 * L, mid[0] * 1.05, mid[1] * 0.85]], sp.saddle.blanket ?? 0x8e3b32, { segs: 10, caps: 'none' }));
    frontGeo.push(tube([[0, sy + 0.06, -0.12 * L, 0.12, 0.05], [0, sy + 0.02, 0.02 * L, 0.15, 0.04], [0, sy + 0.07, 0.17 * L, 0.09, 0.05]], 0x5a3c26, { segs: 8, sq: 0.8 }));
    for (const side of [1, -1]) {
      frontGeo.push(rod(0.008, 0.008, 0.42, 0x4a3423, [side * (sp.belly[0] + 0.02), sy - 0.22, 0.04 * L]));
      frontGeo.push(slab(0.03, 0.02, 0.1, 0x7d838a, [side * (sp.belly[0] + 0.03), sy - 0.44, 0.05 * L], [0, 0, 0], { metal: 1 }));
    }
    sockets.saddle = joint(front, 0, sy + 0.05, 0.02 * L, 'saddle');
  }

  // ——— legs
  const hipF = [sp.chest[0] * (sp.legSpread ?? 0.6), dyF - sp.chest[1] * 0.35, 0.4 * L];
  const hipR = [sp.rump[0] * (sp.legSpread ?? 0.6), dyR - sp.rump[1] * 0.25, -0.4 * L];
  const hF = H + hipF[1];
  const hR = H + hipR[1];
  const lg = sp.leg;
  const dims = { H, L, hF, hR, l1F: hF * (lg.kF ?? 0.525), l2F: hF * (lg.kF ?? 0.525), l1R: hR * (lg.kR1 ?? 0.63), l2R: hR * (lg.kR2 ?? 0.49), hipF, hipR, dyF, dyR };
  const legCol = C.leg ?? C.dark ?? shade(C.body, 0.8);
  const pawCol = C.paw ?? shade(legCol, 0.8);
  const legs = [];
  const makeLeg = (tag, parent, hip, side, isFront) => {
    const r = isFront ? lg.rF : lg.rH;
    const l1 = isFront ? dims.l1F : dims.l1R;
    const l2 = isFront ? dims.l2F : dims.l2R;
    const upper = joint(parent, side * hip[0], hip[1], hip[2], 'upper' + tag);
    const lower = joint(upper, 0, -l1, 0, 'lower' + tag);
    const bulge = (isFront ? (lg.shoulder ?? 1.8) : (lg.haunch ?? 2.3)) * 0.88;
    const upGeo = [tube([[0, r * 1.2, 0, r * bulge * 0.8, r * bulge], [0, -l1 * 0.45, 0, r * 1.3, r * 1.45], [0, -l1, 0, r, r]], C.body, { segs: 7, jitter: jit, colors: [C.body, mix(C.body, legCol, 0.5), legCol], capEnd: 'none' })];
    const pr = lg.pawR ?? r * 1.25;
    const lowGeo = [
      ball(r * 1.08, legCol, [0, 0, 0], 1, { segs: 6, rings: 4 }),
      tube([[0, 0, 0, r], [0, -l2 * 0.6, 0, r * 0.74], [0, -l2 + pr * 0.6, 0, r * 0.72]], legCol, { segs: 6, jitter: jit, capEnd: 'none' }),
    ];
    if (lg.paw === 'hoof') lowGeo.push(rod(pr * 0.85, pr, pr * 1.1, C.hoof ?? 0x2a2622, [0, -l2 + pr * 0.55, pr * 0.1], [0, 0, 0], { segs: 7 }));
    else lowGeo.push(ball(pr, pawCol, [0, -l2 + pr * 0.52, pr * 0.42], [1.05, 0.56, 1.5], { segs: 7, rings: 4 }));
    if (lg.feather) lowGeo.push(tube([[0, -l2 * 0.62, 0, r * 0.9], [0, -l2 + pr * 0.9, 0, r * 1.7]], lg.feather, { segs: 7, caps: 'none', jitter: 0.06 }));
    upper.add(part(upGeo, null, { name: 'legU' }));
    lower.add(part(lowGeo, null, { name: 'legL' }));
    upper.rotation.x = isFront ? -0.25 : 0.45;
    lower.rotation.x = isFront ? 0.5 : -0.9;
    stiffLimb(upper);
    legs.push({ upper, lower, l1, l2, hip, side, isFront });
  };
  makeLeg('FL', front, hipF, 1, true);
  makeLeg('FR', front, hipF, -1, true);
  makeLeg('HL', rear, hipR, 1, false);
  makeLeg('HR', rear, hipR, -1, false);

  // ——— neck & head
  const nk = sp.neck;
  const hd = sp.head;
  const neck = joint(front, 0, dyF + sp.chest[1] * (nk.y ?? 0.3), 0.44 * L + sp.chest[0] * 0.25, 'neck');
  const neckGeo = [shadeBelly(tube([[0, -nk.r[0] * 0.25, -nk.r[0] * 0.7, nk.r[0] * 1.05, nk.r[0] * 1.25], [0, 0, nk.len * 0.5, (nk.r[0] + nk.r[1]) * 0.5, (nk.r[0] + nk.r[1]) * 0.56], [0, 0, nk.len, nk.r[1], nk.r[1] * 1.08]], C.neck ?? C.body, { segs: 8, gradient: grad, jitter: jit }), bellyCol, sp.bellyAmount ?? 0.8)];
  if (sp.mane) {
    const mn = sp.mane;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = nk.r[0] * mn.size;
      neckGeo.push(tube([[Math.sin(a) * r * 0.5, Math.cos(a) * r * 0.55, nk.len * 0.35, r * 0.55], [Math.sin(a) * r * 1.25, Math.cos(a) * r * 1.3 - r * 0.2, -nk.len * 0.25, r * 0.12]], mn.color, { segs: 5, jitter: 0.1 }));
    }
    frontGeo.push(ball(sp.chest[0] * 0.95, mn.color, [0, dyF + sp.chest[1] * 0.35, 0.34 * L], [1.02, 1.0, 1.0], { jitter: 0.1 }));
  }
  if (sp.neckMane) {
    for (let i = 0; i < 6; i++) neckGeo.push(tube([[0, nk.r[0] * 0.8, nk.len * (i / 6), 0.02, 0.07], [0, nk.r[0] * 0.8 + sp.neckMane.h, nk.len * (i / 6) - 0.06, 0.004, 0.02]], sp.neckMane.color, { segs: 4, flat: true }));
  }
  if (sp.dewlap) neckGeo.push(ball(nk.r[0] * 0.55, sp.dewlap, [0, -nk.r[0] * 1.15, nk.len * 0.55], [0.6, 1.3, 1.2], { jitter: 0.08 }));
  neck.add(part(neckGeo, null, { name: 'neck' }));
  const head = joint(neck, 0, 0, nk.len, 'head');
  const [hx, hy, hz] = hd.r;
  const sl = hd.snout[0];
  const sr = hd.snout[1];
  const sz = hz * 0.62;
  const sy = -hy * (hd.snoutDrop ?? 0.18);
  const snoutCol = C.snout ?? C.body;
  const headGeo = [
    shadeBelly(ball(1, C.head ?? C.body, [0, 0, hz * 0.25], [hx, hy, hz], { segs: 9, rings: 7, gradient: grad, jitter: jit }), bellyCol, 0.5),
    tube([[0, sy + sr * 0.2, sz, sr * 1.45, sr * 1.3], [0, sy - sr * 0.2, sz + sl * 0.6, sr * 1.05, sr * 0.95], [0, sy - sr * 0.3, sz + sl, sr * 0.82, sr * 0.72]], snoutCol, { segs: 7, gradient: grad, colors: [C.head ?? C.body, snoutCol, snoutCol] }),
    ball(sr * 0.42, C.nose ?? 0x1c1a18, [0, sy - sr * 0.12, sz + sl + sr * 0.5], [1.15, 0.85, 0.8], { segs: 6, rings: 4, gradient: false }),
  ];
  const headDetail = [];
  const eyeR = hd.eye ?? hx * 0.17;
  const eyePos = side => [side * hx * 0.74, hy * 0.2, hz * 0.72];
  for (const side of [1, -1]) headDetail.push(ball(eyeR, C.eye ?? 0x1a1612, eyePos(side), [0.7, 1, 1], { segs: 6, rings: 4, gradient: false }));
  if (sp.fangs) {
    for (const side of [1, -1]) headGeo.push(tube([[side * sr * 0.6, sy - sr * 0.7, sz + sl * 0.82, sr * 0.14], [side * sr * 0.6, sy - sr * 0.7 - sr * sp.fangs * 0.6, sz + sl * 0.8, 0.002]], 0xe8e0c8, { segs: 4, gradient: false }));
  }
  if (sp.tusks) {
    for (const side of [1, -1]) headGeo.push(tube([[side * sr * 1.0, sy - sr * 0.9, sz + sl * 0.55, sr * 0.2], [side * sr * 1.5, sy - sr * 0.5, sz + sl * 0.75, sr * 0.16], [side * sr * 1.6, sy + sr * sp.tusks, sz + sl * 0.7, 0.003]], 0xe6dcc0, { segs: 5 }));
  }
  if (sp.antlers) for (const side of [1, -1]) headGeo.push(antlerGeos(sp.antlers, sp.antlers.color ?? 0x8a7458, side).map(g => xf(g, [0, hy * 0.8, -hz * 0.05])));
  if (sp.horns) for (const side of [1, -1]) headGeo.push(hornGeos(sp.horns, side).map(g => xf(g, [0, hy * 0.75, hz * 0.0])));
  if (sp.faceStripe) {
    headGeo.push(tube([[0, hy * 0.75, -hz * 0.3, hx * 0.3, 0.012], [0, hy * 0.8, hz * 0.5, hx * 0.3, 0.012], [0, sy + sr * 1.2, sz + sl * 0.8, sr * 0.6, 0.01]], sp.faceStripe, { segs: 4, gradient: false }));
  }
  if (sp.ruff) for (const side of [1, -1]) headGeo.push(tube([[side * hx * 0.7, -hy * 0.2, hz * 0.2, hx * 0.3], [side * hx * 1.5, -hy * 0.75, hz * 0.05, 0.01]], sp.ruff, { segs: 5, jitter: 0.08 }));
  if (sp.beard) headGeo.push(tube([[0, -hy * 0.9, sz + sl * 0.3, sr * 0.5], [0, -hy * 0.9 - sp.beard, sz + sl * 0.2, 0.004]], C.dark ?? C.body, { segs: 5 }));
  if (sp.scars) {
    headDetail.push(slab(0.01, hy * 1.2, 0.012, 0x8a3a30, [hx * 0.55, hy * 0.25, hz * 0.85], [0.3, 0, 0.3]));
    frontGeo.push(slab(0.012, 0.2, 0.012, 0x7a3a30, [sp.chest[0] * 0.96, dyF + 0.03, 0.3 * L], [0.5, 0, 0]));
    frontGeo.push(slab(0.012, 0.16, 0.012, 0x7a3a30, [sp.chest[0] * 0.97, dyF + 0.01, 0.36 * L], [0.5, 0, 0]));
  }
  if (sp.headTop) headGeo.push(sp.headTop.map(g => g.clone()));
  head.add(part(headGeo, headDetail, { name: 'head' }));
  let glowEyes = null;
  if (sp.glowEyes != null) {
    const g = new THREE.SphereGeometry(eyeR * 1.15, 6, 4);
    const g2 = g.clone();
    g.translate(...eyePos(1));
    g2.translate(...eyePos(-1));
    g.translate(hx * 0.03, 0, hz * 0.03);
    g2.translate(-hx * 0.03, 0, hz * 0.03);
    const merged = new THREE.BufferGeometry();
    const a = g.toNonIndexed().attributes.position.array;
    const b = g2.toNonIndexed().attributes.position.array;
    const all = new Float32Array(a.length + b.length);
    all.set(a, 0);
    all.set(b, a.length);
    merged.setAttribute('position', new THREE.BufferAttribute(all, 3));
    glowEyes = new THREE.Mesh(merged, glowMat(sp.glowEyes, 2.4));
    glowEyes.castShadow = false;
    glowEyes.userData.shadow = false;
    glowEyes.userData.lodMax = 1;
    head.add(glowEyes);
  }
  const jaw = joint(head, 0, sy - sr * 0.55, sz - sr * 0.3, 'jaw');
  const jawGeo = [tube([[0, 0, 0, sr * 1.15, sr * 0.5], [0, -sr * 0.05, sl * 0.6 + sr * 0.3, sr * 0.85, sr * 0.42], [0, 0, sl + sr * 0.15, sr * 0.6, sr * 0.3]], C.jaw ?? shade(snoutCol, 0.85), { segs: 6, gradient: false })];
  if (sp.fangs) for (const side of [1, -1]) jawGeo.push(tube([[side * sr * 0.45, sr * 0.2, sl * 0.9, sr * 0.11], [side * sr * 0.45, sr * 0.2 + sr * sp.fangs * 0.4, sl * 0.9, 0.002]], 0xe8e0c8, { segs: 4, gradient: false }));
  const jawMesh = part(jawGeo, null, { name: 'jaw' });
  jawMesh.userData.lodMax = 1;
  jaw.add(jawMesh);
  const ears = joint(head, 0, hy * 0.72, -hz * 0.1, 'ears');
  if (sp.ears && sp.ears.kind !== 'none') {
    const earMesh = part([earGeos(sp.ears, C.ear ?? C.dark ?? C.body, 1, hx, C.tuft), earGeos(sp.ears, C.ear ?? C.dark ?? C.body, -1, hx, C.tuft)], null, { name: 'ears' });
    earMesh.userData.lodMax = 1;
    ears.add(earMesh);
  }
  Object.assign(J, { neck, head, jaw, ears });

  // ——— tail chain (built along -z)
  const tl = sp.tail || { kind: 'stub', len: 0.08, r: 0.04 };
  const tail = [];
  const tailBase = joint(rear, 0, dyR + sp.rump[1] * (tl.y ?? 0.45), -0.5 * L - sp.rump[0] * 0.3, 'tail0');
  const segs = tl.segs || 1;
  const segLen = tl.len / segs;
  let parent = tailBase;
  const tailCol = C.tail ?? C.dark ?? C.body;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const prof = t => {
      if (tl.kind === 'bushy') return tl.r * (0.55 + Math.sin(Math.min(1, t * 1.25) * Math.PI) * 0.75);
      if (tl.kind === 'horse') return tl.r * (0.7 + t * 0.8);
      if (tl.kind === 'tuft') return t > 0.75 ? tl.r * 2.2 : tl.r * 0.6;
      if (tl.kind === 'stub') return tl.r;
      return tl.r * (1 - t * 0.75);
    };
    const tip = i === segs - 1;
    const colA = tl.tip != null && t0 > 0.55 ? tl.tip : tailCol;
    const colB = tl.tip != null && tip ? tl.tip : tailCol;
    const geo = tl.kind === 'stub'
      ? [ball(tl.r, tl.tip ?? tailCol, [0, 0, -tl.len * 0.4], [1, 1, 1.2], { segs: 6, rings: 4, jitter: jit })]
      : [tube([[0, 0, 0, prof(t0)], [0, 0, -segLen * 0.5, prof((t0 + t1) / 2)], [0, 0, -segLen, tip ? prof(t1) * (tl.kind === 'horse' || tl.kind === 'tuft' ? 0.6 : 0.35) : prof(t1)]], tailCol, { segs: 6, jitter: tl.kind === 'thin' ? 0 : 0.08, colors: [colA, colB, colB] })];
    const mesh = part(geo, null, { name: 'tail' });
    if (i > 0) mesh.userData.lodMax = 1;
    parent.add(mesh);
    tail.push(parent);
    if (!tip) parent = joint(parent, 0, 0, -segLen, 'tail' + (i + 1));
  }

  front.add(part(frontGeo, null, { name: 'front' }));
  rear.add(part(rearGeo, null, { name: 'rear' }));
  const scale = sp.scale || 1;
  const headTop = sp.hs + Math.sin(nk.pitch) * nk.len + hy + (sp.antlers ? sp.antlers.size * 0.55 : 0);
  return {
    group, scaler, root, body, J, legs, tail, dims, sockets, spec: sp, glowEyes,
    height: headTop * scale,
    radius: Math.max(L * 0.5 + sp.chest[0], sp.chest[0] * 1.4) * scale * 0.9,
  };
}
