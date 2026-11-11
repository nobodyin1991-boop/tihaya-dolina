// Spider rig: cephalothorax + abdomen + chelicerae and eight two-segment IK legs drawn as two InstancedMeshes
// (16 leg segments = 2 draw calls). Species: giant_spider, spiderling.
import * as THREE from 'three';
import { makeRng } from '../core/noise.js';
import { tube, ball, part, joint, fuse, shade, actorMat, gaitFoot, damp, lerp, smoothstep, clamp, makeLod, disposeActor } from './rig.js';

const SPECIES = {
  giant_spider: { size: 1, col: { body: 0x2c2622, leg: 0x3a3028, mark: 0xb8622a, eye: 0xc03a28, fang: 0x1a1614, hair: 0x4a3e34 }, speed: 7 },
  spiderling: { size: 0.36, col: { body: 0x5a4a38, leg: 0x6a583e, mark: 0xd8b060, eye: 0x2a1a14, fang: 0x2a2018, hair: 0x7a6a4c }, speed: 5, legK: 1.1 },
};

/** Pinned creature ids that use this rig. */
export const SPIDER_IDS = Object.keys(SPECIES);

const DOWN = new THREE.Vector3(0, -1, 0);
const _d = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fore = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _t = new THREE.Vector3();
const foot = { z: 0, lift: 0, swing: 0 };

function build(sp) {
  const C = sp.col;
  const group = new THREE.Group();
  const scaler = joint(group, 0, 0, 0, 'scale');
  scaler.scale.setScalar(sp.scale);
  const root = joint(scaler, 0, 0, 0, 'root');
  const bodyH = 0.42;
  const body = joint(root, 0, bodyH, 0, 'body');
  const ceph = [
    ball(0.2, C.body, [0, 0, 0.08], [1, 0.62, 1.15], { segs: 9, rings: 6, jitter: 0.08, gradient: [0.75, 1.1] }),
    ball(0.13, shade(C.body, 1.15), [0, 0.06, 0.2], [1, 0.7, 1], { segs: 8, rings: 5, jitter: 0.06 }),
  ];
  const eyes = [[0.035, 0.115, 0.3, 0.024], [0.085, 0.1, 0.27, 0.018], [0.03, 0.15, 0.25, 0.014], [0.075, 0.14, 0.22, 0.012]];
  for (const e of eyes) {
    for (const side of [1, -1]) ceph.push(ball(e[3], C.eye, [side * e[0], e[1], e[2]], 1, { segs: 5, rings: 4, gradient: [1, 1.5] }));
  }
  for (let i = 0; i < 5; i++) ceph.push(tube([[(i - 2) * 0.05, 0.1, 0.02, 0.012], [(i - 2) * 0.06, 0.2, -0.04, 0.002]], C.hair, { segs: 4 }));
  body.add(part(ceph, null, { name: 'ceph' }));
  const abdomen = joint(body, 0, 0.04, -0.12, 'abdomen');
  const abGeo = [
    ball(0.3, C.body, [0, 0.06, -0.3], [1, 0.86, 1.3], { segs: 10, rings: 7, jitter: 0.08, gradient: [0.7, 1.12] }),
    ball(0.1, C.mark, [0, 0.29, -0.22], [1.1, 0.3, 1.5], { segs: 6, rings: 4, gradient: false }),
    ball(0.075, C.mark, [0, 0.27, -0.48], [1.3, 0.3, 1.2], { segs: 6, rings: 4, gradient: false }),
    tube([[0, 0.0, -0.66, 0.05], [0, -0.04, -0.76, 0.01]], shade(C.body, 0.8), { segs: 5 }),
  ];
  for (const side of [1, -1]) {
    abGeo.push(ball(0.05, C.mark, [side * 0.17, 0.2, -0.3], [0.5, 0.4, 1.6], { segs: 5, rings: 3, gradient: false }));
    for (let i = 0; i < 4; i++) abGeo.push(tube([[side * 0.2, 0.18, -0.15 - i * 0.12, 0.014], [side * 0.3, 0.28, -0.2 - i * 0.12, 0.002]], C.hair, { segs: 4 }));
  }
  abdomen.add(part(abGeo, null, { name: 'abdomen' }));
  const fangs = joint(body, 0, -0.03, 0.28, 'fangs');
  const fangGeo = [];
  for (const side of [1, -1]) {
    fangGeo.push(tube([[side * 0.05, 0.02, 0, 0.04], [side * 0.055, -0.06, 0.05, 0.034], [side * 0.03, -0.17, 0.06, 0.004]], C.fang, { segs: 5, gradient: [1.3, 0.9] }));
    fangGeo.push(tube([[side * 0.13, 0.02, -0.02, 0.022], [side * 0.16, -0.02, 0.12, 0.018], [side * 0.11, -0.08, 0.2, 0.008]], C.leg, { segs: 5, jitter: 0.08 }));
  }
  const fangMesh = part(fangGeo, null, { name: 'fangs' });
  fangMesh.userData.lodMax = 1;
  fangs.add(fangMesh);

  // legs: instanced segments, geometry along -y
  const legK = sp.legK || 1;
  const l1 = 0.5 * legK;
  const l2 = 0.72 * legK;
  const upGeo = fuse([tube([[0, 0.02, 0, 0.045], [0, -l1 * 0.5, 0, 0.036], [0, -l1, 0, 0.032]], C.leg, { segs: 5, jitter: 0.1, gradient: [0.9, 1.1] }), ball(0.042, shade(C.leg, 0.75), [0, -l1, 0], 1, { segs: 5, rings: 4 })]);
  const lowGeo = fuse([tube([[0, 0, 0, 0.03], [0, -l2 * 0.55, 0, 0.022], [0, -l2, 0, 0.005]], C.leg, { segs: 5, jitter: 0.1, colors: [C.leg, C.leg, shade(C.leg, 0.6)] })]);
  const upper = new THREE.InstancedMesh(upGeo, actorMat(), 8);
  const lower = new THREE.InstancedMesh(lowGeo, actorMat(), 8);
  for (const im of [upper, lower]) {
    im.frustumCulled = false;
    im.castShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    body.add(im);
  }
  const legs = [];
  const angles = [0.62, 1.2, 1.85, 2.5];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? 1 : -1;
    const k = i % 4;
    const a = angles[k];
    const reach = (k === 0 || k === 3 ? 0.98 : 0.86) * legK;
    legs.push({
      hip: new THREE.Vector3(side * 0.15, 0, 0.2 - k * 0.085),
      rest: new THREE.Vector3(side * Math.sin(a) * reach, 0, Math.cos(a) * reach + 0.06),
      side, k, phase: (k + (side > 0 ? 0 : 1)) % 2 ? 0.5 : 0,
    });
  }
  return { group, scaler, root, body, abdomen, fangs, upper, lower, legs, l1, l2, bodyH, spec: sp, height: 0.85 * sp.scale, radius: 0.95 * sp.scale };
}

