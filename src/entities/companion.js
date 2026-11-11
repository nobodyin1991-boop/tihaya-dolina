// The engineer's mechanical companion: a brass-and-wood four-legged clockwork automaton with a small bolt-thrower
// turret, a winding key and visible gears. Clockwork, not magic.
import * as THREE from 'three';
import { PALETTE as P, glowMat } from '../world/materials.js';
import { tube, ball, slab, rod, hoop, part, joint, stiffLimb, xf, gaitFoot, legIK, damp, lerp, smoothstep, clamp, makeLod, disposeActor } from './rig.js';
import { gearGeos } from './gear-models.js';

const M = { metal: 1 };
const HALF_PI = Math.PI / 2;
const BRASS = 0xb08a3e;
const BRASS_DARK = 0x7a5e2c;

function cog(r, teeth, color) {
  const geos = [rod(r, r, 0.03, color, [0, 0, 0], [0, 0, HALF_PI], { metal: 1, segs: 12 }), rod(r * 0.3, r * 0.3, 0.045, BRASS_DARK, [0, 0, 0], [0, 0, HALF_PI], { metal: 1, segs: 8 })];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    geos.push(slab(0.028, r * 0.3, r * 0.34, color, [0, Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05], [a, 0, 0], M));
  }
  return part(geos, null, { name: 'cog' });
}

function build() {
  const group = new THREE.Group();
  const root = joint(group, 0, 0, 0, 'root');
  const H = 0.5;
  const body = joint(root, 0, H, 0, 'body');
  const shell = [
    tube([[0, 0, -0.34, 0.17, 0.15], [0, 0.01, -0.15, 0.2, 0.17], [0, 0.01, 0.16, 0.2, 0.17], [0, -0.01, 0.36, 0.15, 0.13]], BRASS, { segs: 10, sq: 0.72, metal: 1, gradient: [0.7, 1.15] }),
    slab(0.405, 0.16, 0.36, P.wood, [0, 0.0, 0.0], [0, 0, 0], { gradient: [0.8, 1.05] }),
    slab(0.3, 0.03, 0.5, P.woodDark, [0, 0.165, 0.0]),
    hoop(0.19, 0.012, P.copper, [0, 0.0, -0.2], [0, 0, 0], { metal: 1, segs: 12, tubeSegs: 4 }),
    hoop(0.19, 0.012, P.copper, [0, 0.0, 0.2], [0, 0, 0], { metal: 1, segs: 12, tubeSegs: 4 }),
    rod(0.07, 0.085, 0.12, BRASS_DARK, [0, 0.02, 0.42], [HALF_PI, 0, 0], { metal: 1, segs: 9 }),
    hoop(0.07, 0.012, P.gold, [0, 0.02, 0.485], [0, 0, 0], { metal: 1, segs: 10, tubeSegs: 4 }),
    rod(0.02, 0.02, 0.12, P.copper, [0.1, 0.19, -0.22], [0, 0, 0], M),
    rod(0.035, 0.03, 0.05, BRASS_DARK, [0.1, 0.26, -0.22], [0, 0, 0], M),
  ];
  for (let i = 0; i < 6; i++) {
    for (const side of [1, -1]) shell.push(ball(0.014, P.copper, [side * 0.205, 0.06, -0.15 + i * 0.06], 1, { metal: 1, segs: 5, rings: 3 }));
  }
  body.add(part(shell, null, { name: 'shell' }));
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), glowMat(P.amber, 1.6));
  lens.position.set(0, 0.02, 0.485);
  lens.scale.set(1, 1, 0.45);
  lens.castShadow = false;
  lens.userData.shadow = false;
  body.add(lens);
  const key = joint(body, 0, 0.03, -0.37, 'key');
  key.add(part([
    rod(0.014, 0.014, 0.14, BRASS_DARK, [0, 0, -0.06], [HALF_PI, 0, 0], M),
    hoop(0.055, 0.014, P.gold, [0.06, 0, -0.13], [0, 0, 0], { metal: 1, segs: 9, tubeSegs: 4 }),
    hoop(0.055, 0.014, P.gold, [-0.06, 0, -0.13], [0, 0, 0], { metal: 1, segs: 9, tubeSegs: 4 }),
  ], null, { name: 'key' }));
  const cogs = [];
  for (const side of [1, -1]) {
    const cj = joint(body, side * 0.225, 0.03, -0.02, 'cog');
    cj.add(cog(0.085, 9, side > 0 ? P.bronze : P.copper));
    cogs.push(cj);
  }
  const turretYaw = joint(body, 0, 0.185, 0.02, 'turretYaw');
  turretYaw.add(part([rod(0.075, 0.09, 0.05, BRASS_DARK, [0, 0.02, 0], [0, 0, 0], { metal: 1, segs: 10 }), slab(0.03, 0.12, 0.05, BRASS, [0.06, 0.09, 0], [0, 0, 0], M), slab(0.03, 0.12, 0.05, BRASS, [-0.06, 0.09, 0], [0, 0, 0], M)], null, { name: 'turretBase' }));
  const turretPitch = joint(turretYaw, 0, 0.13, 0, 'turretPitch');
  const thrower = gearGeos('crossbow', { tier: 3 }).geos.map(g => xf(g, [0, 0.02, -0.06], [HALF_PI, 0, 0], [0.62, 0.8, 0.8]));
  thrower.push(rod(0.012, 0.012, 0.14, P.copper, [0, 0, 0], [0, 0, HALF_PI], M));
  turretPitch.add(part(thrower, null, { name: 'thrower' }));
  const muzzle = joint(turretPitch, 0, 0.06, 0.34, 'muzzle');

  const legs = [];
  const l1 = 0.27;
  const l2 = 0.29;
  for (const [x, z, isFront] of [[1, 0.24, true], [-1, 0.24, true], [1, -0.24, false], [-1, -0.24, false]]) {
    const upper = joint(body, x * 0.215, -0.02, z, 'legU');
    const lower = joint(upper, 0, -l1, 0, 'legL');
    upper.add(part([
      ball(0.055, BRASS_DARK, [0, 0, 0], 1, { metal: 1, segs: 7, rings: 5 }),
      tube([[0, 0, 0, 0.034, 0.045], [0, -l1, 0, 0.028, 0.036]], BRASS, { segs: 6, sq: 0.7, metal: 1 }),
      rod(0.01, 0.01, l1 * 0.8, P.copper, [x * 0.03, -l1 * 0.5, 0.02], [0, 0, 0], M),
    ]));
    lower.add(part([
      ball(0.042, P.copper, [0, 0, 0], 1, { metal: 1, segs: 7, rings: 5 }),
      tube([[0, 0, 0, 0.026], [0, -l2 + 0.03, 0, 0.02]], P.woodDark, { segs: 6 }),
      rod(0.05, 0.062, 0.035, BRASS_DARK, [0, -l2 + 0.018, 0.01], [0, 0, 0], { metal: 1, segs: 8 }),
    ]));
    stiffLimb(upper);
    legs.push({ upper, lower, z, isFront });
  }
  return { group, root, body, lens, key, cogs, turretYaw, turretPitch, muzzle, legs, l1, l2, H };
}

