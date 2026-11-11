// Procedural animation controller for humanoids: layered locomotion (distance-driven leg IK, no foot sliding),
// idle life, persistent stances, one-shot keyframe overlays and optional off-hand IK onto a held weapon.
import * as THREE from 'three';
import { DIM } from './humanoid.js';
import { JOINTS, STYLES, COMMON_STANCES, COMMON_TRACKS } from './humanoid-poses.js';
import { compilePose, compileTrack, sampleTrack, trackWeight, gaitFoot, legIK, ik2, damp, lerp, smoothstep, clamp, makeLod, disposeActor } from './rig.js';

const idx = name => JOINTS.indexOf(name) * 3;
const I = {};
for (const name of JOINTS) I[name] = idx(name);
const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const LEG_LEN = DIM.thigh + DIM.shin;

/** Real joints driven straight from the pose array: [name, mirror sign for y/z]. */
const DRIVEN = [['pelvis', 1], ['spine', 1], ['chest', 1], ['neck', 1], ['head', 1], ['armL', 1], ['foreL', 1], ['armR', -1], ['foreR', -1]];

const LOOPS = {
  hammer(t, time) {
    const u = (time * 0.9) % 1;
    const lift = u < 0.6 ? Math.sin((u / 0.6) * HALF_PI) : 1 - Math.pow((u - 0.6) / 0.4, 2) * 1.25;
    t[I.armR] += -0.75 * lift + 0.2;
    t[I.foreR] += -0.55 * lift + 0.35;
    t[I.handR] += 0.5 - lift * 0.6;
    t[I.spine] += -0.08 * lift + 0.04;
    t[I.head] += -0.06 * lift;
  },
};

const styleCache = new Map();

function compileStance(def) {
  return {
    vals: compilePose(JOINTS, def.pose || {}),
    lock: def.lock || 0,
    pelvisY: def.pelvisY ?? null,
    armSwing: def.armSwing ?? 1,
    idle: def.idle ?? 1,
    breath: def.breath ?? 1,
    rate: def.rate ?? 9,
    ik: def.ik || 0,
    loop: def.loop ? LOOPS[def.loop] : null,
  };
}

function getStyle(name) {
  let style = styleCache.get(name);
  if (style) return style;
  const def = STYLES[name] || STYLES.onehand;
  const stances = {};
  for (const key of Object.keys(COMMON_STANCES)) stances[key] = compileStance(COMMON_STANCES[key]);
  for (const key of Object.keys(def.stances || {})) stances[key] = compileStance({ ...COMMON_STANCES[key], ...def.stances[key] });
  const tracks = {};
  const slow = def.slow || 1;
  const addTrack = (key, tdef) => {
    const track = compileTrack(JOINTS, tdef);
    track.dur *= slow;
    track.ik = tdef.ik || 0;
    track.ikAux = !!tdef.ikAux;
    tracks[key] = track;
  };
  for (const key of Object.keys(COMMON_TRACKS)) addTrack(key, COMMON_TRACKS[key]);
  for (const key of Object.keys(def.tracks || {})) addTrack(key, def.tracks[key]);
  const alias = def.alias || {};
  for (const key of Object.keys(alias)) tracks[key] = tracks[alias[key]];
  if (!tracks.shoot) tracks.shoot = tracks.attack;
  if (!tracks.cast) tracks.cast = tracks.use;
  style = { stances, tracks, ikHand: def.ikHand || null };
  styleCache.set(name, style);
  return style;
}

const _m = new THREE.Matrix4();
const _target = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const footL = { z: 0, lift: 0, swing: 0 };
const footR = { z: 0, lift: 0, swing: 0 };
const ikOut = { a: 0, b: 0 };

/**
 * Wrap a humanoid model (buildHumanoid) into an Actor.
 * opts: style (key of STYLES), ikMesh (weapon mesh with userData.gripL / bow with userData.nock held by the other hand),
 * onAux(a, b) (bow draw / glow hook), seed.
 */
