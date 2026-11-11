// Terrain: the single source of truth for the shape of the world.
// Pure functions of (x, z) — no DOM, no three — so sim, tests, map UI and renderers agree.
import { noise2, fbm, ridged, clamp, lerp, smoothstep } from '../core/noise.js';
import { WORLD, CITIES, LEGS, SIDE_ROADS, RIVER, REGIONS, POIS } from '../data/world-map.js';

const SEED = WORLD.seed;

// ───────────────────────── smoothed polylines with a spatial index ─────────────────────────

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Build an evenly sampled smooth path through control points [[x,z,(v)]...]. */
function buildPath(points, spacing) {
  const fine = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(2, Math.ceil(segLen / 1.5));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      fine.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), z: catmull(p0[1], p1[1], p2[1], p3[1], t), v: p1[2] !== undefined ? lerp(p1[2], p2[2], t) : 0 });
    }
  }
  const last = points[n - 1];
  fine.push({ x: last[0], z: last[1], v: last[2] ?? 0 });

  // resample at even arc length
  const samples = [{ x: fine[0].x, z: fine[0].z, v: fine[0].v, s: 0, y: 0 }];
  let acc = 0, s = 0;
  for (let i = 1; i < fine.length; i++) {
    const a = fine[i - 1], b = fine[i];
    let seg = Math.hypot(b.x - a.x, b.z - a.z);
    let from = 0;
    while (acc + (seg - from) >= spacing) {
      from += spacing - acc; acc = 0; s += spacing;
      const t = from / seg;
      samples.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), v: lerp(a.v, b.v, t), s, y: 0 });
    }
    acc += seg - from;
  }
  const end = fine[fine.length - 1], tail = samples[samples.length - 1];
  const rest = Math.hypot(end.x - tail.x, end.z - tail.z);
  if (rest > 0.5) samples.push({ x: end.x, z: end.z, v: end.v, s: s + rest, y: 0 });

  const CELL = 64;
  const grid = new Map();
  for (let i = 0; i < samples.length - 1; i++) {
    const p = samples[i];
    const key = (Math.floor(p.x / CELL) + 512) * 1024 + Math.floor(p.z / CELL) + 512;
    let arr = grid.get(key); if (!arr) grid.set(key, arr = []);
    arr.push(i);
  }
  return { samples, grid, CELL, length: samples[samples.length - 1].s, spacing };
}

/** Nearest point on a path within maxDist. Returns {dist, s, i, t} or null. */
function queryPath(path, x, z, maxDist) {
  const { samples, grid, CELL } = path;
  const reach = maxDist + path.spacing;
  const cx0 = Math.floor((x - reach) / CELL), cx1 = Math.floor((x + reach) / CELL);
  const cz0 = Math.floor((z - reach) / CELL), cz1 = Math.floor((z + reach) / CELL);
  let best = maxDist * maxDist, bi = -1, bt = 0;
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
    const arr = grid.get((cx + 512) * 1024 + cz + 512);
    if (!arr) continue;
    for (let k = 0; k < arr.length; k++) {
      const i = arr[k], a = samples[i], b = samples[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const ex = x - a.x - dx * t, ez = z - a.z - dz * t;
      const d2 = ex * ex + ez * ez;
      if (d2 < best) { best = d2; bi = i; bt = t; }
    }
  }
  if (bi < 0) return null;
  const a = samples[bi], b = samples[bi + 1];
  return { dist: Math.sqrt(best), s: lerp(a.s, b.s, bt), i: bi, t: bt };
}

function pathPoint(path, s) {
  const { samples, spacing } = path;
  s = clamp(s, 0, path.length);
  let i = Math.min(samples.length - 2, Math.floor(s / spacing));
  while (i > 0 && samples[i].s > s) i--;
  while (i < samples.length - 2 && samples[i + 1].s < s) i++;
  const a = samples[i], b = samples[i + 1];
  const t = clamp((s - a.s) / Math.max(1e-6, b.s - a.s), 0, 1);
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t), yaw: Math.atan2(b.x - a.x, b.z - a.z) };
}

// ───────────────────────── river ─────────────────────────

const riverPath = buildPath(RIVER.path, 6);
const RIVER_HALF = RIVER.width / 2;