const foot = { z: 0, lift: 0, swing: 0 };
const ikOut = { a: 0, b: 0 };
const PH = [0, 0.5, 0.5, 0];

/**
 * Engineer's companion. Actor interface + `aim(yaw, pitch)` (turret, radians relative to the body) and
 * `attach.muzzle` (bolt spawn point). Actions: shoot|attack|hit|cheer|use. Stances: idle|combat|sleep|dead.
 */
export function createCompanion() {
  const model = build();
  let time = 0;
  let phase = 0;
  let moving = 0;
  let stanceName = 'idle';
  let low = 0;
  let dead = 0;
  let combat = 0;
  let recoil = 0;
  let flinch = 0;
  let hop = 0;
  let aimYaw = 0;
  let aimPitch = 0;
  let wantYaw = 0;
  let wantPitch = 0;
  let scan = 0;
  const setLodMeshes = makeLod(model.group);

  function update(dt, ctx) {
    dt = Math.min(dt, 0.1);
    time += dt;
    const speed = (ctx && ctx.speed) || 0;
    const a = clamp(speed / 6, 0, 1.2);
    moving = damp(moving, smoothstep(0.02, 0.25, speed), 10, dt);
    low = damp(low, stanceName === 'sleep' || stanceName === 'sit' ? 1 : 0, 4, dt);
    dead = damp(dead, stanceName === 'dead' ? 1 : 0, 6, dt);
    combat = damp(combat, stanceName === 'combat' ? 1 : 0, 6, dt);
    recoil = damp(recoil, 0, 9, dt);
    flinch = damp(flinch, 0, 7, dt);
    hop = Math.max(0, hop - dt * 2.2);
    const duty = lerp(0.6, 0.45, a);
    const cycleLen = lerp(0.55, 1.5, a);
    phase += (speed * dt) / cycleLen;
    phase -= Math.floor(phase);
    const stride = duty * cycleLen;
    const alive = 1 - dead;
    const tick = Math.floor(time * 4) / 4;
    const bob = Math.abs(Math.sin(phase * Math.PI * 2)) * 0.018 * moving + Math.sin(hop * Math.PI * 3) * 0.08 * hop;
    const bodyY = model.H * (1 - 0.5 * low - 0.62 * dead) + bob - flinch * 0.03;
    model.body.position.set(0, bodyY, -recoil * 0.05 - flinch * 0.04);
    model.body.rotation.set(-recoil * 0.06 + flinch * 0.1, 0, dead * 0.35 + Math.sin(phase * Math.PI * 2) * 0.03 * moving);
    model.key.rotation.z = (tick * 1.2 + phase * 6) * alive;
    model.cogs[0].rotation.x = (time * 1.5 + phase * 10) * alive;
    model.cogs[1].rotation.x = -(time * 1.5 + phase * 10) * alive;
    model.lens.scale.setScalar(alive * (0.9 + 0.1 * Math.sin(time * 3) + combat * 0.2 + recoil * 0.5) + 0.001);
    model.lens.scale.z *= 0.45;
    scan = Math.sin(time * 0.6) * 0.5 * (1 - combat) * alive;
    aimYaw = damp(aimYaw, wantYaw * combat + scan, 6, dt);
    aimPitch = damp(aimPitch, wantPitch * combat - 0.08 * combat + 0.5 * dead + 0.25 * low, 6, dt);
    model.turretYaw.rotation.y = aimYaw;
    model.turretPitch.rotation.x = aimPitch - recoil * 0.25;
    const liftH = lerp(0.07, 0.14, a) * moving;
    const cx = Math.cos(model.body.rotation.x);
    const sx = Math.sin(model.body.rotation.x);
    for (let i = 0; i < 4; i++) {
      const leg = model.legs[i];
      gaitFoot(phase + PH[i], duty, foot);
      const hipY = bodyY - 0.02 - leg.z * sx;
      const splay = (dead * 0.25 + low * 0.1) * (leg.isFront ? 1 : -1);
      const dz = foot.z * stride * moving + splay + (leg.isFront ? 0.03 : -0.03);
      const dy = foot.lift * liftH - hipY;
      legIK(-dy * sx + dz * cx, dy * cx + dz * sx, model.l1, model.l2, leg.isFront ? 1 : -1, ikOut);
      leg.upper.rotation.x = ikOut.a;
      leg.lower.rotation.x = ikOut.b;
    }
  }

  const actor = {
    group: model.group, height: 0.95, radius: 0.45, model,
    attach: { head: model.turretPitch, back: model.body, muzzle: model.muzzle },
    update,
    /** Point the turret (radians, relative to the body's forward axis). Only applied in the combat stance. */
    aim(yaw, pitch = 0) {
      wantYaw = clamp(yaw, -2.6, 2.6);
      wantPitch = clamp(-pitch, -0.7, 0.4);
    },
    play(action, duration) {
      if (stanceName === 'dead') return null;
      if (action === 'shoot' || action === 'attack' || action === 'attack2' || action === 'heavy') {
        recoil = 1;
        return { duration: duration || 0.5, strike: 0.05 };
      }
      if (action === 'hit') {
        flinch = 1;
        return { duration: duration || 0.4, strike: 0.1 };
      }
      if (action === 'cheer' || action === 'use' || action === 'talk') {
        hop = 1;
        return { duration: duration || 0.5, strike: 0.2 };
      }
      return null;
    },
    setStance(name) {
      stanceName = ['idle', 'combat', 'sleep', 'sit', 'dead'].includes(name) ? name : 'idle';
    },
    get stance() { return stanceName; },
    setLod(level) {
      setLodMeshes(level);
    },
    dispose() { disposeActor(model.group); },
  };
  actor.setLod(0);
  update(0.016, { speed: 0 });
  return actor;
}
