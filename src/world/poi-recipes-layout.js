// Recipes of the points of interest: each places structures and spots through the builder `B` of poi-layout.js.
// Coordinates: f = metres from the centre towards the entrance, l = metres sideways, rot in degrees (0 = facing the
// entrance). Pure. The key is a POI id, or a POI type as the fallback.

const DEG = Math.PI / 180;
const ringPoint = (a, r) => [Math.cos(a * DEG) * r, Math.sin(a * DEG) * r];

// ───────────────────────── bandits ─────────────────────────

function banditCamp(B, o = {}) {
  const R = Math.round(B.r * 0.6);
  const tent = o.tent || 'bandit-tent';
  B.ring('palisade-section', R, 4.6, 26);
  B.add('banner', R + 0.6, 4.4, 0, { color: 'bandit' });
  B.add('banner', R + 0.6, -4.4, 0, { color: 'bandit' });
  B.add('barricade', R + 6, 8.5, 25);
  B.add('barricade', R + 6, -8.5, -25);
  B.add('watch-platform', R - 3.4, 7.4, 180);
  B.campfire(1.5, 0);
  const boss = !!B.poi.boss;
  for (const a of boss ? [62, 105, 255, 298] : [62, 105, 150, 210, 255, 298]) {
    const [f, l] = ringPoint(a, R * 0.62);
    B.add(tent, f, l, a + 180);
  }
  B.add('cage', -R * 0.32, R * 0.62, 20);
  B.add('cage', -R * 0.5, R * 0.45, -10);
  B.add('crates', 4, -R * 0.72, 40);
  B.add('barrels', R * 0.5, -R * 0.55, 0);
  B.add('weapon-rack', R * 0.45, R * 0.42, -60);
  B.add('torch-stand', R - 1.5, 3.4);
  B.add('torch-stand', R - 1.5, -3.4);
  if (boss) {
    B.add('boss-tent', -R + 5.8, 0, 0);
    B.add('throne', -R + 10.4, 0, 0);
    B.boss(-R + 12.4, 0);
    B.chest(-R + 10, 3.6, -30);
    B.add('banner', -R + 9.6, -3.6, 0, { color: 'bandit' });
  } else {
    B.chest(-R + 4.2, 0, 0);
    B.add('crates', -R + 3.6, 3.2, 30);
  }
  B.guard(R + 2.5, 2.6, 0);
  B.guard(R + 2.5, -2.6, 0);
  B.guard(4.5, 2.8, 200);
  B.guard(4.2, -3, 160);
  B.guard(-2, 5.5, 240);
  B.guard(-3, -6, 100);
  if (B.poi.level >= 8) B.guard(R * 0.5, -R * 0.3, 20);
  if (B.poi.level >= 10) B.guard(-R * 0.3, 0.5, 0);
  B.patrol([[R + 7, 0], [R - 4, 0], [3, 6.5], [-R * 0.45, 2], [3, -6.5], [R - 4, 0]]);
}

