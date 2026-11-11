// Pure tests of settlement layouts: cities (buildings, walls, NPC spots, walk graph) and points of interest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, NPC_ROLES, LEGS, POIS } from '../src/data/world-map.js';
import { getCityLayout } from '../src/world/city-layout.js';
import { getPoiLayout } from '../src/world/poi-layout.js';
import { segmentFree, CLEARANCE } from '../src/world/city-walk-layout.js';
import { pointInBox, boxesOverlap, pointBoxDist } from '../src/world/geom-layout.js';
import { ROADS } from '../src/world/terrain.js';

const solidOf = b => ({ x: b.x, z: b.z, w: b.w, d: b.d, rot: b.rot });

function reachable(walk, from) {
  const adj = walk.nodes.map(() => []);
  for (const [a, b] of walk.edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const n = queue.pop();
    for (const k of adj[n]) {
      if (!seen.has(k)) {
        seen.add(k);
        queue.push(k);
      }
    }
  }
  return seen;
}

for (const city of CITIES) {
  const L = getCityLayout(city.key);
  const inside = (p, margin = 0) => Math.hypot(p.x - city.x, p.z - city.z) <= city.radius - margin;

  test(`${city.key}: layout basics and counts`, () => {
    assert.deepEqual(L.warnings, []);
    assert.equal(L.city, city);
    const real = L.buildings.filter(b => b.type !== 'shop-stall');
    assert.ok(real.length >= 45 && real.length <= 70, `buildings: ${real.length}`);
    assert.ok(L.homes.length >= 12, `homes: ${L.homes.length}`);
    assert.ok(L.idle.length >= 20, `idle: ${L.idle.length}`);
    assert.ok(L.lamps.length >= 14, `lamps: ${L.lamps.length}`);
    for (const l of L.lamps) assert.ok(l.y > city.y + 2 && l.y < city.y + 8);
    for (const p of L.idle) assert.ok(['sit', 'stand', 'work', 'lean'].includes(p.kind));
    const ids = new Set(L.buildings.map(b => b.id));
    assert.equal(ids.size, L.buildings.length, 'building ids are unique');
  });

  test(`${city.key}: buildings stand inside the wall and do not overlap`, () => {
    for (const b of L.buildings) {
      assert.ok(inside(b, 3), `${b.id} outside the wall`);
      assert.ok(b.w > 1 && b.d > 1 && b.floors >= 1);
    }
    for (let i = 0; i < L.buildings.length; i++) {
      for (let j = i + 1; j < L.buildings.length; j++) {
        assert.ok(!boxesOverlap(solidOf(L.buildings[i]), solidOf(L.buildings[j]), 0), `${L.buildings[i].id} overlaps ${L.buildings[j].id}`);
      }
    }
  });

  test(`${city.key}: gates match the map and stay open`, () => {
    assert.equal(L.walls.gates.length, city.gates.length);
    for (const g of city.gates) {
      const gate = L.walls.gates.find(k => k.id === g.id);
      assert.ok(gate, `gate ${g.id}`);
      assert.ok(Math.hypot(gate.x - g.x, gate.z - g.z) < 0.01);
      assert.ok(gate.opening >= 9, 'a wagon must pass');
      // an 8.6 m wide corridor (wider than the road) through the gate is free of colliders
      const nx = Math.sin(gate.yaw), nz = Math.cos(gate.yaw);
      assert.ok(segmentFree(L.colliders, gate.x - nx * 14, gate.z - nz * 14, gate.x + nx * 14, gate.z + nz * 14, 4.3), `gate ${g.id} is blocked`);
      // no wall segment crosses the opening
      for (const s of L.walls.segments) {
        const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2;
        assert.ok(Math.hypot(mx - gate.x, mz - gate.z) > 5.4);
      }
    }
  });

  test(`${city.key}: every role has a reachable work spot`, () => {
    const fromGate = {};
    for (const g of city.gates) fromGate[g.id] = reachable(L.walk, L.walk.gateNodes[g.id]);
    for (const role of NPC_ROLES) {
      const spot = L.spots[role];
      assert.ok(spot, `no spot for ${role}`);
      assert.ok(Number.isFinite(spot.yaw));
      assert.ok(inside(spot, 4), `${role} outside the wall`);
      assert.ok(L.buildings.some(b => b.id === spot.buildingId), `${role} has no building`);
      for (const b of L.buildings) assert.ok(!pointInBox(solidOf(b), spot.x, spot.z, 0.3), `${role} stands inside ${b.id}`);
      for (const c of L.colliders) {
        const d = c.kind === 'circle' ? Math.hypot(spot.x - c.x, spot.z - c.z) - c.r : pointBoxDist({ x: c.x, z: c.z, w: c.hw * 2, d: c.hd * 2, rot: c.rot }, spot.x, spot.z);
        assert.ok(d > 0.5, `${role} is stuck in a collider (${c.tag})`);
      }
      assert.ok(spot.node >= 0);
      const node = L.walk.nodes[spot.node];
      assert.ok(Math.hypot(node.x - spot.x, node.z - spot.z) < 0.01);
      for (const g of city.gates) assert.ok(fromGate[g.id].has(spot.node), `${role} unreachable from gate ${g.id}`);
    }
    for (const key of ['square', 'board', 'well', 'respawn', 'caravanYard', 'caravanArrive']) {
      assert.ok(L.spots[key], `no ${key} spot`);
      assert.ok(inside(L.spots[key], 3));
      assert.ok(fromGate[city.gates[0].id].has(L.spots[key].node), `${key} unreachable`);
    }
    for (const home of L.homes) assert.ok(fromGate[city.gates[0].id].has(home.node), 'home unreachable');
  });

  test(`${city.key}: walk graph is connected and keeps clear of obstacles`, () => {
    const seen = reachable(L.walk, 0);
    assert.equal(seen.size, L.walk.nodes.length, 'graph is not connected');
    for (const [a, b] of L.walk.edges) {
      const p = L.walk.nodes[a], q = L.walk.nodes[b];
      assert.ok(segmentFree(L.colliders, p.x, p.z, q.x, q.z, CLEARANCE - 0.01), `edge ${a}-${b} is obstructed`);
    }
    assert.ok(CLEARANCE >= 1.2);
  });

  test(`${city.key}: caravan yard by the outgoing gate, wagon corridor is free`, () => {
    const outLeg = LEGS.find(l => l.from === city.id), inLeg = LEGS.find(l => l.to === city.id);
    const start = outLeg.path[0], end = inLeg.path[inLeg.path.length - 1];
    const yard = L.spots.caravanYard, arrive = L.spots.caravanArrive;
    assert.ok(inside(yard, 12) && inside(arrive, 8));
    assert.ok(Math.hypot(yard.x - start[0], yard.z - start[1]) < 45, 'yard is not next to the outgoing gate');
    assert.ok(Math.hypot(arrive.x - end[0], arrive.z - end[1]) < 35, 'arrival spot is not next to the incoming gate');
    const gate = L.walls.gates.find(g => Math.hypot(g.x - start[0], g.z - start[1]) < 1);
    const nx = Math.sin(gate.yaw), nz = Math.cos(gate.yaw);
    const turn = { x: gate.x - nx * 27, z: gate.z - nz * 27 };
    assert.ok(segmentFree(L.colliders, gate.x + nx * 6, gate.z + nz * 6, turn.x, turn.z, 2.4), 'road from the gate is obstructed');
    assert.ok(segmentFree(L.colliders, turn.x, turn.z, yard.x, yard.z, 2.4), 'yard entrance is obstructed');
    for (const b of L.buildings) assert.ok(pointBoxDist(solidOf(b), yard.x, yard.z) > 5, `${b.id} stands in the caravan yard`);
  });

  test(`${city.key}: streets are wide enough`, () => {
    for (const s of L.streets) {
      if (s.kind === 'main') assert.ok(s.half * 2 >= 7, `${s.id} too narrow`);
      else assert.ok(s.half * 2 >= 3, `${s.id} too narrow`);
    }
    for (const g of city.gates) assert.ok(L.streets.some(s => s.kind === 'main' && Math.hypot(s.pts[0].x - g.x, s.pts[0].z - g.z) < 0.01), `no main street from gate ${g.id}`);
  });
}

