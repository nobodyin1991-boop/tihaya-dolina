// Roadside furniture of the whole world (always loaded, a few merged meshes per road): milestones every ~250 m
// along the caravan legs, signposts at junctions and city approaches, lantern posts outside the gates, waystones,
// wrecked carts, old camp sites, low stone walls and fences near farms. Everything stands OFF the roadway.
import * as THREE from 'three';
import { PALETTE as P } from './materials.js';
import { makeRng, seedFrom } from '../core/noise.js';
import { ROADS, heightAt, cityAt, poiAt, bridgeAt, slopeAt } from './terrain.js';
import { CITIES, POIS } from '../data/world-map.js';
import { Mesher } from './mesher.js';
import { emitProp } from './props.js';

/** Point beside a road at arc length s: `side` = ±1, `off` metres from the centre line. */
function beside(road, s, side, off) {
  const S = road.path.samples;
  let i = Math.min(S.length - 2, Math.max(0, Math.floor(s / road.path.spacing)));
  while (i < S.length - 2 && S[i + 1].s < s) i++;
  const a = S[i], b = S[i + 1];
  const t = Math.max(0, Math.min(1, (s - a.s) / Math.max(1e-6, b.s - a.s)));
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
  const x = a.x + dx * t + side * dz / len * off, z = a.z + dz * t - side * dx / len * off;
  return { x, z, yaw: Math.atan2(dx, dz), y: heightAt(x, z) };
}

/** True where roadside things may stand: dry, gentle ground outside settlements and bridges. */
function usable(p, margin = 4) {
  if (p.y < 0.6) return false;
  if (cityAt(p.x, p.z, margin) || poiAt(p.x, p.z, 2) || bridgeAt(p.x, p.z)) return false;
  return slopeAt(p.x, p.z) < 0.12;
}

function milestone(m, rng, number) {
  m.box(0.5, 1.05, 0.34, 0x8f8d84, 0, -0.2, 0, { top: [0.82, 0.8], vj: 0.08, g: [0.7, 1.05], lean: [(rng() - 0.5) * 0.1, (rng() - 0.5) * 0.08] });
  m.box(0.34, 0.06, 0.03, 0x4f4d48, 0, 0.56, 0.16, { nb: true });
  for (let i = 0; i < Math.min(5, 1 + number % 5); i++) m.box(0.035, 0.16, 0.03, 0x4f4d48, -0.12 + i * 0.06, 0.3, 0.165, { nb: true });
  m.use('foliage').ico(0.2, P.moss, 0.18, 0.02, 0.1, { noise: 0.3, s: [1.3, 0.5, 1], sway: 0.1 });
  m.use('flat');
}

function waystone(m, rng) {
  m.box(1.5, 0.3, 1.5, 0x77756d, 0, -0.1, 0, { vj: 0.08 });
  m.box(0.8, 2.3, 0.8, 0x8f8d84, 0, 0.2, 0, { top: [0.55, 0.55], vj: 0.08, g: [0.72, 1.06], lean: [0.05, -0.04] });
  m.box(0.6, 0.6, 0.6, 0x9d9a90, 0.05, 2.5, -0.04, { ry: Math.PI / 4, top: [0.1, 0.1] });
  m.cyl(0.24, 0.24, 0.05, P.amber, 0, 1.5, 0.36, { rx: Math.PI / 2, seg: 8 });
  m.cyl(0.14, 0.14, 0.06, 0x8f8d84, 0, 1.5, 0.37, { rx: Math.PI / 2, seg: 8 });
}

function campRemains(m, rng) {
  for (let i = 0; i < 8; i++) m.ico(0.16, i % 2 ? P.stone : P.stoneDark, Math.cos(i * 0.8) * 0.6, 0.06, Math.sin(i * 0.8) * 0.6, { noise: 0.25 });
  m.cyl(0.4, 0.45, 0.04, 0x1f1c1a, 0, 0.01, 0, { seg: 7 });
  m.cyl(0.07, 0.08, 0.8, 0x2b221b, -0.2, 0.05, 0.1, { rz: 1.45, ry: 0.6, seg: 5 });
  m.cyl(0.07, 0.08, 0.7, 0x2b221b, 0.25, 0.05, -0.1, { rz: 1.45, ry: -0.9, seg: 5 });
  m.cyl(0.22, 0.25, 1.8, P.bark, -0.9, 0.22, 1.5, { rz: -Math.PI / 2, seg: 6, bottom: true });
  m.box(1.7, 0.08, 0.7, P.clothBrown, 1.5, 0, -0.6, { ry: 0.5, j: 0.06 });
  m.cyl(0.03, 0.04, 1.3, P.woodDark, -1.3, 0, -0.9, { seg: 4, lean: [0.2, 0.3] });
  m.cyl(0.03, 0.04, 1.3, P.woodDark, -0.5, 0, -1.3, { seg: 4, lean: [-0.2, 0.25] });
}

function stoneWall(m, rng, len) {
  const n = Math.round(len / 0.75);
  for (let i = 0; i < n; i++) {
    const h = 0.6 + rng() * 0.3;
    m.box(len / n + 0.05, h + 0.3, 0.5 + rng() * 0.12, i % 3 ? 0x85837b : 0x77756d, -len / 2 + (i + 0.5) * len / n, -0.3, (rng() - 0.5) * 0.08, { vj: 0.1, j: 0.1, top: [0.95, 0.8], nb: true, g: [0.7, 1.05] });
  }
}

