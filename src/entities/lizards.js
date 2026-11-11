// Lizard rig: low sprawling body, lateral undulation, long tail chain, four IK legs with raised elbows.
// Species: lizard, stoneback (rock-armoured), ridge_drake (horse-sized, crested), marsh_lurker (toad-like, wide maw).
import * as THREE from 'three';
import { makeRng } from '../core/noise.js';
import { tube, ball, part, joint, stiffLimb, shade, tint, xf, compilePose, compileTrack, sampleTrack, trackWeight, gaitFoot, ik2, damp, lerp, smoothstep, clamp, makeLod, disposeActor } from './rig.js';

const LJ = ['root', 'rootPos', 'body', 'bodyPos', 'chest', 'hips', 'neck', 'head', 'jaw', 'tail', 'feet'];
const I = {};
for (const name of LJ) I[name] = LJ.indexOf(name) * 3;
const TWO_PI = Math.PI * 2;

const SPECIES = {
  lizard: {
    len: 0.5, w: 0.11, h: 0.075, bodyH: 0.17, neck: 0.1, neckPitch: 0.25, head: { len: 0.2, w: 0.07, h: 0.045 },
    tail: { len: 0.85, segs: 3 }, leg: { l1: 0.14, l2: 0.15, r: 0.028 }, sprawl: 0.14,
    col: { body: 0x5c6a3c, belly: 0xb8b078, dark: 0x3e4a2c, eye: 0xd8a030, mouth: 0x8a4a48 },
    spines: { color: 0x3a4428, h: 0.035 }, speed: { run: 6 }, teeth: 0.4,
  },
  stoneback: {
    len: 0.95, w: 0.36, h: 0.25, bodyH: 0.36, neck: 0.14, neckPitch: 0.1, head: { len: 0.34, w: 0.16, h: 0.11, beak: true },
    tail: { len: 0.9, segs: 2, club: true, r: 0.5 }, leg: { l1: 0.24, l2: 0.25, r: 0.075 }, sprawl: 0.16,
    col: { body: 0x5e584c, belly: 0x8a8068, dark: 0x45413a, eye: 0x1c1a16, mouth: 0x6a4a40 },
    plates: { color: 0x7d7b72, moss: 0x666a52 }, speed: { run: 3.5 }, strideK: 0.8,
  },
  ridge_drake: {
    len: 1.35, w: 0.25, h: 0.25, bodyH: 0.82, neck: 0.55, neckPitch: 0.75, head: { len: 0.52, w: 0.14, h: 0.11, horns: true },
    tail: { len: 2.0, segs: 4 }, leg: { l1: 0.5, l2: 0.52, r: 0.075 }, sprawl: 0.2,
    col: { body: 0x4a5a56, belly: 0xa89a70, dark: 0x34403e, eye: 0xf0b030, mouth: 0x8a3a34 },
    sail: { color: 0xa8562c, h: 0.34 }, speed: { run: 9 }, teeth: 1, upright: true,
  },
  marsh_lurker: {
    len: 0.7, w: 0.5, h: 0.36, bodyH: 0.4, neck: 0.02, neckPitch: 0.1, head: { len: 0.55, w: 0.48, h: 0.2, toad: true },
    tail: { len: 0.4, segs: 1, r: 0.6 }, leg: { l1: 0.3, l2: 0.3, r: 0.085, hind: 1.5 }, sprawl: 0.22,
    col: { body: 0x4a5632, belly: 0xa0a066, dark: 0x343e26, eye: 0xd8c84a, mouth: 0x7a3a44 },
    warts: 0x5e6a3a, speed: { run: 4 }, strideK: 0.9, lunge: 0.6,
  },
};

/** Pinned creature ids that use this rig. */
export const LIZARD_IDS = Object.keys(SPECIES);

function rock(r, color, pos, scale, rot = [0, 0, 0]) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  xf(g, pos, rot, scale);
  g.computeVertexNormals();
  return tint(g, color, { jitter: 0.1, gradient: [0.75, 1.1] });
}