test('city layouts are deterministic', async () => {
  const fresh = await import('../src/world/city-layout.js?fresh=1');
  for (const city of CITIES) {
    const a = getCityLayout(city.key), b = fresh.getCityLayout(city.key);
    assert.notEqual(a, b);
    assert.equal(JSON.stringify(a.buildings), JSON.stringify(b.buildings));
    assert.equal(JSON.stringify(a.walk), JSON.stringify(b.walk));
    assert.equal(JSON.stringify(a.spots), JSON.stringify(b.spots));
    assert.equal(getCityLayout(city.key), a, 'layouts are cached');
  }
});

// ───────────────────────── points of interest ─────────────────────────

function blockedAt(structures, x, z, radius) {
  for (const s of structures) {
    if (s.r) {
      if (Math.hypot(x - s.x, z - s.z) < s.r + radius) return true;
    } else if (s.hw) {
      if (pointBoxDist({ x: s.x, z: s.z, w: s.hw * 2, d: s.hd * 2, rot: s.rot }, x, z) < radius) return true;
    }
  }
  return false;
}

/** Flood fill on a 0.5 m grid: can a 0.45 m wide walker get from `from` to within 1.6 m of `to`? */
function canWalk(layout, from, to) {
  const poi = layout.poi, cell = 0.5, reach = poi.r + 8;
  const n = Math.ceil(reach * 2 / cell);
  const idx = (x, z) => [Math.round((x - poi.x + reach) / cell), Math.round((z - poi.z + reach) / cell)];
  const seen = new Uint8Array(n * n + n + 1);
  const [sx, sz] = idx(from.x, from.z);
  const queue = [[sx, sz]];
  seen[sx * n + sz] = 1;
  while (queue.length) {
    const [cx, cz] = queue.pop();
    const wx = poi.x - reach + cx * cell, wz = poi.z - reach + cz * cell;
    if (Math.hypot(wx - to.x, wz - to.z) < 1.6) return true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const kx = cx + dx, kz = cz + dz;
      if (kx < 0 || kz < 0 || kx >= n || kz >= n || seen[kx * n + kz]) continue;
      seen[kx * n + kz] = 1;
      if (blockedAt(layout.structures, poi.x - reach + kx * cell, poi.z - reach + kz * cell, 0.45)) continue;
      queue.push([kx, kz]);
    }
  }
  return false;
}

