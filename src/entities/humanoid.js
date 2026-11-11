// Procedural humanoid body: a joint hierarchy (no skinning) with one fused, vertex-coloured mesh per bone.
// The look is driven by a plain `spec` object (see normSpec) — heroes, NPCs and bandits only differ by spec.
import * as THREE from 'three';
import { PALETTE as P } from '../world/materials.js';
import { tube, ball, slab, rod, hoop, sheet, xf, part, joint, stiffLimb, shade, mix } from './rig.js';
import { hatGeos, quiverGeos } from './gear-models.js';

/** Skeleton dimensions at scale 1 (metres). */
export const DIM = { ankle: 0.075, shin: 0.42, thigh: 0.43, upper: 0.29, fore: 0.25, hand: 0.055, hipX: 0.095, hipDrop: 0.05, pelvisY: 0.975 };

const HALF_PI = Math.PI / 2;
const COVERING_HATS = new Set(['hood', 'coif', 'kettle', 'nasal', 'fullhelm', 'cap', 'scarf', 'bandana', 'straw', 'widebrim', 'chef', 'fur']);

/** Fill a humanoid spec with defaults. All colours are sRGB hex. */
export function normSpec(spec = {}) {
  const s = {
    scale: 1, bulk: 1, shoulders: 1, hips: 1, belly: 0, headScale: 1.1, female: false,
    skin: P.skin, hair: P.hairBrown, hairStyle: 'short', beard: 'none', hat: null, mask: null, eyePatch: 0, scar: false,
    top: { kind: 'tunic', color: P.clothBrown, trim: null, skirt: 0.22 },
    sleeves: { kind: 'long', color: null },
    bracers: null, gloves: null,
    legs: { color: P.leatherDark },
    boots: { color: P.leatherDark, tall: false, metal: 0 },
    belt: { color: P.leatherDark, buckle: P.bronze, pouches: 0, satchel: null, sash: null },
    pauldrons: null, overlay: null, tabard: null, apron: null, collar: null, chain: null, strap: null,
    cloak: null, back: null, mailSkirt: null, greaves: null, extra: null, ...spec,
  };
  s.top = { kind: 'tunic', color: P.clothBrown, trim: null, skirt: 0.22, ...(spec.top || {}) };
  s.sleeves = { kind: 'long', color: null, ...(spec.sleeves || {}) };
  s.legs = { color: P.leatherDark, ...(spec.legs || {}) };
  s.boots = { color: P.leatherDark, tall: false, metal: 0, ...(spec.boots || {}) };
  s.belt = { color: P.leatherDark, buckle: P.bronze, pouches: 0, satchel: null, sash: null, ...(spec.belt || {}) };
  if (s.sleeves.color == null) s.sleeves.color = s.top.color;
  return s;
}

const TORSO = [
  [0, -0.17, 0, 0.136, 0.1],
  [0, -0.06, 0.005, 0.15, 0.108],
  [0, 0.07, 0.012, 0.178, 0.124],
  [0, 0.17, 0.006, 0.198, 0.118],
  [0, 0.232, 0, 0.13, 0.085],
  [0, 0.265, 0, 0.062, 0.056],
];

function torsoPath(s, kx = 1, kz = 1, dz = 0, from = 0, to = TORSO.length - 1) {
  const out = [];
  for (let i = from; i <= to; i++) {
    const r = TORSO[i];
    let rx = r[3] * s.bulk;
    let rz = r[4] * s.bulk;
    if (i <= 1) {
      rz += s.belly * (i === 1 ? 1.1 : 1);
      rx += s.belly * 0.5;
      if (s.female) rx *= 0.88;
    } else if (i <= 3) {
      rx *= s.shoulders;
      if (s.female && i === 2) rz += 0.012;
    } else if (i === 4) {
      rx *= s.shoulders;
    }
    out.push([0, r[1], r[2] + dz, rx * kx, rz * kz]);
  }
  return out;
}

function strapHoop(color, tilt, s, metal = 0) {
  const g = hoop(0.176 * s.bulk, 0.016, color, [0, 0, 0], [HALF_PI, 0, 0], { segs: 14, tubeSegs: 4, metal });
  return xf(g, [0, 0.05, 0.008], [0, 0, tilt], [1, 1, 0.7 + s.belly * 2]);
}