function buildLizard(sp) {
  const C = sp.col;
  const group = new THREE.Group();
  const scaler = joint(group, 0, 0, 0, 'scale');
  scaler.scale.setScalar(sp.scale);
  const root = joint(scaler, 0, 0, 0, 'root');
  const body = joint(root, 0, sp.bodyH, 0, 'body');
  const { len, w, h } = sp;
  const chest = joint(body, 0, 0, len * 0.25, 'chest');
  const hips = joint(body, 0, 0, -len * 0.25, 'hips');
  const grad = [1.25, 0.9];
  const opts = { segs: 9, gradient: grad, jitter: 0.06, sq: 0.9 };
  const chestGeo = [tube([[0, 0, -len * 0.3, w, h], [0, 0.01, 0, w * 1.02, h * 1.04], [0, 0, len * 0.22, w * 0.9, h * 0.95], [0, h * 0.1, len * 0.3 + w * 0.3, w * 0.55, h * 0.6]], C.body, { ...opts, colors: [C.body, C.body, C.body, C.body] })];
  const hipsGeo = [tube([[0, 0, len * 0.3, w, h], [0, 0, 0, w * 0.98, h], [0, 0, -len * 0.22, w * 0.8, h * 0.85], [0, 0, -len * 0.3 - w * 0.3, w * 0.5, h * 0.6]], C.body, opts)];
  // belly tint: recolour downward-facing vertices
  for (const g of [chestGeo[0], hipsGeo[0]]) bellyTint(g, C.belly);
  const onBack = (t, fn) => { (t >= 0 ? chestGeo : hipsGeo).push(fn(t >= 0 ? t * len * 0.5 - len * 0.25 : t * len * 0.5 + len * 0.25)); };
  if (sp.spines) for (let i = 0; i < 10; i++) onBack(-0.95 + i * 0.2, z => tube([[0, h * 0.9, z, 0.012, 0.02], [0, h + sp.spines.h, z - 0.02, 0.002, 0.003]], sp.spines.color, { segs: 4, flat: true }));
  if (sp.sail) {
    for (let i = 0; i < 9; i++) {
      const t = -0.9 + i * 0.225;
      const hh = sp.sail.h * (0.45 + 0.55 * Math.sin((i / 8) * Math.PI));
      onBack(t, z => tube([[0, h * 0.85, z + 0.04, 0.016, 0.08], [0, h + hh * 0.6, z - 0.03, 0.01, 0.06], [0, h + hh, z - 0.1, 0.002, 0.004]], sp.sail.color, { segs: 4, flat: true, gradient: [0.7, 1.15] }));
    }
  }
  if (sp.plates) {
    for (let i = 0; i < 14; i++) {
      const row = i % 7;
      const side = i < 7 ? 1 : -1;
      const t = -0.85 + row * 0.28;
      const big = 0.55 + ((i * 7) % 5) * 0.08;
      onBack(t, z => rock(w * big, (i * 3) % 7 === 0 ? sp.plates.moss : sp.plates.color, [side * w * 0.42, h * 0.62, z], [1, 0.62, 1.1], [0.2 * side, i, 0.3 * side]));
    }
    for (let i = 0; i < 6; i++) onBack(-0.8 + i * 0.32, z => rock(w * 0.5, sp.plates.color, [0, h * 0.95, z], [1, 0.75, 1.15], [0, i * 1.3, 0]));
  }
  if (sp.warts != null) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI - Math.PI / 2;
      const t = -0.8 + ((i * 5) % 9) * 0.2;
      onBack(t, z => ball(w * (0.13 + (i % 3) * 0.04), sp.warts, [Math.sin(a) * w * 0.85, h * 0.25 + Math.cos(a) * h * 0.7, z], [1, 0.7, 1], { segs: 5, rings: 4, jitter: 0.08 }));
    }
  }
  chest.add(part(chestGeo, null, { name: 'chest' }));
  hips.add(part(hipsGeo, null, { name: 'hips' }));

  // neck + head + jaw
  const hd = sp.head;
  const neck = joint(chest, 0, h * 0.15, len * 0.28, 'neck');
  const nr = Math.min(w * 0.62, hd.w * 1.1);
  if (sp.neck > 0.05) {
    const ng = tube([[0, -0.01, -nr * 0.6, nr * 1.1, Math.min(h, nr) * 0.95], [0, 0, sp.neck * 0.5, nr * 0.9, nr * 0.8], [0, 0, sp.neck, hd.w * 0.85, hd.h * 0.95]], C.body, { segs: 8, gradient: grad, jitter: 0.06 });
    bellyTint(ng, C.belly);
    const neckGeo = [ng];
    if (sp.sail) for (let i = 0; i < 4; i++) neckGeo.push(tube([[0, nr * 0.7, sp.neck * (0.15 + i * 0.22), 0.012, 0.05], [0, nr * 0.7 + sp.sail.h * 0.4, sp.neck * (0.1 + i * 0.22) - 0.05, 0.002, 0.004]], sp.sail.color, { segs: 4, flat: true }));
    neck.add(part(neckGeo, null, { name: 'neck' }));
  }
  const head = joint(neck, 0, 0, sp.neck, 'head');
  const upper = tube([[0, 0, -hd.w * 0.4, hd.w * 0.85, hd.h], [0, hd.h * 0.15, hd.len * 0.3, hd.w, hd.h * 0.95], [0, 0, hd.len * 0.75, hd.w * (hd.toad ? 0.9 : 0.62), hd.h * 0.6], [0, -hd.h * 0.1, hd.len, hd.w * (hd.toad ? 0.6 : 0.36), hd.h * 0.35]], C.body, { segs: 8, gradient: [1.05, 0.92], jitter: 0.06, sq: 0.9 });
  const headGeo = [upper];
  const eyeY = hd.toad ? hd.h * 1.0 : hd.h * 0.62;
  const eyeX = hd.toad ? hd.w * 0.52 : hd.w * 0.74;
  const eyeR = hd.toad ? hd.w * 0.2 : hd.w * 0.22;
  for (const side of [1, -1]) {
    if (hd.toad) headGeo.push(ball(eyeR * 1.3, C.body, [side * eyeX, eyeY - eyeR * 0.4, hd.len * 0.3], 1, { segs: 6, rings: 4, jitter: 0.06 }));
    headGeo.push(ball(eyeR, C.eye, [side * eyeX, eyeY, hd.len * (hd.toad ? 0.34 : 0.36)], [0.8, 1, 1], { segs: 6, rings: 4, gradient: false }));
    headGeo.push(ball(eyeR * 0.45, 0x14120e, [side * (eyeX + eyeR * 0.5), eyeY + eyeR * 0.1, hd.len * (hd.toad ? 0.36 : 0.38) + eyeR * 0.4], [0.6, 1.3, 0.8], { segs: 5, rings: 3, gradient: false }));
    if (hd.horns) {
      headGeo.push(tube([[side * hd.w * 0.55, hd.h * 0.8, 0, 0.04], [side * hd.w * 1.0, hd.h * 1.9, -hd.len * 0.3, 0.025], [side * hd.w * 1.05, hd.h * 2.4, -hd.len * 0.62, 0.004]], 0xcbbd98, { segs: 5 }));
      headGeo.push(tube([[side * hd.w * 0.8, hd.h * 0.2, hd.len * 0.05, 0.03], [side * hd.w * 1.5, hd.h * 0.5, -hd.len * 0.2, 0.004]], 0xcbbd98, { segs: 5 }));
    }
    if (sp.teeth) {
      for (let i = 0; i < 4; i++) {
        const tz = hd.len * (0.5 + i * 0.13);
        const tx = side * hd.w * lerp(0.6, 0.3, i / 3);
        headGeo.push(tube([[tx, -hd.h * 0.35, tz, hd.h * 0.12], [tx, -hd.h * (0.35 + 0.45 * sp.teeth), tz, 0.002]], 0xe8e0c8, { segs: 4, gradient: false }));
      }
    }
  }
  if (hd.beak) headGeo.push(tube([[0, -hd.h * 0.1, hd.len * 0.8, hd.w * 0.42, hd.h * 0.42], [0, -hd.h * 0.55, hd.len * 1.08, 0.01, 0.01]], 0x3a362e, { segs: 5 }));
  if (hd.horns) headGeo.push(tube([[0, hd.h * 0.9, hd.len * 0.1, 0.02, 0.1], [0, hd.h * 1.6, -hd.len * 0.15, 0.004, 0.02]], sp.sail.color, { segs: 4, flat: true }));
  if (sp.plates) headGeo.push(rock(hd.w * 0.8, sp.plates.color, [0, hd.h * 0.8, hd.len * 0.2], [1, 0.5, 1.2]));
  head.add(part(headGeo, null, { name: 'head' }));
  const jaw = joint(head, 0, -hd.h * 0.45, -hd.w * 0.1, 'jaw');
  const jawGeo = [
    tube([[0, 0, -hd.w * 0.2, hd.w * 0.8, hd.h * 0.5], [0, -hd.h * (hd.toad ? 0.5 : 0.1), hd.len * 0.4, hd.w * 0.92, hd.h * (hd.toad ? 0.75 : 0.42)], [0, 0, hd.len * 0.98, hd.w * (hd.toad ? 0.58 : 0.33), hd.h * 0.25]], C.belly, { segs: 8, gradient: [1.0, 0.85], jitter: 0.05 }),
    xf(ball(1, C.mouth, [0, 0, 0], [hd.w * 0.7, hd.h * 0.12, hd.len * 0.42], { segs: 6, rings: 4, gradient: false }), [0, hd.h * 0.32, hd.len * 0.45]),
  ];
  jaw.add(part(jawGeo, null, { name: 'jaw' }));

  // tail chain along -z
  const tl = sp.tail;
  const tails = [];
  let parent = joint(hips, 0, 0, -len * 0.3, 'tail0');
  const segLen = tl.len / tl.segs;
  const r0 = w * (tl.r ?? 0.52);
  for (let i = 0; i < tl.segs; i++) {
    const ra = lerp(r0, r0 * 0.12, i / tl.segs);
    const rb = lerp(r0, r0 * 0.12, (i + 1) / tl.segs);
    const hk = Math.min(1, h / w + 0.25);
    const tg = tube([[0, 0, ra * 0.4, ra, ra * hk], [0, 0, -segLen * 0.5, (ra + rb) / 2, ((ra + rb) / 2) * hk], [0, 0, -segLen, rb, rb * hk]], C.body, { segs: 7, gradient: grad, jitter: 0.06 });
    bellyTint(tg, C.belly);
    const geo = [tg];
    if (sp.spines) for (let k = 0; k < 3; k++) geo.push(tube([[0, ra * hk * 0.8, -segLen * (k / 3), 0.01, 0.018], [0, ra * hk + sp.spines.h * (1 - i / tl.segs), -segLen * (k / 3) - 0.02, 0.002, 0.003]], sp.spines.color, { segs: 4, flat: true }));
    if (sp.sail && i < 3) for (let k = 0; k < 2; k++) geo.push(tube([[0, ra * hk * 0.8, -segLen * (k / 2), 0.012, 0.07], [0, ra * hk + sp.sail.h * 0.5 * (1 - i / 3), -segLen * (k / 2) - 0.08, 0.002, 0.004]], sp.sail.color, { segs: 4, flat: true }));
    if (tl.club && i === tl.segs - 1) geo.push(rock(w * 0.42, sp.plates.color, [0, 0, -segLen], [1, 0.8, 1.2]));
    if (sp.plates && i === 0) geo.push(rock(ra * 0.9, sp.plates.color, [0, ra * 0.5, -segLen * 0.4], [1, 0.6, 1.4]));
    const mesh = part(geo, null, { name: 'tail' });
    parent.add(mesh);
    tails.push(parent);
    if (i < tl.segs - 1) parent = joint(parent, 0, 0, -segLen, 'tail' + (i + 1));
  }

  // legs
  const legs = [];
  const lg = sp.leg;
  const makeLeg = (parentJ, zLocal, side, isFront) => {
    const k = !isFront && lg.hind ? lg.hind : 1;
    const l1 = lg.l1 * k;
    const l2 = lg.l2 * k;
    const r = lg.r * (k > 1 ? 1.25 : 1);
    const upper = joint(parentJ, side * w * 0.78, -h * 0.25, zLocal, 'legU');
    const lower = joint(upper, 0, -l1, 0, 'legL');
    upper.add(part([tube([[0, r * 0.5, 0, r * 1.5], [0, -l1 * 0.5, 0, r * 1.2], [0, -l1, 0, r * 0.9]], C.body, { segs: 6, jitter: 0.06 })]));
    const foot = [
      tube([[0, 0, 0, r * 0.95], [0, -l2 * 0.6, 0, r * 0.75], [0, -l2 + r * 0.4, 0, r * 0.7]], C.dark, { segs: 6, jitter: 0.06 }),
      ball(r * 1.3, C.dark, [0, -l2 + r * 0.35, r * 0.7], [1.2, 0.45, 1.5], { segs: 6, rings: 4 }),
    ];
    for (const cx of [-1, 0, 1]) foot.push(tube([[cx * r * 0.8, -l2 + r * 0.3, r * 1.8, r * 0.3], [cx * r * 1.1, -l2 + r * 0.1, r * 2.9, 0.004]], 0x2a261e, { segs: 4 }));
    lower.add(part(foot));
    stiffLimb(upper);
    const rest = new THREE.Vector3(side * (w * 0.78 + sp.sprawl * (k > 1 ? 1.25 : 1)), -sp.bodyH, zLocal + (isFront ? 0.04 : -0.04) * len);
    legs.push({ upper, lower, l1, l2, rest, side, isFront, parent: parentJ });
  };
  makeLeg(chest, len * 0.16, 1, true);
  makeLeg(chest, len * 0.16, -1, true);
  makeLeg(hips, -len * 0.14, 1, false);
  makeLeg(hips, -len * 0.14, -1, false);
  const totalLen = len + sp.neck + hd.len;
  return { group, scaler, root, body, chest, hips, neck, head, jaw, tails, legs, spec: sp, height: (sp.bodyH + h + (sp.upright ? Math.sin(sp.neckPitch) * sp.neck + hd.h : 0.05)) * sp.scale, radius: totalLen * 0.5 * sp.scale };
}

