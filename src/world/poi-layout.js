// Layouts of the points of interest: which structures stand where, spawn / chest / NPC spots and patrol loops.
// Pure and deterministic (no three, no DOM), cached per POI. Structures carry their own collider size, so the
// renderer (poi-builder.js), the spawner and the tests agree.
import { POIS, CITIES, poiById } from '../data/world-map.js';
import { makeRng, seedFrom } from '../core/noise.js';
import { ROADS, heightAt } from './terrain.js';
import { DEG, pointSegDist, pointBoxDist } from './geom-layout.js';
import { POI_RECIPES } from './poi-recipes-layout.js';

/** Default collider of a structure kind: circle {r} or box {hw, hd}; h = height. Kinds missing here are walk-through. */
export const STRUCTURE_SIZE = {
  'palisade-section': { hw: 2.35, hd: 0.4, h: 3.6 }, tent: { r: 1.9, h: 2.3 }, 'bandit-tent': { r: 2.1, h: 2.5 }, 'boss-tent': { r: 3.3, h: 4 },
  campfire: { r: 0.8, h: 0.5 }, cage: { r: 1.1, h: 2.1 }, 'watch-platform': { hw: 1.5, hd: 1.5, h: 7 }, throne: { r: 0.9, h: 2 },
  banner: { r: 0.15, h: 4 }, barricade: { hw: 2.2, hd: 0.6, h: 1.6 }, crate: { r: 0.5, h: 0.7 }, barrel: { r: 0.42, h: 0.9 }, sack: { r: 0.5, h: 0.6 },
  crates: { r: 1.0, h: 1.4 }, barrels: { r: 0.9, h: 1.6 }, 'weapon-rack': { r: 0.7, h: 1.5 }, 'target-dummy': { r: 0.5, h: 2 },
  'fort-tower': { hw: 2.4, hd: 2.4, h: 10 }, 'log-hall': { hw: 6.2, hd: 4.2, h: 7 }, 'log-hut': { hw: 3.4, hd: 2.7, h: 4.5 },
  'ruin-wall': { hw: 3, hd: 0.55, h: 4 }, rubble: { r: 0.9, h: 0.7 }, column: { r: 0.45, h: 4 }, 'dead-tree': { r: 0.35, h: 6 },
  rock: { r: 1.2, h: 1.6 }, 'rock-mound': { r: 9, h: 9 }, 'ore-cart': { r: 1.0, h: 1.4 }, 'spoil-heap': { r: 1.8, h: 1.6 },
  'saw-shed': { hw: 5, hd: 2.8, h: 4.5 }, 'log-stack': { hw: 2.5, hd: 1.2, h: 1.6 }, 'plank-stack': { hw: 1.6, hd: 0.8, h: 1.2 },
  windmill: { r: 3.3, h: 14 }, farmhouse: { hw: 4.6, hd: 3.3, h: 6 }, barn: { hw: 5.2, hd: 3.7, h: 7 }, 'fence-run': { hw: 4, hd: 0.15, h: 1.1 },
  beehive: { r: 0.45, h: 1.3 }, kiln: { r: 2.3, h: 2.6 }, 'fish-hut': { hw: 2.9, hd: 2.3, h: 4 }, 'drying-rack': { hw: 1.6, hd: 0.3, h: 2 },
  boat: { r: 1.3, h: 0.7 }, 'guard-tower': { hw: 1.8, hd: 1.8, h: 9 }, barrier: { r: 0.3, h: 1.4 }, 'rock-den': { r: 4.4, h: 5 },
  'egg-sac': { r: 0.5, h: 1 }, 'giant-oak': { r: 2.9, h: 30 }, lighthouse: { r: 4.3, h: 30 }, 'standing-stone': { r: 0.75, h: 3.5 },
  'flat-stone': { r: 1.5, h: 0.7 }, 'rock-spire': { r: 5.2, h: 30 }, 'ice-rock': { r: 1.4, h: 3 }, scaffold: { hw: 2, hd: 1, h: 5 },
  'crystal-rock': { r: 1.7, h: 2.6 }, well: { r: 1.3, h: 2.6 }, haystack: { r: 1.2, h: 2.4 }, scarecrow: { r: 0.2, h: 2 }, pen: { hw: 3, hd: 2.4, h: 1.1 },
  cart: { r: 1.3, h: 1.4 }, 'wagon-wreck': { r: 1.5, h: 1.2 }, 'lantern-post': { r: 0.22, h: 3.4 }, woodpile: { r: 0.9, h: 1 },
  'tanning-rack': { r: 0.8, h: 1.9 }, table: { r: 0.75, h: 0.8 }, 'hitching-post': { hw: 1.2, hd: 0.15, h: 1.1 }, 'torch-stand': { r: 0.2, h: 1.8 },
  'fishing-net': { hw: 1.2, hd: 0.2, h: 2 }, 'hide-shelter': { r: 1.8, h: 2 }, 'web-tree': { r: 0.4, h: 6 }, workbench: { r: 0.9, h: 0.9 }, anvil: { r: 0.5, h: 0.8 },
};

