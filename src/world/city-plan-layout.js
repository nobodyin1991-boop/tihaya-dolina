// Hand-authored town plans (streets, yards, where the important buildings want to stand) for the three cities.
// Pure data + small helpers; coordinates are LOCAL to the city centre (x east, z south). city-layout.js turns
// a plan into concrete buildings, walls, spots and a walk graph.
import { LEGS } from '../data/world-map.js';
import { DEG, polar } from './geom-layout.js';

/** Arc polyline around the origin. az in degrees; `radius` may be a function of azimuth (radians). */
function arc(radius, az0, az1, stepDeg = 8) {
  const pts = [];
  const n = Math.max(1, Math.round(Math.abs(az1 - az0) / stepDeg));
  for (let i = 0; i <= n; i++) {
    const az = az0 + (az1 - az0) * i / n;
    const r = typeof radius === 'function' ? radius(az * DEG) : radius;
    pts.push(polar(az, r));
  }
  return pts;
}

function nearestGate(gates, point) {
  let best = gates[0], bd = Infinity;
  for (const g of gates) {
    const d = Math.hypot(g.x - point[0], g.z - point[1]);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

/** Point in a gate's frame: `depth` metres inside the gate, `lat` metres to the gate's right-hand side (seen from outside). */
function inGate(gate, depth, lat) {
  return [gate.x - gate.nx * depth + gate.nz * lat, gate.z - gate.nz * depth - gate.nx * lat];
}

/** Caravan yard beside the outgoing gate: an open court, the stable on its far side, the quartermaster's office behind. */
function caravanYard(gate, side) {
  const centre = inGate(gate, 27, 15 * side);
  const lat = [gate.nz * side, -gate.nx * side];          // from the street towards the yard
  const stableAt = [centre[0] + lat[0] * 17.2, centre[1] + lat[1] * 17.2];
  const officeAt = [centre[0] - gate.nx * 15.2, centre[1] - gate.nz * 15.2];
  return {
    centre,
    yaw: Math.atan2(gate.nx, gate.nz),
    zone: { x: centre[0], z: centre[1], r: 10 },
    stable: { at: stableAt, rot: Math.atan2(-lat[0], -lat[1]) },
    office: { at: officeAt, rot: Math.atan2(gate.nx, gate.nz) },
  };
}

const HOUSE = { type: 'house' };
const special = (type, role, w, d, floors, extra = {}) => ({ type, role, w, d, floors, ...extra });

/** Buildings every city has; `t` holds the target points ("near") chosen by the concrete plan. */
function commonSpecials(t, yard) {
  return [
    special('stable', 'stablemaster', 12, 6, 1, { canopy: 3.6, at: yard.stable.at, rot: yard.stable.rot }),
    special('warehouse', 'quartermaster', 9.5, 7, 1, { at: yard.office.at, rot: yard.office.rot, variant: 'office' }),
    special('townhall', 'elder', t.hallSize[0], t.hallSize[1], 3, { near: t.townhall, streets: ['sq'] }),
    special('tavern', 'innkeeper', 13, 8.5, 2, { canopy: 4.6, near: t.tavern, face: 0 }),
    special('barracks', 'captain', 15, 8, 2, { near: t.barracks }),
    special('shop', 'weaponsmith', 8, 6.5, 2, { canopy: 2.6, near: t.weaponsmith }),
    special('shop', 'armorer', 8, 6.5, 2, { canopy: 2.6, near: t.armorer }),
    special('shop', 'grocer', 8, 6.5, 2, { canopy: 2.6, near: t.grocer }),
    special(t.traderType || 'shop', 'trader', t.traderSize?.[0] || 9, t.traderSize?.[1] || 7, t.traderFloors || 2, { canopy: 3, near: t.trader }),
    special('warehouse', 'banker', 11, 8.5, 2, { near: t.banker, variant: 'vault' }),
    special('smithy', 'smith', 9, 6, 1, { canopy: 4, near: t.smith }),
    special('workshop', 'carpenter', 8.5, 6, 1, { canopy: 3.6, near: t.carpenter }),
    special('workshop', 'leatherworker', 8, 6, 1, { canopy: 3.4, near: t.leatherworker }),
    special('workshop', 'tailor', 8, 6, 2, { canopy: 3.2, near: t.tailor }),
    special('workshop', 'mason', 8.5, 6, 1, { canopy: 3.6, near: t.mason }),
    special('workshop', 'apothecary', 7.5, 6, 2, { canopy: 3.2, near: t.apothecary }),
    special('workshop', 'farmer', 8.5, 6, 1, { canopy: 3.4, near: t.farmer }),
  ];
}

function stallRing(square, count, radius, az0) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const az = az0 + i * 360 / count;
    const p = polar(az, radius);
    out.push(special('shop-stall', null, 3.4, 2.2, 1, { at: [square.x + p[0], square.z + p[1]], rot: (az + 180) * DEG }));
  }
  return out;
}

