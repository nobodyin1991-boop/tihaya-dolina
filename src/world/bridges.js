// Bridges: one per terrain BRIDGES entry. The deck top lies exactly on walkHeightAt (road profile + 0.3 m), the
// railings get colliders just outside the 2 × halfWidth roadway. A stone bridge near the stone city, timber
// trestles elsewhere. Always loaded (they are few and small).
import * as THREE from 'three';
import { PALETTE as P } from './materials.js';
import { makeRng, seedFrom } from '../core/noise.js';
import { BRIDGES, ROADS, heightAt, riverAt } from './terrain.js';
import { CITIES } from '../data/world-map.js';
import { Mesher } from './mesher.js';
import { lantern } from './props.js';

const DECK_LIFT = 0.3;      // walkHeightAt = road profile + 0.3 on a bridge

/** Road samples covering the bridge span (with one extra sample on each bank). */
function spanSamples(bridge) {
  const road = ROADS.find(r => r.key === bridge.road);
  const S = road.path.samples;
  const out = [];
  for (let i = 0; i < S.length; i++) {
    if (S[i].s >= bridge.s0 - 5.5 && S[i].s <= bridge.s1 + 5.5) out.push(S[i]);
  }
  return out;
}

function isStone(bridge) {
  return CITIES.some(c => c.style === 'stone' && Math.hypot(c.x - bridge.x, c.z - bridge.z) < c.radius + 260);
}