/** Solve one leg in body space and write the two instance matrices. */
function solveLeg(model, i, target, poleUp) {
  const leg = model.legs[i];
  const { l1, l2 } = model;
  _d.copy(target).sub(leg.hip);
  const raw = _d.length();
  const dist = clamp(raw, Math.abs(l1 - l2) + 0.01, (l1 + l2) * 0.995);
  _d.multiplyScalar(1 / Math.max(raw, 1e-5));
  _bend.set(leg.side * 0.25, poleUp, 0).addScaledVector(_d, -(_d.x * leg.side * 0.25 + _d.y * poleUp));
  _bend.normalize();
  const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _up.copy(_d).multiplyScalar(cosA).addScaledVector(_bend, sinA);
  _knee.copy(leg.hip).addScaledVector(_up, l1);
  _fore.copy(leg.hip).addScaledVector(_d, dist).sub(_knee).normalize();
  _q.setFromUnitVectors(DOWN, _up);
  model.upper.setMatrixAt(i, _m.compose(leg.hip, _q, _one));
  _q.setFromUnitVectors(DOWN, _fore);
  model.lower.setMatrixAt(i, _m.compose(_knee, _q, _one));
}

function createSpiderActor(model) {
  const sp = model.spec;
  let time = (sp.seed % 9) * 0.5;
  let phase = (sp.seed % 10) / 10;
  let moving = 0;
  let stanceName = 'idle';
  let combat = 0;
  let dead = 0;
  let sleep = 0;
  let action = null;
  let at = 0;
  let adur = 1;
  let lod = 0;
  let frame = 0;
  let skipped = 0;
  const setLodMeshes = makeLod(model.group);
  const ACTIONS = { bite: 0.6, attack: 0.6, attack2: 0.6, heavy: 1.1, hit: 0.4, charge: 0.9, howl: 1.2 };
  const STRIKE = { bite: 0.5, attack: 0.5, attack2: 0.5, heavy: 0.62, hit: 0.1, charge: 0.6, howl: 0.3 };

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
    const a = clamp(speed / sp.speed, 0, 1.2);
    moving = damp(moving, smoothstep(0.02, 0.2, speed), 10, dt);
    combat = damp(combat, stanceName === 'combat' ? 1 : 0, 6, dt);
    dead = damp(dead, stanceName === 'dead' ? 1 : 0, 5, dt);
    sleep = damp(sleep, stanceName === 'sleep' ? 1 : 0, 3, dt);
    const duty = lerp(0.6, 0.45, a);
    const cycleLen = lerp(0.9, 2.2, a);
    phase += (speed * dt) / cycleLen;
    phase -= Math.floor(phase);
    const stride = duty * cycleLen;
    // one-shot action envelope
    let lunge = 0;
    let rear = 0;
    let fang = 0.15 * combat + Math.max(0, Math.sin(time * 1.3)) * 0.1;
    let flinch = 0;
    if (action) {
      at += dt / adur;
      if (at >= 1) {
        action = null;
      } else if (action === 'heavy' || action === 'howl') {
        const up = smoothstep(0, 0.4, at) * (1 - smoothstep(0.55, 0.68, at));
        rear = up;
        lunge = action === 'heavy' ? smoothstep(0.55, 0.66, at) * (1 - smoothstep(0.7, 1, at)) * 0.5 - up * 0.15 : 0;
        fang = 0.3 + up * 0.7;
      } else if (action === 'hit') {
        flinch = Math.sin(Math.min(1, at * 1.5) * Math.PI);
      } else {
        const wind = smoothstep(0, 0.36, at) * (1 - smoothstep(0.4, 0.5, at));
        const strike = smoothstep(0.4, 0.5, at) * (1 - smoothstep(0.62, 1, at));
        lunge = strike * 0.55 - wind * 0.2;
        rear = wind * 0.35;
        fang = wind * 0.9 + strike * (at < 0.56 ? 0.9 : 0.1);
      }
    }
    const bob = Math.sin(phase * TWO_PI_2) * 0.02 * moving + Math.sin(time * 1.7) * 0.012 * (1 - dead);
    const bodyY = model.bodyH * (1 + 0.18 * combat - 0.55 * sleep - 0.5 * dead - 0.25 * flinch + rear * 0.25) + bob;
    model.root.rotation.z = dead * Math.PI;
    model.root.position.y = dead * 0.42;
    model.body.position.set(flinch * 0.05, bodyY, lunge);
    model.body.rotation.set(-rear * 0.6 - combat * 0.12 + flinch * 0.15, 0, Math.sin(phase * Math.PI * 2) * 0.03 * moving);
    model.abdomen.rotation.x = 0.1 + combat * 0.25 + rear * 0.3 + Math.sin(time * 2.1) * 0.03 + Math.sin(phase * TWO_PI_2) * 0.05 * moving - dead * 0.3;
    model.fangs.rotation.x = -fang * 0.7;
    const cb = Math.cos(model.body.rotation.x);
    const sb = Math.sin(model.body.rotation.x);
    const liftH = lerp(0.16, 0.3, a) * moving;
    for (let i = 0; i < 8; i++) {
      const leg = model.legs[i];
      gaitFoot(phase + leg.phase, duty, foot);
      // world-ish target relative to the body origin (ground plane at -bodyY)
      let tx = leg.rest.x;
      let ty = -bodyY + foot.lift * liftH;
      let tz = leg.rest.z + foot.z * stride * moving - lunge;
      if (leg.k === 0) {
        const raise = rear + combat * 0.35;
        ty += raise * 0.75 + Math.sin(time * 5 + leg.side) * 0.05 * raise;
        tz += raise * 0.1;
        tx *= 1 - raise * 0.3;
      }
      if (leg.k === 1) ty += rear * 0.35;
      const curl = Math.max(dead, sleep * 0.45);
      if (curl > 0.001) {
        tx = lerp(tx, leg.side * 0.3, curl);
        tz = lerp(tz, leg.hip.z + 0.05, curl);
        ty = lerp(ty, -0.2 - dead * 0.1, curl * dead) ;
      }
      // into the pitched body frame (rotation about x)
      _t.set(tx, ty * cb + tz * sb, -ty * sb + tz * cb);
      solveLeg(model, i, _t, 1.6 - dead * 1.2);
    }
    model.upper.instanceMatrix.needsUpdate = true;
    model.lower.instanceMatrix.needsUpdate = true;
  }

  const actor = {
    group: model.group, height: model.height, radius: model.radius, model,
    attach: { head: model.body, back: model.abdomen },
    update,
    play(name, duration) {
      if (!ACTIONS[name] || stanceName === 'dead') return null;
      action = name;
      at = 0;
      adur = duration || ACTIONS[name];
      return { duration: adur, strike: STRIKE[name] * adur };
    },
    setStance(name) {
      stanceName = ['idle', 'combat', 'sleep', 'dead'].includes(name) ? name : 'idle';
      if (name === 'dead') action = null;
    },
    get stance() { return stanceName; },
    get busy() { return !!action; },
    setLod(level) {
      lod = level;
      setLodMeshes(level);
    },
    dispose() { disposeActor(model.group); },
  };
  actor.setLod(0);
  update(0.016, { speed: 0 });
  return actor;
}

const TWO_PI_2 = Math.PI * 4;

function recolour(col, k) {
  const out = {};
  for (const key of Object.keys(col)) out[key] = key === 'eye' || key === 'mark' ? col[key] : shade(col[key], k);
  return out;
}

/** Build a spider-rig creature. opts: seed, elite, scale. */
export function createSpider(id, opts = {}) {
  const base = SPECIES[id] || SPECIES.giant_spider;
  const seed = (opts.seed ?? 1) >>> 0;
  const rng = makeRng(seed * 6007 + id.length * 17);
  const sp = { ...base, seed, scale: base.size * (0.94 + rng() * 0.12) * (opts.scale || 1), col: recolour(base.col, 0.92 + rng() * 0.16) };
  if (opts.elite) {
    sp.scale *= 1.2;
    sp.col = recolour(sp.col, 0.68);
    sp.col.mark = 0xe0a030;
    sp.col.eye = 0xffb040;
  }
  const actor = createSpiderActor(build(sp));
  actor.creatureId = id;
  return actor;
}