// ───────────────────────── Тихая долина — round timber village ─────────────────────────

function planValley(c) {
  const { gates, gateOut, gateIn } = c;
  const square = { x: -5, z: 6, r: 19 };
  const north = gates.find(g => g.id === 'north');
  const sq = (az, r) => { const p = polar(az, r); return [square.x + p[0], square.z + p[1]]; };
  const streets = gates.map(g => {
    const bend = [g.x - g.nx * 47, g.z - g.nz * 47];
    const dx = bend[0] - square.x, dz = bend[1] - square.z, len = Math.hypot(dx, dz);
    const end = [square.x + dx / len * (square.r - 3), square.z + dz / len * (square.r - 3)];
    return { id: 'main-' + g.id, kind: 'main', half: 4, pts: [[g.x, g.z], bend, end], gate: g.id };
  });
  streets.push({ id: 'sq', kind: 'square', half: 2, pts: arc(square.r - 2, 0, 360, 10).map(p => [p[0] + square.x, p[1] + square.z]), sides: [-1], closed: true });
  const ringR = a => 58 + 4 * Math.sin(2 * a + 0.7);
  streets.push({ id: 'ring', kind: 'lane', half: 2.6, pts: arc(ringR, 0, 360, 7.5), closed: true });
  for (const az of [38, 128, 232, 318]) streets.push({ id: 'lane-' + az, kind: 'lane', half: 2, pts: [polar(az, ringR(az * DEG)), polar(az + 4, 90)] });
  const yard = caravanYard(gateOut, 1);
  const t = {
    hallSize: [14, 10],
    townhall: sq(135, 27), tavern: sq(205, 27), banker: sq(250, 27),
    weaponsmith: sq(305, 26), armorer: sq(335, 26), grocer: sq(25, 26), trader: sq(65, 26),
    barracks: inGate(north, 27, 13),
    smith: polar(292, 64), carpenter: polar(315, 66), mason: polar(338, 66),
    leatherworker: polar(292, 48), tailor: polar(22, 64), apothecary: polar(48, 66), farmer: polar(200, 66),
  };
  const specials = commonSpecials(t, yard);
  specials.push(
    special('granary', null, 7.5, 7.5, 2, { near: polar(222, 66) }),
    special('barn', null, 11, 8, 1, { near: polar(170, 84), streets: ['lane-128', 'ring', 'main-north'] }),
    special('barn', null, 10, 7.5, 1, { near: polar(244, 84) }),
    special('mill', null, 8, 8, 2, { near: polar(150, 64) }),
    ...stallRing(square, 4, 11.5, 62),
  );
  return {
    square, streets, yard, specials,
    wall: { style: 'timber', arcs: [[0, 360]], segLen: 11, towerEvery: 0, inset: 5.5, thickness: 0.9 },
    arrive: inGate(gateIn, 21, -10),
    training: inGate(north, 26, -15),
    houses: { w: [6.5, 10], d: [6, 8], floors: [1, 2, 2], target: 68, gap: [0.8, 3.2] },
    features: [
      { kind: 'well', at: sq(250, 9), r: 1.25 },
      { kind: 'linden', at: sq(80, 9.5), r: 0.9 },
    ],
    filler: ['plot', 'plot', 'pen', 'tree', 'tree', 'hay', 'orchard', 'plot'],
  };
}

// ───────────────────────── Каменный Брод — walled mining town on a grid ─────────────────────────