function fortRaven(B) {
  const H = 22;
  const side = (fixed, axis, rot) => {
    for (let k = -H + 2.3; k <= H - 2.2; k += 4.6) {
      if (axis === 'front' && Math.abs(k) < 6.5) continue;
      if (axis === 'front' || axis === 'back') B.add('palisade-section', fixed, k, rot);
      else B.add('palisade-section', k, fixed, rot);
    }
  };
  side(H, 'front', 0);
  side(-H, 'back', 180);
  side(H, 'left', 90);
  side(-H, 'right', -90);
  for (const sf of [-1, 1]) {
    for (const sl of [-1, 1]) B.add('fort-tower', sf * H, sl * H, 0);
  }
  B.add('fort-tower', H, 6.6, 0, { gate: 1 });
  B.add('fort-tower', H, -6.6, 0, { gate: -1 });
  B.add('fort-gate', H, 0, 0);
  B.add('banner', H + 3.2, 9.6, 0, { color: 'bandit' });
  B.add('banner', H + 3.2, -9.6, 0, { color: 'bandit' });
  B.add('barricade', H + 9, 10, 20);
  B.add('barricade', H + 9, -10, -20);
  B.add('log-hall', -H + 7.5, 0, 0);
  B.add('throne', -H + 13.2, 0, 0);
  B.boss(-H + 15.2, 0);
  B.chest(-H + 13.2, 4.6, -20);
  B.add('log-hut', -3, H - 5.5, -90);
  B.add('log-hut', 7, H - 5.5, -90);
  B.add('log-hut', -3, -H + 5.5, 90);
  B.add('watch-platform', H - 4.5, -H + 4.5, 135);
  B.add('cage', 14, H - 4.2, 0);
  B.add('cage', 17.5, H - 4.2, 10);
  B.campfire(4, 0);
  B.add('weapon-rack', 7.5, -H + 4, 90);
  B.add('target-dummy', 12, -H + 5, 90);
  B.add('target-dummy', 15, -H + 5, 90);
  B.add('anvil', 2.5, -H + 9, 0);
  B.add('crates', -H + 4, H - 4, 30);
  B.add('barrels', -H + 4, -H + 4, 0);
  B.add('torch-stand', H - 2, 4.6);
  B.add('torch-stand', H - 2, -4.6);
  B.add('torch-stand', -H + 13, -4.5);
  for (const [f, l, a] of [[H + 3, 3, 0], [H + 3, -3, 0], [H - 5, 2, 180], [8, 4, 200], [7, -4, 160], [-H + 15, 6, 0], [-H + 15, -6, 0], [-2, H - 10, 270], [-2, -H + 10, 90], [13, -H + 8, 270]]) B.guard(f, l, a);
  B.patrol([[H + 8, 0], [H - 5, 0], [6, 9], [-8, 8], [-8, -8], [6, -9], [H - 5, 0]]);
}

// ───────────────────────── ruins ─────────────────────────

/** Broken rectangular walls centred on (cf, cl): random heights, gaps, a doorway in the front wall. */
function wallRect(B, cf, cl, w, d, o = {}) {
  const piece = 3.4, rng = B.rng;
  const run = (len, place) => {
    const n = Math.round(len / piece);
    for (let i = 0; i < n; i++) {
      const k = -len / 2 + (i + 0.5) * len / n;
      const p = place(k);
      if (p.door && Math.abs(k) < 2) continue;
      if (rng() < (o.missing ?? 0.18) && !p.keep) continue;
      B.add('ruin-wall', p.f, p.l, p.rot, { hw: len / n / 2 + 0.05, h: (o.h || 3.4) * (0.45 + rng() * 0.75) });
    }
  };
  run(d, k => ({ f: cf + w / 2, l: cl + k, rot: 0, door: true }));
  run(d, k => ({ f: cf - w / 2, l: cl + k, rot: 180, keep: Math.abs(k) > d * 0.25 }));
  run(w, k => ({ f: cf + k, l: cl + d / 2, rot: 90 }));
  run(w, k => ({ f: cf + k, l: cl - d / 2, rot: -90 }));
}

function scatter(B, kind, count, rMin, rMax, o = {}) {
  for (let i = 0; i < count; i++) {
    const a = B.rng() * 360, d = rMin + B.rng() * (rMax - rMin);
    const [f, l] = ringPoint(a, d);
    if (Math.abs(l) < 3.2 && f > 0) continue;
    B.add(kind, f, l, B.rng() * 360, o);
  }
}

