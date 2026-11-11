// "Dressing" of a city layout: NPC work spots, workshop furniture, street lamps, benches, clutter, garden plots,
// idle points and doorsteps. Pure — works on the local-space context of city-layout.js.
import { NPC_ROLES } from '../data/world-map.js';
import { DEG, polar, toWorld, pointInBox, pointBoxDist, pointSegDist, pointPolyDist } from './geom-layout.js';

/** Furniture under the canopy of a role building: [kind, side, |x| from the centre, z out of the wall, collider r]. */
const CANOPY_SETS = {
  smith: [['forge', -1, 3.0, 1.3, 1.0], ['anvil', 1, 2.3, 2.3, 0.5], ['grindstone', 1, 3.5, 0.9, 0.5], ['barrel', -1, 3.4, 3.2, 0.45]],
  carpenter: [['workbench', -1, 2.9, 1.2, 0.9], ['woodpile', 1, 3.0, 1.1, 0.9], ['saw-horse', 1, 2.6, 2.9, 0.6]],
  leatherworker: [['tanning-rack', -1, 2.8, 1.5, 0.8], ['barrel', 1, 2.3, 0.8, 0.45], ['tanning-rack', 1, 3.0, 2.4, 0.8]],
  tailor: [['loom', -1, 2.7, 1.3, 0.9], ['cloth-rack', 1, 2.7, 1.3, 0.8]],
  mason: [['stone-stack', -1, 2.9, 1.4, 1.0], ['workbench', 1, 2.9, 1.2, 0.9], ['grindstone', -1, 2.5, 3.0, 0.5]],
  apothecary: [['herb-rack', -1, 2.6, 1.2, 0.8], ['goods-table', 1, 2.6, 1.3, 0.8], ['barrel', 1, 3.2, 2.6, 0.45]],
  farmer: [['sack', -1, 2.7, 1.1, 0.7], ['crate', 1, 2.5, 1.0, 0.6], ['hay-bale', 1, 3.2, 2.5, 0.7], ['sack', -1, 3.2, 2.5, 0.6]],
  weaponsmith: [['weapon-rack', -1, 2.7, 0.8, 0.7], ['goods-table', 1, 2.7, 1.2, 0.8]],
  armorer: [['armor-stand', -1, 2.4, 0.9, 0.5], ['armor-stand', 1, 2.4, 0.9, 0.5], ['crate', 1, 3.3, 1.9, 0.5]],
  grocer: [['goods-table', -1, 2.7, 1.2, 0.8], ['barrel', 1, 2.3, 0.8, 0.45], ['crate', 1, 3.3, 1.2, 0.5], ['sack', 1, 2.5, 1.9, 0.5]],
  trader: [['crate', -1, 2.8, 1.0, 0.6], ['goods-table', 1, 2.8, 1.3, 0.8], ['barrel', -1, 3.7, 2.0, 0.45], ['sack', -1, 2.4, 2.2, 0.5]],
  stablemaster: [['hay-bale', -1, 3.2, 1.2, 0.7], ['trough', 1, 3.4, 2.4, 0.8], ['hay-bale', -1, 4.5, 2.2, 0.7], ['barrel', 1, 4.8, 0.8, 0.45]],
  innkeeper: [['table', -1, 3.6, 1.4, 0.75], ['table', 1, 3.6, 1.4, 0.75], ['table', -1, 3.9, 3.5, 0.75], ['table', 1, 3.9, 3.5, 0.75], ['barrel', -1, 5.7, 0.7, 0.45]],
};

const FILLERS = {
  plot: { kind: 'plot', clear: 4.2 },
  pen: { kind: 'pen', clear: 4.6, hw: 3, hd: 2.4 },
  tree: { kind: 'tree', clear: 2.8, r: 0.45 },
  orchard: { kind: 'fruit-tree', clear: 2.8, r: 0.4 },
  palm: { kind: 'cypress', clear: 2.2, r: 0.4 },
  hay: { kind: 'haystack', clear: 2.2, r: 1.2 },
  'ore-pile': { kind: 'ore-pile', clear: 2.4, r: 1.5 },
  'stone-stack': { kind: 'stone-stack', clear: 1.9, r: 1.0 },
  crates: { kind: 'crates', clear: 1.9, r: 1.0 },
  barrels: { kind: 'barrels', clear: 1.7, r: 0.9 },
  woodpile: { kind: 'woodpile', clear: 1.7, r: 0.9 },
};