/** River info near (x,z): {dist, surfaceY, s} or null if farther than maxDist. */
export function riverAt(x, z, maxDist = 200) {
  const q = queryPath(riverPath, x, z, maxDist);
  if (!q) return null;
  const a = riverPath.samples[q.i], b = riverPath.samples[q.i + 1];
  return { dist: q.dist, surfaceY: lerp(a.v, b.v, q.t), s: q.s };
}

// ───────────────────────── regions ─────────────────────────

const _w = new Float64Array(REGIONS.length);

function regionWeights(x, z) {
  const wx = x + 110 * noise2(x / 520, z / 520, SEED + 11);
  const wz = z + 110 * noise2(x / 520 + 40.3, z / 520 - 17.7, SEED + 12);
  let sum = 0;
  for (let i = 0; i < REGIONS.length; i++) {
    const R = REGIONS[i];
    const dx = wx - R.x, dz = wz - R.z;
    const d2 = dx * dx + dz * dz + 14400;
    const w = 1 / (d2 * d2);
    _w[i] = w; sum += w;
  }
  return sum;
}

/** The dominant named region at a point. */
export function regionAt(x, z) {
  regionWeights(x, z);
  let bi = 0;
  for (let i = 1; i < REGIONS.length; i++) if (_w[i] > _w[bi]) bi = i;
  return REGIONS[bi];
}

/** Top regions with normalised weights: [{region, w}] (sorted, up to `count`). For biome colour/vegetation blending. */
export function regionBlend(x, z, count = 3) {
  const sum = regionWeights(x, z);
  const out = [];
  for (let i = 0; i < REGIONS.length; i++) out.push({ region: REGIONS[i], w: _w[i] / sum });
  out.sort((a, b) => b.w - a.w);
  out.length = Math.min(count, out.length);
  return out;
}

/**
 * Normalised weights of ALL regions at a point, written into `out` (array-like of REGIONS.length, same order as REGIONS).
 * Allocation-free variant of regionBlend for hot loops (terrain colouring, vegetation scattering). Returns `out`.
 */
export function regionWeightsInto(x, z, out) {
  const sum = regionWeights(x, z);
  for (let i = 0; i < REGIONS.length; i++) out[i] = _w[i] / sum;
  return out;
}

/** Level range of wild creatures at a point: {min, max}. */
export function levelAt(x, z) {
  const r = regionAt(x, z);
  return { min: r.level[0], max: r.level[1] };
}

// ───────────────────────── height stages ─────────────────────────

function seaField(x, z) {
  return x * 0.55 + z * 0.85 - 2350 + 70 * noise2(x / 300, z / 300, SEED + 21);
}

/** Stage 1: regions + noise + border mountains + sea shelf + river valley (no river bed yet). */
function naturalHeight(x, z) {
  const sum = regionWeights(x, z);
  let elev = 0, rough = 0, rg = 0;
  for (let i = 0; i < REGIONS.length; i++) {
    const R = REGIONS[i], w = _w[i] / sum;
    elev += w * R.elev; rough += w * R.rough; if (R.ridged) rg += w;
  }
  const n = fbm(x / 300, z / 300, 5, SEED + 1);
  let shape = n;
  if (rg > 0.01) shape = lerp(n, ridged(x / 430, z / 430, 5, SEED + 2) * 1.7 - 0.8 + n * 0.25, rg);
  let h = elev + rough * shape + (0.3 + rough * 0.012) * fbm(x / 24, z / 24, 2, SEED + 5);

  const sf = seaField(x, z);
  const edge = Math.max(Math.abs(x), Math.abs(z));
  if (edge > 2700 && sf < -300) h += smoothstep(2700, 2990, edge) * 280 * smoothstep(-300, -600, sf);
  if (sf > -200) h = lerp(h, -16, smoothstep(-200, 80, sf));

  const r = riverAt(x, z, 175);
  if (r) {
    const t = smoothstep(170, 22, r.dist);
    h = lerp(h, r.surfaceY + 1.4, t * t);
  }
  return h;
}

for (const p of POIS) p.y = naturalHeight(p.x, p.z);
// keep waterside POIs above water
for (const p of POIS) if (p.y < 1.2) p.y = 1.2;