const RUINS = {
  'ruin-watchtower'(B) {
    // a round tower broken open towards the entrance
    const heights = [0, 6.5, 9, 10.5, 8, 4.2, 2.4, 0];
    for (let i = 1; i < 7; i++) {
      const a = i * 45, [f, l] = ringPoint(a, 4.9);
      B.add('ruin-wall', f - 2, l, a, { hw: 2.05, hd: 0.7, h: heights[i], round: true });
    }
    B.chest(-3.2, 0.4, 0);
    wallRect(B, -2, 0, 22, 26, { missing: 0.62, h: 2.2 });
    scatter(B, 'rubble', 7, 7, 15);
    B.add('dead-tree', 6, -9.5);
    B.add('column', 9.5, 6, 0, { h: 2.6 });
    B.guard(8, 3, 0);
    B.guard(-9, -8, 90);
    B.guard(2, 10, 200);
  },
  'ruin-outpost'(B) {
    wallRect(B, -1, 0, 18, 14, { h: 4.2 });
    for (const [f, l, a] of [[-10, 7, 0], [-10, 4.6, 90], [-7.6, 7, 180]]) B.add('ruin-wall', f, l, a, { hw: 1.4, hd: 0.7, h: 7.5 });
    B.add('ruin-wall', -1, 2.5, 90, { hw: 3, h: 2.8 });
    B.add('column', 5, 4, 0, { h: 3.6 });
    B.add('column', 5, -4, 0, { h: 1.6 });
    B.chest(-7.6, -4.4, 40);
    scatter(B, 'rubble', 8, 10, 19);
    B.add('dead-tree', 11, 12);
    for (const [f, l] of [[4, 0], [-4, 5], [-5, -3], [12, -6], [-13, 0]]) B.guard(f, l, 0);
  },
  'ruin-manor'(B) {
    wallRect(B, 0, -3, 12, 12, { h: 4.6, missing: 0.22 });
    wallRect(B, -2, 9, 8, 8, { h: 3.2, missing: 0.3 });
    B.add('column', -5, -8, 0, { h: 7.5, r: 0.7 });
    B.add('ruin-wall', 0, -3, 90, { hw: 2.4, h: 2.2 });
    B.chest(-4, -4.6, 30);
    scatter(B, 'rubble', 9, 9, 20);
    B.add('dead-tree', 10, -12);
    B.add('dead-tree', -12, 13);
    B.add('boat', 13, 9, 70);
    for (const [f, l] of [[3, -3], [-3, -1], [9, 4], [-10, -10], [-2, 9]]) B.guard(f, l, 0);
  },
  'ruin-bridgefort'(B) {
    wallRect(B, -1, 0, 15, 15, { h: 4.4, missing: 0.1 });
    for (const sl of [-1, 1]) B.add('ruin-wall', 6.5, sl * 7.5, 0, { hw: 1.5, hd: 1.5, h: 6.8 });
    B.add('bandit-tent', -3.5, 4.2, -110);
    B.add('bandit-tent', -3.5, -4.2, 110);
    B.campfire(1.5, 0);
    B.chest(-6.2, 0, 0);
    B.add('barricade', 11.5, 5.5, 20);
    B.add('banner', 7.6, 3, 0, { color: 'bandit' });
    scatter(B, 'rubble', 5, 11, 17);
    for (const [f, l] of [[9, 2.2], [9, -2.2], [3, 2.5], [2.5, -2.8], [-4, 0]]) B.guard(f, l, 0);
  },
};

// ───────────────────────── mines ─────────────────────────

function mine(B, o = {}) {
  const mr = B.r * 0.32, mf = -B.r * 0.47 - 2;
  B.add('rock-mound', mf, 0, 0, { r: mr });
  const af = mf + mr - 0.4;
  B.add('adit', af, 0, 0, { abandoned: !!o.abandoned });
  B.add('rails', af + 5.5, 0, 0, { len: 10 });
  B.add('spoil-heap', 4, 10.5);
  B.add('spoil-heap', -2, -12);
  B.add('rock', mf + 2, mr + 2.5, 0, { r: 1.6 });
  B.add('rock', mf - 1, -mr - 2, 0, { r: 1.3 });
  if (o.abandoned) {
    B.add('wagon-wreck', af + 9, 4.4, 60);
    B.add('ore-cart', af + 9.5, 0.2, 8, { tipped: true });
    B.add('dead-tree', 8, -9);
    scatter(B, 'rubble', 5, 8, 16);
    B.chest(af + 1.8, -3.4, 30);
    for (const [f, l] of [[af + 4, 2], [af + 9, -4], [6, 6], [10, -3]]) B.guard(f, l, 0);
  } else {
    B.add('ore-cart', af + 2, 0, 0);
    B.add('ore-cart', af + 9.5, 5.6, 35);
    B.add('lantern-post', af + 1.2, 3.3);
    B.add('lantern-post', af + 1.2, -3.3);
    B.add('log-hut', 6, 13.5, -90);
    B.add('log-hut', 15, 13.5, -90);
    B.add('crates', 8, -9.5, 20);
    B.add('workbench', 2, -8, 0);
    B.add('ore-pile', 13, -9, 0, { r: 1.5 });
    B.campfire(12, 7);
    B.npc('miner', af + 3, 2.6, 250);
    B.npc('miner', 4, -6.5, 180);
    B.npc('merchant', 9.5, -7, 20);
    B.npc('guard', 17, 4.5, 0);
  }
  B.patrol([[af + 5, 3], [10, 6], [14, -4], [af + 6, -4]]);
}