function buildChest(s) {
  const top = s.top;
  const opts = { segs: 10, sq: 0.86, capStart: 'none', gradient: [0.78, 1.06], jitter: top.kind === 'rags' ? 0.1 : 0.02 };
  if (top.kind === 'mail') opts.metal = 0.55;
  const core = [tube(torsoPath(s), top.color, opts)];
  const detail = [];
  core.push(tube([[0, 0.25, 0.004, 0.052 * Math.sqrt(s.bulk)], [0, 0.36, 0.014, 0.047]], s.skin, { segs: 7, caps: 'none', gradient: [0.85, 1] }));
  const ov = s.overlay;
  if (ov) {
    const metal = ov.metal ?? 0;
    if (ov.kind === 'cuirass') {
      core.push(tube(torsoPath(s, 1.07, 1.13, 0.004, 0, 4), ov.color, { segs: 10, sq: 0.8, capStart: 'none', metal, gradient: [0.72, 1.12] }));
      if (ov.trim) detail.push(tube(torsoPath(s, 1.09, 1.15, 0.004, 0, 0).concat(torsoPath(s, 1.09, 1.15, 0.004, 0, 0).map(r => [r[0], r[1] + 0.03, r[2], r[3], r[4]])), ov.trim, { segs: 10, caps: 'none', metal: 1, gradient: false }));
    } else if (ov.kind === 'vest') {
      core.push(tube(torsoPath(s, 1.07, 0.93, -0.012, 0, 4), ov.color, { segs: 10, sq: 0.86, capStart: 'none', metal }));
    } else if (ov.kind === 'jerkin') {
      core.push(tube(torsoPath(s, 1.05, 1.08, 0, 0, 4), ov.color, { segs: 10, sq: 0.86, capStart: 'none', metal, jitter: 0.04 }));
    }
  }
  if (s.tabard) {
    core.push(tube(torsoPath(s, 0.74, 1.16, 0, 0, 4), s.tabard.color, { segs: 10, sq: 0.7, capStart: 'none' }));
    if (s.tabard.emblem != null) detail.push(xf(ball(0.05, s.tabard.emblem, [0, 0, 0], [1, 1.25, 0.3], { segs: 4, rings: 2, gradient: false }), [0, 0.07, 0.137 * s.bulk + 0.012]));
  }
  if (s.apron) {
    core.push(tube(torsoPath(s, 0.8, 1, 0.022, 0, 2), s.apron, { segs: 10, sq: 0.7, capStart: 'none', capEnd: 'none' }));
    detail.push(strapHoop(shade(s.apron, 0.8), 0, s));
  }
  if (top.trim != null) {
    detail.push(slab(0.035, 0.36, 0.012, top.trim, [0, 0.03, 0.118 * s.bulk + s.belly * 0.7], [-0.06, 0, 0]));
  }
  if (s.collar) {
    const c = s.collar;
    if (c.kind === 'fur') {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const big = c.big ? 1.5 : 1;
        core.push(ball(0.062 * big, c.color, [Math.sin(a) * 0.15 * s.shoulders * (c.big ? 1.2 : 1), 0.225 + Math.cos(a * 2) * 0.012, Math.cos(a) * 0.1 - 0.01], [1.15, 0.8, 1.1], { segs: 6, rings: 4, jitter: 0.14 }));
      }
    } else if (c.kind === 'high') {
      core.push(tube([[0, 0.225, -0.005, 0.085, 0.075], [0, 0.31, -0.012, 0.1, 0.085]], c.color, { segs: 8, caps: 'none' }));
    } else if (c.kind === 'cowl') {
      core.push(tube([[0, 0.17, 0, 0.2 * s.shoulders, 0.135], [0, 0.245, 0, 0.14, 0.11], [0, 0.29, -0.005, 0.085, 0.08]], c.color, { segs: 9, caps: 'none' }));
    } else if (c.kind === 'feathers') {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const dir = [Math.sin(a), Math.cos(a)];
        const col = i % 3 === 0 ? 0x23232d : P.clothBlack;
        core.push(tube([[dir[0] * 0.1, 0.25, dir[1] * 0.07, 0.03, 0.012], [dir[0] * 0.27 * s.shoulders, 0.16, dir[1] * 0.19, 0.034, 0.01], [dir[0] * 0.33 * s.shoulders, 0.06, dir[1] * 0.23, 0.006, 0.004]], col, { segs: 4, flat: true }));
      }
    }
  }
  if (s.chain != null) detail.push(xf(hoop(0.13, 0.011, s.chain, [0, 0, 0], [HALF_PI, 0, 0], { metal: 1, segs: 12, tubeSegs: 4 }), [0, 0.14, 0.03], [0.75, 0, 0], [1, 1, 0.85]));
  if (s.strap) {
    detail.push(strapHoop(s.strap.color, s.strap.tilt ?? 0.72, s));
    if (s.strap.vials) {
      for (let i = 0; i < 4; i++) {
        const t = (i - 1.5) * 0.065;
        detail.push(rod(0.014, 0.014, 0.06, i % 2 ? P.crystal : P.amber, [t, 0.05 + t * 0.9, 0.125 * s.bulk + 0.012 - Math.abs(t) * 0.12], [0, 0, 0.7], { segs: 5 }));
      }
    }
    if (s.strap.cross) detail.push(strapHoop(s.strap.color, -(s.strap.tilt ?? 0.72), s));
  }
  const back = s.back;
  if (back) {
    if (back.kind === 'quiver') core.push(quiverGeos(back.color));
    if (back.kind === 'sack') {
      core.push(ball(0.2, back.color ?? P.canvas, [0.02, 0.04, -0.24], [1, 1.25, 0.85], { jitter: 0.06 }));
      core.push(ball(0.05, shade(back.color ?? P.canvas, 0.8), [0.02, 0.3, -0.22], [1, 0.8, 1], { segs: 5, rings: 4 }));
    }
    if (back.kind === 'pack') {
      core.push(slab(0.3, 0.34, 0.16, back.color ?? P.leather, [0, 0.04, -0.2], [0, 0, 0], { gradient: [0.75, 1.05] }));
      core.push(tube([[-0.17, 0.23, -0.2, 0.05], [0.17, 0.23, -0.2, 0.05]], P.canvas, { segs: 6 }));
      if (back.gears) {
        detail.push(rod(0.07, 0.07, 0.03, P.bronze, [0.09, 0.04, -0.29], [HALF_PI, 0, 0], { metal: 1, segs: 8 }));
        detail.push(rod(0.045, 0.045, 0.03, P.copper, [-0.07, -0.03, -0.29], [HALF_PI, 0, 0], { metal: 1, segs: 8 }));
      }
    }
    if (back.kind === 'banner') {
      core.push(rod(0.012, 0.014, 1.15, P.woodDark, [0.06, 0.45, -0.15]));
      core.push(sheet(3, 3, (u, v) => [0.07 + (u * 0.5 + 0.5) * (0.4 - v * 0.12 * (1 + u)), 1.0 - v * 0.42 - (u > 0.5 ? v * 0.08 : 0), -0.15 + Math.sin(u * 3 + v * 2) * 0.02], back.color ?? P.banditRed, { jitter: 0.08 }));
      core.push(xf(sheet(3, 3, (u, v) => [0.07 + (u * 0.5 + 0.5) * (0.4 - v * 0.12 * (1 + u)), 1.0 - v * 0.42 - (u > 0.5 ? v * 0.08 : 0), -0.152 + Math.sin(u * 3 + v * 2) * 0.02], shade(back.color ?? P.banditRed, 0.8)), [0, 0, 0], [0, 0, 0], [1, 1, 1]));
    }
    if (back.kind === 'trophies') {
      for (let i = 0; i < 3; i++) core.push(ball(0.05, P.bone, [-0.1 + i * 0.1, 0.02 - (i % 2) * 0.05, -0.15], [0.9, 1.1, 1], { segs: 6, rings: 4 }));
    }
  }
  if (s.extra && s.extra.chest) core.push(s.extra.chest);
  return part(core, detail, { name: 'chest' });
}