/** Stage 2: + flat pads for POIs and cities. */
function settledHeight(x, z) {
  let h = naturalHeight(x, z);
  for (let i = 0; i < POIS.length; i++) {
    const p = POIS[i];
    const dx = x - p.x, dz = z - p.z, lim = p.r + 26;
    if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
    const d = Math.hypot(dx, dz);
    if (d < lim) h = lerp(h, p.y, smoothstep(lim, p.r * 0.7, d));
  }
  for (let i = 0; i < CITIES.length; i++) {
    const c = CITIES[i];
    const dx = x - c.x, dz = z - c.z, lim = c.radius + 90;
    if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
    const d = Math.hypot(dx, dz);
    if (d < lim) h = lerp(h, c.y, smoothstep(lim, c.radius + 8, d));
  }
  return h;
}

// ───────────────────────── roads ─────────────────────────

function buildRoad(def, kind, legId) {
  const path = buildPath(def.path, 5);
  const S = path.samples, n = S.length;
  const nearRiver = new Array(n);
  for (let i = 0; i < n; i++) {
    S[i].y = settledHeight(S[i].x, S[i].z);
    const r = riverAt(S[i].x, S[i].z, RIVER_HALF + 16);
    nearRiver[i] = r ? r.surfaceY + 2.6 : -Infinity;
  }
  const floor = i => Math.max(nearRiver[i], 1.3);        // causeway above water / bridge clearance
  for (let i = 0; i < n; i++) S[i].y = Math.max(S[i].y, floor(i));
  // smooth the long profile (keep endpoints so roads meet city gates exactly)
  const W = kind === 'leg' ? 10 : 5;
  for (let pass = 0; pass < 3; pass++) {
    const src = S.map(p => p.y);
    for (let i = 1; i < n - 1; i++) {
      let sum = 0, cnt = 0;
      for (let k = -W; k <= W; k++) { const j = clamp(i + k, 0, n - 1); sum += src[j]; cnt++; }
      S[i].y = Math.max(sum / cnt, floor(i));
    }
  }
  // limit grade so wagons can climb
  const maxStep = path.spacing * 0.16;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < n; i++) S[i].y = clamp(S[i].y, S[i - 1].y - maxStep, S[i - 1].y + maxStep);
    for (let i = n - 2; i >= 0; i--) S[i].y = clamp(S[i].y, S[i + 1].y - maxStep, S[i + 1].y + maxStep);
  }
  for (let i = 0; i < n; i++) S[i].y = Math.max(S[i].y, floor(i));

  // bridges: runs of samples over the river bed
  const bridges = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const over = i < n && nearRiver[i] > -Infinity;
    if (over && start < 0) start = i;
    if (!over && start >= 0) {
      const a = S[Math.max(0, start - 1)], b = S[Math.min(n - 1, i)];
      const mid = pathPoint(path, (a.s + b.s) / 2);
      const deckY = Math.max(a.y, b.y, mid.y);
      bridges.push({ road: def.key, leg: legId, s0: a.s, s1: b.s, x: mid.x, z: mid.z, y: deckY, yaw: mid.yaw, length: b.s - a.s, halfWidth: kind === 'leg' ? 4.6 : 3 });
      start = -1;
    }
  }
  return { key: def.key, name: def.name || '', kind, leg: legId, path, bridges, halfWidth: kind === 'leg' ? 4.2 : 2.4 };
}

/** All roads: caravan legs first (index === leg id), then side tracks. Each: {key,name,kind,leg,path:{samples,length},bridges,halfWidth}. */
export const ROADS = [
  ...LEGS.map(l => buildRoad(l, 'leg', l.id)),
  ...SIDE_ROADS.map(r => buildRoad(r, 'side', -1)),
];
export const BRIDGES = ROADS.flatMap(r => r.bridges);
export const RIVER_SAMPLES = riverPath.samples; // [{x,z,v:surfaceY,s}]

/** Nearest road within maxDist: {dist, road, leg, s, y} or null. */
export function roadAt(x, z, maxDist = 40) {
  let best = null;
  for (let r = 0; r < ROADS.length; r++) {
    const road = ROADS[r];
    const q = queryPath(road.path, x, z, best ? Math.min(maxDist, best.dist) : maxDist);
    if (!q) continue;
    const a = road.path.samples[q.i], b = road.path.samples[q.i + 1];
    best = { dist: q.dist, road, leg: road.leg, s: q.s, y: lerp(a.y, b.y, q.t) };
  }
  return best;
}

