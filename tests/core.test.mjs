import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/world/terrain.js';
import { CITIES, POIS } from '../src/data/world-map.js';
import { createColliders } from '../src/world/collision.js';
import { createState, hydrateState } from '../src/sim/state.js';
import '../src/sim/player.js';
import { addItem, removeItem, countItem, freeSlots, BASE_SLOTS } from '../src/sim/inventory.js';

test('cities sit on flat ground and legs connect them', () => {
  for (const c of CITIES) assert.ok(Math.abs(T.heightAt(c.x + 20, c.z - 30) - c.y) < 0.01);
  for (let leg = 0; leg < 3; leg++) {
    const L = T.legLength(leg);
    assert.ok(L > 1200);
    for (let s = 0; s <= L; s += 10) {
      const p = T.legPoint(leg, s);
      assert.ok(Math.abs(T.walkHeightAt(p.x, p.z) - p.y) < 0.6, `leg ${leg} s=${s} surface mismatch`);
    }
  }
});
test('no POI is under water', () => {
  for (const p of POIS) assert.equal(T.waterDepthAt(p.x, p.z), 0, p.id);
});
test('colliders push out', () => {
  const c = createColliders();
  c.addBox(0, 0, 2, 1, 0.3);
  c.addCircle(10, 0, 1);
  assert.ok(c.blocked(0, 0)); assert.ok(!c.blocked(5, 5));
  const r = c.resolve(10.2, 0, 0.5); assert.ok(Math.hypot(r.x - 10, r.z) >= 1.49);
});
test('state + inventory roundtrip', () => {
  const s = createState({ name: 'Тест', classId: 'archer' });
  assert.equal(addItem(s, 'wood', 150), 150);
  assert.equal(freeSlots(s), BASE_SLOTS - 2);
  assert.ok(removeItem(s, 'wood', 60)); assert.equal(countItem(s, 'wood'), 90);
  const copy = hydrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(copy.player.name, 'Тест');
});