function cobaltCut(B) {
  B.add('rock-mound', -9, 0, 0, { r: 8.5, cobalt: true });
  for (const [f, l, s] of [[1, 6.5, 1.8], [2.5, -6, 1.5], [-3, 11.5, 1.3], [-4, -11, 1.6], [8, 10, 1.1]]) B.add('crystal-rock', f, l, B.rng() * 360, { r: s });
  B.add('scaffold', -0.2, 0.5, 0);
  B.add('scaffold', -5, -8.8, 60);
  B.add('wagon-wreck', 9, -5, 40);
  B.add('spoil-heap', 12, 7);
  B.chest(1.2, -3.2, 20);
  for (const [f, l] of [[5, 2], [6, -8], [-2, 14], [12, 0], [3, 10]]) B.guard(f, l, 0);
}

// ───────────────────────── friendly camps, farms, village, outposts ─────────────────────────

const CAMPS = {
  sawmill(B) {
    B.add('saw-shed', 2, 11, -90);
    B.add('log-stack', 11, 9.5, 0);
    B.add('log-stack', 12, 14, 8);
    B.add('log-stack', -7, 12, 90);
    B.add('plank-stack', 3, 17.5, 0);
    B.add('plank-stack', -1.5, 17.5, 5);
    B.add('log-hut', 4, -11, 90);
    B.add('log-hut', -6.5, -11, 90);
    B.add('woodpile', 10, -8, 30);
    B.add('cart', 11, -13, 60);
    B.add('workbench', -2, -6.8, 90);
    B.campfire(-10, -2);
    B.add('lantern-post', 6, 5.2);
    B.npc('citizen', 2.5, 7.2, 270);
    B.npc('citizen', 9.5, 7, 60);
    B.npc('merchant', 3.5, -7.2, 90);
  },
  'hunter-lodge'(B) {
    B.add('log-hut', -7, 0, 0, { hw: 4, hd: 3 });
    B.add('tanning-rack', -2, 7.5, -30);
    B.add('tanning-rack', 1.5, 9, -20);
    B.add('woodpile', -8, -6, 0);
    B.add('target-dummy', 6, -9, 150);
    B.add('table', -1, -6, 0);
    B.add('hide-shelter', 3, -12, 60);
    B.campfire(2.5, 0.5);
    B.add('weapon-rack', -3.2, 3.8, 0);
    B.npc('hunter', -2.4, -1.5, 0);
    B.npc('hunter', 1, 7, 150);
    B.npc('merchant', -0.5, -4.2, 30);
  },
  'charcoal-camp'(B) {
    B.add('kiln', -6, 5, 0, { lit: true });
    B.add('kiln', -8, -4, 0, { lit: true });
    B.add('kiln', 1, 10, 0);
    B.add('woodpile', 0, -9, 20);
    B.add('woodpile', 2.5, -10.5, 80);
    B.add('log-stack', -13, 6, 60);
    B.add('tent', 7, -8, 140);
    B.add('tent', 10, 5.5, 220);
    B.add('sack', 4, 5, 0);
    B.add('sack', 5, 6.2, 40);
    B.add('cart', 11, -2, 80);
    B.campfire(5.5, -1);
    B.npc('citizen', -3.5, 3, 300);
    B.npc('citizen', 1.5, -6.5, 180);
    B.npc('merchant', 6.5, 2.5, 60);
  },
  mill(B) {
    // two tracks meet here (one along +f, one leaving towards -l): everything stands on the +l side
    B.add('windmill', -9, 11, -60);
    B.add('farmhouse', 9, 13, -90);
    B.add('field', -13, 23, 0, { w: 13, d: 8, crop: 'wheat' });
    B.add('field', 6, 24.5, 0, { w: 12, d: 7, crop: 'rye' });
    B.add('field', -18, -9, 0, { w: 9, d: 9, crop: 'wheat' });
    B.add('haystack', -1.5, 12.5);
    B.add('cart', 2.5, 7.4, 100);
    B.add('sack', -3.6, 6.8, 0);
    B.add('sack', -2.4, 7.6, 50);
    B.add('well', 17, 7);
    B.add('scarecrow', -13, 23, 20);
    B.add('fence-run', 15.5, 20, 90, { hw: 4 });
    B.npc('farmer', -5.4, 8, 200);
    B.npc('farmer', 8.5, 8.6, 270);
    B.npc('merchant', 1, 5.8, 0);
  },
  'far-farm'(B) {
    B.add('farmhouse', -4, -12, 90);
    B.add('barn', -8, 12, -90);
    B.add('field', 10, 16, 0, { w: 14, d: 10, crop: 'wheat' });
    B.add('field', 11, -17, 0, { w: 13, d: 9, crop: 'flax' });
    B.add('field', -20, -1, 0, { w: 9, d: 13, crop: 'rye' });
    B.add('pen', 5, 9.5, 0);
    B.add('haystack', -14, 5.5);
    B.add('haystack', -16.5, 8);
    B.add('well', 5, -8);
    B.add('scarecrow', 10, 16, 200);
    B.add('cart', -1, 7.5, 30);
    B.add('fence-run', 18, 9, 90, { hw: 5 });
    B.add('fence-run', 18.5, -10, 90, { hw: 5 });
    B.add('woodpile', -10.5, -8, 0);
    B.npc('farmer', -3.5, -7.6, 90);
    B.npc('farmer', 4, 6, 200);
    B.npc('farmer', -7, 7.4, 270);
    B.npc('merchant', 1.5, -6, 20);
  },
  apiary(B) {
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 4; i++) B.add('beehive', -3 - row * 3.4, -7.5 + i * 2.6 + row * 1.2, 180 + B.rng() * 30);
    }
    B.add('log-hut', -2, 9, -90, { hw: 3, hd: 2.4 });
    B.add('field', 7, -8, 0, { w: 8, d: 7, crop: 'flowers' });
    B.add('fence-run', -11, 0, 0, { hw: 9 });
    B.add('table', 3.5, 6, 90);
    B.add('barrel', 1.4, 5);
    B.add('lantern-post', 5.5, 3.6);
    B.npc('farmer', -1, -4, 180);
    B.npc('merchant', 3, 4.4, 20);
  },
  village(B) {
    for (const [f, l, a] of [[8, 13, -80], [-3, 14.5, -95], [-14, 12, -110], [9, -13, 85], [-2, -15, 95], [-13, -12, 110]]) B.add('fish-hut', f, l, a);
    for (const [f, l, a] of [[2, 8, 0], [-6, 8.5, 10], [-8, -8.5, 0], [3, -8, -8]]) B.add('drying-rack', f, l, a);
    // boats and nets lie on the side of the village that slopes down to the water
    const [wf, wl] = B.low;
    const shore = (k, side) => [wf * B.r * k - wl * side, wl * B.r * k + wf * side];
    const yawOut = Math.atan2(wl, wf) / DEG;
    B.add('fishing-net', ...shore(0.5, 5), yawOut + 90);
    B.add('fishing-net', ...shore(0.52, -5), yawOut + 80);
    B.add('boat', ...shore(0.7, 6), yawOut + 15);
    B.add('boat', ...shore(0.74, 0), yawOut - 10);
    B.add('boat', ...shore(0.68, -7), yawOut + 30);
    B.add('well', -9, 0.5);
    B.campfire(-3.5, 5);
    B.add('barrels', 12, 7, 0);
    B.add('crates', 13, -7.5, 20);
    B.add('lantern-post', 16, 4.6);
    B.add('table', 4, -5.2, 0);
    B.npc('fisher', -4.5, 6.5, 190);
    B.npc('fisher', -14, 2, 260);
    B.npc('fisher', 1.5, -6, 20);
    B.npc('fisher', wf * B.r * 0.6 - wl * 3, wl * B.r * 0.6 + wf * 3, yawOut);
    B.npc('merchant', 10.5, 5.5, 200);
  },
  outpost(B) {
    const base = Math.min(B.roadF - 7.8, 8);
    B.add('barrier', base + 0.6, 4.5, 90);
    B.add('guard-tower', base - 3, -6, 0);
    B.add('log-hut', base - 8.5, 4.5, 0, { hw: 3.2, hd: 2.5 });
    B.add('tent', base - 6, -12.5, 30);
    B.add('weapon-rack', base - 4, 8.6, 0);
    B.add('hitching-post', base - 1.5, 10.5, 0);
    B.add('banner', base, -1.6, 0, { color: 'guard' });
    B.add('crates', base - 11, -3, 40);
    B.add('lantern-post', base + 0.4, 1.4);
    B.campfire(base - 4.5, 0.2);
    B.npc('guard', base + 1.2, 3, 0);
    B.npc('guard', base + 1.2, -3.4, 0);
    B.npc('guard', base - 3.4, 2.4, 200);
  },
};