function buildPelvis(s) {
  const b = s.bulk;
  const hw = s.hips * (s.female ? 1.08 : 1);
  const skirt = s.top.skirt || 0;
  const upper = skirt > 0 ? s.top.color : s.legs.color;
  const core = [
    tube([[0, -0.14, 0, 0.118 * b * hw, 0.098 * b], [0, -0.06, 0, 0.156 * b * hw, 0.117 * b], [0, 0.05, 0, 0.148 * b + s.belly * 0.5, 0.112 * b + s.belly], [0, 0.14, 0, 0.138 * b + s.belly * 0.5, 0.102 * b + s.belly]],
      s.legs.color, { segs: 10, sq: 0.86, colors: [s.legs.color, s.legs.color, upper, upper], gradient: [0.8, 1] }),
  ];
  const detail = [];
  const bz = 0.124 * b + s.belly;
  if (skirt > 0) {
    const col = s.top.skirtColor ?? shade(s.top.color, 0.93);
    core.push(tube([[0, 0.04, 0, 0.158 * b + s.belly * 0.5, 0.12 * b + s.belly * 0.9], [0, -skirt * 0.5, 0, (0.166 + skirt * 0.12) * b * hw, (0.128 + skirt * 0.17) * b], [0, -skirt, 0.004, (0.172 + skirt * 0.22) * b * hw, (0.134 + skirt * 0.3) * b]],
      col, { segs: 10, caps: 'none', sq: 0.92, gradient: [0.68, 1.02], jitter: s.top.kind === 'rags' ? 0.1 : 0.02 }));
  }
  if (s.mailSkirt) {
    const len = s.mailSkirt.len ?? 0.2;
    core.push(tube([[0, 0.04, 0, 0.163 * b, 0.125 * b + s.belly], [0, -len, 0, (0.185 + len * 0.2) * b * hw, (0.145 + len * 0.3) * b]], s.mailSkirt.color, { segs: 10, caps: 'none', metal: s.mailSkirt.metal ?? 0.55, jitter: 0.05, gradient: [0.7, 1.05] }));
  }
  core.push(tube([[0, 0.03, 0, 0.166 * b + s.belly * 0.5, bz + 0.004], [0, 0.078, 0, 0.162 * b + s.belly * 0.5, bz]], s.belt.color, { segs: 10, caps: 'none', gradient: false }));
  detail.push(slab(0.05, 0.05, 0.016, s.belt.buckle, [0, 0.054, bz + 0.008], [0, 0, 0], { metal: 1 }));
  if (s.belt.sash != null) {
    core.push(tube([[0, 0.02, 0, 0.17 * b, bz + 0.008], [0, 0.1, 0, 0.165 * b, bz + 0.004]], s.belt.sash, { segs: 10, caps: 'none' }));
    core.push(slab(0.07, 0.3, 0.014, shade(s.belt.sash, 0.9), [0.1 * b, -0.1, bz * 0.72], [-0.12, 0, 0.1]));
  }
  for (let i = 0; i < s.belt.pouches; i++) {
    const side = i % 2 ? -1 : 1;
    const a = side * (0.9 + Math.floor(i / 2) * 0.75);
    detail.push(ball(0.045, s.belt.pouchColor ?? P.leather, [Math.sin(a) * 0.168 * b, 0.0, Math.cos(a) * (bz + 0.01)], [1, 1.15, 0.75], { segs: 6, rings: 4 }));
  }
  if (s.belt.satchel != null) {
    core.push(slab(0.07, 0.17, 0.2, s.belt.satchel, [-0.2 * b, -0.04, 0.0], [0, 0, 0.08], { gradient: [0.75, 1.05] }));
    detail.push(slab(0.075, 0.07, 0.205, shade(s.belt.satchel, 0.8), [-0.2 * b, 0.03, 0.0], [0, 0, 0.08]));
  }
  if (s.belt.tools) {
    detail.push(rod(0.01, 0.01, 0.2, P.wood, [0.17 * b, -0.06, 0.03], [0.2, 0, 0]));
    detail.push(slab(0.03, 0.04, 0.07, P.iron, [0.17 * b, -0.16, 0.01], [0.2, 0, 0], { metal: 1 }));
    detail.push(rod(0.008, 0.008, 0.16, P.iron, [0.13 * b, -0.05, 0.1], [0, 0, 0.1], { metal: 1 }));
  }
  if (s.tabard) {
    const len = s.tabard.len ?? 0.36;
    core.push(slab(0.2 * b, len, 0.014, s.tabard.color, [0, 0.03 - len / 2, bz + 0.012 + len * 0.1], [-0.2, 0, 0], { gradient: [0.75, 1] }));
    core.push(slab(0.2 * b, len, 0.014, s.tabard.color, [0, 0.03 - len / 2, -bz - 0.012 - len * 0.1], [0.2, 0, 0], { gradient: [0.75, 1] }));
  }
  if (s.apron) {
    const len = s.apronLen ?? 0.42;
    core.push(slab(0.3 * b, len, 0.014, s.apron, [0, 0.04 - len / 2, bz + 0.016 + len * 0.13], [-0.26, 0, 0], { gradient: [0.75, 1] }));
  }
  if (s.tassets) {
    for (const side of [1, -1]) core.push(slab(0.03, 0.2, 0.17, s.tassets, [side * 0.175 * b * hw, -0.07, 0], [0, 0, side * 0.16], { metal: 1, gradient: [0.75, 1.1] }));
  }
  if (s.extra && s.extra.pelvis) core.push(s.extra.pelvis);
  return part(core, detail, { name: 'pelvis' });
}