for (const poi of POIS) {
  test(`poi ${poi.id}: layout`, () => {
    const L = getPoiLayout(poi.id);
    assert.equal(L.poi, poi);
    assert.ok(L.structures.length > 0);
    const within = (p, extra = 0) => Math.hypot(p.x - poi.x, p.z - poi.z) <= poi.r + extra;
    assert.ok(within(L.spots.entrance), 'entrance outside the pad');
    assert.ok(Array.isArray(L.spots.guards) && Array.isArray(L.spots.npcs) && Array.isArray(L.patrol));
    assert.ok(L.patrol.length >= 2);
    const spots = [...L.spots.guards, ...L.spots.npcs, ...L.patrol];
    if (L.spots.boss) spots.push(L.spots.boss);
    if (L.spots.chest) spots.push(L.spots.chest);
    if (L.spots.campfire) assert.ok(within(L.spots.campfire));
    for (const p of spots) {
      assert.ok(within(p), 'spot outside the pad radius');
      assert.ok(!blockedAt(L.structures.filter(s => s.kind !== 'campfire'), p.x, p.z, 0.3), `spot inside a structure at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    }
    for (const s of L.structures) assert.ok(within(s, 6), `${s.kind} far outside the pad`);
    if (poi.boss) assert.ok(L.spots.boss, 'boss spot missing');
    if (poi.chest) {
      assert.ok(L.spots.chest, 'chest spot missing');
      assert.ok(Number.isFinite(L.spots.chest.yaw));
      assert.ok(canWalk(L, L.spots.entrance, L.spots.chest), 'chest is not reachable from the entrance');
    }
    if (poi.faction === 'bandit' || poi.faction === 'beast') assert.ok(L.spots.guards.length >= 3, 'hostile POI needs spawn spots');
    if (poi.faction === 'friendly') assert.ok(L.spots.npcs.length >= 1, 'friendly POI needs NPC spots');
    for (const p of [...L.spots.guards, ...L.spots.npcs]) assert.ok(canWalk(L, L.spots.entrance, p), 'spawn spot is walled in');
    // nothing solid stands in a roadway
    for (const s of L.structures) {
      if (!s.r && !s.hw) continue;
      for (const road of ROADS) {
        for (const q of road.path.samples) {
          if (Math.abs(q.x - s.x) > 12 || Math.abs(q.z - s.z) > 12) continue;
          assert.ok(Math.hypot(q.x - s.x, q.z - s.z) > road.halfWidth + (s.r || Math.min(s.hw, s.hd)), `${s.kind} blocks ${road.key}`);
        }
      }
    }
  });
}

test('poi layouts are deterministic', async () => {
  const fresh = await import('../src/world/poi-layout.js?fresh=1');
  for (const poi of POIS) {
    const a = getPoiLayout(poi.id), b = fresh.getPoiLayout(poi.id);
    assert.equal(JSON.stringify(a.structures), JSON.stringify(b.structures));
    assert.equal(JSON.stringify(a.spots), JSON.stringify(b.spots));
  }
});
