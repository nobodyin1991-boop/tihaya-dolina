// Species table for the quadruped rig. Proportions in metres; every species is its own silhouette, not a recolour.
import { makeRng } from '../core/noise.js';
import { buildQuadruped } from './quadruped-rig.js';
import { createQuadrupedActor } from './quadruped-anim.js';
import { shade } from './rig.js';

const WOLF = {
  hs: 0.78, hh: 0.73, len: 0.76, chest: [0.15, 0.2], belly: [0.12, 0.14], rump: [0.132, 0.16],
  neck: { len: 0.3, r: [0.11, 0.085], pitch: 0.55 }, head: { r: [0.088, 0.086, 0.105], snout: [0.18, 0.046] },
  ears: { kind: 'point', size: 0.085 }, tail: { kind: 'bushy', len: 0.5, r: 0.055, segs: 2, pitch: -1.05 },
  leg: { rF: 0.04, rH: 0.044, pawR: 0.052 },
  col: { body: 0x77726a, belly: 0xb4ac9c, dark: 0x4c4842, leg: 0x8a8478, snout: 0xa8a092, eye: 0xd8a030 },
  speed: { walk: 1.6, run: 8 }, fangs: 1.0, idle: 'sniff', lunge: 0.4,
};

const BOAR = {
  hs: 0.74, hh: 0.62, len: 0.8, chest: [0.2, 0.25], belly: [0.19, 0.21], rump: [0.16, 0.19], hump: 0.85,
  neck: { len: 0.16, r: [0.17, 0.135], pitch: 0.02, y: 0.1 }, head: { r: [0.115, 0.118, 0.14], snout: [0.25, 0.062], snoutDrop: 0.3 },
  ears: { kind: 'point', size: 0.07 }, tail: { kind: 'thin', len: 0.2, r: 0.014, segs: 1, pitch: -0.3 },
  leg: { rF: 0.036, rH: 0.04, paw: 'hoof', pawR: 0.04, shoulder: 2.6, haunch: 2.8 },
  col: { body: 0x4e4238, belly: 0x6a5a4a, dark: 0x2e2822, leg: 0x2e2822, snout: 0x5a4a40, nose: 0x8a6a62, eye: 0x1a1210 },
  ridge: { color: 0x241e1a, h: 0.1, n: 9 }, tusks: 0.9, speed: { walk: 1.4, run: 9 }, idle: 'graze', grazeReach: 0.5, lunge: 0.45,
};