function buildUpperArm(s, side) {
  const b = Math.sqrt(s.bulk);
  const sl = s.sleeves;
  const bare = sl.kind === 'bare';
  const color = bare ? s.skin : sl.color;
  const metal = sl.kind === 'mail' ? 0.55 : sl.kind === 'plate' ? 1 : 0;
  const core = [tube([[0, 0.02, 0, 0.071 * b], [0, -0.11, 0, 0.065 * b], [0, -DIM.upper, 0, 0.054 * b]], color, { segs: 7, metal, capEnd: 'none' })];
  const pd = s.pauldrons;
  if (pd && (!pd.side || pd.side === side)) {
    const k = pd.size ?? 1;
    const metalP = pd.metal ?? 0;
    core.push(ball(0.088 * b * k, pd.color, [side * 0.012, 0.035, 0], [1.12, 0.78, 1.18], { metal: metalP, gradient: [0.7, 1.12], jitter: pd.fur ? 0.14 : 0 }));
    if (pd.layers) core.push(tube([[side * 0.01, -0.03, 0, 0.082 * b * k, 0.086 * b * k], [side * 0.014, -0.1, 0, 0.074 * b * k, 0.078 * b * k]], shade(pd.color, 0.88), { segs: 7, caps: 'none', metal: metalP }));
    if (pd.spike) core.push(tube([[side * 0.05, 0.08, 0, 0.022], [side * 0.11, 0.2, 0, 0.002]], P.bone, { segs: 5 }));
    if (pd.trim != null) core.push(xf(hoop(0.083 * b * k, 0.009, pd.trim, [0, 0, 0], [HALF_PI, 0, 0], { metal: 1, segs: 9, tubeSegs: 4 }), [side * 0.012, 0.012, 0], [0, 0, 0], [1.12, 1, 1.18]));
  }
  return part(core, null, { name: 'upperArm' });
}