// ───────────────────────── lairs ─────────────────────────

function lair(B, o = {}) {
  const rock = o.rock || 'rock';
  B.add('rock-den', -B.r * 0.42, 0, 0, { variant: o.variant });
  const df = -B.r * 0.42 + 4.6;
  for (let i = 0; i < 6; i++) {
    const a = 60 + i * 48, d = B.r * (0.5 + B.rng() * 0.22);
    const [f, l] = ringPoint(a, d);
    B.add(rock, f, l, B.rng() * 360, { r: 0.9 + B.rng() * 0.9 });
  }
  for (const [f, l] of [[df + 2, 2.2], [df + 5, -3.5], [4, 6], [8, -2.5]]) B.add('bones', f, l, B.rng() * 360);
  if (o.trees) {
    for (const [f, l] of o.trees) B.add(o.tree || 'dead-tree', f, l, B.rng() * 360);
  }
  if (o.extra) o.extra(B, df);
  B.chest(df + 0.6, -4.6, 35);
  B.guard(df + 3, 0, 0);
  B.guard(df + 6.5, 4.5, 0);
  B.guard(df + 6.5, -5, 0);
  B.guard(8, 2, 0);
  if (B.poi.level >= 12) B.guard(3, -8, 0);
  B.patrol([[df + 4, 0], [9, 7], [13, 0], [9, -7]]);
}