function emitBridge(m, bridge, colliders, handles) {
  const rng = makeRng(seedFrom('bridge:' + bridge.road + Math.round(bridge.s0)));
  const stone = isStone(bridge);
  const S = spanSamples(bridge);
  const half = bridge.halfWidth;
  const rail = half + 0.28;
  const deckColor = stone ? [0x8a8b88, 0x7b7d7c, 0x969690] : [P.wood, P.woodLight, 0x7c5e3e];
  for (let i = 0; i + 1 < S.length; i++) {
    const a = S[i], b = S[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(b.y - a.y, len);
    const my = (a.y + b.y) / 2 + DECK_LIFT;
    m.push((a.x + b.x) / 2, my, (a.z + b.z) / 2, yaw, pitch);
    // deck: top face exactly at walk height
    if (stone) {
      m.box(half * 2 + 1.3, 1.1, len + 0.04, deckColor[i % 3], 0, -1.1, 0, { vj: 0.06, g: [0.75, 1.02] });
      for (let k = 0; k < 5; k++) m.box(0.7 + rng() * 0.8, 0.02, 0.5 + rng() * 0.6, deckColor[(i + k) % 3], (rng() - 0.5) * (half * 2 - 1), 0.0, (rng() - 0.5) * len, { j: 0.12, nb: true });
    } else {
      const planks = Math.max(2, Math.round(len / 0.62));
      for (let k = 0; k < planks; k++) {
        m.box(half * 2 + 0.7, 0.16, len / planks - 0.03, deckColor[(i * 7 + k) % 3], (rng() - 0.5) * 0.12, -0.16, -len / 2 + (k + 0.5) * len / planks, { j: 0.1 });
      }
      for (const sx of [-1, 0, 1]) m.box(0.3, 0.34, len + 0.04, P.woodDark, sx * (half - 0.4), -0.5, 0);
    }
    // railings
    for (const sx of [-1, 1]) {
      if (stone) {
        m.box(0.5, 1.0, len + 0.04, 0x7b7d7c, sx * rail, 0, 0, { vj: 0.07, nb: true });
        m.box(0.66, 0.16, len + 0.04, 0x969690, sx * rail, 1.0, 0, { j: 0.04 });
      } else {
        m.box(0.16, 1.25, 0.16, P.woodDark, sx * rail, -0.2, -len / 2 + 0.1, { nb: true, lean: [sx * 0.04, 0] });
        m.box(0.1, 0.12, len + 0.04, P.wood, sx * rail, 1.0, 0, { j: 0.08 });
        m.box(0.08, 0.1, len + 0.04, P.wood, sx * rail, 0.5, 0, { j: 0.08 });
      }
    }
    m.pop();
    // colliders along both railings
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const sx of [-1, 1]) {
      const cx = (a.x + b.x) / 2 + c * rail * sx, cz = (a.z + b.z) / 2 - s * rail * sx;
      handles.push(colliders.addBox(cx, cz, 0.26, len / 2 + 0.05, yaw, { top: my + 1.15, tag: 'bridge' }));
    }
    // supports under every other span joint
    if (i % 2 === 1) {
      const bed = Math.min(heightAt(a.x, a.z), heightAt(a.x + c * half, a.z - s * half), heightAt(a.x - c * half, a.z + s * half));
      const top = a.y + DECK_LIFT - (stone ? 1.0 : 0.6);
      const river = riverAt(a.x, a.z, 14);
      if (top - bed > 0.6) {
        m.push(a.x, 0, a.z, yaw);
        if (stone) {
          m.box(half * 2 + 0.6, top - bed + 1.2, 2.2, 0x74777a, 0, bed - 1.2, 0, { vj: 0.08, g: [0.6, 1.02], top: [1, 0.8], nb: true });
          m.cyl(1.25, 1.4, top - bed + 0.4, 0x858887, half + 0.5, bed - 1, 0, { seg: 6, vj: 0.07, g: [0.6, 1.02] });
          m.cyl(1.25, 1.4, top - bed + 0.4, 0x858887, -half - 0.5, bed - 1, 0, { seg: 6, vj: 0.07, g: [0.6, 1.02] });
          for (const sz of [-1, 1]) m.box(half * 2 + 0.6, 1.6, 1.6, 0x7b7d7c, 0, top - 0.4, sz * 1.5, { c: true, rx: sz * Math.PI / 4, vj: 0.06 });
        } else {
          for (const sx of [-1, -0.33, 0.33, 1]) {
            m.cyl(0.2, 0.26, top - bed + 1.6, P.bark, sx * (half - 0.2), bed - 1.2, 0, { seg: 6, j: 0.1, g: [0.5, 1.05], lean: [sx * 0.25, 0] });
          }
          m.box(half * 2 + 0.8, 0.3, 0.34, P.woodDark, 0, top - 0.1, 0);
          if (top - bed > 2.2) {
            const diag = Math.hypot(half * 2, top - bed - 0.8);
            m.box(0.14, diag, 0.14, P.wood, 0, (top + bed) / 2 + 0.2, 0.2, { c: true, rz: Math.atan2(half * 2, top - bed - 0.8) });
            m.box(0.14, diag, 0.14, P.wood, 0, (top + bed) / 2 + 0.2, -0.2, { c: true, rz: -Math.atan2(half * 2, top - bed - 0.8) });
          }
        }
        m.pop();
        if (river && i % 4 === 1) {
          m.push(a.x, a.y + DECK_LIFT, a.z, yaw);
          for (const sx of [-1, 1]) {
            if (stone) m.box(0.6, 1.5, 0.6, 0x858887, sx * rail, 1.0, 0, { nb: true, top: [0.8, 0.8] });
            else m.box(0.14, 1.6, 0.14, P.woodDark, sx * rail, 1.0, 0, { nb: true });
            lantern(m, sx * rail, stone ? 2.5 : 2.6, 0, 1.4);
          }
          m.pop();
        }
      }
    }
  }
}

/**
 * Build all bridges. ctx = { scene, colliders }. Returns { group, lamps: [{x,y,z}], dispose() }.
 */
export function buildBridges(ctx) {
  const group = new THREE.Group();
  group.name = 'bridges';
  const handles = [];
  const lamps = [];
  BRIDGES.forEach((bridge, index) => {
    const m = new Mesher(index + 1);
    emitBridge(m, bridge, ctx.colliders, handles);
    for (const mesh of m.build()) group.add(mesh);
    lamps.push({ x: bridge.x, y: bridge.y + 3, z: bridge.z });
  });
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