function buildForearm(s, side) {
  const b = Math.sqrt(s.bulk);
  const sl = s.sleeves;
  const bareFore = sl.kind === 'bare' || sl.kind === 'short';
  const color = bareFore ? s.skin : sl.color;
  const metal = sl.kind === 'mail' ? 0.55 : sl.kind === 'plate' ? 1 : 0;
  const handCol = s.gloves ?? s.skin;
  const core = [
    tube([[0, 0.005, 0, 0.056 * b], [0, -0.1, 0, 0.054 * b], [0, -DIM.fore, 0, 0.042 * b]], color, { segs: 7, metal: bareFore ? 0 : metal, capEnd: 'none' }),
    tube([[0, -0.235, 0, 0.04, 0.035], [0, -0.3, 0.006, 0.055, 0.042], [0, -0.36, 0.018, 0.042, 0.035]], handCol, { segs: 7, gradient: [0.85, 1.02] }),
  ];
  const detail = [ball(0.024, handCol, [-side * 0.044, -0.285, 0.03], [1, 1.5, 1], { segs: 5, rings: 3 })];
  if (sl.kind === 'short') core.push(tube([[0, 0.02, 0, 0.063 * b], [0, -0.03, 0, 0.065 * b]], sl.color, { segs: 7, caps: 'none' }));
  if (sl.cuff != null) core.push(tube([[0, -0.19, 0, 0.053 * b], [0, -0.245, 0, 0.058 * b]], sl.cuff, { segs: 7, caps: 'none' }));
  if (s.bracers) {
    const br = s.bracers;
    core.push(tube([[0, -0.07, 0, 0.062 * b], [0, -0.23, 0, 0.051 * b]], br.color, { segs: 7, caps: 'none', metal: br.metal ?? 0, gradient: [0.8, 1.1] }));
  }
  return part(core, detail, { name: 'forearm' });
}

function buildThigh(s) {
  const b = Math.sqrt(s.bulk);
  const core = [tube([[0, 0.03, 0, 0.094 * b, 0.1 * b], [0, -0.16, 0.006, 0.09 * b], [0, -DIM.thigh, 0, 0.066 * b]], s.legs.color, { segs: 7, capEnd: 'none', gradient: [0.78, 1.02] })];
  if (s.greaves && s.greaves.thigh) core.push(tube([[0, -0.1, 0.014, 0.092 * b, 0.096 * b], [0, -0.34, 0.012, 0.077 * b]], s.greaves.color, { segs: 7, caps: 'none', metal: 1, gradient: [0.75, 1.1] }));
  return part(core, null, { name: 'thigh' });
}

