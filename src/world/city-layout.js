// City layouts: where every building, wall, gate, NPC work spot, lamp and street node of a city is.
// Pure and deterministic (seeded by the city key) — no three, no DOM. Cached per city.
// The renderer (city-builder.js), NPC logic and tests all read the same layout.
import { cityByKey } from '../data/world-map.js';
import { makeRng, seedFrom } from '../core/noise.js';
import { makeCityPlan } from './city-plan-layout.js';
import { DEG, polar, toWorld, boxCorners, boxesOverlap, pointBoxDist, segBoxDist } from './geom-layout.js';
import { dressCity } from './city-dress-layout.js';
import { buildWalkGraph } from './city-walk-layout.js';

const cache = new Map();
const GATE_HALF = 5.5;          // half of the clear wall opening at a gate
const GATE_ROADWAY = 7;         // roadway width between the two gate guards

/**
 * Layout of a city (world coordinates). See the header of this file and the README block at the bottom
 * for the exact shape. The same object is returned on every call — treat it as read-only.
 */
export function getCityLayout(cityKey) {
  let layout = cache.get(cityKey);
  if (!layout) {
    const city = cityByKey(cityKey);
    if (!city) throw new Error('Unknown city: ' + cityKey);
    layout = generate(city);
    cache.set(cityKey, layout);
  }
  return layout;
}

// ───────────────────────── streets ─────────────────────────

function prepareStreet(street) {
  const pts = street.closed ? [...street.pts.slice(0, -1), street.pts[0]] : street.pts;
  const segs = [];
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    segs.push({ x0: a[0], z0: a[1], x1: b[0], z1: b[1], len, s0: s, dx: (b[0] - a[0]) / len, dz: (b[1] - a[1]) / len });
    s += len;
  }
  return { ...street, pts, segs, length: s, sides: street.sides || [1, -1] };
}

/** Point and unit tangent on a street at arc length t. */
function streetPoint(street, t) {
  const segs = street.segs;
  let seg = segs[segs.length - 1];
  for (let i = 0; i < segs.length; i++) {
    if (t <= segs[i].s0 + segs[i].len) { seg = segs[i]; break; }
  }
  const u = Math.max(0, Math.min(seg.len, t - seg.s0));
  return { x: seg.x0 + seg.dx * u, z: seg.z0 + seg.dz * u, dx: seg.dx, dz: seg.dz };
}

// ───────────────────────── building placement ─────────────────────────

/** Solid box + "full" box (solid plus the open canopy in front) of a building whose solid centre is (x, z). */
function footprint(spec, x, z, rot) {
  const solid = { x, z, w: spec.w, d: spec.d, rot };
  const canopy = spec.canopy || 0;
  if (!canopy) return { solid, full: solid };
  const [fx, fz] = toWorld(solid, 0, canopy / 2);
  return { solid, full: { x: fx, z: fz, w: spec.w, d: spec.d + canopy, rot } };
}

