// Street walk graph of a city: nodes along every street, hub nodes on the square, a node for every NPC spot and
// doorstep, and only edges that keep CLEARANCE metres away from every collider. Pure.
import { NPC_ROLES } from '../data/world-map.js';
import { polar, subdivide, pointSegDist, segBoxDist } from './geom-layout.js';

export const CLEARANCE = 1.2;

/** True when the segment keeps `clear` metres from all colliders ([{kind:'box'|'circle',…}]). */
export function segmentFree(colliders, x0, z0, x1, z1, clear = CLEARANCE) {
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, half = Math.hypot(x1 - x0, z1 - z0) / 2;
  for (const c of colliders) {
    const bound = c.kind === 'circle' ? c.r : Math.hypot(c.hw, c.hd);
    if (Math.hypot(c.x - mx, c.z - mz) > half + bound + clear) continue;
    if (c.kind === 'circle') {
      if (pointSegDist(c.x, c.z, x0, z0, x1, z1) < c.r + clear) return false;
    } else if (segBoxDist(x0, z0, x1, z1, { x: c.x, z: c.z, w: c.hw * 2, d: c.hd * 2, rot: c.rot }) < clear) {
      return false;
    }
  }
  return true;
}

export function buildWalkGraph(ctx) {
  const { plan, streets, colliders } = ctx;
  const nodes = [], edges = [], edgeSet = new Set();
  const streetOf = [];

  function addNode(x, z, street, exact = false) {
    for (let i = 0; i < nodes.length && !exact; i++) {
      if (Math.abs(nodes[i].x - x) < 0.9 && Math.abs(nodes[i].z - z) < 0.9) return i;
    }
    nodes.push({ x, z });
    streetOf.push(street);
    return nodes.length - 1;
  }

  function link(a, b, clear = CLEARANCE) {
    if (a === b) return false;
    const key = a < b ? a * 100000 + b : b * 100000 + a;
    if (edgeSet.has(key)) return true;
    if (!segmentFree(colliders, nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z, clear)) return false;
    edgeSet.add(key);
    edges.push([a, b]);
    return true;
  }

  // nodes along the streets
  const gateNodes = {};
  for (const s of streets) {
    const pts = subdivide(s.pts, 7);
    let prev = -1;
    for (let i = 0; i < pts.length; i++) {
      const n = addNode(pts[i][0], pts[i][1], s.id);
      if (prev >= 0) link(prev, n);
      prev = n;
      if (i === 0 && s.gate) gateNodes[s.gate] = n;
    }
  }
  // a node on the road just outside every gate
  for (const g of plan.gates) {
    const out = addNode(g.x + g.nx * 10, g.z + g.nz * 10, 'outside');
    link(out, gateNodes[g.id]);
  }
  // hub ring on the square
  const sq = plan.square;
  const hub = [];
  for (let k = 0; k < 8; k++) {
    const p = polar(k * 45 + 22.5, 6.5);
    hub.push(addNode(sq.x + p[0], sq.z + p[1], 'hub'));
  }
  for (let k = 0; k < 8; k++) link(hub[k], hub[(k + 1) % 8]);
  // junctions: nodes of different streets that are close to each other
  const count = nodes.length;
  for (let a = 0; a < count; a++) {
    for (let b = a + 1; b < count; b++) {
      if (streetOf[a] === streetOf[b]) continue;
      const hubPair = streetOf[a] === 'hub' || streetOf[b] === 'hub';
      const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
      if (d < (hubPair ? 13.5 : 7.6)) link(a, b);
    }
  }

  /** Attach a free-standing point to the graph: straight to the nearest street nodes it can reach. */
  function attach(spot, label) {
    const order = [];
    for (let i = 0; i < count; i++) {
      const d = Math.hypot(nodes[i].x - spot.x, nodes[i].z - spot.z);
      if (d < 34 && d > 0.9) order.push([d, i]);
    }
    order.sort((p, q) => p[0] - q[0]);
    const reach = [];
    for (const [, i] of order) {
      if (segmentFree(colliders, spot.x, spot.z, nodes[i].x, nodes[i].z)) reach.push(i);
      if (reach.length >= 2) break;
    }
    if (!reach.length) {
      ctx.warnings.push('spot not connected to the street graph: ' + label);
      spot.node = -1;
      return -1;
    }
    const n = addNode(spot.x, spot.z, 'spot', true);
    spot.node = n;
    for (const i of reach) link(n, i);
    return n;
  }

  for (const role of NPC_ROLES) {
    if (ctx.spots[role]) attach(ctx.spots[role], role);
  }
  for (const key of ['respawn', 'caravanYard', 'caravanArrive']) attach(ctx.spots[key], key);
  // the board and the well are obstacles: connect the place where one stands in front of them
  for (const key of ['board', 'well', 'square']) {
    const s = ctx.spots[key];
    let best = hub[0], bd = Infinity;
    for (let i = 0; i < count; i++) {
      const d = Math.hypot(nodes[i].x - s.x, nodes[i].z - s.z);
      if (d < bd) { bd = d; best = i; }
    }
    s.node = best;
  }
  ctx.homes.forEach((home, i) => attach(home, 'home ' + i));
  ctx.homes = ctx.homes.filter(home => home.node >= 0);
  for (const p of ctx.idle) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < count; i++) {
      const d = Math.hypot(nodes[i].x - p.x, nodes[i].z - p.z);
      if (d < bd) { bd = d; best = i; }
    }
    p.node = best;
  }
  return { nodes, edges, gateNodes };
}