function buildShin(s) {
  const b = Math.sqrt(s.bulk);
  const bt = s.boots;
  const core = [
    ball(0.07 * b, s.greaves ? s.greaves.color : s.legs.color, [0, 0, 0.008], [1, 1, 1], { segs: 7, rings: 5, metal: s.greaves ? 1 : 0 }),
    tube([[0, 0, 0, 0.068 * b], [0, -0.14, -0.014, 0.068 * b], [0, -DIM.shin, 0, 0.05 * b]], bt.tall ? bt.color : s.legs.color, { segs: 7, capEnd: 'none', colors: bt.tall ? null : [s.legs.color, s.legs.color, bt.color], gradient: [0.8, 1.02], metal: bt.metal }),
  ];
  if (bt.tall) core.push(tube([[0, -0.05, -0.004, 0.077 * b], [0, -0.085, -0.008, 0.075 * b]], shade(bt.color, 0.82), { segs: 7, caps: 'none' }));
  if (s.greaves) core.push(tube([[0, -0.05, 0.012, 0.072 * b], [0, -0.36, 0.01, 0.057 * b]], s.greaves.color, { segs: 7, caps: 'none', metal: 1, gradient: [0.75, 1.1] }));
  return part(core, null, { name: 'shin' });
}

function buildFoot(s) {
  const bt = s.boots;
  const k = Math.sqrt(s.bulk);
  const core = [tube([[0, -0.03, -0.068, 0.052 * k, 0.044], [0, -0.036, 0.055, 0.06 * k, 0.038], [0, -0.048, 0.175, 0.05 * k, 0.026]], bt.color, { segs: 7, sq: 0.85, gradient: [0.7, 1.02], metal: bt.metal })];
  return part(core, null, { name: 'foot' });
}

function hairGeos(s, covered) {
  const c = s.hair;
  const out = [];
  const style = s.hairStyle;
  if (style === 'bald') return out;
  const topCap = () => ball(0.122, c, [0, 0.15, -0.024], [1, 0.94, 1.04], { jitter: 0.04 });
  if (!covered) {
    if (style === 'balding') out.push(ball(0.118, c, [0, 0.118, -0.034], [1.02, 0.62, 0.98], { jitter: 0.05 }));
    else if (style === 'crop') out.push(ball(0.1185, c, [0, 0.148, -0.017], [1, 0.93, 1.03]));
    else out.push(topCap());
    if (style === 'bun') out.push(ball(0.052, c, [0, 0.235, -0.085], 1, { segs: 6, rings: 4 }));
    if (style === 'wild') {
      for (let i = 0; i < 5; i++) out.push(tube([[(i - 2) * 0.04, 0.23, -0.03, 0.03], [(i - 2) * 0.06, 0.29, -0.06 - (i % 2) * 0.03, 0.004]], c, { segs: 4 }));
    }
  }
  if (style === 'long') out.push(tube([[0, 0.15, -0.07, 0.108, 0.06], [0, 0.02, -0.088, 0.112, 0.05], [0, -0.09, -0.082, 0.09, 0.03]], c, { segs: 8, jitter: 0.05 }));
  if (style === 'bob') out.push(ball(0.126, c, [0, 0.115, -0.034], [1.04, 1.02, 0.95], { jitter: 0.04 }));
  if (style === 'tail') out.push(tube([[0, 0.19, -0.11, 0.035], [0, 0.1, -0.16, 0.03], [0, -0.04, -0.15, 0.012]], c, { segs: 5 }));
  if (style === 'braids') {
    for (const side of [1, -1]) out.push(tube([[side * 0.1, 0.1, 0.0, 0.026], [side * 0.11, -0.03, 0.04, 0.022], [side * 0.1, -0.13, 0.06, 0.012]], c, { segs: 5 }));
  }
  return out;
}

function beardGeos(s) {
  const c = s.beardColor ?? s.hair;
  switch (s.beard) {
    case 'stubble':
      return [ball(0.078, mix(s.skin, c, 0.4), [0, 0.062, 0.03], [0.98, 0.82, 0.93])];
    case 'short':
      return [ball(0.08, c, [0, 0.058, 0.03], [1, 0.86, 0.96], { jitter: 0.05 }), slab(0.075, 0.016, 0.02, c, [0, 0.087, 0.098])];
    case 'full':
      return [tube([[0, 0.085, 0.025, 0.09, 0.075], [0, 0.0, 0.05, 0.075, 0.055], [0, -0.085, 0.06, 0.03, 0.02]], c, { segs: 7, jitter: 0.06 }), slab(0.085, 0.018, 0.022, c, [0, 0.088, 0.1])];
    case 'mustache':
      return [tube([[-0.05, 0.068, 0.092, 0.006], [-0.02, 0.085, 0.108, 0.014], [0.02, 0.085, 0.108, 0.014], [0.05, 0.068, 0.092, 0.006]], c, { segs: 5 })];
    case 'goatee':
      return [tube([[0, 0.05, 0.085, 0.03, 0.02], [0, -0.03, 0.09, 0.008]], c, { segs: 5 }), slab(0.07, 0.014, 0.02, c, [0, 0.087, 0.1])];
    default:
      return [];
  }
}

