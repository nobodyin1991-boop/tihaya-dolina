// Procedural animation for quadrupeds: walk / trot / gallop with diagonal phases and planted-foot IK,
// idle grazing / sniffing / looking around, tail and ear secondary motion, one-shot attacks, stances, death.
import { compilePose, compileTrack, sampleTrack, trackWeight, gaitFoot, legIK, damp, lerp, smoothstep, clamp, makeLod, disposeActor } from './rig.js';

export const QJ = ['root', 'rootPos', 'body', 'bodyPos', 'front', 'rear', 'neck', 'head', 'jaw', 'ears', 'tail', 'feet', 'legF', 'legH'];
const I = {};
for (const name of QJ) I[name] = QJ.indexOf(name) * 3;
const TWO_PI = Math.PI * 2;

// leg order: FL, FR, HL, HR
const WALK = [0.25, 0.75, 0, 0.5];
const TROT = [0, 0.5, 0.5, 0];
const GALLOP = [0.5, 0.62, 0, 0.12];
const HOP = [0.5, 0.5, 0, 0];

/** bodyPos is in fractions of body height (y) and body length (x, z); feet = [frontLift, frontReach, hindShift] × leg height. */
function stanceDefs(sp, dims) {
  const lie = -(dims.H - sp.belly[1] * 0.95) / dims.H;
  return {
    idle: { pose: {} },
    combat: { idle: 0.25, pose: { bodyPos: [0, -0.07, 0], neck: [0.32, 0, 0], head: [-0.12, 0, 0], jaw: [0.14, 0, 0], ears: [-0.6, 0, 0], tail: [0.35, 0, 0], feet: [0, 0.08, -0.08] } },
    sit: { idle: 0.6, pose: { body: [-0.5, 0, 0], bodyPos: [0, -0.2, -0.08], neck: [0.4, 0, 0], feet: [0, -0.1, 0.35], tail: [-0.3, 0, 0] } },
    sleep: { idle: 0, breath: 1.6, rate: 3, pose: { bodyPos: [0, lie, 0], body: [0, 0, 0.12], neck: [sp.neck.pitch + 0.55, 0.7, 0], head: [-0.25, 0.3, 0.3], ears: [-0.4, 0, 0], tail: [-0.5, 1.0, 0], feet: [0, 0.3, -0.2] } },
    dead: { idle: 0, breath: 0, rate: 5, lock: 1, pose: { root: [0, 0, 1.5], rootPos: [0, sp.chest[0] * 0.85, 0], neck: [sp.neck.pitch * 0.6, 0.25, 0], head: [0.2, 0, 0], jaw: [0.3, 0, 0], legF: [-0.35, 0.5, 0], legH: [0.25, -0.6, 0], tail: [-0.3, 0, 0] } },
  };
}