function makePlacer(ctx) {
  const { plan, streets, zones } = ctx;
  const R = plan.R;
  const quay = plan.quay;

  function insideWall(box) {
    for (const [x, z] of boxCorners(box)) {
      const r = Math.hypot(x, z);
      let limit = R - plan.wall.inset;
      if (quay) {
        let az = Math.atan2(x, z) / DEG;
        if (az > quay.az1 + 180) az -= 360;
        if (az > quay.az0 && az < quay.az1) limit = R - 2;
      }
      if (r > limit) return false;
    }
    return true;
  }

  function valid(fp, opts = {}) {
    const box = fp.full;
    if (!insideWall(box)) return false;
    for (const zone of zones) {
      if (pointBoxDist(box, zone.x, zone.z) < zone.r) return false;
    }
    for (const f of plan.features) {
      if (pointBoxDist(box, f.at[0], f.at[1]) < f.r + 1.6) return false;
    }
    const reach = Math.hypot(box.w, box.d) / 2;
    for (const street of streets) {
      const need = street.half + (opts.streetGap ?? 0.25);
      for (const seg of street.segs) {
        const mx = (seg.x0 + seg.x1) / 2, mz = (seg.z0 + seg.z1) / 2;
        if (Math.hypot(mx - box.x, mz - box.z) > seg.len / 2 + reach + need) continue;
        if (segBoxDist(seg.x0, seg.z0, seg.x1, seg.z1, box) < need) return false;
      }
    }
    const margin = opts.margin ?? 1;
    for (const other of ctx.buildings) {
      if (boxesOverlap(box, other.full, margin)) return false;
    }
    return true;
  }

  /** Footprint of `spec` standing on `side` of `street` at arc length t, or null when it does not fit. */
  function along(spec, street, t, side, opts) {
    const p = streetPoint(street, t);
    const nx = side * p.dz, nz = -side * p.dx;
    const rot = Math.atan2(-nx, -nz);
    const canopy = spec.canopy || 0;
    for (const gap of [0.5, 1.1, 1.9]) {
      const off = street.half + gap + canopy + spec.d / 2;
      const fp = footprint(spec, p.x + nx * off, p.z + nz * off, rot);
      if (valid(fp, opts)) return fp;
    }
    return null;
  }

  function add(spec, fp, street) {
    const n = ctx.buildings.length;
    const type = spec.type;
    const id = spec.role ? spec.role : type + '-' + n;
    const b = {
      id, type, role: spec.role || undefined, variant: spec.variant,
      x: fp.solid.x, z: fp.solid.z, rot: fp.solid.rot, w: spec.w, d: spec.d, floors: spec.floors,
      canopy: spec.canopy || 0, seed: seedFrom(ctx.city.key + ':' + id), street: street ? street.id : null,
      solid: fp.solid, full: fp.full,
    };
    ctx.buildings.push(b);
    return b;
  }

  function placeSpecial(spec) {
    if (spec.at) {
      const fp = footprint(spec, spec.at[0], spec.at[1], spec.rot || 0);
      if (!valid(fp, { margin: 0.6, streetGap: 0 })) ctx.warnings.push('explicit building does not fit: ' + (spec.role || spec.type));
      return add(spec, fp, null);
    }
    let best = null, bestScore = Infinity, bestStreet = null;
    for (const street of streets) {
      if (spec.streets && !spec.streets.includes(street.id)) continue;
      if (street.kind === 'quay' && !spec.streets) continue;
      for (const side of street.sides) {
        for (let t = spec.w / 2 + 0.5; t < street.length - spec.w / 2; t += 1.5) {
          const p = streetPoint(street, t);
          if (Math.hypot(p.x - spec.near[0], p.z - spec.near[1]) > 60) continue;
          const fp = along(spec, street, t, side);
          if (!fp) continue;
          let score = Math.hypot(fp.solid.x - spec.near[0], fp.solid.z - spec.near[1]);
          if (spec.face !== undefined) score += 9 * (1 - Math.cos(fp.solid.rot - spec.face));
          if (score < bestScore) { bestScore = score; best = fp; bestStreet = street; }
        }
      }
    }
    if (!best) {
      ctx.warnings.push('no room for ' + (spec.role || spec.type));
      return null;
    }
    return add(spec, best, bestStreet);
  }

  function fillHouses() {
    const { rng } = ctx;
    const h = plan.houses;
    const order = ['main', 'square', 'lane'];
    for (const kind of order) {
      for (const street of streets) {
        if (street.kind !== kind) continue;
        for (const side of street.sides) {
          let t = 1 + rng() * 3;
          let spec = null;
          while (t < street.length - 3) {
            if (!spec) {
              spec = {
                type: 'house',
                w: h.w[0] + rng() * (h.w[1] - h.w[0]),
                d: h.d[0] + rng() * (h.d[1] - h.d[0]),
                floors: h.floors[Math.floor(rng() * h.floors.length)],
              };
              spec.w = Math.round(spec.w * 4) / 4;
              spec.d = Math.round(spec.d * 4) / 4;
            }
            const fp = t + spec.w < street.length ? along(spec, street, t + spec.w / 2, side, { margin: h.gap[0] }) : null;
            if (fp) {
              add(spec, fp, street);
              t += spec.w + h.gap[0] + rng() * (h.gap[1] - h.gap[0]);
              spec = null;
            } else {
              t += 1.3;
            }
          }
        }
      }
    }
  }

  /** Thin the rows of houses down to the target count, leaving vacant lots for gardens and yards. */
  function thin() {
    const { rng } = ctx;
    const streetKind = id => (streets.find(s => s.id === id) || {}).kind;
    let extra = ctx.buildings.length - plan.houses.target;
    const removable = ctx.buildings.filter(b => b.type === 'house' && streetKind(b.street) !== 'square');
    while (extra > 0 && removable.length) {
      const i = Math.floor(rng() * removable.length);
      const [gone] = removable.splice(i, 1);
      ctx.buildings.splice(ctx.buildings.indexOf(gone), 1);
      extra--;
    }
  }

  return { placeSpecial, fillHouses, thin, valid };
}

// ───────────────────────── walls ─────────────────────────