/** Every quadruped species. Pinned creature ids + `horse`, `draft_horse`, `ox` for mounts and the wagon. */
export const SPECIES = {
  rabbit: {
    hs: 0.2, hh: 0.25, len: 0.22, chest: [0.058, 0.07], belly: [0.068, 0.08], rump: [0.078, 0.092],
    neck: { len: 0.045, r: [0.045, 0.04], pitch: 0.75 }, head: { r: [0.043, 0.046, 0.052], snout: [0.034, 0.021] },
    ears: { kind: 'long', size: 0.125 }, tail: { kind: 'stub', len: 0.04, r: 0.03, tip: 0xf0ece0, y: 0.2 },
    leg: { rF: 0.014, rH: 0.02, pawR: 0.02, haunch: 3.4 },
    col: { body: 0x9a8468, belly: 0xdcd0b8, dark: 0x8a7458, nose: 0x8a5a50 },
    speed: { walk: 1.0, run: 7 }, gait: 'hop', idle: 'graze', grazeReach: 0.25, hindSet: 0.1,
  },
  deer: {
    hs: 1.0, hh: 1.04, len: 0.9, chest: [0.155, 0.22], belly: [0.14, 0.175], rump: [0.155, 0.21],
    neck: { len: 0.46, r: [0.095, 0.065], pitch: 1.0 }, head: { r: [0.07, 0.075, 0.09], snout: [0.165, 0.036] },
    ears: { kind: 'point', size: 0.1 }, tail: { kind: 'stub', len: 0.07, r: 0.04, tip: 0xf0ece0 },
    leg: { rF: 0.027, rH: 0.031, paw: 'hoof', pawR: 0.03, haunch: 3.0, shoulder: 2.2 },
    col: { body: 0x9a6a42, belly: 0xdccbaa, dark: 0x7a5232, leg: 0x6e4c32, snout: 0x5a4030 },
    antlers: { kind: 'branch', size: 0.72 }, speed: { walk: 1.5, run: 11 }, idle: 'graze', grazeReach: 0.9,
  },
  elk: {
    hs: 1.78, hh: 1.6, len: 1.5, chest: [0.3, 0.42], belly: [0.27, 0.33], rump: [0.255, 0.33], hump: 0.95,
    neck: { len: 0.62, r: [0.18, 0.13], pitch: 0.42 }, head: { r: [0.115, 0.125, 0.17], snout: [0.36, 0.08], snoutDrop: 0.35, pitch: 0.2 },
    ears: { kind: 'point', size: 0.13 }, tail: { kind: 'stub', len: 0.08, r: 0.05 },
    leg: { rF: 0.052, rH: 0.058, paw: 'hoof', pawR: 0.065, haunch: 2.8, shoulder: 2.3 },
    col: { body: 0x4a3a2c, belly: 0x3a2e24, dark: 0x3a2c20, leg: 0x94846e, snout: 0x6a5846 },
    antlers: { kind: 'palm', size: 1.3, color: 0xb8a684 }, dewlap: 0x3a2e24, speed: { walk: 1.6, run: 10 }, idle: 'graze', grazeReach: 0.8, bellyAmount: 0.5,
  },
  sheep: {
    hs: 0.66, hh: 0.66, len: 0.6, chest: [0.15, 0.18], belly: [0.16, 0.18], rump: [0.16, 0.18], wool: 0xd9d3c0,
    neck: { len: 0.17, r: [0.085, 0.07], pitch: 0.5 }, head: { r: [0.06, 0.066, 0.076], snout: [0.1, 0.036] },
    ears: { kind: 'droop', size: 0.06 }, tail: { kind: 'stub', len: 0.06, r: 0.045, tip: 0xd9d3c0 },
    leg: { rF: 0.022, rH: 0.024, paw: 'hoof', pawR: 0.026 },
    col: { body: 0xcfc8b4, belly: 0xcfc8b4, dark: 0x3a3430, leg: 0x3a3430, head: 0x3a3430, snout: 0x3a3430, neck: 0xd9d3c0 },
    speed: { walk: 1.0, run: 6 }, idle: 'graze', grazeReach: 0.8, bellyAmount: 0,
  },
  goat: {
    hs: 0.7, hh: 0.68, len: 0.62, chest: [0.12, 0.165], belly: [0.118, 0.15], rump: [0.112, 0.15],
    neck: { len: 0.23, r: [0.068, 0.052], pitch: 0.9 }, head: { r: [0.055, 0.06, 0.07], snout: [0.11, 0.03] },
    ears: { kind: 'droop', size: 0.055 }, tail: { kind: 'stub', len: 0.06, r: 0.028, y: 0.8 },
    leg: { rF: 0.022, rH: 0.025, paw: 'hoof', pawR: 0.026 },
    col: { body: 0xb8ae98, belly: 0xd8d0be, dark: 0x6a5e50, leg: 0x5a5046, snout: 0x8a8070 },
    horns: { kind: 'back', size: 1.1 }, beard: 0.1, stripe: 0x6a5e50, speed: { walk: 1.2, run: 8 }, idle: 'graze', grazeReach: 0.7,
  },
  fox: {
    hs: 0.38, hh: 0.36, len: 0.42, chest: [0.072, 0.09], belly: [0.062, 0.072], rump: [0.068, 0.084],
    neck: { len: 0.15, r: [0.056, 0.045], pitch: 0.6 }, head: { r: [0.052, 0.05, 0.06], snout: [0.1, 0.022] },
    ears: { kind: 'point', size: 0.068 }, tail: { kind: 'bushy', len: 0.44, r: 0.056, segs: 2, pitch: -0.75, tip: 0xf0ece0 },
    leg: { rF: 0.018, rH: 0.02, pawR: 0.024 },
    col: { body: 0xb9622c, belly: 0xece2cc, dark: 0x8a4420, leg: 0x2a221c, snout: 0xe6dcc8, ear: 0x2a221c, tail: 0xb9622c },
    speed: { walk: 1.4, run: 9 }, fangs: 0.8, idle: 'sniff',
  },
  badger: {
    hs: 0.3, hh: 0.3, len: 0.5, chest: [0.115, 0.115], belly: [0.13, 0.118], rump: [0.125, 0.118], legSpread: 0.75,
    neck: { len: 0.1, r: [0.085, 0.07], pitch: 0.12, y: 0.0 }, head: { r: [0.06, 0.056, 0.076], snout: [0.095, 0.03] },
    ears: { kind: 'round', size: 0.024 }, tail: { kind: 'bushy', len: 0.16, r: 0.04, segs: 1, pitch: -0.5 },
    leg: { rF: 0.03, rH: 0.032, pawR: 0.04, kF: 0.56 },
    col: { body: 0x76746c, belly: 0x2a2826, dark: 0x2a2826, leg: 0x201e1c, head: 0x24221f, snout: 0x24221f, neck: 0x55534d },
    faceStripe: 0xece8dc, stripe: 0xb8b4a8, speed: { walk: 0.9, run: 5 }, fangs: 0.7, idle: 'sniff', bellyAmount: 1,
  },
  boar: BOAR,
  thorn_boar: {
    ...BOAR, scale: 1.34, tusks: 1.45,
    col: { ...BOAR.col, body: 0x3c3832, belly: 0x4a4038, eye: 0xb03020 },
    ridge: { color: 0x1c1816, h: 0.12, n: 9 }, spikes: { color: 0xbcae8c, n: 11, size: 0.2 },
  },
  wolf: WOLF,
  alpha_wolf: {
    ...WOLF, scale: 1.24, chest: [0.165, 0.215],
    col: { ...WOLF.col, body: 0x55514c, belly: 0x77726a, dark: 0x302e2c, leg: 0x5c5852, snout: 0x6a665e, eye: 0xe8a020, tail: 0x302e2c },
    mane: { color: 0x26242a, size: 1.5 }, scars: true, fangs: 1.3,
  },
  frost_wolf: {
    ...WOLF, scale: 1.1,
    col: { body: 0xdde5ea, belly: 0xf4f7f8, dark: 0xb9c7d0, leg: 0xe6ecef, snout: 0xf0f4f5, eye: 0x7fc8e8, tail: 0xcfdbe2 },
    crest: { color: 0xbfe6f2, n: 7, size: 0.11 }, tail: { ...WOLF.tail, tip: 0xbfe6f2 },
  },
  lynx: {
    hs: 0.56, hh: 0.61, len: 0.58, chest: [0.1, 0.13], belly: [0.092, 0.11], rump: [0.105, 0.13],
    neck: { len: 0.14, r: [0.078, 0.066], pitch: 0.7 }, head: { r: [0.072, 0.07, 0.076], snout: [0.05, 0.03] },
    ears: { kind: 'point', size: 0.062, tuft: true }, tail: { kind: 'stub', len: 0.1, r: 0.03, tip: 0x1c1a18 },
    leg: { rF: 0.03, rH: 0.036, pawR: 0.05 },
    col: { body: 0xa8875a, belly: 0xe4d8c0, dark: 0x8a6c44, leg: 0xb49466, snout: 0xe4d8c0, nose: 0x8a5a50, eye: 0xc8b040 },
    ruff: 0xdcd0b8, speed: { walk: 1.4, run: 9 }, fangs: 0.8, swipe: true, idle: 'sniff',
  },
  shadow_cat: {
    hs: 0.84, hh: 0.82, len: 1.0, chest: [0.14, 0.18], belly: [0.118, 0.14], rump: [0.138, 0.17],
    neck: { len: 0.22, r: [0.105, 0.088], pitch: 0.42 }, head: { r: [0.094, 0.088, 0.1], snout: [0.085, 0.042] },
    ears: { kind: 'point', size: 0.055 }, tail: { kind: 'thin', len: 0.95, r: 0.032, segs: 3, pitch: -1.15, curl: 0.3 },
    leg: { rF: 0.044, rH: 0.05, pawR: 0.062 },
    col: { body: 0x1e1e25, belly: 0x2a2a33, dark: 0x141418, leg: 0x1a1a20, snout: 0x24242c, nose: 0x0c0c0e },
    glowEyes: 0xa8f060, speed: { walk: 1.6, run: 10 }, fangs: 1.4, swipe: true, idle: 'sniff', lunge: 0.45, jitter: 0.02,
  },
  bear: {
    hs: 1.2, hh: 1.08, len: 1.2, chest: [0.33, 0.38], belly: [0.33, 0.35], rump: [0.31, 0.35], hump: 0.9,
    neck: { len: 0.26, r: [0.24, 0.2], pitch: 0.22, y: 0.1 }, head: { r: [0.17, 0.16, 0.19], snout: [0.17, 0.075] },
    ears: { kind: 'round', size: 0.055 }, tail: { kind: 'stub', len: 0.08, r: 0.06 },
    leg: { rF: 0.1, rH: 0.105, pawR: 0.13, shoulder: 1.9, haunch: 2.2 },
    col: { body: 0x4e3a28, belly: 0x5a4430, dark: 0x3a2a1c, leg: 0x3e2e20, snout: 0x8e7250, paw: 0x2a1e16 },
    speed: { walk: 1.2, run: 8 }, fangs: 0.8, swipe: true, rears: true, idle: 'sniff', lunge: 0.3, jitter: 0.06,
  },
  horse: {
    hs: 1.56, hh: 1.56, len: 1.15, chest: [0.26, 0.35], belly: [0.26, 0.31], rump: [0.27, 0.34],
    neck: { len: 0.72, r: [0.18, 0.115], pitch: 0.95 }, head: { r: [0.1, 0.11, 0.14], snout: [0.3, 0.07], snoutDrop: 0.3, pitch: 0.55 },
    ears: { kind: 'point', size: 0.085 }, tail: { kind: 'horse', len: 0.8, r: 0.055, segs: 2, pitch: -1.3, curl: -0.1 },
    leg: { rF: 0.044, rH: 0.05, paw: 'hoof', pawR: 0.06, haunch: 3.2, shoulder: 2.6 },
    col: { body: 0x7a5234, belly: 0x86603e, dark: 0x2a201a, leg: 0x32261e, snout: 0x4a3626, tail: 0x221a16 },
    neckMane: { color: 0x221a16, h: 0.13 }, speed: { walk: 1.7, run: 12 }, idle: 'none', bellyAmount: 0.4, headLevel: 0.55,
  },
  ox: {
    hs: 1.45, hh: 1.38, len: 1.35, chest: [0.35, 0.42], belly: [0.36, 0.4], rump: [0.33, 0.38], hump: 0.75,
    neck: { len: 0.36, r: [0.25, 0.2], pitch: 0.12, y: 0.15 }, head: { r: [0.15, 0.15, 0.18], snout: [0.25, 0.1], snoutDrop: 0.25 },
    ears: { kind: 'droop', size: 0.085 }, tail: { kind: 'tuft', len: 0.85, r: 0.022, segs: 2, pitch: -1.45, curl: 0 },
    leg: { rF: 0.068, rH: 0.072, paw: 'hoof', pawR: 0.085, haunch: 2.4, shoulder: 2.2 },
    col: { body: 0x8a6444, belly: 0xb09472, dark: 0x5a4030, leg: 0x6a4c34, snout: 0xc8b494, nose: 0x4a3830, tail: 0x3a2a20 },
    horns: { kind: 'wide', size: 1.0, color: 0xd8ccb0 }, dewlap: 0x9a7a58, speed: { walk: 1.3, run: 6 }, idle: 'none', bellyAmount: 0.6,
  },
};
SPECIES.draft_horse = {
  ...SPECIES.horse, chest: [0.3, 0.38], belly: [0.3, 0.35], rump: [0.31, 0.37],
  neck: { len: 0.66, r: [0.21, 0.135], pitch: 0.8 },
  leg: { ...SPECIES.horse.leg, rF: 0.055, rH: 0.06, pawR: 0.075, feather: 0xd8ceb8 },
  col: { body: 0x5c4634, belly: 0x6a5240, dark: 0x1e1814, leg: 0x3a2c22, snout: 0xcfc4ae, tail: 0x1e1814 },
  speed: { walk: 1.4, run: 9 },
};