function planFord(c) {
  const { gates, gateOut, gateIn } = c;
  const square = { x: 0, z: 0, r: 18 };
  const north = gates.find(g => g.id === 'north');
  const streets = gates.map(g => ({ id: 'main-' + g.id, kind: 'main', half: 4.2, pts: [[g.x, g.z], [g.nx * (square.r - 3), g.nz * (square.r - 3)]], gate: g.id }));
  streets.push({ id: 'main-east', kind: 'main', half: 4, pts: [[square.r - 3, 0], [70, 0]] });
  streets.push({ id: 'sq', kind: 'square', half: 2, pts: arc(square.r - 2, 0, 360, 10), sides: [-1], closed: true });
  streets.push({ id: 'lane-n', kind: 'lane', half: 2.4, pts: [[-78, -44], [-44, -44], [0, -44], [44, -44], [78, -44]] });
  streets.push({ id: 'lane-s', kind: 'lane', half: 2.4, pts: [[-78, 44], [-44, 44], [0, 44], [44, 44], [78, 44]] });
  streets.push({ id: 'lane-w', kind: 'lane', half: 2.4, pts: [[-44, -78], [-44, -44], [-44, 0], [-44, 44], [-44, 78]] });
  streets.push({ id: 'lane-e', kind: 'lane', half: 2.4, pts: [[44, -78], [44, -44], [44, 0], [44, 44], [44, 78]] });
  const yard = caravanYard(gateOut, 1);
  const t = {
    hallSize: [15, 12],
    townhall: polar(135, 27), tavern: polar(225, 27), banker: polar(45, 27),
    weaponsmith: polar(300, 27), armorer: polar(330, 27), grocer: [-30, 8], trader: [-34, -8],
    barracks: inGate(north, 28, 13),
    smith: [36, -36], carpenter: [20, -52], mason: [52, -22], leatherworker: [52, -62],
    tailor: [-36, 26], apothecary: [-36, -26], farmer: [-52, 58],
  };
  const specials = commonSpecials(t, yard);
  specials.unshift(special('foundry', null, 17, 12, 2, { at: [84, 4], rot: -90 * DEG }));
  specials.push(
    special('warehouse', null, 12, 8, 1, { near: [76, -28], variant: 'ore' }),
    special('warehouse', null, 11, 8, 2, { near: [62, 30], variant: 'ore' }),
    ...stallRing(square, 3, 11.5, 20),
  );
  return {
    square, streets, yard, specials,
    wall: { style: 'stone', arcs: [[0, 360]], segLen: 30, towerEvery: 1, inset: 7.5, thickness: 2.4 },
    arrive: inGate(gateIn, 21, -10),
    training: inGate(north, 27, -15),
    houses: { w: [7, 11], d: [7, 9.5], floors: [2, 2, 3], target: 70, gap: [0.3, 1.6] },
    zones: [{ x: 70, z: 0, r: 8 }],
    features: [
      { kind: 'well', at: polar(110, 9.5), r: 1.25 },
      { kind: 'statue', at: polar(290, 9.5), r: 1.3 },
      { kind: 'crane', at: [70, -9], r: 1.2, rot: 20 * DEG },
      { kind: 'ore-cart', at: [66, 6], r: 1.1, rot: 80 * DEG },
      { kind: 'ore-cart', at: [74, 7.5], r: 1.1, rot: 100 * DEG },
    ],
    filler: ['ore-pile', 'stone-stack', 'crates', 'tree', 'plot', 'woodpile'],
  };
}

// ───────────────────────── Янтарная Гавань — sea-side trading port ─────────────────────────