function buildHead(s) {
  const skin = s.skin;
  const hatKind = s.hat ? s.hat.kind : null;
  const covered = hatKind && COVERING_HATS.has(hatKind);
  const jawK = s.female ? 0.9 : 1;
  const core = [
    ball(0.112, skin, [0, 0.13, 0], [0.95, 1.08, 1.02], { segs: 10, rings: 8, gradient: [0.88, 1.03] }),
    ball(0.078, skin, [0, 0.066, 0.028], [0.96 * jawK, 0.82, 0.92], { segs: 8, rings: 6, gradient: [0.84, 1] }),
    tube([[0, 0.14, 0.098, 0.011], [0, 0.103, 0.125, 0.02], [0, 0.086, 0.108, 0.017]], shade(skin, 0.96), { segs: 5, gradient: false }),
    hairGeos(s, covered),
    beardGeos(s),
  ];
  if (hatKind) core.push(hatGeos(hatKind, s.hat));
  const detail = [];
  const brow = s.browColor ?? shade(s.hair, 0.8);
  for (const side of [1, -1]) {
    if (s.eyePatch !== side) {
      detail.push(ball(0.017, 0xe9e2d0, [side * 0.042, 0.136, 0.093], [1, 0.72, 0.6], { segs: 6, rings: 4, gradient: false }));
      detail.push(ball(0.0095, s.eyes ?? 0x2b2620, [side * 0.042, 0.135, 0.103], [1, 1, 0.6], { segs: 5, rings: 3, gradient: false }));
    }
    detail.push(slab(0.044, 0.011, 0.016, brow, [side * 0.043, 0.16, 0.099], [0, 0, -side * (s.stern ? 0.3 : 0.1)]));
    detail.push(ball(0.026, shade(skin, 0.94), [side * 0.107, 0.125, 0.0], [0.5, 1, 0.8], { segs: 5, rings: 4 }));
  }
  if (s.beard === 'none' || s.beard === 'stubble' || s.beard === 'mustache') detail.push(slab(0.044, 0.007, 0.01, shade(skin, 0.6), [0, 0.066, 0.099]));
  if (s.eyePatch) {
    core.push(slab(0.05, 0.045, 0.012, P.clothBlack, [s.eyePatch * 0.042, 0.137, 0.104]));
    core.push(xf(hoop(0.116, 0.007, P.clothBlack, [0, 0, 0], [HALF_PI, 0, 0], { segs: 12, tubeSegs: 4 }), [0, 0.15, 0], [0, 0, -s.eyePatch * 0.3]));
  }
  if (s.mask != null) core.push(ball(0.086, s.mask, [0, 0.072, 0.03], [1, 0.84, 0.99], { jitter: 0.05 }));
  if (s.scar) detail.push(slab(0.008, 0.09, 0.008, 0x9a4a3c, [-0.05, 0.12, 0.1], [0, 0, 0.3]));
  if (s.extra && s.extra.head) core.push(s.extra.head);
  return part(core, detail, { name: 'head' });
}