const LAIRS = {
  'lair-wolf': B => lair(B, { trees: [[5, 11], [-3, -12]] }),
  'lair-bear': B => lair(B, { variant: 'cave', trees: [[7, -10]], extra: (b, df) => { b.add('log-stack', df + 3, 6.5, 30, { rotten: true }); } }),
  'lair-stoneback': B => lair(B, { variant: 'spires', extra: (b) => { b.add('rock', 3, 13, 0, { r: 2.2 }); b.add('rock', 4, -13, 0, { r: 1.9 }); } }),
  'lair-spider': B => lair(B, {
    variant: 'webbed', tree: 'web-tree', trees: [[4, 9], [9, 5], [6, -9], [-2, -12], [12, -5], [-4, 12]],
    extra: (b, df) => { for (const [f, l] of [[df + 2, 4], [df + 3.4, 5.2], [df + 1.5, -2.2], [5, -4]]) b.add('egg-sac', f, l, 0); },
  }),
  'lair-marsh': B => lair(B, { variant: 'mud', trees: [[6, 9], [10, -6], [-6, -11]], extra: (b) => { b.add('boat', 7, 3.5, 70, { sunk: true }); b.add('reeds', 3, -8); b.add('reeds', 11, 6); b.add('reeds', -2, 10); } }),
  'lair-frost': B => lair(B, { variant: 'ice', rock: 'ice-rock' }),
};