function trackDefs(sp) {
  const reach = sp.lunge ?? 0.34;
  const defs = {
    bite: {
      dur: 0.62, strike: 0.5, fout: 0.35,
      keys: [
        [0, 'io', { bodyPos: [0, -0.04, -0.05], body: [0, 0, 0], neck: [-0.1, 0, 0], head: [0, 0, 0], jaw: [0.1, 0, 0], ears: [-0.6, 0, 0], feet: [0, 0, 0] }],
        [0.34, 'out', { bodyPos: [0, -0.1, -0.16], neck: [-0.3, 0, 0], head: [-0.25, 0, 0], jaw: [0.8, 0, 0], feet: [0, -0.1, -0.1] }],
        [0.5, 'in', { bodyPos: [0, -0.03, reach], body: [0.07, 0, 0], neck: [0.22, 0, 0], head: [0.05, 0, 0], jaw: [0.9, 0, 0], feet: [0, 0.3, 0.1] }],
        [0.58, 'snap', { jaw: [0, 0, 0], head: [0.2, 0, 0.3] }],
        [0.75, 'io', { head: [0.1, 0, -0.3], bodyPos: [0, -0.03, reach * 0.8] }],
        [1, 'io', { bodyPos: [0, 0, reach * 0.2], body: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], feet: [0, 0.05, 0] }],
      ],
    },
    swipe: {
      dur: 0.7, strike: 0.52, fout: 0.3,
      keys: [
        [0, 'io', { body: [0, 0, 0], bodyPos: [0, 0, 0], feet: [0, 0, 0], jaw: [0.2, 0, 0], neck: [0, 0, 0] }],
        [0.34, 'out', { body: [-0.3, 0, 0], bodyPos: [0, 0.04, -0.1], feet: [0.6, -0.05, 0], jaw: [0.6, 0, 0], neck: [0.25, 0, 0] }],
        [0.54, 'in', { body: [0.08, 0, 0], bodyPos: [0, -0.05, reach * 0.7], feet: [0.05, 0.6, 0], jaw: [0.5, 0, 0], neck: [0.1, 0, 0] }],
        [1, 'io', { body: [0, 0, 0], bodyPos: [0, 0, 0.05], feet: [0, 0.05, 0], jaw: [0, 0, 0] }],
      ],
    },
    heavy: {
      dur: 0.95, strike: 0.6, fout: 0.3,
      keys: [
        [0, 'io', { body: [0, 0, 0], bodyPos: [0, 0, 0], feet: [0, 0, 0], jaw: [0.1, 0, 0], neck: [0, 0, 0], ears: [-0.6, 0, 0] }],
        [0.38, 'out', { body: [0.1, 0, 0], bodyPos: [0, -0.2, -0.2], feet: [0, -0.15, -0.15], jaw: [0.3, 0, 0], neck: [-0.2, 0, 0] }],
        [0.58, 'in', { body: [-0.35, 0, 0], bodyPos: [0, 0.22, reach * 1.6], feet: [0.5, 0.5, 0.3], jaw: [0.9, 0, 0], neck: [0.3, 0, 0] }],
        [0.74, 'out', { body: [0.12, 0, 0], bodyPos: [0, -0.12, reach * 1.5], feet: [0, 0.3, 0.3], jaw: [0.1, 0, 0] }],
        [1, 'io', { body: [0, 0, 0], bodyPos: [0, 0, reach * 0.3], feet: [0, 0.05, 0], neck: [0, 0, 0] }],
      ],
    },
    charge: {
      dur: 1.0, strike: 0.5, fin: 0.2, fout: 0.25,
      keys: [
        [0, 'io', { neck: [0.75, 0, 0], head: [0.35, 0, 0], bodyPos: [0, -0.08, 0], body: [0.06, 0, 0], ears: [-0.7, 0, 0], tail: [0.6, 0, 0] }],
        [0.5, 'io', { neck: [0.85, 0, 0], head: [0.25, 0, 0], bodyPos: [0, -0.1, 0.12] }],
        [0.62, 'out', { neck: [0.1, 0, 0], head: [-0.4, 0, 0], bodyPos: [0, -0.02, 0.25] }],
        [1, 'io', { neck: [0.3, 0, 0], head: [0, 0, 0], bodyPos: [0, -0.04, 0.05] }],
      ],
    },
    howl: {
      dur: 2.4, strike: 0.3, fin: 0.16, fout: 0.2,
      keys: [
        [0, 'io', { body: [-0.1, 0, 0], neck: [-0.4, 0, 0], head: [-0.3, 0, 0], jaw: [0.1, 0, 0], ears: [-0.6, 0, 0], tail: [-0.2, 0, 0] }],
        [0.25, 'io', { body: [-0.2, 0, 0], neck: [-0.8, 0, 0], head: [-0.65, 0, 0], jaw: [0.5, 0, 0] }],
        [0.55, 'io', { neck: [-0.85, 0.08, 0], head: [-0.7, 0, 0], jaw: [0.42, 0, 0] }],
        [0.8, 'io', { neck: [-0.8, -0.08, 0], head: [-0.62, 0, 0], jaw: [0.5, 0, 0] }],
        [1, 'io', { body: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], jaw: [0, 0, 0] }],
      ],
    },
    hit: {
      dur: 0.42, strike: 0.1, fin: 0.08, fout: 0.55,
      keys: [
        [0, 'io', { bodyPos: [0.06, -0.06, -0.14], body: [-0.06, 0.1, 0.16], neck: [-0.25, 0.35, 0], head: [-0.1, 0.2, 0.2], jaw: [0.35, 0, 0], ears: [-0.8, 0, 0] }],
        [1, 'io', { bodyPos: [0, 0, 0], body: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], jaw: [0, 0, 0] }],
      ],
    },
    dodge: {
      dur: 0.45, strike: 0.2, fin: 0.15, fout: 0.4,
      keys: [
        [0, 'io', { bodyPos: [0, -0.1, 0], body: [0, 0, 0] }],
        [0.45, 'out', { bodyPos: [0.5, -0.12, -0.1], body: [0, 0.25, 0.22], neck: [0.2, -0.4, 0] }],
        [1, 'io', { bodyPos: [0, 0, 0], body: [0, 0, 0], neck: [0, 0, 0] }],
      ],
    },
  };
  if (sp.rears) {
    defs.heavy = {
      dur: 1.5, strike: 0.7, fout: 0.25,
      keys: [
        [0, 'io', { body: [0, 0, 0], bodyPos: [0, 0, 0], feet: [0, 0, 0], jaw: [0.1, 0, 0], neck: [0, 0, 0], head: [0, 0, 0] }],
        [0.3, 'io', { body: [-1.0, 0, 0], bodyPos: [0, 0.3, -0.12], feet: [1.1, 0.25, 0.1], jaw: [0.5, 0, 0], neck: [1.0, 0, 0], head: [0.1, 0, 0] }],
        [0.45, 'io', { body: [-1.08, 0.08, 0], feet: [1.3, 0.1, 0.1], jaw: [0.95, 0, 0], neck: [0.9, 0.15, 0] }],
        [0.6, 'io', { body: [-1.02, -0.08, 0], feet: [1.2, 0.3, 0.1], jaw: [0.9, 0, 0], neck: [0.95, -0.15, 0] }],
        [0.72, 'in', { body: [0.1, 0, 0], bodyPos: [0, -0.1, 0.3], feet: [0, 0.45, 0.1], jaw: [0.3, 0, 0], neck: [0.3, 0, 0] }],
        [1, 'io', { body: [0, 0, 0], bodyPos: [0, 0, 0.05], feet: [0, 0.05, 0], jaw: [0, 0, 0], neck: [0, 0, 0] }],
      ],
    };
  }
  return defs;
}