function planHarbor(c) {
  const { R, gates, gateOut, gateIn } = c;
  const square = { x: 0, z: -6, r: 21 };
  const north = gates.find(g => g.id === 'north');
  const quayR = R - 9;
  const toSquare = g => {
    const dx = square.x - g.x, dz = square.z - g.z, len = Math.hypot(dx, dz);
    const k = (len - square.r + 3) / len;
    return [g.x + dx * k, g.z + dz * k];
  };
  const streets = gates.map(g => ({ id: 'main-' + g.id, kind: 'main', half: 4.2, pts: [[g.x, g.z], toSquare(g)], gate: g.id }));
  streets.push({ id: 'main-sea', kind: 'main', half: 4, pts: [[square.x + 6, square.z + square.r - 3.6], polar(16, 62), polar(18, quayR - 7)] });
  streets.push({ id: 'sq', kind: 'square', half: 2, pts: arc(square.r - 2, 0, 360, 10).map(p => [p[0] + square.x, p[1] + square.z]), sides: [-1], closed: true });
  streets.push({ id: 'quay', kind: 'quay', half: 7, pts: arc(quayR, -46, 86, 6), sides: [1] });
  streets.push({ id: 'ring', kind: 'lane', half: 2.6, pts: arc(66, 62, 332, 7.5) });
  streets.push({ id: 'lane-e', kind: 'lane', half: 2.4, pts: [polar(62, 66), polar(62, quayR - 7)] });
  streets.push({ id: 'lane-sw', kind: 'lane', half: 2.4, pts: [polar(332, 66), polar(332, quayR - 7)] });
  streets.push({ id: 'lane-nw', kind: 'lane', half: 2.2, pts: [polar(225, 68), polar(228, 100)] });
  streets.push({ id: 'lane-ne', kind: 'lane', half: 2.2, pts: [polar(132, 68), polar(135, 102)] });
  const yard = caravanYard(gateOut, 1);
  const sq = (az, r) => { const p = polar(az, r); return [square.x + p[0], square.z + p[1]]; };
  const t = {
    hallSize: [15, 11],
    townhall: sq(135, 30), tavern: sq(215, 30), banker: sq(245, 30),
    weaponsmith: sq(292, 29), armorer: sq(318, 29), grocer: sq(60, 29),
    trader: sq(28, 31), traderType: 'guildhall', traderSize: [16, 11], traderFloors: 3,
    barracks: inGate(north, 28, 13),
    smith: polar(100, 74), carpenter: polar(80, 74), mason: polar(118, 74),
    leatherworker: polar(292, 74), tailor: polar(40, 52), apothecary: polar(352, 54), farmer: polar(205, 74),
  };
  const specials = commonSpecials(t, yard);
  for (const az of [-30, -8, 36, 56, 76]) {
    specials.push(special('warehouse', null, 13, 9, 2, { near: polar(az, quayR - 13), streets: ['quay'], variant: 'quay' }));
  }
  specials.push(...stallRing(square, 6, 12.5, 30));
  const features = [
    { kind: 'fountain', at: [square.x, square.z + 0.01], r: 2.3 },
    { kind: 'crane', at: polar(-18, R - 0.5), r: 1.2, rot: -18 * DEG },
    { kind: 'crane', at: polar(46, R - 0.5), r: 1.2, rot: 46 * DEG },
  ];
  return {
    square, streets, yard, specials, features,
    squareHub: [square.x + 8, square.z + 2],
    wall: { style: 'harbor', arcs: [[86, 314]], segLen: 26, towerEvery: 1, inset: 7, thickness: 2 },
    quay: { az0: -46, az1: 86, r: R + 2.5, piers: [-28, 4, 30, 62] },
    arrive: inGate(gateIn, 21, -10),
    training: inGate(north, 27, -15),
    houses: { w: [8, 13], d: [8, 10.5], floors: [2, 2, 3], target: 70, gap: [0.3, 2.2] },
    filler: ['crates', 'palm', 'palm', 'tree', 'barrels', 'plot', 'orchard', 'palm'],
  };
}

const PLANS = { timber: planValley, stone: planFord, harbor: planHarbor };

/** Build the plan of a city (local coordinates). */
export function makeCityPlan(city) {
  const gates = city.gates.map(g => {
    const x = g.x - city.x, z = g.z - city.z;
    const len = Math.hypot(x, z);
    return { id: g.id, x, z, nx: x / len, nz: z / len, yaw: Math.atan2(x, z) };
  });
  const outLeg = LEGS.find(l => l.from === city.id);
  const inLeg = LEGS.find(l => l.to === city.id);
  const first = outLeg.path[0], last = inLeg.path[inLeg.path.length - 1];
  const gateOut = nearestGate(gates, [first[0] - city.x, first[1] - city.z]);
  const gateIn = nearestGate(gates, [last[0] - city.x, last[1] - city.z]);
  const plan = PLANS[city.style]({ city, R: city.radius, gates, gateOut, gateIn });
  return { R: city.radius, gates, gateOut, gateIn, zones: [], features: [], ...plan, houseProto: HOUSE };
}
