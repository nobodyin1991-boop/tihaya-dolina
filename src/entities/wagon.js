// The trade wagon — star of the caravan loop. Spoked wheels, iron-bound plank box, canvas bows and cover,
// driver on the seat, drawbar + yoke and a pair of draft animals walking in step. Cargo fills up, damage shows,
// lanterns glow at night. Origin: ground point under the middle of the box; the team extends towards +z.
import * as THREE from 'three';
import { PALETTE as P, glowMat } from '../world/materials.js';
import { tube, ball, slab, rod, hoop, sheet, part, joint, fuse, xf, shade, actorMat, damp, makeLod, disposeActor } from './rig.js';
import { createQuadruped } from './quadrupeds.js';
import { buildHumanoid } from './humanoid.js';
import { createHumanoidActor } from './humanoid-anim.js';

const M = { metal: 1 };
const HALF_PI = Math.PI / 2;
const PLANKS = [P.wood, P.woodLight, 0x7d5c3c, 0x86683f];

function wheelGeo(r) {
  const geos = [
    hoop(r - 0.035, 0.04, P.woodDark, [0, 0, 0], [0, HALF_PI, 0], { segs: 18, tubeSegs: 5, jitter: 0.06 }),
    hoop(r, 0.018, P.iron, [0, 0, 0], [0, HALF_PI, 0], { segs: 18, tubeSegs: 4, metal: 1 }),
    rod(0.085, 0.085, 0.16, P.woodDark, [0, 0, 0], [0, 0, HALF_PI], { segs: 8 }),
    rod(0.05, 0.05, 0.2, P.iron, [0, 0, 0], [0, 0, HALF_PI], { segs: 6, metal: 1 }),
  ];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    geos.push(rod(0.018, 0.024, r - 0.1, P.woodLight, [0, Math.cos(a) * (r * 0.5 + 0.01), Math.sin(a) * (r * 0.5 + 0.01)], [a, 0, 0], { segs: 5 }));
  }
  return fuse(geos);
}

function crate(w, h, d, pos, rotY = 0, color = P.woodLight) {
  const g = [
    slab(w, h, d, color, [0, h / 2, 0], [0, 0, 0], { gradient: [0.78, 1.05], jitter: 0.05 }),
    slab(w + 0.02, 0.05, d + 0.02, shade(color, 0.72), [0, h - 0.04, 0]),
    slab(w + 0.02, 0.05, d + 0.02, shade(color, 0.72), [0, 0.04, 0]),
    slab(0.05, h, d + 0.02, shade(color, 0.72), [w / 2 - 0.03, h / 2, 0]),
    slab(0.05, h, d + 0.02, shade(color, 0.72), [-w / 2 + 0.03, h / 2, 0]),
  ];
  return g.map(x => xf(x, pos, [0, rotY, 0]));
}

function barrel(r, h, pos, tilt = 0) {
  const g = [
    tube([[0, 0, 0, r * 0.86], [0, h * 0.5, 0, r], [0, h, 0, r * 0.86]], P.wood, { segs: 10, caps: 'flat', jitter: 0.06, gradient: [0.8, 1.05] }),
    hoop(r * 0.93, 0.012, P.iron, [0, h * 0.2, 0], [HALF_PI, 0, 0], { segs: 12, tubeSegs: 4, metal: 1 }),
    hoop(r * 0.93, 0.012, P.iron, [0, h * 0.8, 0], [HALF_PI, 0, 0], { segs: 12, tubeSegs: 4, metal: 1 }),
  ];
  return g.map(x => xf(x, pos, [tilt, 0, 0]));
}

function sack(r, pos, color = P.canvas) {
  return [ball(r, color, [pos[0], pos[1] + r * 0.7, pos[2]], [1, 0.75, 1.25], { segs: 7, rings: 5, jitter: 0.07 }), ball(r * 0.28, shade(color, 0.8), [pos[0], pos[1] + r * 1.15, pos[2] + r * 0.9], 1, { segs: 5, rings: 3 })];
}

/**
 * Build the caravan wagon with its team.
 * @param {{tier?:1|2|3, upgrades?:{sides?:boolean, lanterns?:boolean, cover?:boolean}}} [opts]
 * @returns {{group:THREE.Group, radius:number, length:number, seat:THREE.Object3D, team:object[], driver:object,
 *            update(dt:number, s:{speed:number, damage?:number, cargo?:number, night?:boolean}):void, setLod(l:number):void, dispose():void}}
 */