export function createHumanoidActor(model, opts = {}) {
  const style = getStyle(opts.style || 'unarmed');
  const J = model.J;
  const scale = model.spec.scale;
  const n = JOINTS.length * 3;
  const cur = new Float32Array(n);
  const tgt = new Float32Array(n);
  let stance = style.stances.idle;
  let stanceName = 'idle';
  cur.set(stance.vals);
  let time = (opts.seed || 0) % 17;
  let phase = ((opts.seed || 0) % 100) / 100;
  let moving = 0;
  let run = 0;
  let lock = stance.lock;
  let armSwing = stance.armSwing;
  let air = 0;
  let hipH = LEG_LEN * 0.97;
  let pelvisLock = DIM.pelvisY;
  let overlay = null;
  let ot = 0;
  let odur = 1;
  let ikW = 0;
  let lookYaw = 0;
  let lookTarget = 0;
  let lookPitch = 0;
  let lookTimer = 1 + ((opts.seed || 0) % 5);
  let cloakA = 0.1;
  let lod = 0;
  let frame = 0;
  let skipped = 0;
  let rngState = (opts.seed || 1) >>> 0;
  const rng = () => {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  };
  const setLodMeshes = makeLod(model.group);
  const ikMesh = opts.ikMesh || null;
  const ikHand = style.ikHand;
  const ikArm = ikHand === 'R' ? J.armR : J.armL;
  const ikFore = ikHand === 'R' ? J.foreR : J.foreL;
  const holdChain = ikHand === 'R' ? [J.armL, J.foreL, J.handL] : [J.armR, J.foreR, J.handR];
  const driven = DRIVEN.map(d => ({ joint: J[d[0]], i: I[d[0]], sign: d[1] }));

  const LEGS = [
    { thigh: J.thighL, shin: J.shinL, foot: J.footL, iT: I.thighL, iS: I.shinL, iF: I.footL, sign: 1, airT: -0.7, airS: 1.2 },
    { thigh: J.thighR, shin: J.shinR, foot: J.footR, iT: I.thighR, iS: I.shinR, iF: I.footR, sign: -1, airT: 0.15, airS: 0.7 },
  ];

  function solveLeg(leg, foot, strideLen, z0, liftH) {
    const z = z0 + foot.z * strideLen * moving - cur[I.pos + 2];
    const y = -(hipH + cur[I.pos + 1]) + foot.lift * liftH;
    legIK(z, y, DIM.thigh, DIM.shin, 1, ikOut);
    let tx = ikOut.a;
    let sx = ikOut.b;
    let fx = -(tx + sx) + (Math.sin(Math.PI * foot.swing) * 0.55 - foot.swing * foot.swing * 0.35) * moving;
    const lk = Math.max(lock, air);
    if (lk > 0.001) {
      tx = lerp(tx, lerp(cur[leg.iT], leg.airT, air), lk);
      sx = lerp(sx, lerp(cur[leg.iS], leg.airS, air), lk);
      fx = lerp(fx, lerp(cur[leg.iF], 0.4, air), lk);
    }
    leg.thigh.rotation.set(tx, cur[leg.iT + 1] * leg.sign, cur[leg.iT + 2] * leg.sign);
    leg.shin.rotation.set(sx, 0, 0);
    leg.foot.rotation.set(fx, 0, 0);
  }

  function solveHandIK(dt, want) {
    ikW = damp(ikW, want, 14, dt);
    if (ikW < 0.01 || !ikMesh) return;
    holdChain[0].updateMatrix();
    holdChain[1].updateMatrix();
    holdChain[2].updateMatrix();
    ikMesh.updateMatrix();
    _m.multiplyMatrices(holdChain[0].matrix, holdChain[1].matrix).multiply(holdChain[2].matrix).multiply(ikMesh.matrix);
    const grip = ikMesh.userData.nock || ikMesh.userData.gripL;
    _target.copy(grip).applyMatrix4(_m);
    if (ikHand === 'R') _pole.set(-1, 0.4, -0.1);
    else _pole.set(0.55, -0.6, -0.3);
    _qa.copy(ikArm.quaternion);
    _qb.copy(ikFore.quaternion);
    ik2(ikArm, ikFore, DIM.upper, DIM.fore + DIM.hand, _target, _pole);
    if (ikW < 0.995) {
      _qc.copy(ikArm.quaternion);
      ikArm.quaternion.copy(_qa).slerp(_qc, ikW);
      _qc.copy(ikFore.quaternion);
      ikFore.quaternion.copy(_qb).slerp(_qc, ikW);
    }
  }

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
    const speed = ((ctx && ctx.speed) || 0) / scale;
    const turn = (ctx && ctx.turn) || 0;
    const st = stance;
    moving = damp(moving, smoothstep(0.05, 0.5, speed), 10, dt);
    run = damp(run, smoothstep(2.6, 5.0, speed), 7, dt);
    lock = damp(lock, st.lock, 7, dt);
    armSwing = damp(armSwing, st.armSwing, 8, dt);
    air = damp(air, ctx && ctx.airborne ? 1 : 0, 12, dt);
    const strideLen = lerp(0.5 + 0.11 * Math.min(speed, 2.6), 0.95 + 0.07 * Math.min(speed, 8), run);
    const duty = lerp(0.62, 0.36, run);
    phase += (speed * dt) / (strideLen / duty);
    phase -= Math.floor(phase);
    const c2 = Math.cos(phase * TWO_PI);
    const s2 = Math.sin(phase * TWO_PI);
    const mv = moving * (1 - lock);

    // ——— base target: stance + locomotion upper body + idle life
    tgt.set(st.vals);
    if (st.loop) st.loop(tgt, time);
    const swing = lerp(0.4, 0.95, run) * mv * armSwing;
    tgt[I.armL] += swing * c2;
    tgt[I.armR] -= swing * c2;
    tgt[I.foreL] -= (0.12 + 1.0 * run + 0.25 * Math.max(0, -c2)) * mv * armSwing;
    tgt[I.foreR] -= (0.12 + 1.0 * run + 0.25 * Math.max(0, c2)) * mv * armSwing;
    tgt[I.pelvis + 1] -= 0.1 * mv * c2;
    tgt[I.chest + 1] += 0.17 * mv * c2 * (0.35 + 0.65 * armSwing);
    tgt[I.pelvis + 2] += 0.035 * mv * s2;
    tgt[I.spine] += (0.03 + 0.14 * run) * mv;
    tgt[I.head] -= 0.08 * run * mv;
    tgt[I.root + 2] += clamp(-turn * 0.035 * mv, -0.16, 0.16);
    if (air > 0.01) {
      tgt[I.armL] -= 0.5 * air;
      tgt[I.armR] -= 0.3 * air;
      tgt[I.armL + 2] += 0.5 * air;
      tgt[I.armR + 2] += 0.5 * air;
    }
    const breathe = Math.sin(time * 1.7) * st.breath;
    tgt[I.chest] -= breathe * 0.016;
    tgt[I.armL + 2] += breathe * 0.012;
    tgt[I.armR + 2] += breathe * 0.012;
    const idle = (1 - moving) * st.idle;
    if (idle > 0.01 && lod < 2) {
      const sway = Math.sin(time * 0.43);
      tgt[I.pelvis + 2] += 0.03 * sway * idle;
      tgt[I.pos] += 0.014 * sway * idle;
      tgt[I.spine + 2] -= 0.03 * sway * idle;
      lookTimer -= dt;
      if (lookTimer <= 0) {
        lookTimer = 2 + rng() * 4.5;
        lookTarget = (rng() - 0.5) * 1.0;
        lookPitch = (rng() - 0.4) * 0.16;
      }
      lookYaw = damp(lookYaw, lookTarget, 2.5, dt);
      tgt[I.head + 1] += lookYaw * idle * 0.7;
      tgt[I.neck + 1] += lookYaw * idle * 0.3;
      tgt[I.head] += lookPitch * idle;
    }

    // ——— damp towards the target, then lay the one-shot overlay on top (crisp, eased by its own keys)
    const k = 1 - Math.exp(-st.rate * dt);
    for (let i = 0; i < n; i++) cur[i] += (tgt[i] - cur[i]) * k;
    let ikWant = st.ik;
    if (overlay) {
      ot += dt / odur;
      if (ot >= 1) {
        overlay = null;
      } else {
        sampleTrack(overlay, ot, cur, trackWeight(overlay, ot));
        ikWant = overlay.ikAux ? cur[I.aux + 1] : Math.max(overlay.ik, st.ik * (overlay.ik ? 1 : 0));
      }
    }

    // ——— apply
    model.body.rotation.set(cur[I.root], cur[I.root + 1], cur[I.root + 2]);
    model.body.position.set(cur[I.rootPos], cur[I.rootPos + 1], cur[I.rootPos + 2]);
    for (let d = 0; d < driven.length; d++) {
      const dj = driven[d];
      dj.joint.rotation.set(cur[dj.i], cur[dj.i + 1] * dj.sign, cur[dj.i + 2] * dj.sign);
    }
    J.handL.rotation.set(HALF_PI + cur[I.handL], cur[I.handL + 1], cur[I.handL + 2]);
    J.handR.rotation.set(HALF_PI + cur[I.handR], -cur[I.handR + 1], -cur[I.handR + 2]);

    // ——— legs: planted-foot IK, pelvis height follows the stance leg (natural bob)
    gaitFoot(phase, duty, footL);
    gaitFoot(phase + 0.5, duty, footR);
    const crouch = cur[I.stride + 2];
    let want = LEG_LEN * 0.972 - crouch;
    const reachK = 1 - 0.45 * run;
    const zl = (cur[I.stride] + footL.z * strideLen * moving) * reachK;
    const zr = (cur[I.stride + 1] + footR.z * strideLen * moving) * reachK;
    const maxLen = LEG_LEN * 0.992;
    if (footL.lift === 0 || moving < 0.5) want = Math.min(want, Math.sqrt(Math.max(0.1, maxLen * maxLen - zl * zl)));
    if (footR.lift === 0 || moving < 0.5) want = Math.min(want, Math.sqrt(Math.max(0.1, maxLen * maxLen - zr * zr)));
    want += run * moving * 0.035 * Math.abs(s2);
    hipH = damp(hipH, want, 26, dt);
    const liftH = lerp(0.1, 0.26, run) * moving;
    solveLeg(LEGS[0], footL, strideLen, cur[I.stride], liftH);
    solveLeg(LEGS[1], footR, strideLen, cur[I.stride + 1], liftH);
    pelvisLock = damp(pelvisLock, st.pelvisY ?? DIM.pelvisY, st.rate, dt);
    const ikY = DIM.ankle + hipH + DIM.hipDrop + cur[I.pos + 1];
    J.pelvis.position.set(cur[I.pos], lerp(ikY, pelvisLock + cur[I.pos + 1], lock), cur[I.pos + 2]);

    if (lod < 2) {
      if (ikMesh && ikHand) solveHandIK(dt, ikWant);
      if (model.cloak.length) {
        const flutter = Math.sin(time * 2.3 + phase * TWO_PI) * (0.03 + 0.02 * Math.min(speed, 6));
        const wantA = 0.06 + Math.min(0.85, speed * 0.13) + flutter - (cur[I.spine] + cur[I.chest]) * 0.9 - cur[I.root];
        cloakA = damp(cloakA, wantA, 6, dt);
        model.cloak[0].rotation.x = Math.max(-0.05, cloakA);
        if (model.cloak[1]) model.cloak[1].rotation.x = cloakA * 0.45 + Math.sin(time * 2.3 - 0.9) * 0.05;
      }
      if (opts.onAux) opts.onAux(cur[I.aux], cur[I.aux + 2]);
    }
  }

  const actor = {
    group: model.group,
    height: model.height,
    radius: model.radius,
    model,
    attach: { handR: model.sockets.handR, handL: model.sockets.handL, back: model.sockets.back, head: model.sockets.head },
    update,
    /** Start a one-shot action. Returns { duration, strike } in seconds or null when unknown. */
    play(action, duration) {
      const track = style.tracks[action];
      if (!track || stanceName === 'dead') return null;
      overlay = track;
      ot = 0;
      odur = duration || track.dur;
      return { duration: odur, strike: track.strike * odur };
    },
    setStance(name) {
      const next = style.stances[name];
      if (!next) return;
      stance = next;
      stanceName = name;
      if (name === 'dead') overlay = null;
    },
    get stance() { return stanceName; },
    get busy() { return !!overlay; },
    /** Show / hide the held gear (weapon, shield) — e.g. while carrying a crate or sleeping. */
    showGear(visible) {
      const gear = actor.gear || {};
      for (const mesh of [gear.main, gear.off]) {
        if (!mesh) continue;
        mesh.userData.hidden = !visible;
        mesh.visible = !!visible;
      }
    },
    setLod(level) {
      lod = level;
      setLodMeshes(level);
    },
    dispose() {
      disposeActor(model.group);
    },
  };
  actor.setLod(0);
  return actor;
}