const CLUTTER = {
  timber: ['barrel', 'crate', 'woodpile', 'hay-bale', 'sack', 'barrel'],
  stone: ['barrel', 'crate', 'crate', 'sack', 'woodpile', 'stone-stack'],
  harbor: ['barrel', 'crate', 'crate', 'fishing-net', 'sack', 'barrel'],
};

/** Fill ctx.spots / decor / colliders / lamps / idle / homes. */
export function dressCity(ctx) {
  const { plan, rng, streets, buildings } = ctx;
  const sq = plan.square;
  const mainOf = gate => streets.find(s => s.gate === gate.id);

  function addDecor(kind, x, z, rot = 0, o = {}) {
    const item = { kind, x, z, rot, seed: Math.floor(rng() * 1e9), ...o };
    ctx.decor.push(item);
    if (o.r) ctx.colliders.push({ kind: 'circle', x, z, r: o.r, h: o.h || 1.2, tag: 'prop' });
    if (o.hw) ctx.colliders.push({ kind: 'box', x, z, hw: o.hw, hd: o.hd, rot, h: o.h || 1.2, tag: 'prop' });
    return item;
  }

  /** True when a disc of radius r at (x,z) touches nothing: buildings, streets (optional), existing prop colliders. */
  function free(x, z, r, o = {}) {
    for (const b of buildings) {
      if (pointBoxDist(b.full, x, z) < r + (o.building ?? 0.1)) return false;
    }
    if (o.street !== false) {
      for (const s of streets) {
        if (pointPolyDist(x, z, s.pts) < s.half + r + (o.street ?? 0.4)) return false;
      }
    }
    for (const zone of ctx.zones) {
      if (o.zones !== false && Math.hypot(x - zone.x, z - zone.z) < zone.r + r * (o.zoneK ?? 0.5)) return false;
    }
    for (const c of ctx.colliders) {
      if (c.tag !== 'prop' && c.tag !== 'post') continue;
      const cr = c.kind === 'circle' ? c.r : Math.hypot(c.hw, c.hd);
      if (Math.hypot(x - c.x, z - c.z) < r + cr + (o.gap ?? 0.3)) return false;
    }
    return Math.hypot(x, z) < plan.R - plan.wall.inset + 2.5;
  }

  // — building colliders (one box each) —
  for (const b of buildings) {
    const tall = b.type !== 'shop-stall';
    ctx.colliders.push({ kind: 'box', x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2, rot: b.rot, h: tall ? 4 + b.floors * 2.8 : 2.4, tag: 'building', id: b.id });
    if (b.canopy && b.type !== 'tavern') {
      for (const side of [-1, 1]) {
        const [px, pz] = toWorld(b.solid, side * (b.w / 2 - 0.25), b.d / 2 + b.canopy - 0.25);
        ctx.colliders.push({ kind: 'circle', x: px, z: pz, r: 0.2, h: 3, tag: 'post' });
      }
    }
  }

  // — fixed features of the plan (well, linden, statue, cranes …) —
  for (const f of plan.features) addDecor(f.kind, f.at[0], f.at[1], f.rot || 0, { r: f.r, h: 3 });

  // — role spots and workshop furniture —
  const byRole = {};
  for (const b of buildings) {
    if (b.type === 'house') {
      const choices = [-0.26, 0, 0.26];
      b.door = Math.round(b.w * choices[Math.floor(rng() * 3)] * 10) / 10;
      const [hx, hz] = toWorld(b.solid, b.door, b.d / 2 + 1.35);
      ctx.homes.push({ x: hx, z: hz, yaw: b.rot + Math.PI, buildingId: b.id });
    }
    if (!b.role) continue;
    byRole[b.role] = b;
    const out = b.canopy ? Math.min(1.7, b.canopy * 0.5) : (b.type === 'townhall' ? 2.4 : 1.5);
    const [sx, sz] = toWorld(b.solid, 0, b.d / 2 + out);
    ctx.spots[b.role] = { x: sx, z: sz, yaw: b.rot, buildingId: b.id };
    for (const [kind, side, ax, lz, r] of CANOPY_SETS[b.role] || []) {
      const lx = Math.min(ax, b.w / 2 - r - 0.1);
      if (lx - r < 1.45 || lz + r > b.canopy + 0.3) continue;
      const [px, pz] = toWorld(b.solid, side * lx, b.d / 2 + lz);
      addDecor(kind, px, pz, b.rot + (kind === 'table' ? 0 : side * 0.2), { r, h: 1.1, owner: b.id });
      if (kind === 'table') {
        const [ix, iz] = toWorld(b.solid, side * lx, b.d / 2 + lz + 0.9);
        ctx.idle.push({ x: ix, z: iz, yaw: b.rot + Math.PI, kind: 'sit' });
      }
    }
  }
  for (const role of NPC_ROLES) {
    if (!ctx.spots[role] && role !== 'trainer') ctx.warnings.push('missing role building: ' + role);
  }

  // — special spots —
  const gIn = plan.gateIn, gOut = plan.gateOut;
  ctx.spots.square = { x: sq.x, z: sq.z };
  const well = plan.features.find(f => f.kind === 'well' || f.kind === 'fountain');
  ctx.spots.well = { x: well.at[0], z: well.at[1] };
  const mainAz = streets.filter(s => s.kind === 'main').map(s => {
    const a = s.pts[0], b = s.pts[s.pts.length - 1];
    const end = Math.hypot(a[0] - sq.x, a[1] - sq.z) < Math.hypot(b[0] - sq.x, b[1] - sq.z) ? a : b;
    return { id: s.id, az: Math.atan2(end[0] - sq.x, end[1] - sq.z) / DEG };
  });
  const inAz = mainAz.find(m => m.id === 'main-' + gIn.id).az;
  const boardAz = inAz + 27;
  const bp = polar(boardAz, sq.r - 5);
  ctx.spots.board = { x: sq.x + bp[0], z: sq.z + bp[1], yaw: (boardAz + 180) * DEG };
  addDecor('notice-board', ctx.spots.board.x, ctx.spots.board.z, ctx.spots.board.yaw, { r: 0.55, h: 2.4 });
  const rp = polar(inAz + 8, 5.2);
  ctx.spots.respawn = { x: sq.x + rp[0], z: sq.z + rp[1], yaw: Math.atan2(-rp[0], -rp[1]) };
  ctx.spots.caravanYard = { x: plan.yard.centre[0], z: plan.yard.centre[1], yaw: plan.yard.yaw };
  ctx.spots.caravanArrive = { x: plan.arrive[0], z: plan.arrive[1], yaw: gIn.yaw + Math.PI };

  // training yard beside the barracks: the trainer faces the street, dummies stand behind
  const tr = plan.training;
  const north = plan.gates.find(g => g.id === 'north') || plan.gates[0];
  const street = mainOf(north);
  let toStreet = [1, 0], bd = Infinity;
  for (const seg of street.segs) {
    const d = pointSegDist(tr[0], tr[1], seg.x0, seg.z0, seg.x1, seg.z1);
    if (d < bd) {
      bd = d;
      const u = Math.max(0, Math.min(seg.len, (tr[0] - seg.x0) * seg.dx + (tr[1] - seg.z0) * seg.dz));
      toStreet = [(seg.x0 + seg.dx * u - tr[0]) / d, (seg.z0 + seg.dz * u - tr[1]) / d];
    }
  }
  ctx.spots.trainer = { x: tr[0] + toStreet[0] * 3, z: tr[1] + toStreet[1] * 3, yaw: Math.atan2(toStreet[0], toStreet[1]), buildingId: byRole.captain ? byRole.captain.id : null };
  const across = [-toStreet[1], toStreet[0]];
  for (const k of [-1, 0, 1]) {
    const dx = tr[0] - toStreet[0] * 3.6 + across[0] * k * 3.2, dz = tr[1] - toStreet[1] * 3.6 + across[1] * k * 3.2;
    addDecor(k === 0 ? 'archery-target' : 'target-dummy', dx, dz, Math.atan2(toStreet[0], toStreet[1]), { r: 0.5, h: 2 });
    if (k !== 0) ctx.idle.push({ x: dx + toStreet[0] * 1.5, z: dz + toStreet[1] * 1.5, yaw: Math.atan2(-toStreet[0], -toStreet[1]), kind: 'work' });
  }

  // — caravan yard dressing (kept off the wagon's way) —
  const yc = plan.yard.centre;
  const lat = [gOut.nz, -gOut.nx];
  addDecor('crates', yc[0] - gOut.nx * 7.5 + lat[0] * 5.5, yc[1] - gOut.nz * 7.5 + lat[1] * 5.5, 0.4, { r: 1.0 });
  addDecor('cart', yc[0] + gOut.nx * 7 + lat[0] * 6, yc[1] + gOut.nz * 7 + lat[1] * 6, gOut.yaw + 0.5, { r: 1.3 });
  ctx.idle.push({ x: yc[0] - gOut.nx * 5.5 + lat[0] * 4, z: yc[1] - gOut.nz * 5.5 + lat[1] * 4, yaw: gOut.yaw, kind: 'work' });

  // — benches round the square —
  const angDiff = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
  let benches = 0;
  for (let az = 15; az < 375 && benches < 6; az += 30) {
    if (mainAz.some(m => angDiff(m.az, az) < 20) || angDiff(boardAz, az) < 14) continue;
    const p = polar(az, sq.r - 5.4);
    addDecor('bench', sq.x + p[0], sq.z + p[1], (az + 180) * DEG);
    ctx.idle.push({ x: sq.x + p[0], z: sq.z + p[1], yaw: (az + 180) * DEG, kind: 'sit' });
    benches++;
  }
  ctx.idle.push({ x: ctx.spots.board.x - Math.sin(boardAz * DEG) * 1.5, z: ctx.spots.board.z - Math.cos(boardAz * DEG) * 1.5, yaw: boardAz * DEG, kind: 'stand' });
  const wd = Math.hypot(well.at[0] - sq.x, well.at[1] - sq.z) || 1;
  const wdir = wd > 1 ? [(sq.x - well.at[0]) / wd, (sq.z - well.at[1]) / wd] : [0.6, 0.8];
  ctx.idle.push({ x: well.at[0] + wdir[0] * (well.r + 0.9), z: well.at[1] + wdir[1] * (well.r + 0.9), yaw: Math.atan2(-wdir[0], -wdir[1]), kind: 'stand' });
  for (const b of buildings) {
    if (b.type !== 'shop-stall') continue;
    const [ix, iz] = toWorld(b.solid, 0, b.d / 2 + 1.4);
    ctx.idle.push({ x: ix, z: iz, yaw: b.rot + Math.PI, kind: 'stand' });
  }

  // — lamps —
  const corridor = [[gOut.x, gOut.z], [gOut.x - gOut.nx * 27, gOut.z - gOut.nz * 27], yc];
  const addLamp = (x, z, withPost = true) => {
    if (withPost) {
      if (!free(x, z, 0.25, { street: false, zones: false, gap: 0.6 })) return false;
      if (pointPolyDist(x, z, corridor) < 3.2) return false;
      for (const zone of ctx.zones) {
        if (zone.tag !== 'square' && Math.hypot(x - zone.x, z - zone.z) < zone.r) return false;
      }
      addDecor('lantern-post', x, z, rng() * 6.28, { r: 0.22, h: 3.6 });
    }
    ctx.lamps.push({ x, z, h: withPost ? 3.45 : 4.4 });
    return true;
  };
  for (const s of streets) {
    if (s.kind !== 'main' && s.kind !== 'lane') continue;
    const step = s.kind === 'main' ? 24 : 46;
    let side = 1;
    for (let t = s.kind === 'main' ? 19 : 14; t < s.length - 6; t += step) {
      const seg = s.segs.find(q => t <= q.s0 + q.len) || s.segs[s.segs.length - 1];
      const u = t - seg.s0;
      const off = s.half + 0.6;
      const x = seg.x0 + seg.dx * u + side * seg.dz * off, z = seg.z0 + seg.dz * u - side * seg.dx * off;
      if (addLamp(x, z) && s.kind === 'main' && ctx.idle.length < 60 && rng() < 0.4) {
        ctx.idle.push({ x: x + side * seg.dz * 0.55, z: z - side * seg.dx * 0.55, yaw: Math.atan2(-side * seg.dz, side * seg.dx), kind: 'lean' });
      }
      side = -side;
    }
  }
  for (let k = 0; k < 4; k++) {
    const p = polar(45 + k * 90 + 7, sq.r - 4.4);
    addLamp(sq.x + p[0], sq.z + p[1]);
  }
  for (const g of plan.gates) {
    for (const side of [-1, 1]) {
      addLamp(g.x + g.nz * 5.1 * side - g.nx * 2.2, g.z - g.nx * 5.1 * side - g.nz * 2.2, false);
    }
    ctx.idle.push({ x: g.x + g.nz * 4.4 - g.nx * 9, z: g.z - g.nx * 4.4 - g.nz * 9, yaw: g.yaw - 1.9, kind: 'lean' });
  }
  if (plan.quay) {
    for (let az = plan.quay.az0 + 8; az < plan.quay.az1; az += 13) {
      const p = polar(az, plan.quay.r - 1.6);
      addLamp(p[0], p[1]);
      const q = polar(az + 6, plan.quay.r - 1.5);
      if (ctx.idle.length < 60) ctx.idle.push({ x: q[0], z: q[1], yaw: (az + 6) * DEG, kind: 'lean' });
      if (az % 2 < 1) {
        const c = polar(az + 3.3, plan.quay.r - 2.3);
        if (free(c[0], c[1], 1.0, { street: false })) addDecor(rng() < 0.5 ? 'crates' : 'barrels', c[0], c[1], rng() * 6.28, { r: 1.0 });
      }
    }
  }

  // — clutter beside buildings —
  const clutter = CLUTTER[plan.wall.style];
  for (const b of buildings) {
    if (b.type === 'shop-stall' || rng() > 0.6) continue;
    const side = rng() < 0.5 ? -1 : 1;
    const count = 1 + Math.floor(rng() * 2.4);
    for (let k = 0; k < count; k++) {
      const [x, z] = toWorld(b.solid, side * (b.w / 2 + 0.6), b.d / 2 - 0.7 - k * 1.15);
      const kind = clutter[Math.floor(rng() * clutter.length)];
      const r = kind === 'woodpile' || kind === 'stone-stack' ? 0.6 : 0.45;
      if (free(x, z, r, { building: -0.25, street: 0.5, zoneK: 1 })) addDecor(kind, x, z, b.rot + rng() * 0.6, { r, small: true });
    }
  }

  // — gardens, pens, trees and stock piles on the vacant ground —
  const fill = plan.filler || [];
  const limit = plan.R - plan.wall.inset - 3;
  const cells = [];
  for (let gx = -limit; gx <= limit; gx += 8) {
    for (let gz = -limit; gz <= limit; gz += 8) cells.push([gx, gz, rng()]);
  }
  cells.sort((p, q) => p[2] - q[2]);
  let placed = 0;
  for (const [gx, gz] of cells) {
    if (placed >= 60 || !fill.length) break;
    const x = gx + (rng() - 0.5) * 5, z = gz + (rng() - 0.5) * 5;
    const f = FILLERS[fill[Math.floor(rng() * fill.length)]];
    if (Math.hypot(x, z) > limit) continue;
    const big = f.hw ? Math.hypot(f.hw, f.hd) : 0;
    if (!free(x, z, f.clear, { building: 0, street: 0.2, gap: 1.2 + big, zoneK: 1 })) continue;
    const rot = Math.atan2(x, z) + (rng() - 0.5) * 0.5;
    addDecor(f.kind, x, z, rot, { r: f.r, hw: f.hw, hd: f.hd, h: f.kind.includes('tree') || f.kind === 'cypress' ? 5 : 1.4, clear: f.clear });
    if ((f.kind === 'plot' || f.kind === 'pen') && ctx.idle.length < 60) {
      const k = f.clear * 0.92;
      ctx.idle.push({ x: x + Math.sin(rot) * k, z: z + Math.cos(rot) * k, yaw: rot + Math.PI, kind: 'work' });
    }
    placed++;
  }

  // idle points must be standable: drop any that ended up inside something solid
  ctx.idle = ctx.idle.filter(p => {
    for (const b of buildings) {
      if (pointInBox(b.solid, p.x, p.z, 0.35)) return false;
    }
    for (const c of ctx.colliders) {
      if (c.kind === 'circle' && c.tag === 'prop' && Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.1) return false;
    }
    return true;
  });
}