function buildWalls(ctx) {
  const { plan } = ctx;
  const R = plan.R, wall = plan.wall;
  const segments = [], towers = [];
  const dAz = GATE_HALF / R / DEG;
  for (const [a0, a1] of wall.arcs) {
    const full = a1 - a0 >= 360;
    const inArc = [];
    for (const g of plan.gates) {
      let az = g.yaw / DEG;
      while (az < a0) az += 360;
      while (az >= a0 + 360) az -= 360;
      if (full || az < a1) inArc.push(az);
    }
    inArc.sort((p, q) => p - q);
    const spans = [];
    if (full) {
      for (let i = 0; i < inArc.length; i++) {
        const next = i + 1 < inArc.length ? inArc[i + 1] : inArc[0] + 360;
        spans.push([inArc[i] + dAz, next - dAz]);
      }
    } else {
      let from = a0;
      for (const az of inArc) {
        spans.push([from, az - dAz]);
        from = az + dAz;
      }
      spans.push([from, a1]);
      for (const az of [a0, a1]) {
        const p = polar(az, R);
        towers.push({ x: p[0], z: p[1], end: true });
      }
    }
    for (const [s0, s1] of spans) {
      const n = Math.max(1, Math.round((s1 - s0) * DEG * R / wall.segLen));
      for (let k = 0; k < n; k++) {
        const p = polar(s0 + (s1 - s0) * k / n, R), q = polar(s0 + (s1 - s0) * (k + 1) / n, R);
        segments.push({ x0: p[0], z0: p[1], x1: q[0], z1: q[1] });
        if (k > 0 && wall.towerEvery && k % wall.towerEvery === 0) towers.push({ x: p[0], z: p[1] });
      }
    }
  }
  const gates = plan.gates.map(g => ({
    id: g.id, x: g.x, z: g.z, yaw: g.yaw, width: GATE_ROADWAY, opening: GATE_HALF * 2,
    guards: [-1, 1].map(side => ({ x: g.x + g.nz * 4.6 * side - g.nx * 1.5, z: g.z - g.nx * 4.6 * side - g.nz * 1.5, yaw: g.yaw })),
  }));
  let quay = null;
  if (plan.quay) {
    const q = plan.quay;
    const edge = [];
    const n = Math.round((q.az1 - q.az0) / 6);
    for (let i = 0; i < n; i++) {
      const a = polar(q.az0 + (q.az1 - q.az0) * i / n, q.r), b = polar(q.az0 + (q.az1 - q.az0) * (i + 1) / n, q.r);
      edge.push({ x0: a[0], z0: a[1], x1: b[0], z1: b[1] });
    }
    const piers = q.piers.map(az => {
      const p = polar(az, q.r);
      return { x: p[0], z: p[1], yaw: az * DEG, length: 64, width: 5 };
    });
    quay = { segments: edge, piers };
  }
  // colliders: wall boxes, towers, gate towers, quay parapet
  const spec = WALL_SPEC[wall.style];
  const boxAlong = (s, thick, h, tag) => {
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    ctx.colliders.push({ kind: 'box', x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, hw: len / 2 + 0.2, hd: thick / 2, rot: Math.atan2(-(s.z1 - s.z0), s.x1 - s.x0), h, tag });
  };
  for (const s of segments) boxAlong(s, wall.thickness, spec.height, 'wall');
  for (const t of towers) {
    if (spec.roundTower) ctx.colliders.push({ kind: 'circle', x: t.x, z: t.z, r: spec.tower, h: spec.height + 4, tag: 'tower' });
    else ctx.colliders.push({ kind: 'box', x: t.x, z: t.z, hw: spec.tower, hd: spec.tower, rot: Math.atan2(t.x, t.z), h: spec.height + 4, tag: 'tower' });
  }
  for (const g of plan.gates) {
    for (const side of [-1, 1]) {
      const off = GATE_HALF + spec.gateTower;
      const x = g.x + g.nz * off * side, z = g.z - g.nx * off * side;
      if (spec.roundTower) ctx.colliders.push({ kind: 'circle', x, z, r: spec.gateTower, h: spec.height + 5, tag: 'gate' });
      else ctx.colliders.push({ kind: 'box', x, z, hw: spec.gateTower, hd: spec.gateTower, rot: g.yaw, h: spec.height + 5, tag: 'gate' });
    }
  }
  if (quay) for (const s of quay.segments) boxAlong(s, 0.9, 1.0, 'quay');
  return { style: wall.style, thickness: wall.thickness, height: spec.height, tower: spec.tower, gateTower: spec.gateTower, segments, towers, gates, quay };
}

/** Wall dimensions per style: height, half-size of wall towers and of the two towers flanking each gate. */
export const WALL_SPEC = {
  timber: { height: 4.6, tower: 2.2, gateTower: 2.3, roundTower: false },
  stone: { height: 7.5, tower: 3.6, gateTower: 3.4, roundTower: false },
  harbor: { height: 6, tower: 3.4, gateTower: 3.1, roundTower: true },
};