const cache = new Map();

/** Where the POI is entered from: unit vector from its centre towards the nearest road (or the nearest city). */
function entranceDir(poi) {
  let best = null, bestScore = Infinity;
  let near = null, nearDist = Infinity;
  for (const road of ROADS) {
    for (const p of road.path.samples) {
      const d = Math.hypot(p.x - poi.x, p.z - poi.z);
      if (d < nearDist) { nearDist = d; near = p; }
      if (d > 800) continue;
      // prefer a road point right at the edge of the pad (a track that leads into the POI)
      const score = Math.abs(d - poi.r);
      if (score < bestScore) { bestScore = score; best = p; }
    }
  }
  if (!best) {
    let city = CITIES[0];
    for (const c of CITIES) {
      if (Math.hypot(c.x - poi.x, c.z - poi.z) < Math.hypot(city.x - poi.x, city.z - poi.z)) city = c;
    }
    best = city;
  }
  // a road-side outpost faces the road squarely: aim at the exact foot of the perpendicular
  if (poi.type === 'outpost' && near && nearDist < poi.r * 2.5) {
    for (const road of ROADS) {
      const S = road.path.samples;
      for (let i = 0; i + 1 < S.length; i++) {
        const a = S[i], b = S[i + 1];
        if (Math.abs(a.x - poi.x) > 80 || Math.abs(a.z - poi.z) > 80) continue;
        const ex = b.x - a.x, ez = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((poi.x - a.x) * ex + (poi.z - a.z) * ez) / (ex * ex + ez * ez)));
        const px = a.x + ex * t, pz = a.z + ez * t;
        const d = Math.hypot(px - poi.x, pz - poi.z);
        if (d <= nearDist + 1e-9) {
          nearDist = d;
          best = d > 1.5 ? { x: px, z: pz } : { x: poi.x + ez, z: poi.z - ex };
        }
      }
    }
  }
  const dx = best.x - poi.x, dz = best.z - poi.z, len = Math.hypot(dx, dz) || 1;
  return [dx / len, dz / len, nearDist];
}

/** Distance from a point to the nearest road centre line within the POI area, and that road's half width. */
function roadClearance(poi, x, z) {
  let best = Infinity, half = 0;
  for (const road of ROADS) {
    const S = road.path.samples;
    for (let i = 0; i + 1 < S.length; i++) {
      if (Math.abs(S[i].x - poi.x) > poi.r + 40 || Math.abs(S[i].z - poi.z) > poi.r + 40) continue;
      const d = pointSegDist(x, z, S[i].x, S[i].z, S[i + 1].x, S[i + 1].z);
      if (d < best) { best = d; half = road.halfWidth; }
    }
  }
  return { dist: best, half };
}