const _c = new THREE.Color();
function bellyTint(geo, bellyHex) {
  const nor = geo.attributes.normal;
  const col = geo.attributes.color;
  _c.set(bellyHex);
  for (let i = 0; i < col.count; i++) {
    const t = clamp((-nor.getY(i) - 0.1) / 0.5, 0, 1);
    col.setXYZ(i, col.getX(i) + (_c.r - col.getX(i)) * t, col.getY(i) + (_c.g - col.getY(i)) * t, col.getZ(i) + (_c.b - col.getZ(i)) * t);
  }
}

function defs(sp) {
  const lunge = sp.lunge ?? 0.4;
  const stances = {
    idle: { pose: {} },
    combat: { idle: 0.2, pose: { bodyPos: [0, 0.18, 0], body: [-0.1, 0, 0], neck: [-0.25, 0, 0], jaw: [0.35, 0, 0], tail: [0.2, 0, 0] } },
    sleep: { idle: 0, rate: 3, pose: { bodyPos: [0, -0.62, 0], neck: [0.3, 0.5, 0], tail: [0, 0.7, 0], feet: [0.4, 0, 0] } },
    dead: { idle: 0, rate: 5, dead: 1, pose: { root: [0, 0, 2.9], rootPos: [0, sp.h * 1.7, 0], bodyPos: [0, -0.9, 0], neck: [0.3, 0.4, 0], jaw: [0.6, 0, 0], tail: [0, 0.8, 0], feet: [-0.5, 0.5, 0] } },
  };
  const tracks = {
    bite: {
      dur: 0.6, strike: 0.5, fout: 0.35,
      keys: [
        [0, 'io', { bodyPos: [0, 0, 0], neck: [-0.15, 0, 0], head: [0, 0, 0], jaw: [0.2, 0, 0] }],
        [0.35, 'out', { bodyPos: [0, 0.05, -0.18], neck: [-0.35, 0, 0], head: [-0.15, 0, 0], jaw: [0.9, 0, 0] }],
        [0.5, 'in', { bodyPos: [0, -0.1, lunge], neck: [0.2, 0, 0], head: [0.1, 0, 0], jaw: [1.0, 0, 0] }],
        [0.58, 'snap', { jaw: [0, 0, 0], head: [0.1, 0, 0.3] }],
        [1, 'io', { bodyPos: [0, 0, lunge * 0.2], neck: [0, 0, 0], head: [0, 0, 0] }],
      ],
    },
    heavy: {
      dur: 1.0, strike: 0.55, fout: 0.3,
      keys: [
        [0, 'io', { body: [0, 0, 0], bodyPos: [0, 0, 0], tail: [0, 0, 0], neck: [0, 0, 0], jaw: [0.2, 0, 0] }],
        [0.38, 'out', { body: [0, -0.6, 0], bodyPos: [0, 0.1, -0.05], tail: [0.1, -0.9, 0], neck: [0, 0.5, 0], jaw: [0.5, 0, 0] }],
        [0.58, 'in', { body: [0, 0.9, 0.1], bodyPos: [0, 0, 0.1], tail: [0.15, 1.3, 0], neck: [0, -0.7, 0], jaw: [0.7, 0, 0] }],
        [0.75, 'out', { body: [0, 1.0, 0], tail: [0.1, 0.8, 0] }],
        [1, 'io', { body: [0, 0, 0], bodyPos: [0, 0, 0], tail: [0, 0, 0], neck: [0, 0, 0], jaw: [0, 0, 0] }],
      ],
    },
    charge: {
      dur: 1.0, strike: 0.5, fin: 0.2, fout: 0.25,
      keys: [
        [0, 'io', { bodyPos: [0, -0.15, 0], neck: [0.4, 0, 0], head: [0.2, 0, 0], jaw: [0.1, 0, 0] }],
        [0.55, 'io', { bodyPos: [0, -0.18, 0.15], neck: [0.5, 0, 0] }],
        [0.66, 'out', { bodyPos: [0, 0.1, 0.3], neck: [-0.3, 0, 0], head: [-0.3, 0, 0], jaw: [0.8, 0, 0] }],
        [1, 'io', { bodyPos: [0, 0, 0.05], neck: [0, 0, 0], head: [0, 0, 0], jaw: [0, 0, 0] }],
      ],
    },
    howl: {
      dur: 1.6, strike: 0.3, fin: 0.16, fout: 0.2,
      keys: [
        [0, 'io', { bodyPos: [0, 0.1, 0], neck: [-0.4, 0, 0], head: [-0.2, 0, 0], jaw: [0.3, 0, 0] }],
        [0.3, 'io', { bodyPos: [0, 0.22, 0], neck: [-0.7, 0.1, 0], head: [-0.4, 0, 0], jaw: [1.0, 0, 0] }],
        [0.8, 'io', { neck: [-0.7, -0.1, 0], jaw: [0.9, 0, 0] }],
        [1, 'io', { bodyPos: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], jaw: [0, 0, 0] }],
      ],
    },
    hit: {
      dur: 0.42, strike: 0.1, fin: 0.08, fout: 0.55,
      keys: [
        [0, 'io', { bodyPos: [0.05, -0.1, -0.15], body: [0, 0.15, 0.15], neck: [-0.2, 0.4, 0], jaw: [0.5, 0, 0] }],
        [1, 'io', { bodyPos: [0, 0, 0], body: [0, 0, 0], neck: [0, 0, 0], jaw: [0, 0, 0] }],
      ],
    },
  };
  return { stances, tracks };
}