// ───────────────────────── assembly ─────────────────────────

function generate(city) {
  const plan = makeCityPlan(city);
  const rng = makeRng(seedFrom('city-layout:' + city.key));
  const streets = plan.streets.map(prepareStreet);
  const zones = [
    { x: plan.square.x, z: plan.square.z, r: plan.square.r, tag: 'square' },
    { ...plan.yard.zone, tag: 'yard' },
    { x: plan.arrive[0], z: plan.arrive[1], r: 6, tag: 'arrive' },
    { x: plan.training[0], z: plan.training[1], r: 7.5, tag: 'training' },
    ...plan.zones,
  ];
  const ctx = {
    city, plan, rng, streets, zones,
    buildings: [], decor: [], colliders: [], lamps: [], idle: [], homes: [], spots: {}, warnings: [],
  };
  const placer = makePlacer(ctx);
  // market stalls stand inside the square zone, so they are placed without the zone test
  const stalls = plan.specials.filter(s => s.type === 'shop-stall');
  for (const spec of plan.specials) {
    if (spec.type !== 'shop-stall') placer.placeSpecial(spec);
  }
  placer.fillHouses();
  placer.thin();
  for (const spec of stalls) {
    const solid = { x: spec.at[0], z: spec.at[1], w: spec.w, d: spec.d, rot: spec.rot };
    const n = ctx.buildings.length;
    ctx.buildings.push({ id: 'stall-' + n, type: 'shop-stall', x: solid.x, z: solid.z, rot: solid.rot, w: spec.w, d: spec.d, floors: 1, canopy: 0, seed: seedFrom(city.key + ':stall' + n), street: null, solid, full: solid });
  }
  const walls = buildWalls(ctx);
  ctx.walls = walls;
  dressCity(ctx);
  const walk = buildWalkGraph(ctx);
  return toWorldLayout(ctx, walls, walk);
}

/** Convert the local-space working data into the public, world-space layout. */
function toWorldLayout(ctx, walls, walk) {
  const { city, plan } = ctx;
  const ox = city.x, oz = city.z;
  const pt = o => ({ ...o, x: o.x + ox, z: o.z + oz });
  const seg = s => ({ x0: s.x0 + ox, z0: s.z0 + oz, x1: s.x1 + ox, z1: s.z1 + oz });
  const sector = (x, z) => {
    if (Math.hypot(x - plan.square.x, z - plan.square.z) < plan.square.r + 14) return 'core';
    let az = Math.atan2(x, z) / DEG;
    if (az < 0) az += 360;
    return 's' + Math.floor(az / 60);
  };
  const buildings = ctx.buildings.map(b => ({
    id: b.id, type: b.type, x: b.x + ox, z: b.z + oz, rot: b.rot, w: b.w, d: b.d, floors: b.floors,
    role: b.role, variant: b.variant, canopy: b.canopy, door: b.door || 0, seed: b.seed, chunk: sector(b.x, b.z),
  }));
  const spots = {};
  for (const key of Object.keys(ctx.spots)) spots[key] = pt(ctx.spots[key]);
  return {
    city,
    style: city.style,
    buildings,
    walls: {
      style: walls.style, thickness: walls.thickness, height: walls.height, tower: walls.tower, gateTower: walls.gateTower,
      segments: walls.segments.map(seg),
      towers: walls.towers.map(pt),
      gates: walls.gates.map(g => ({ ...pt(g), guards: g.guards.map(pt) })),
      quay: walls.quay ? { segments: walls.quay.segments.map(seg), piers: walls.quay.piers.map(pt) } : null,
    },
    spots,
    homes: ctx.homes.map(pt),
    idle: ctx.idle.map(pt),
    walk: { nodes: walk.nodes.map(pt), edges: walk.edges, gateNodes: walk.gateNodes },
    lamps: ctx.lamps.map(l => ({ x: l.x + ox, y: city.y + l.h, z: l.z + oz })),
    // — extras used by the renderer —
    square: { x: plan.square.x + ox, z: plan.square.z + oz, r: plan.square.r },
    streets: ctx.streets.map(s => ({ id: s.id, kind: s.kind, half: s.half, closed: !!s.closed, pts: s.pts.map(p => ({ x: p[0] + ox, z: p[1] + oz })) })),
    decor: ctx.decor.map(d => ({ ...pt(d), chunk: sector(d.x, d.z) })),
    colliders: ctx.colliders.map(pt),
    warnings: ctx.warnings,
  };
}