const foot = { z: 0, lift: 0, swing: 0 };
const ikOut = { a: 0, b: 0 };

/** Wrap a quadruped model into an Actor. */
export function createQuadrupedActor(model) {
  const sp = model.spec;
  const dims = model.dims;
  const J = model.J;
  const scale = sp.scale || 1;
  const n = QJ.length * 3;
  const cur = new Float32Array(n);
  const tgt = new Float32Array(n);
  const stances = {};
  const sdefs = stanceDefs(sp, dims);
  for (const key of Object.keys(sdefs)) {
    const d = sdefs[key];
    stances[key] = { vals: compilePose(QJ, d.pose), idle: d.idle ?? 1, breath: d.breath ?? 1, rate: d.rate ?? 7, lock: d.lock || 0 };
  }
  const tracks = {};
  const tdefs = trackDefs(sp);
  for (const key of Object.keys(tdefs)) tracks[key] = compileTrack(QJ, tdefs[key]);
  tracks.attack = tracks.bite;
  tracks.attack2 = sp.swipe ? tracks.swipe : tracks.bite;
  let stance = stances.idle;
  let stanceName = 'idle';
  let time = ((sp.seed || 0) % 13) * 0.7;
  let phase = ((sp.seed || 0) % 10) / 10;
  let moving = 0;
  let trot = 0;
  let gallop = sp.gait === 'hop' ? 1 : 0;
  let lock = 0;
  let overlay = null;
  let ot = 0;
  let odur = 1;
  let lod = 0;
  let frame = 0;
  let skipped = 0;
  let idleMode = 0;      // 0 look, 1 graze / sniff
  let idleTimer = 2 + ((sp.seed || 0) % 4);
  let idleNeck = 0;
  let lookYaw = 0;
  let lookTarget = 0;
  let earTwitch = 0;
  let rngState = ((sp.seed || 1) * 7919) >>> 0;
  const rng = () => {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  };
  const off = [0, 0, 0, 0];
  const setLodMeshes = makeLod(model.group);
  const tailPitch = (sp.tail && sp.tail.pitch) ?? -0.9;
  const hop = sp.gait === 'hop';

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
    const a = speed / sp.speed.run;
    moving = damp(moving, smoothstep(0.02, 0.25, speed), 9, dt);
    trot = damp(trot, smoothstep(0.2, 0.36, a), 6, dt);
    gallop = hop ? 1 : damp(gallop, smoothstep(0.52, 0.78, a), 5, dt);
    lock = damp(lock, st.lock, 6, dt);
    const duty = hop ? 0.34 : lerp(lerp(0.64, 0.5, trot), 0.3, gallop);
    const cycleLen = dims.hF * (hop ? 2.2 + a * 2.5 : lerp(lerp(1.25, 2.0, trot), 3.4 + a * 1.2, gallop)) * (sp.strideK || 1);
    phase += (speed * dt) / cycleLen;
    phase -= Math.floor(phase);
    const stride = duty * cycleLen;
    const liftK = hop ? 0.3 : lerp(lerp(0.13, 0.2, trot), 0.32, gallop);
    for (let i = 0; i < 4; i++) off[i] = hop ? HOP[i] : lerp(lerp(WALK[i], TROT[i], trot), GALLOP[i], gallop);
    const sp2 = Math.sin(phase * TWO_PI);
    const cp2 = Math.cos(phase * TWO_PI);
    const g = gallop * moving;

    // ——— target pose
    tgt.set(st.vals);
    tgt[I.bodyPos + 1] += -0.03 * moving + g * 0.07 * Math.sin(phase * TWO_PI + 0.9) - (1 - gallop) * trot * moving * 0.025 * Math.abs(Math.sin(phase * TWO_PI * 2));
    tgt[I.body] += g * 0.1 * Math.sin(phase * TWO_PI + 2.2);
    tgt[I.front] += -g * 0.14 * sp2;
    tgt[I.rear] += g * 0.16 * sp2;
    tgt[I.body + 2] += (1 - gallop) * moving * 0.035 * Math.sin(phase * TWO_PI * (1 + trot));
    tgt[I.body + 1] += (1 - gallop) * moving * 0.04 * cp2;
    tgt[I.root + 2] += clamp(-turn * 0.05 * moving, -0.2, 0.2);
    tgt[I.neck] += moving * (0.12 + 0.3 * gallop) + (1 - gallop) * moving * 0.05 * Math.sin(phase * TWO_PI * 2);
    tgt[I.neck + 1] += clamp(turn * 0.15, -0.4, 0.4);
    tgt[I.ears] -= 0.5 * g;
    tgt[I.tail] += moving * (0.25 + 0.5 * gallop);
    const breathe = Math.sin(time * 1.9) * st.breath;
    tgt[I.bodyPos + 1] += breathe * 0.006;
    const idle = (1 - moving) * st.idle;
    if (lod < 2) {
      idleTimer -= dt;
      if (idleTimer <= 0) {
        if (idleMode === 0 && rng() < 0.55 && sp.idle !== 'none') {
          idleMode = 1;
          idleTimer = 3 + rng() * 4;
        } else {
          idleMode = 0;
          idleTimer = 2 + rng() * 5;
          lookTarget = (rng() - 0.5) * 1.3;
        }
        if (rng() < 0.6) earTwitch = 1;
      }
      const grazeDepth = sp.idle === 'graze' ? sp.neck.pitch + (sp.grazeReach ?? 0.75) : 0.45;
      idleNeck = damp(idleNeck, idleMode === 1 ? grazeDepth : 0, 2.2, dt);
      lookYaw = damp(lookYaw, idleMode === 1 ? Math.sin(time * 1.4) * 0.25 : lookTarget, 2.5, dt);
      earTwitch = Math.max(0, earTwitch - dt * 4);
      tgt[I.neck] += idleNeck * idle;
      tgt[I.body] += idleNeck * 0.1 * idle;
      tgt[I.head] += idleNeck * idle * (sp.idle === 'graze' ? -0.35 : -0.2) + Math.sin(time * 6) * 0.03 * idle * (idleMode === 1 ? 1 : 0);
      tgt[I.neck + 1] += lookYaw * idle * 0.6;
      tgt[I.head + 1] += lookYaw * idle * 0.5;
      tgt[I.ears] += Math.sin(earTwitch * Math.PI * 2) * 0.35;
    }
    const k = 1 - Math.exp(-st.rate * dt);
    for (let i = 0; i < n; i++) cur[i] += (tgt[i] - cur[i]) * k;
    if (overlay) {
      ot += dt / odur;
      if (ot >= 1) overlay = null;
      else sampleTrack(overlay, ot, cur, trackWeight(overlay, ot));
    }

    // ——— apply spine, neck, head
    model.root.rotation.set(cur[I.root], cur[I.root + 1], cur[I.root + 2]);
    model.root.position.set(cur[I.rootPos], cur[I.rootPos + 1], cur[I.rootPos + 2]);
    const bodyY = dims.H * (1 + cur[I.bodyPos + 1]);
    const bodyZ = cur[I.bodyPos + 2] * dims.L;
    model.body.position.set(cur[I.bodyPos] * dims.L, bodyY, bodyZ);
    model.body.rotation.set(cur[I.body], cur[I.body + 1], cur[I.body + 2]);
    J.front.rotation.x = cur[I.front];
    J.rear.rotation.x = cur[I.rear];
    const neckX = -sp.neck.pitch + cur[I.neck];
    J.neck.rotation.set(neckX, cur[I.neck + 1], cur[I.neck + 2]);
    const level = -(neckX + cur[I.body] + cur[I.front]);
    J.head.rotation.set(level * (sp.headLevel ?? 0.85) + (sp.head.pitch || 0) + cur[I.head], cur[I.head + 1], cur[I.head + 2]);
    J.jaw.rotation.x = Math.max(0, cur[I.jaw]) * 0.7;
    J.ears.rotation.x = cur[I.ears] * 0.6;

    // ——— legs
    for (let i = 0; i < 4; i++) {
      const leg = model.legs[i];
      const theta = cur[I.body] + (leg.isFront ? cur[I.front] : cur[I.rear]);
      const ct = Math.cos(theta);
      const stn = Math.sin(theta);
      const hip = leg.hip;
      const hipY = bodyY + hip[1] * ct - hip[2] * stn;
      const hipZ = bodyZ + hip[1] * stn + hip[2] * ct;
      gaitFoot(phase + off[i], duty, foot);
      const hLeg = leg.isFront ? dims.hF : dims.hR;
      let fz = hip[2] + foot.z * stride * moving;
      let fy = foot.lift * liftK * hLeg * moving;
      if (leg.isFront) {
        fz += cur[I.feet + 1] * hLeg;
        fy += cur[I.feet] * hLeg;
      } else {
        fz += cur[I.feet + 2] * hLeg + (sp.hindSet ?? -0.12) * hLeg;
      }
      const dy = fy - hipY;
      const dz = fz - hipZ;
      legIK(-dy * stn + dz * ct, dy * ct + dz * stn, leg.l1, leg.l2, leg.isFront ? 1 : -1, ikOut);
      let ux = ikOut.a;
      let lx = ikOut.b;
      if (lock > 0.001) {
        const ch = leg.isFront ? I.legF : I.legH;
        ux = lerp(ux, cur[ch] + (leg.side > 0 ? 0 : 0.25), lock);
        lx = lerp(lx, cur[ch + 1], lock);
      }
      leg.upper.rotation.x = ux;
      leg.lower.rotation.x = lx;
    }

    // ——— tail
    if (lod < 2 || frame % 4 === 0) {
      const wag = Math.sin(time * (2.2 + moving * 4)) * (0.12 + 0.1 * moving) * (st.breath > 0 ? 1 : 0);
      const tails = model.tail;
      for (let i = 0; i < tails.length; i++) {
        const tj = tails[i];
        if (i === 0) tj.rotation.set(tailPitch + cur[I.tail] + g * 0.08 * cp2, cur[I.tail + 1] + wag, 0);
        else tj.rotation.set((sp.tail.curl ?? 0.15) + g * 0.1 * Math.sin(phase * TWO_PI - i), Math.sin(time * (2.2 + moving * 4) - i * 0.9) * (0.18 + 0.1 * moving), 0);
      }
    }
  }

  const actor = {
    group: model.group,
    height: model.height,
    radius: model.radius,
    model,
    attach: { head: J.head, back: J.front, saddle: model.sockets.saddle || null },
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
      const next = stances[name] || stances.idle;
      stance = next;
      stanceName = stances[name] ? name : 'idle';
      if (name === 'dead') overlay = null;
    },
    get stance() { return stanceName; },
    get busy() { return !!overlay; },
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