const footOut = { z: 0, lift: 0, swing: 0 };
const _t = new THREE.Vector3();
const _pole = new THREE.Vector3();
const PH = [0, 0.5, 0.5, 0];

function createLizardActor(model) {
  const sp = model.spec;
  const n = LJ.length * 3;
  const cur = new Float32Array(n);
  const tgt = new Float32Array(n);
  const d = defs(sp);
  const stances = {};
  for (const key of Object.keys(d.stances)) stances[key] = { vals: compilePose(LJ, d.stances[key].pose), idle: d.stances[key].idle ?? 1, rate: d.stances[key].rate ?? 7, dead: d.stances[key].dead || 0 };
  const tracks = {};
  for (const key of Object.keys(d.tracks)) tracks[key] = compileTrack(LJ, d.tracks[key]);
  tracks.attack = tracks.bite;
  tracks.attack2 = tracks.bite;
  let stance = stances.idle;
  let stanceName = 'idle';
  let time = (sp.seed % 11) * 0.6;
  let phase = (sp.seed % 10) / 10;
  let moving = 0;
  let dead = 0;
  let overlay = null;
  let ot = 0;
  let odur = 1;
  let lod = 0;
  let frame = 0;
  let skipped = 0;
  let lookYaw = 0;
  let lookTarget = 0;
  let lookTimer = 2;
  const setLodMeshes = makeLod(model.group);
  const legReach = (sp.leg.l1 + sp.leg.l2);

  function update(dtIn, ctx) {
    let dt = dtIn;
    if (lod === 2) {
      skipped += dt;
      frame++;
      if (frame % 2) return;
      dt = skipped;
      skipped = 0;
    }
    dt = Math.min(dt, 0.1);
    time += dt;
    const speed = ((ctx && ctx.speed) || 0) / sp.scale;
    const turn = (ctx && ctx.turn) || 0;
    const a = clamp(speed / sp.speed.run, 0, 1.2);
    moving = damp(moving, smoothstep(0.02, 0.25, speed), 9, dt);
    dead = damp(dead, stance.dead, 5, dt);
    const duty = lerp(0.62, 0.42, a);
    const cycleLen = legReach * lerp(1.7, 4.2, a) * (sp.strideK || 1);
    phase += (speed * dt) / cycleLen;
    phase -= Math.floor(phase);
    const stride = Math.min(duty * cycleLen, legReach * 1.25);
    const wave = Math.sin(phase * TWO_PI);
    const amp = (sp.upright ? 0.08 : 0.2) * moving;

    tgt.set(stance.vals);
    tgt[I.chest + 1] += amp * wave;
    tgt[I.hips + 1] -= amp * wave;
    tgt[I.neck + 1] += -amp * 0.8 * wave + clamp(turn * 0.2, -0.4, 0.4);
    tgt[I.bodyPos + 1] += moving * 0.12 + Math.sin(time * 1.6) * 0.012;
    const idle = (1 - moving) * stance.idle;
    lookTimer -= dt;
    if (lookTimer <= 0) {
      lookTimer = 2 + ((time * 37) % 4);
      lookTarget = (((time * 91) % 1) - 0.5) * 1.2;
    }
    lookYaw = damp(lookYaw, lookTarget, 2, dt);
    tgt[I.neck + 1] += lookYaw * idle * 0.6;
    tgt[I.head + 1] += lookYaw * idle * 0.4;
    tgt[I.jaw] += Math.max(0, Math.sin(time * 0.7)) * 0.08 * idle;
    const k = 1 - Math.exp(-stance.rate * dt);
    for (let i = 0; i < n; i++) cur[i] += (tgt[i] - cur[i]) * k;
    if (overlay) {
      ot += dt / odur;
      if (ot >= 1) overlay = null;
      else sampleTrack(overlay, ot, cur, trackWeight(overlay, ot));
    }

    model.root.rotation.set(cur[I.root], cur[I.root + 1], cur[I.root + 2]);
    model.root.position.set(cur[I.rootPos], cur[I.rootPos + 1], cur[I.rootPos + 2]);
    const bodyY = sp.bodyH * (1 + cur[I.bodyPos + 1]);
    const bodyZ = cur[I.bodyPos + 2] * sp.len;
    model.body.position.set(cur[I.bodyPos] * sp.len, bodyY, bodyZ);
    model.body.rotation.set(cur[I.body], cur[I.body + 1], cur[I.body + 2]);
    model.chest.rotation.y = cur[I.chest + 1];
    model.hips.rotation.y = cur[I.hips + 1];
    model.neck.rotation.set(-sp.neckPitch + cur[I.neck], cur[I.neck + 1], 0);
    model.head.rotation.set(sp.neckPitch * 0.8 - cur[I.neck] * 0.6 + cur[I.head], cur[I.head + 1], cur[I.head + 2]);
    model.jaw.rotation.x = Math.max(0, cur[I.jaw]) * 0.75;

    // legs: IK in the half-body space; elbows point up and out
    const liftH = legReach * lerp(0.18, 0.3, a) * moving;
    for (let i = 0; i < 4; i++) {
      const leg = model.legs[i];
      gaitFoot(phase + PH[i], duty, footOut);
      const yaw = leg.isFront ? cur[I.chest + 1] : cur[I.hips + 1];
      const pull = cur[I.feet] * leg.side;
      let tx = leg.rest.x - pull * sp.sprawl - cur[I.bodyPos] * sp.len;
      let tz = leg.rest.z + footOut.z * stride * moving - bodyZ;
      const ty = -bodyY + footOut.lift * liftH + cur[I.feet + 1] * sp.bodyH * dead;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const lx = tx * c - tz * s;
      const lz = tx * s + tz * c;
      tx = lx;
      tz = lz;
      _t.set(tx, ty, tz);
      _pole.set(leg.side * (sp.upright ? 0.25 : 1.0), sp.upright ? 0.2 : 1.3, leg.isFront ? (sp.upright ? -1 : -0.2) : (sp.upright ? 1 : 0.3));
      ik2(leg.upper, leg.lower, leg.l1, leg.l2, _t, _pole);
    }

    if (lod < 2) {
      const tails = model.tails;
      for (let i = 0; i < tails.length; i++) {
        const sway = Math.sin(phase * TWO_PI - (i + 1) * 1.0) * amp * 1.5 + Math.sin(time * 1.1 - i * 0.7) * 0.07 * (1 - dead);
        tails[i].rotation.set(i === 0 ? cur[I.tail] - 0.06 : 0.03, sway + cur[I.tail + 1] * (0.4 + i * 0.25), 0);
      }
    }
  }

  const actor = {
    group: model.group, height: model.height, radius: model.radius, model,
    attach: { head: model.head, back: model.chest },
    update,
    play(action, duration) {
      const track = tracks[action];
      if (!track || stanceName === 'dead') return null;
      overlay = track;
      ot = 0;
      odur = duration || track.dur;
      return { duration: odur, strike: track.strike * odur };
    },
    setStance(name) {
      stanceName = stances[name] ? name : 'idle';
      stance = stances[stanceName];
      if (name === 'dead') overlay = null;
    },
    get stance() { return stanceName; },
    get busy() { return !!overlay; },
    setLod(level) {
      lod = level;
      setLodMeshes(level);
    },
    dispose() { disposeActor(model.group); },
  };
  actor.setLod(0);
  return actor;
}

function recolour(col, k) {
  const out = {};
  for (const key of Object.keys(col)) out[key] = key === 'eye' ? col[key] : shade(col[key], k);
  return out;
}

/** Build a lizard-rig creature. opts: seed, elite, scale. */
export function createLizard(id, opts = {}) {
  const base = SPECIES[id] || SPECIES.lizard;
  const seed = (opts.seed ?? 1) >>> 0;
  const rng = makeRng(seed * 7717 + id.length * 13);
  const sp = { ...base, seed, scale: (0.95 + rng() * 0.1) * (opts.scale || 1), col: recolour(base.col, 0.94 + rng() * 0.12) };
  if (opts.elite) {
    sp.scale *= 1.18;
    sp.col = recolour(sp.col, 0.7);
    sp.col.eye = 0xffa028;
    if (sp.sail) sp.sail = { ...sp.sail, color: 0xd88a20 };
  }
  const actor = createLizardActor(buildLizard(sp));
  actor.creatureId = id;
  return actor;
}