/** Pinned creature ids that use this rig. */
export const QUADRUPED_IDS = ['rabbit', 'deer', 'sheep', 'goat', 'fox', 'badger', 'boar', 'wolf', 'lynx', 'bear', 'alpha_wolf', 'frost_wolf', 'thorn_boar', 'elk', 'shadow_cat'];

function recolour(col, k) {
  const out = {};
  for (const key of Object.keys(col)) out[key] = key === 'eye' || key === 'nose' ? col[key] : shade(col[key], k);
  return out;
}

/**
 * Build a quadruped by species id.
 * opts: seed (size/colour variation), elite (bigger, darker, glowing amber eyes), scale, harness {color, blanket}, saddle {blanket}.
 */
export function createQuadruped(id, opts = {}) {
  const base = SPECIES[id] || SPECIES.wolf;
  const seed = (opts.seed ?? 1) >>> 0;
  const rng = makeRng(seed * 9781 + id.length * 31);
  const sp = { ...base, seed };
  let scale = (base.scale || 1) * (0.96 + rng() * 0.08) * (opts.scale || 1);
  let col = recolour(base.col, 0.94 + rng() * 0.12);
  if (opts.elite) {
    scale *= 1.18;
    col = recolour(col, 0.7);
    if (sp.glowEyes == null) sp.glowEyes = 0xffa028;
    if (sp.fangs) sp.fangs *= 1.25;
  }
  sp.scale = scale;
  sp.col = opts.col ? { ...col, ...opts.col } : col;
  if (opts.harness) sp.harness = opts.harness;
  if (opts.saddle) sp.saddle = opts.saddle;
  const actor = createQuadrupedActor(buildQuadruped(sp));
  actor.creatureId = id;
  return actor;
}