export function createWagon(opts = {}) {
  const tier = Math.max(1, Math.min(3, opts.tier || 1));
  const up = opts.upgrades || {};
  const k = 1 + (tier - 1) * 0.14;
  const len = 2.7 * k;
  const wid = 1.34 * (1 + (tier - 1) * 0.08);
  const rF = 0.5 * k;
  const rR = 0.62 * k;
  const bedY = rR + 0.2;
  const sideH = (up.sides ? 0.72 : 0.5) * (1 + (tier - 1) * 0.06);
  const hw = wid / 2;
  const hl = len / 2;
  const iron = tier >= 3 ? P.steel : P.iron;
  const group = new THREE.Group();
  const bodyJ = joint(group, 0, 0, 0, 'wagonBody');

  // ——— chassis
  const ch = [];
  for (let i = 0; i < 6; i++) ch.push(slab(wid / 6 - 0.012, 0.06, len, PLANKS[i % 4], [-hw + (i + 0.5) * (wid / 6), bedY, 0], [0, 0, 0], { jitter: 0.05 }));
  ch.push(slab(0.1, 0.12, len + 0.5, P.woodDark, [-hw * 0.55, bedY - 0.09, 0.1]));
  ch.push(slab(0.1, 0.12, len + 0.5, P.woodDark, [hw * 0.55, bedY - 0.09, 0.1]));
  const rows = Math.round(sideH / 0.17);
  for (const side of [1, -1]) {
    for (let r = 0; r < rows; r++) ch.push(slab(0.045, sideH / rows - 0.012, len, PLANKS[(r + (side > 0 ? 0 : 2)) % 4], [side * hw, bedY + 0.03 + (r + 0.5) * (sideH / rows), 0], [0, 0, side * -0.06], { jitter: 0.05 }));
    for (const z of [-hl + 0.08, -hl * 0.33, hl * 0.33, hl - 0.08]) {
      ch.push(slab(0.07, sideH + 0.16, 0.08, P.woodDark, [side * (hw + 0.03), bedY + sideH / 2, z], [0, 0, side * -0.06]));
      ch.push(slab(0.02, sideH * 0.9, 0.1, iron, [side * (hw + 0.07), bedY + sideH / 2, z], [0, 0, side * -0.06], M));
    }
    if (tier >= 2) ch.push(slab(0.02, 0.06, len + 0.04, iron, [side * (hw + 0.045), bedY + sideH + 0.01, 0], [0, 0, 0], M));
    if (up.sides) ch.push(slab(0.02, 0.07, len + 0.04, iron, [side * (hw + 0.04), bedY + sideH * 0.5, 0], [0, 0, 0], M));
  }
  for (const z of [-hl, hl]) {
    for (let r = 0; r < rows; r++) ch.push(slab(wid, sideH / rows - 0.012, 0.045, PLANKS[(r + 1) % 4], [0, bedY + 0.03 + (r + 0.5) * (sideH / rows), z], [0, 0, 0], { jitter: 0.05 }));
  }
  // axles, drawbar, yoke
  const axF = hl - 0.5;
  const axR = -hl + 0.55;
  ch.push(rod(0.05, 0.05, wid + 0.5, P.woodDark, [0, rF, axF], [0, 0, HALF_PI]));
  ch.push(rod(0.055, 0.055, wid + 0.5, P.woodDark, [0, rR, axR], [0, 0, HALF_PI]));
  ch.push(slab(0.5, bedY - rF - 0.1, 0.12, P.woodDark, [0, (bedY + rF) / 2 - 0.02, axF]));
  ch.push(slab(0.5, 0.12, 0.12, P.woodDark, [0, bedY - 0.12, axR]));
  const teamZ = hl + 2.35 * k;
  const poleLen = teamZ - axF + 0.75;
  const animalKind = tier === 1 ? 'ox' : 'draft_horse';
  const yokeY = tier === 1 ? 1.34 : 1.2;
  ch.push(xf(rod(0.04, 0.05, poleLen, P.wood, [0, 0, 0], [HALF_PI, 0, 0], { segs: 6 }), [0, (rF + yokeY * 0.72) / 2, axF + poleLen / 2], [-(yokeY * 0.72 - rF) / poleLen, 0, 0]));
  const yokeZ = teamZ + 0.55;
  ch.push(rod(0.045, 0.045, 1.5, P.woodLight, [0, yokeY * 0.74, yokeZ - 0.1], [0, 0, HALF_PI], { segs: 6 }));
  ch.push(slab(0.06, 0.06, 0.3, iron, [0, yokeY * 0.73, yokeZ - 0.1], [0, 0, 0], M));
  ch.push(slab(1.2, 0.07, 0.07, P.wood, [0, rF + 0.12, axF + 0.6]));
  for (const side of [1, -1]) {
    ch.push(xf(rod(0.012, 0.012, teamZ - axF - 0.4, P.leatherDark, [0, 0, 0], [HALF_PI, 0, 0], { segs: 4 }), [side * 0.95, rF + 0.42, (teamZ + axF) / 2 + 0.3], [-0.2, 0, 0]));
    ch.push(xf(rod(0.012, 0.012, teamZ - axF - 0.4, P.leatherDark, [0, 0, 0], [HALF_PI, 0, 0], { segs: 4 }), [side * 0.32, rF + 0.42, (teamZ + axF) / 2 + 0.3], [-0.2, 0, 0]));
  }
  // driver's seat + footboard
  const seatY = bedY + sideH + 0.14;
  const seatZ = hl - 0.2;
  ch.push(slab(wid * 0.92, 0.07, 0.42, P.woodLight, [0, seatY, seatZ], [0.04, 0, 0], { jitter: 0.05 }));
  ch.push(slab(wid * 0.92, 0.36, 0.05, P.wood, [0, seatY + 0.2, seatZ - 0.22], [-0.12, 0, 0], { jitter: 0.05 }));
  ch.push(slab(wid * 0.8, 0.05, 0.4, P.wood, [0, seatY - 0.44, hl + 0.3], [-0.25, 0, 0]));
  for (const side of [1, -1]) ch.push(slab(0.05, 0.5, 0.06, P.woodDark, [side * hw * 0.8, seatY - 0.22, hl + 0.06], [0.5, 0, 0]));
  // extras by tier
  if (tier >= 2) {
    ch.push(barrel(0.19, 0.44, [hw + 0.24, bedY - 0.1, -hl * 0.3]));
    ch.push(slab(0.5, 0.26, 0.3, P.woodDark, [-hw - 0.17, bedY + 0.1, hl * 0.2]));
    ch.push(slab(0.52, 0.04, 0.32, iron, [-hw - 0.17, bedY + 0.24, hl * 0.2], [0, 0, 0], M));
  }
  if (tier >= 3) {
    const spare = wheelGeo(rF * 0.9);
    ch.push(xf(spare, [0, bedY + sideH * 0.55, -hl - 0.13], [0, HALF_PI, 0]));
    for (const z of [-hl, hl]) ch.push(slab(wid + 0.12, 0.06, 0.03, iron, [0, bedY + sideH * 0.5, z + Math.sign(z) * 0.03], [0, 0, 0], M));
  }
  const lanternPos = [];
  if (up.lanterns) {
    for (const side of [1, -1]) {
      const lp = [side * (hw + 0.16), seatY + 0.62, hl - 0.05];
      lanternPos.push(lp);
      ch.push(slab(0.04, 0.8, 0.04, P.woodDark, [side * (hw + 0.02), seatY + 0.36, hl - 0.05]));
      ch.push(slab(0.2, 0.03, 0.03, iron, [side * (hw + 0.1), seatY + 0.76, hl - 0.05], [0, 0, 0], M));
      ch.push(rod(0.07, 0.03, 0.06, iron, [lp[0], lp[1] + 0.1, lp[2]], [0, 0, 0], { metal: 1, segs: 6 }));
      ch.push(rod(0.06, 0.06, 0.025, iron, [lp[0], lp[1] - 0.085, lp[2]], [0, 0, 0], { metal: 1, segs: 6 }));
      for (let i = 0; i < 4; i++) ch.push(rod(0.006, 0.006, 0.16, iron, [lp[0] + Math.cos(i * HALF_PI + 0.78) * 0.055, lp[1], lp[2] + Math.sin(i * HALF_PI + 0.78) * 0.055], [0, 0, 0], M));
    }
  }
  // canvas bows
  const bowH = 1.15 * k;
  const nBows = 5;
  const coverOn = !!up.cover;
  if (coverOn) {
    for (let i = 0; i < nBows; i++) {
      const z = -hl + 0.06 + (i / (nBows - 1)) * (len - 0.5);
      ch.push(xf(hoop(1, 0.022, P.woodPale, [0, 0, 0], [0, 0, 0], { segs: 12, tubeSegs: 4, arc: Math.PI }), [0, bedY + sideH, z], [0, 0, 0], [hw + 0.03, bowH, 1]));
    }
  }
  const chassis = part(ch, null, { name: 'chassis' });
  bodyJ.add(chassis);

  // ——— canvas cover (intact + torn variant)
  const covers = [];
  if (coverOn) {
    const coverFn = torn => (u, v) => {
      const ang = u * HALF_PI;
      const z = -hl + 0.02 + v * (len - 0.42);
      const sag = 1 - 0.035 * Math.abs(Math.sin(v * (nBows - 1) * Math.PI)) * Math.cos(ang);
      let x = Math.sin(ang) * (hw + 0.06) * sag;
      let y = bedY + sideH - 0.05 + Math.cos(ang) * (bowH + 0.03) * sag;
      if (Math.abs(u) > 0.93) y -= 0.1;
      if (torn && v > 0.42 && v < 0.72 && u > 0.1 && u < 0.75) {
        y -= 0.45 * Math.sin(((v - 0.42) / 0.3) * Math.PI);
        x *= 0.82;
      }
      return [x, y, z];
    };
    for (const torn of [false, true]) {
      const g = [sheet(12, 12, coverFn(torn), P.canvas, { jitter: 0.05, gradient: [0.74, 1.06] })];
      if (!torn) g.push(sheet(6, 2, (u, v) => [u * (hw - 0.02) * (1 - v * 0.15), bedY + sideH + bowH * (1 - v * 0.42) * Math.cos(u * HALF_PI * 0.98), -hl + 0.0 - v * 0.03], shade(P.canvas, 0.9)));
      else g.push(slab(0.3, 0.3, 0.02, 0x8a7a5a, [hw * 0.5, bedY + sideH + bowH * 0.55, 0.3], [0.3, 0.2, 0.8]));
      const mesh = part(g, null, { double: true, name: torn ? 'coverTorn' : 'cover' });
      mesh.userData.hidden = torn;
      mesh.visible = !torn;
      bodyJ.add(mesh);
      covers.push(mesh);
    }
  }

  // ——— cargo in three fill levels
  const y0 = bedY + 0.03;
  const cargoDefs = [
    [crate(0.6, 0.45, 0.6, [-hw * 0.45, y0, -hl * 0.55], 0.1), barrel(0.24, 0.6, [hw * 0.45, y0, -hl * 0.6]), sack(0.26, [0.1, y0, -hl * 0.12]), sack(0.24, [-hw * 0.5, y0, hl * 0.05], 0xb8a67c)],
    [crate(0.55, 0.42, 0.7, [hw * 0.42, y0, hl * 0.3], -0.08, P.wood), barrel(0.22, 0.56, [-hw * 0.45, y0, hl * 0.5]), crate(0.5, 0.38, 0.5, [-hw * 0.4, y0 + 0.47, -hl * 0.55], 0.3), sack(0.25, [hw * 0.3, y0, -hl * 0.1])],
    [crate(0.6, 0.4, 0.55, [hw * 0.35, y0 + 0.44, hl * 0.28], 0.15), sack(0.27, [0, y0 + 0.4, -hl * 0.12], 0xb8a67c), sack(0.25, [-hw * 0.4, y0 + 0.3, hl * 0.1]), barrel(0.17, 0.4, [hw * 0.42, y0 + 0.62, -hl * 0.6]), crate(0.4, 0.3, 0.4, [-hw * 0.4, y0 + 0.58, hl * 0.5], -0.3, P.wood)],
  ];
  const cargo = cargoDefs.map((def, i) => {
    const mesh = part(def, null, { name: 'cargo' + i });
    bodyJ.add(mesh);
    return mesh;
  });
  let tarp = null;
  if (!coverOn) {
    tarp = part([sheet(8, 8, (u, v) => {
      const z = -hl * 0.9 + v * len * 0.86;
      const edge = Math.max(Math.abs(u), Math.abs(v * 2 - 1));
      const lump = 0.55 + 0.1 * Math.sin(u * 4 + v * 7) + 0.08 * Math.cos(v * 11 - u * 3);
      return [u * (hw + 0.04), bedY + sideH * 0.8 + lump * (1 - Math.pow(edge, 3)) * 0.75, z];
    }, P.canvas, { jitter: 0.05, gradient: [0.72, 1.05] })], null, { double: true, name: 'tarp' });
    bodyJ.add(tarp);
  }

  // ——— damage overlays
  const dmg1 = part([
    slab(0.05, 0.16, 0.8, 0x2e2620, [hw + 0.012, bedY + sideH * 0.62, -hl * 0.2], [0.12, 0, -0.06]),
    slab(0.05, 0.14, 0.5, P.woodDark, [hw + 0.06, bedY + sideH * 0.25, -hl * 0.45], [0.5, 0.1, -0.3]),
    ...[[-0.3, 0.3], [0.2, 0.55], [0.5, 0.35]].map(a => [
      xf(rod(0.008, 0.008, 0.5, P.woodPale, [0, 0, 0], [0, 0, HALF_PI], { segs: 4 }), [-hw - 0.22, bedY + sideH * a[1], hl * a[0]], [0, 0.3, 0.25]),
      xf(slab(0.1, 0.05, 0.004, P.clothRed, [0, 0, 0]), [-hw - 0.44, bedY + sideH * a[1] + 0.055, hl * a[0] + 0.07], [0, 0.3, 0.25]),
    ]),
  ], null, { name: 'damage1' });
  const dmg2 = part([
    slab(0.3, 0.05, 0.6, 0x241e1a, [-hw * 0.3, bedY + 0.036, hl * 0.4], [0, 0.3, 0]),
    slab(0.06, 0.5, 0.06, P.woodDark, [-hw - 0.03, bedY + sideH * 0.8, -hl * 0.33], [0.2, 0, 0.5]),
    slab(wid * 0.5, 0.14, 0.05, 0x2a221c, [hw * 0.2, bedY + sideH * 0.7, -hl - 0.012], [0, 0, 0.12]),
    ball(0.2, 0x1e1a18, [hw * 0.3, bedY + sideH * 0.5, hl * 0.1], [0.12, 1, 1.4], { segs: 6, rings: 4, gradient: false }),
  ], null, { name: 'damage2' });
  for (const m of [dmg1, dmg2]) {
    m.userData.hidden = true;
    m.visible = false;
    bodyJ.add(m);
  }

  // ——— lantern glow (night only)
  let lanternGlow = null;
  if (lanternPos.length) {
    const g = new THREE.CylinderGeometry(0.048, 0.048, 0.15, 6);
    const g2 = g.clone();
    g.translate(...lanternPos[0]);
    g2.translate(...lanternPos[1]);
    const a = g.toNonIndexed().attributes.position.array;
    const b = g2.toNonIndexed().attributes.position.array;
    const all = new Float32Array(a.length + b.length);
    all.set(a, 0);
    all.set(b, a.length);
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(all, 3));
    merged.computeVertexNormals();
    lanternGlow = new THREE.Mesh(merged, glowMat(0xffa848, 1.9));
    lanternGlow.castShadow = false;
    lanternGlow.userData.shadow = false;
    bodyJ.add(lanternGlow);
    g.dispose();
    g2.dispose();
  }
  const lanternDark = lanternPos.length ? new THREE.Mesh(lanternGlow.geometry, actorMat()) : null;
  if (lanternDark) {
    lanternDark.geometry = lanternGlow.geometry.clone();
    const n = lanternDark.geometry.attributes.position.count;
    const col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) col.set([0.05, 0.06, 0.07, 0.4], i * 4);
    lanternDark.geometry.setAttribute('color', new THREE.BufferAttribute(col, 4));
    bodyJ.add(lanternDark);
  }

  // ——— wheels
  const geoF = wheelGeo(rF);
  const geoR = wheelGeo(rR);
  const wheels = [];
  for (const [x, z, r, geo] of [[1, axF, rF, geoF], [-1, axF, rF, geoF], [1, axR, rR, geoR], [-1, axR, rR, geoR]]) {
    const mesh = new THREE.Mesh(geo, actorMat());
    mesh.castShadow = true;
    mesh.position.set(x * (hw + 0.2), r, z);
    mesh.userData.r = r;
    group.add(mesh);
    wheels.push(mesh);
  }

  // ——— driver
  const driverModel = buildHumanoid({
    scale: 0.98, hat: { kind: 'straw', color: P.clothRed }, beard: 'short', hair: P.hairBrown,
    top: { kind: 'tunic', color: tier >= 2 ? P.clothBlue : P.clothBrown, skirt: 0.16 }, sleeves: { kind: 'long', color: P.clothCream },
    overlay: { kind: 'vest', color: P.leather }, legs: { color: 0x4a3e2c }, boots: { color: P.leatherDark, tall: true },
  });
  const driver = createHumanoidActor(driverModel, { style: 'unarmed', seed: 11 });
  driver.setStance('sit');
  driver.group.position.set(-hw * 0.3, seatY - 0.38, seatZ + 0.12);
  const seat = joint(bodyJ, -hw * 0.3, seatY - 0.38, seatZ + 0.12, 'seat');
  bodyJ.add(driver.group);

  // ——— team
  const team = [];
  for (const side of [1, -1]) {
    const animal = createQuadruped(animalKind, { seed: 21 + (side > 0 ? 0 : 5) + tier, harness: { color: P.leatherDark, blanket: tier >= 3 ? P.clothRed : null } });
    animal.group.position.set(side * 0.63, 0, teamZ);
    group.add(animal.group);
    team.push(animal);
  }

  const setLodMeshes = makeLod(group);
  let time = 0;
  let dmg = 0;
  let jolt = 0;
  let lastCargo = -1;
  let lastDmgLevel = -1;
  let lastNight = null;
  let lodLevel = 0;

  function refresh(cargoFill, night) {
    const level = dmg > 0.6 ? 2 : dmg > 0.28 ? 1 : 0;
    if (cargoFill === lastCargo && level === lastDmgLevel && night === lastNight) return;
    lastCargo = cargoFill;
    lastDmgLevel = level;
    lastNight = night;
    cargo[0].userData.hidden = cargoFill < 0.05;
    cargo[1].userData.hidden = cargoFill < 0.4;
    cargo[2].userData.hidden = cargoFill < 0.75;
    if (tarp) tarp.userData.hidden = cargoFill < 0.4;
    dmg1.userData.hidden = level < 1;
    dmg2.userData.hidden = level < 2;
    if (covers.length) {
      covers[0].userData.hidden = level >= 2;
      covers[1].userData.hidden = level < 2;
    }
    if (lanternGlow) {
      lanternGlow.userData.hidden = !night;
      lanternDark.userData.hidden = !!night;
    }
    group.traverse(o => { if (o.isMesh && o.userData.hidden !== undefined) o.visible = !o.userData.hidden; });
  }

  function update(dt, s = {}) {
    dt = Math.min(dt, 0.1);
    time += dt;
    const speed = s.speed || 0;
    dmg = damp(dmg, s.damage || 0, 4, dt);
    refresh(s.cargo ?? 1, !!s.night);
    for (const w of wheels) w.rotation.x += (speed * dt) / w.userData.r;
    wheels[0].rotation.z = Math.sin(wheels[0].rotation.x) * 0.1 * Math.max(0, dmg - 0.3);
    wheels[3].rotation.z = Math.sin(wheels[3].rotation.x + 1) * 0.14 * Math.max(0, dmg - 0.6);
    const rough = Math.min(1, speed / 2.5);
    jolt = damp(jolt, (Math.sin(time * 7.3) * Math.sin(time * 3.1) > 0.75 ? 1 : 0) * rough, 14, dt);
    bodyJ.position.y = Math.sin(time * 5.1) * 0.006 * rough + jolt * 0.018 - dmg * 0.03;
    bodyJ.rotation.z = Math.sin(time * 2.3) * 0.012 * rough + dmg * 0.045;
    bodyJ.rotation.x = Math.sin(time * 3.4 + 1) * 0.006 * rough - dmg * 0.012;
    for (const animal of team) animal.update(dt, { speed });
    if (lodLevel < 2) driver.update(dt, { speed: 0 });
  }

  const wagon = {
    group,
    radius: Math.max(hw + 0.5, 1.2),
    /** Total length from the tail board to the animals' noses; the box itself is `boxLength`. */
    length: hl + teamZ + 1.4,
    boxLength: len,
    seat, team, driver,
    update,
    setLod(level) {
      lodLevel = level;
      for (const animal of team) animal.setLod(level);
      driver.setLod(level);
      setLodMeshes(level);
      lastCargo = -1;
    },
    dispose() {
      disposeActor(group);
    },
  };
  wagon.setLod(0);
  update(0.016, { speed: 0, cargo: 1 });
  return wagon;
}