function buildCloak(s, chest, list) {
  const ck = s.cloak;
  const sw = s.shoulders * s.bulk;
  const len = ck.length ?? 0.95;
  const segs = ck.segs ?? 1;
  const side = ck.side ?? 0;
  const w0 = ck.width ?? 0.2;
  const zAt = v => -0.02 - 0.05 * v;
  const fn = (v0, v1) => (u, vv) => {
    const v = v0 + (v1 - v0) * vv;
    const w = (w0 + (ck.flare ?? 0.1) * v) * sw;
    const jag = ck.feathers && v > 0.98 ? Math.abs(Math.sin(u * 9)) * 0.1 : 0;
    return [u * w + side * 0.08, -(v - v0) * len - jag, zAt(v) - zAt(v0) + 0.085 * u * u * (1 - 0.5 * v)];
  };
  const joints = [];
  let parent = joint(chest, 0, 0.235, -0.1 * s.bulk - (s.collar ? 0.03 : 0), 'cloak0');
  for (let i = 0; i < segs; i++) {
    const v0 = i / segs;
    const v1 = (i + 1) / segs;
    const geos = [sheet(4, segs === 1 ? 4 : 2, fn(v0, v1), ck.color, { gradient: i === 0 && segs > 1 ? [0.85, 1.05] : [0.7, 1.02], jitter: ck.feathers ? 0.1 : 0.03 })];
    if (ck.feathers) {
      for (let k = 0; k < 5; k++) {
        const u = (k - 2) / 2.4;
        const p = fn(v0, v1)(u, 0.55);
        geos.push(tube([[p[0], p[1] + 0.16, p[2] - 0.012, 0.05, 0.006], [p[0], p[1] - 0.12, p[2] - 0.02, 0.012, 0.004]], k % 2 ? 0x24242e : 0x15151a, { segs: 4, flat: true }));
      }
    }
    const mesh = part(geos, null, { double: true, name: 'cloak' });
    mesh.userData.noStiff = true;
    parent.add(mesh);
    joints.push(parent);
    list.push(mesh);
    if (i < segs - 1) parent = joint(parent, 0, -len / segs, zAt(v1) - zAt(v0), 'cloak' + (i + 1));
  }
  return joints;
}

/**
 * Build the humanoid model.
 * @returns {{group:THREE.Group, body:THREE.Group, J:Object<string,THREE.Group>, sockets:object, cloak:THREE.Group[], spec:object, height:number, radius:number}}
 */
export function buildHumanoid(specIn) {
  const s = normSpec(specIn);
  const group = new THREE.Group();
  const scaler = joint(group, 0, 0, 0, 'scale');
  scaler.scale.setScalar(s.scale);
  const body = joint(scaler, 0, 0, 0, 'root');
  const J = {};
  J.pelvis = joint(body, 0, DIM.pelvisY, 0, 'pelvis');
  J.spine = joint(J.pelvis, 0, 0.09, 0, 'spine');
  J.chest = joint(J.spine, 0, 0.15, 0, 'chest');
  J.neck = joint(J.chest, 0, 0.285, 0.004, 'neck');
  J.head = joint(J.neck, 0, 0.06, 0.008, 'head');
  J.head.scale.setScalar(s.headScale);
  const shoulderX = 0.218 * s.shoulders * s.bulk;
  const hipX = DIM.hipX * s.hips * Math.sqrt(s.bulk);
  for (const [tag, side] of [['L', 1], ['R', -1]]) {
    J['arm' + tag] = joint(J.chest, side * shoulderX, 0.208, 0, 'arm' + tag);
    J['fore' + tag] = joint(J['arm' + tag], 0, -DIM.upper, 0, 'fore' + tag);
    J['hand' + tag] = joint(J['fore' + tag], 0, -DIM.fore - DIM.hand, 0.012, 'hand' + tag);
    J['thigh' + tag] = joint(J.pelvis, side * hipX, -DIM.hipDrop, 0, 'thigh' + tag);
    J['shin' + tag] = joint(J['thigh' + tag], 0, -DIM.thigh, 0, 'shin' + tag);
    J['foot' + tag] = joint(J['shin' + tag], 0, -DIM.shin, 0, 'foot' + tag);
    J['arm' + tag].add(buildUpperArm(s, side));
    J['fore' + tag].add(buildForearm(s, side));
    J['thigh' + tag].add(buildThigh(s));
    J['shin' + tag].add(buildShin(s));
    J['foot' + tag].add(buildFoot(s));
  }
  J.pelvis.add(buildPelvis(s));
  J.chest.add(buildChest(s));
  J.head.add(buildHead(s));
  for (const tag of ['L', 'R']) {
    stiffLimb(J['arm' + tag]);
    stiffLimb(J['thigh' + tag]);
  }
  const cloakMeshes = [];
  const cloak = s.cloak ? buildCloak(s, J.chest, cloakMeshes) : [];
  // sockets
  const shieldL = joint(J.foreL, 0.058, -0.13, 0.0, 'shieldL');
  shieldL.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
  const sockets = {
    handR: J.handR,
    handL: J.handL,
    back: joint(J.chest, 0, 0.1, -0.15 * s.bulk, 'back'),
    head: joint(J.head, 0, 0.26, 0, 'headTop'),
    shieldL,
  };
  J.handR.rotation.x = HALF_PI;
  J.handL.rotation.x = HALF_PI;
  return {
    group, scaler, body, J, sockets, cloak, spec: s,
    shoulderX, hipX,
    height: (1.56 + 0.26 * s.headScale) * s.scale,
    radius: 0.36 * s.scale * Math.max(1, s.bulk),
  };
}