export const legLength = leg => ROADS[leg].path.length;
/** Point on a caravan leg at distance s from its start: {x, z, y, yaw}. y is the driving surface (bridge deck included). */
export function legPoint(leg, s) {
  return pathPoint(ROADS[leg].path, s);
}

// ───────────────────────── final height ─────────────────────────

/** Height of the ground mesh at (x,z). River beds and sea floor are below the water surface. */
export function heightAt(x, z) {
  let h = settledHeight(x, z);
  const rd = roadAt(x, z, 60);
  if (rd) {
    const hw = rd.road.halfWidth;
    const blend = hw + 10 + Math.min(40, Math.abs(h - rd.y) * 1.6);
    if (rd.dist < blend) h = lerp(h, rd.y, smoothstep(blend, hw, rd.dist));
  }
  const r = riverAt(x, z, RIVER_HALF + 8);
  if (r) h = lerp(h, r.surfaceY - RIVER.depth, smoothstep(RIVER_HALF + 7, RIVER_HALF - 3, r.dist));
  return h;
}

/** Bridge under (x,z), if any. */
export function bridgeAt(x, z) {
  for (let i = 0; i < BRIDGES.length; i++) {
    const b = BRIDGES[i];
    if (Math.abs(x - b.x) > b.length + 10 || Math.abs(z - b.z) > b.length + 10) continue;
    const road = ROADS.find(r => r.key === b.road);
    const q = queryPath(road.path, x, z, b.halfWidth);
    if (q && q.s >= b.s0 - 1 && q.s <= b.s1 + 1) return b;
  }
  return null;
}

/** Surface a character walks on: ground, or a bridge deck where there is one. */
export function walkHeightAt(x, z) {
  const h = heightAt(x, z);
  const b = bridgeAt(x, z);
  if (b) {
    const road = ROADS.find(r => r.key === b.road);
    const q = queryPath(road.path, x, z, b.halfWidth);
    const a = road.path.samples[q.i], c = road.path.samples[q.i + 1];
    return Math.max(h, lerp(a.y, c.y, q.t) + 0.3);
  }
  return h;
}

/** Y of the water surface over (x,z), or null on dry land. */
export function waterSurfaceAt(x, z) {
  const h = heightAt(x, z);
  const r = riverAt(x, z, RIVER_HALF + 8);
  if (r && r.surfaceY > h) return Math.max(r.surfaceY, h < WORLD.seaLevel ? WORLD.seaLevel : -Infinity);
  return h < WORLD.seaLevel ? WORLD.seaLevel : null;
}

/** Water depth at (x,z); 0 on dry land. Characters cannot wade deeper than ~1.2 m. */
export function waterDepthAt(x, z) {
  const s = waterSurfaceAt(x, z);
  return s === null ? 0 : Math.max(0, s - heightAt(x, z));
}

export const isSea = (x, z) => seaField(x, z) > 0 && heightAt(x, z) < 0;

/** Unit normal of the ground at (x,z) as [nx, ny, nz]. */
export function normalAt(x, z, e = 1.5) {
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  const l = Math.hypot(dx, 2 * e, dz);
  return [-dx / l, 2 * e / l, -dz / l];
}

/** Slope 0 (flat) .. 1 (vertical). */
export const slopeAt = (x, z) => 1 - normalAt(x, z)[1];

/** City containing (x,z) (optionally with an extra margin), or null. */
export function cityAt(x, z, margin = 0) {
  for (const c of CITIES) if (Math.hypot(x - c.x, z - c.z) < c.radius + margin) return c;
  return null;
}

/** POI whose pad contains (x,z), or null. */
export function poiAt(x, z, margin = 0) {
  for (const p of POIS) if (Math.hypot(x - p.x, z - p.z) < p.r + margin) return p;
  return null;
}

/** True where combat is forbidden: inside city walls. */
export const isSafeZone = (x, z) => !!cityAt(x, z);

export const inBounds = (x, z) => Math.abs(x) < WORLD.half - 30 && Math.abs(z) < WORLD.half - 30;