function generate(poi) {
  const rng = makeRng(seedFrom('poi-layout:' + poi.id));
  const [dx, dz, roadDist] = entranceDir(poi);
  const lx = dz, lz = -dx;
  const baseYaw = Math.atan2(dx, dz);
  const structures = [];
  const spots = { guards: [], npcs: [], entrance: null };
  let patrol = [];
  const at = (f, l) => ({ x: poi.x + dx * f + lx * l, z: poi.z + dz * f + lz * l });

  /** Unit vector (in f, l coordinates) towards the lowest ground at the rim of the pad. */
  function lowSide() {
    let best = [-1, 0], bestH = Infinity;
    for (let a = 0; a < 360; a += 20) {
      const f = Math.cos(a * DEG), l = Math.sin(a * DEG);
      const p = at(f * poi.r * 1.3, l * poi.r * 1.3);
      const h = heightAt(p.x, p.z);
      if (h < bestH - 0.05) { bestH = h; best = [f, l]; }
    }
    return best;
  }

  /** Builder handed to the recipes. f = metres towards the entrance, l = metres to the side, rot in degrees (0 faces the entrance). */
  const B = {
    poi, rng, r: poi.r, roadF: roadDist, low: lowSide(),
    add(kind, f, l, rot = 0, o = {}) {
      const size = STRUCTURE_SIZE[kind] || {};
      const s = { kind, ...at(f, l), rot: baseYaw + rot * DEG, seed: Math.floor(rng() * 1e9), ...size, ...o };
      structures.push(s);
      return s;
    },
    /** Ring of structures round the centre, leaving a gap of gapDeg facing the entrance. */
    ring(kind, radius, spacing, gapDeg, o = {}) {
      const n = Math.round(2 * Math.PI * radius / spacing);
      for (let i = 0; i < n; i++) {
        const a = (i + 0.5) / n * 360;
        const off = Math.min(a, 360 - a);
        if (off < gapDeg / 2) continue;
        B.add(kind, Math.cos(a * DEG) * radius, Math.sin(a * DEG) * radius, a, o);
      }
    },
    guard(f, l, face = 0) { spots.guards.push({ ...at(f, l), yaw: baseYaw + face * DEG }); },
    npc(role, f, l, face = 0) { spots.npcs.push({ ...at(f, l), yaw: baseYaw + face * DEG, role }); },
    chest(f, l, face = 0) { spots.chest = { ...at(f, l), yaw: baseYaw + face * DEG }; },
    boss(f, l) { spots.boss = at(f, l); },
    campfire(f, l) {
      B.add('campfire', f, l);
      spots.campfire = at(f, l);
    },
    patrol(points) { patrol = points.map(([f, l]) => at(f, l)); },
  };
  spots.entrance = at(poi.r - 1, 0);
  const recipe = POI_RECIPES[poi.id] || POI_RECIPES[poi.type];
  recipe(B);

  // never build on a road: drop anything solid that would stand in a roadway
  const kept = structures.filter(s => {
    const reach = s.r || (s.hw ? Math.hypot(s.hw, s.hd) : 0);
    if (!reach && s.kind !== 'field' && s.kind !== 'plot') return true;
    const road = roadClearance(poi, s.x, s.z);
    return road.dist > road.half + 1.2 + (reach || 3);
  });
  if (!poi.boss) delete spots.boss;
  if (!patrol.length) {
    // default loop: a ring of free points round the centre
    const blocked = p => kept.some(s => (s.r && Math.hypot(p.x - s.x, p.z - s.z) < s.r + 0.9)
      || (s.hw && pointBoxDist({ x: s.x, z: s.z, w: s.hw * 2, d: s.hd * 2, rot: s.rot }, p.x, p.z) < 0.9));
    for (let a = 0; a < 360; a += 60) {
      for (const k of [0.5, 0.62, 0.38, 0.74, 0.26]) {
        const p = at(Math.cos(a * DEG) * poi.r * k, Math.sin(a * DEG) * poi.r * k);
        if (!blocked(p)) { patrol.push(p); break; }
      }
    }
  }
  const dropped = structures.filter(s => !kept.includes(s)).map(s => s.kind);
  return { poi, structures: kept, spots, patrol, dir: { x: dx, z: dz }, yaw: baseYaw, dropped };
}

/**
 * Layout of a POI (world coordinates):
 * { poi, structures: [{kind, x, z, rot, seed, r? | hw?, hd?, h?, …}],
 *   spots: { entrance:{x,z}, guards:[{x,z,yaw}], npcs:[{x,z,yaw,role}], chest?:{x,z,yaw}, boss?:{x,z}, campfire?:{x,z} },
 *   patrol: [{x,z}], dir:{x,z} (unit vector centre → entrance), yaw }
 */
export function getPoiLayout(poiId) {
  let layout = cache.get(poiId);
  if (!layout) {
    const poi = poiById(poiId);
    if (!poi) throw new Error('Unknown POI: ' + poiId);
    layout = generate(poi);
    cache.set(poiId, layout);
  }
  return layout;
}

export const POI_IDS = POIS.map(p => p.id);