/**
 * Build the roadside furniture. ctx = { scene, colliders }.
 * Returns { group, lamps: [{x,y,z}], dispose() } — lamps are the lantern posts outside city gates.
 */
export function buildRoadside(ctx) {
  const group = new THREE.Group();
  group.name = 'roadside';
  const handles = [];
  const lamps = [];
  const m = new Mesher(77);
  const solid = (p, r, h = 1.5) => handles.push(ctx.colliders.addCircle(p.x, p.z, r, { top: p.y + h, tag: 'roadside' }));
  const farms = POIS.filter(p => p.type === 'farm' || p.type === 'village');

  for (const road of ROADS) {
    const rng = makeRng(seedFrom('roadside:' + road.key));
    const L = road.path.length;
    const edge = road.halfWidth + 1.5;
    m.setChunk(road.key);
    // milestones and waystones on the caravan legs
    if (road.kind === 'leg') {
      let count = 0;
      for (let s = 125; s < L - 60; s += 250) {
        const side = count % 2 ? 1 : -1;
        const p = beside(road, s, side, edge + 0.4);
        count++;
        if (!usable(p)) continue;
        m.push(p.x, p.y, p.z, p.yaw + side * Math.PI / 2 + Math.PI);
        if (count % 4 === 0) {
          waystone(m, rng);
          solid(p, 0.8, 2.6);
        } else {
          milestone(m, rng, count);
          solid(p, 0.35, 0.9);
        }
        m.pop();
      }
    }
    // signposts and lanterns at both ends (city gates, junctions, track ends)
    for (const end of [0, 1]) {
      const sAt = end ? L : 0;
      const tip = beside(road, sAt, 1, 0);
      const city = CITIES.find(c => Math.hypot(c.x - tip.x, c.z - tip.z) < c.radius + 12);
      const dir = end ? -1 : 1;
      if (city) {
        for (let k = 0; k < 4; k++) {
          const side = k % 2 ? 1 : -1;
          const p = beside(road, sAt + dir * (22 + k * 26), side, edge);
          if (!usable(p, -4)) continue;
          emitProp(m, 'lantern-post', p.x, p.y, p.z, p.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2), { seed: k + 1 });
          solid(p, 0.22, 3.4);
          lamps.push({ x: p.x, y: p.y + 3.4, z: p.z });
        }
      }
      const sp = beside(road, sAt + dir * (city ? 70 : 9), end ? 1 : -1, edge + 0.6);
      if (usable(sp)) {
        const along = sp.yaw + (dir > 0 ? 0 : Math.PI);
        emitProp(m, 'signpost', sp.x, sp.y, sp.z, 0, { seed: 5, arms: [along, along + Math.PI + 0.25, ...(road.kind === 'side' ? [] : [along + 1.4])] });
        solid(sp, 0.2, 2.6);
      }
    }
    // wrecks, old camp sites
    for (let s = 180 + rng() * 200; s < L - 150; s += 420 + rng() * 380) {
      const side = rng() < 0.5 ? 1 : -1;
      const wreck = rng() < 0.4;
      const p = beside(road, s, side, edge + (wreck ? 1.6 : 6 + rng() * 4));
      if (!usable(p, 60)) continue;
      if (wreck) {
        emitProp(m, 'wagon-wreck', p.x, p.y, p.z, p.yaw + 0.5 + rng(), { seed: Math.floor(rng() * 1e6) });
        solid(p, 1.3, 1.2);
      } else {
        m.push(p.x, p.y, p.z, rng() * 6.28);
        campRemains(m, rng);
        m.pop();
      }
    }
    // low stone walls and fences where the road passes farmland
    for (let s = 20; s < L - 20; s += 9) {
      const centre = beside(road, s, 1, 0);
      const farm = farms.find(f => Math.hypot(f.x - centre.x, f.z - centre.z) < f.r + 150);
      const nearCity = CITIES.find(c => c.style === 'timber' && Math.hypot(c.x - centre.x, c.z - centre.z) < c.radius + 170);
      if (!farm && !nearCity) continue;
      for (const side of [-1, 1]) {
        if ((Math.floor(s / 36) + (side > 0 ? 1 : 0)) % 3 === 0 || rng() < 0.2) continue;
        const p = beside(road, s, side, edge + 1.9);
        if (!usable(p, 14)) continue;
        if ((Math.floor(s / 90) + (side > 0 ? 1 : 0)) % 2) {
          m.push(p.x, p.y, p.z, p.yaw + Math.PI / 2);
          stoneWall(m, rng, 8.2);
          m.pop();
          handles.push(ctx.colliders.addBox(p.x, p.z, 4.1, 0.3, p.yaw + Math.PI / 2, { top: p.y + 0.9, tag: 'roadside' }));
        } else {
          for (const k of [-1, 0, 1]) {
            const q = beside(road, s + k * 3.0, side, edge + 1.9);
            emitProp(m, 'fence-section', q.x, heightAt(q.x, q.z), q.z, q.yaw + Math.PI / 2, { seed: Math.floor(rng() * 1e6) });
          }
          handles.push(ctx.colliders.addBox(p.x, p.z, 4.5, 0.15, p.yaw + Math.PI / 2, { top: p.y + 1.1, tag: 'roadside' }));
        }
      }
    }
  }
  m.setChunk('');
  for (const mesh of m.build()) group.add(mesh);
  ctx.scene.add(group);
  return {
    group, lamps,
    dispose() {
      for (const id of handles) ctx.colliders.remove(id);
      ctx.scene.remove(group);
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    },
  };
}