// ───────────────────────── landmarks ─────────────────────────

const LANDMARKS = {
  'lm-patriarch'(B) {
    B.add('giant-oak', -2, 0, 0);
    for (let i = 0; i < 7; i++) {
      const [f, l] = ringPoint(40 + i * 47, 10 + B.rng() * 7);
      B.add(i % 2 ? 'rock' : 'mushrooms', f, l, B.rng() * 360, i % 2 ? { r: 0.8 } : {});
    }
    B.add('flat-stone', 6.5, -4, 20);
    B.chest(2.2, 2.8, 40);
    B.guard(8, 2, 0);
    B.guard(-8, -7, 0);
  },
  'lm-lighthouse'(B) {
    B.add('lighthouse', -3, 0, 0);
    B.add('log-hut', 5, 7, -90, { hw: 3, hd: 2.4 });
    B.add('woodpile', 8.5, 3, 0);
    B.add('crates', 4, -6.5, 30);
    B.add('lantern-post', 9.5, -2.5);
    B.add('boat', -3, -9, 60);
    B.npc('citizen', 3.4, -2.6, 20);
  },
  'lm-stones'(B) {
    for (let i = 0; i < 9; i++) {
      const [f, l] = ringPoint(20 + i * 40, 9.5);
      if (i === 0) continue;
      B.add('standing-stone', f, l, 20 + i * 40, { h: 2.6 + B.rng() * 1.8, fallen: i === 4 });
    }
    B.add('flat-stone', 0, 0, 15);
    B.chest(-2.6, 1.2, 20);
    B.add('standing-stone', 15, -6, 70, { h: 2 });
    B.guard(5, 3, 0);
    B.guard(-4, -5, 0);
  },
  'lm-eaglerock'(B) {
    B.add('rock-spire', -3, 0, 0);
    for (const [f, l, s] of [[4, 6, 1.6], [3, -7, 1.3], [-8, 8, 2.0], [9, -1.5, 0.9]]) B.add('rock', f, l, B.rng() * 360, { r: s });
    B.add('bones', 5, 1.5);
    B.add('bones', 7, -4, 80);
    B.guard(8, 3, 0);
  },
};

function ruinFallback(B) {
  wallRect(B, 0, 0, 14, 12, { h: 4 });
  B.chest(-4, 0, 0);
  B.guard(4, 2, 0);
  B.guard(-3, -3, 0);
}

export const POI_RECIPES = {
  banditcamp: B => banditCamp(B),
  'camp-deserters': B => banditCamp(B, { tent: 'tent' }),
  'fort-raven': fortRaven,
  ruin: ruinFallback,
  ...RUINS,
  mine: B => mine(B),
  'mine-old': B => mine(B, { abandoned: true }),
  'mine-cobalt': cobaltCut,
  camp: CAMPS['hunter-lodge'],
  farm: CAMPS.apiary,
  village: CAMPS.village,
  outpost: CAMPS.outpost,
  sawmill: CAMPS.sawmill,
  'hunter-lodge': CAMPS['hunter-lodge'],
  'charcoal-camp': CAMPS['charcoal-camp'],
  mill: CAMPS.mill,
  'far-farm': CAMPS['far-farm'],
  apiary: CAMPS.apiary,
  'fisher-village': CAMPS.village,
  lair: B => lair(B),
  ...LAIRS,
  landmark: LANDMARKS['lm-stones'],
  ...LANDMARKS,
};
