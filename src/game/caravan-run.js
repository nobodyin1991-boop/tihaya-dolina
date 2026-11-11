// The caravan in the 3D world: the wagon, its guards, ambush spawns and road obstacles.
// All rules live in sim/caravan.js; this module executes its directives and reports back what happened.
import { emit, on } from '../core/events.js';
import { caravanTick, caravanReport, caravanPosition, caravanResume, pendingToll, payToll, repairWagon, wagonMaxHp, currentLeg, scoutedEvents } from '../sim/caravan.js';
import { LEGS, CITIES } from '../data/world-map.js';
import { legPoint, legLength, walkHeightAt, waterDepthAt } from '../world/terrain.js';
import { getCityLayout } from '../world/city-layout.js';
import { createWagon } from '../entities/wagon.js';
import { createProp } from '../world/props.js';
import { hasItems } from '../sim/inventory.js';
import { itemName } from '../data/items.js';
import { isNight, isRaining } from '../sim/time.js';
import { newUnitId } from './units.js';

const OBSTACLE_PROPS = { 'fallen-tree': 'fallen-tree', rockslide: 'rockslide', mud: 'mud-patch', 'broken-bridge': 'broken-bridge-planks', barricade: 'barricade' };
const STATUS_TEXT = { moving: 'В пути', waiting: 'Ждёт вас', combat: 'Засада!', obstacle: 'Путь перекрыт', parked: 'На погрузке' };

export function createCaravanRun(g) {
  let state = null;
  let wagon = null, wagonKey = '';            // model + what it was built from
  let unit = null;                            // combat unit, only during a run
  let collider = 0, colliderX = 0, colliderZ = 0;
  const pos = { x: 0, y: 0, z: 0, yaw: 0, valid: false };
  let speedNow = 0;
  const obstacles = [];                       // [{kind:'obstacle', eventId, x, z, prop, directive}]
  const liveEvents = new Map();               // eventId -> {spawned:boolean, toll}
  let status = 'parked';
  let lagToastT = 0;

  function attach(s) {
    state = s;
    caravanResume(state);
  }

  // ───────────── wagon model ─────────────

  function ensureWagon() {
    const w = state.caravan.wagon;
    const key = w.tier + ':' + Object.keys(w.upgrades || {}).sort().join(',');
    if (wagon && key === wagonKey) return;
    dropWagon();
    wagon = createWagon({ tier: w.tier, upgrades: { sides: !!w.upgrades?.sides, lanterns: !!w.upgrades?.lanterns, cover: !!w.upgrades?.cover } });
    wagonKey = key;
    g.scene.add(wagon.group);
  }
  function dropWagon() {
    if (!wagon) return;
    g.scene.remove(wagon.group);
    wagon.dispose();
    wagon = null;
    if (collider) { g.colliders.remove(collider); collider = 0; }
  }

  function targetPosition() {
    const p = caravanPosition(state);
    if (!p) return null;
    if (p.parked) {
      const leg = currentLeg(state);
      const yard = getCityLayout(CITIES[LEGS[leg].from].key).spots.caravanYard;
      if (yard) return { x: yard.x, z: yard.z, y: walkHeightAt(yard.x, yard.z), yaw: yard.yaw || 0, parked: true };
    }
    return p;
  }

  // ───────────── directives ─────────────

  function spawnSpot(directive, side, index, total) {
    const run = state.caravan.run;
    const road = legPoint(run.leg, run.s);
    const far = directive.forewarned ? 34 : 22;
    const along = { front: 1, rear: -1 }[side] || 0;
    const across = { left: 1, right: -1 }[side] || 0;
    const fx = Math.sin(road.yaw), fz = Math.cos(road.yaw);   // road forward
    const rx = fz, rz = -fx;                                   // road left
    for (let attempt = 0; attempt < 8; attempt++) {
      const spread = (index - (total - 1) / 2) * 2.6 + (Math.random() - 0.5) * 2;
      const dist = far + attempt * 3 + Math.random() * 5;
      let x, z;
      if (along) { x = road.x + fx * along * dist + rx * spread; z = road.z + fz * along * dist + rz * spread; }
      else { x = road.x + rx * across * dist + fx * spread; z = road.z + rz * across * dist + fz * spread; }
      if (waterDepthAt(x, z) < 0.4 && !g.colliders.blocked(x, z, 0.6)) return { x, z };
    }
    return { x: road.x + rx * 14, z: road.z + rz * 14 };
  }

  function handleSpawn(d) {
    const ev = liveEvents.get(d.eventId) || { spawned: true, toll: null };
    ev.spawned = true;
    ev.toll = d.toll || null;
    liveEvents.set(d.eventId, ev);
    for (const group of d.groups) {
      for (let i = 0; i < group.count; i++) {
        const spot = spawnSpot(d, group.side, i, group.count);
        const mob = g.mobs.spawn(group.creatureId, group.level, spot.x, spot.z, {
          scripted: true, role: group.role, eventId: d.eventId, packKey: 'ev:' + d.eventId,
          passive: !!d.toll, focusWagon: group.role === 'attacker' && i % 3 === 2,
        });
        if (mob) mob.home = { x: spot.x, z: spot.z };
      }
    }
    if (d.toll) {
      emit('toast', { text: d.toll.text || `Дорогу перекрыли. Требуют ${d.toll.coins} монет.`, kind: 'warn' });
    } else {
      g.audio.play('horn', { volume: 0.8 });
      emit('caravan:ambush', { title: d.title, wave: d.wave, boss: !!d.boss });
      emit('zone:entered', { title: d.wave ? 'Новая волна' : 'Засада', sub: d.title, kind: 'danger' });
    }
  }

  function handleObstacle(d) {
    const run = state.caravan.run;
    const ahead = legPoint(run.leg, Math.min(legLength(run.leg), d.s + (d.kind === 'wheel-break' ? 0 : 8)));
    const ob = { kind: 'obstacle', eventId: d.eventId, directive: d, x: ahead.x, z: ahead.z, y: ahead.y, prop: null, collider: 0 };
    const propKind = OBSTACLE_PROPS[d.kind];
    if (propKind) {
      ob.prop = createProp(propKind);
      ob.prop.position.set(ahead.x, walkHeightAt(ahead.x, ahead.z), ahead.z);
      ob.prop.rotation.y = ahead.yaw + Math.PI / 2;
      g.scene.add(ob.prop);
    } else { ob.x = pos.x; ob.z = pos.z; }
    obstacles.push(ob);
    emit('toast', { text: d.text || 'Путь перекрыт', kind: 'warn' });
    emit('zone:entered', { title: 'Путь перекрыт', sub: d.text || '', kind: 'danger' });
  }

  function removeObstacle(ob) {
    if (ob.prop) {
      g.scene.remove(ob.prop);
      ob.prop.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    const i = obstacles.indexOf(ob);
    if (i >= 0) obstacles.splice(i, 1);
  }

  function endRun() {
    g.mobs.removeWhere(m => m.eventId || m.guardId);
    for (const ob of [...obstacles]) removeObstacle(ob);
    liveEvents.clear();
    unit = null;
    status = 'parked';
  }

  function handle(d) {
    switch (d.type) {
      case 'spawn': handleSpawn(d); break;
      case 'obstacle': handleObstacle(d); break;
      case 'stand-down':
        for (const m of g.mobs.list) if (m.eventId === d.eventId && m.alive) { m.passive = false; m.leaving = true; m.fleeT = 9; m.target = null; }
        liveEvents.delete(d.eventId);
        break;
      case 'banter': g.bark({ id: 'driver', name: 'Возница', x: pos.x, y: pos.y, z: pos.z, height: 3 }, d.text); break;
      case 'arrived':
        g.audio.play('quest-done');
        endRun();
        emit('ui:open', { screen: 'caravan-result', params: { kind: 'arrived', result: d.result } });
        g.save();
        break;
      case 'failed':
        endRun();
        emit('ui:open', { screen: 'caravan-result', params: { kind: 'failed', reason: d.reason, result: d.result } });
        g.save();
        break;
    }
  }

  // ───────────── run bookkeeping ─────────────

  function startUnit() {
    unit = {
      id: newUnitId(), kind: 'wagon', team: 'player', name: 'Караванная телега', level: g.hero.level,
      x: pos.x, y: pos.y, z: pos.z, yaw: pos.yaw, radius: 2.3, height: 2.8,
      hp: state.caravan.wagon.hp, maxHp: wagonMaxHp(state), alive: true, statuses: [], stunImmune: 0,
    };
    // hired guards walk with the wagon
    state.caravan.guards.forEach((guard, i) => {
      if (!guard.alive) return;
      const a = i * 1.6;
      const mob = g.mobs.spawn('merc', Math.max(1, guard.level || g.hero.level), pos.x + Math.cos(a) * 4, pos.z + Math.sin(a) * 4, { team: 'player', anchor: unit, name: guard.name, guardId: guard.id });
      if (mob) mob.scripted = true;
    });
  }

  function checkEvents() {
    for (const [eventId, ev] of liveEvents) {
      if (!ev.spawned) continue;
      const alive = g.mobs.aliveCount(m => m.eventId === eventId && !m.leaving);
      if (alive === 0) {
        liveEvents.delete(eventId);
        caravanReport(state, { type: 'event-cleared', eventId });
        g.audio.play('quest-start', { volume: 0.6 });
      }
    }
  }

  function update(dt) {
    if (!state) return;
    const run = state.caravan.run;
    const target = targetPosition();
    if (!target) { dropWagon(); pos.valid = false; return; }

    // only keep the model when the hero is reasonably close
    const farAway = Math.hypot(target.x - g.hero.x, target.z - g.hero.z) > 420;
    if (farAway && !run) { dropWagon(); pos.valid = false; }
    else {
      ensureWagon();
      if (!pos.valid) { pos.x = target.x; pos.y = target.y; pos.z = target.z; pos.yaw = target.yaw; pos.valid = true; }
      const before = pos.x + pos.z;
      const k = 1 - Math.exp(-dt * 6);
      pos.x += (target.x - pos.x) * k; pos.z += (target.z - pos.z) * k; pos.y += (target.y - pos.y) * k;
      let dy = (target.yaw - pos.yaw) % (Math.PI * 2);
      if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2;
      pos.yaw += dy * Math.min(1, dt * 3);
      speedNow = Math.abs(pos.x + pos.z - before) / Math.max(dt, 1e-4) > 0.3 ? 4 : 0;
      wagon.group.position.set(pos.x, pos.y, pos.z);
      wagon.group.rotation.y = pos.yaw;
      const maxHp = wagonMaxHp(state);
      wagon.update(dt, { speed: speedNow, damage: 1 - state.caravan.wagon.hp / maxHp, cargo: run ? run.cargoLeft / Math.max(1, run.cargoTotal) : 0.6, night: g.sky.night > 0.5 });
      if (!collider || Math.hypot(pos.x - colliderX, pos.z - colliderZ) > 0.6) {
        if (collider) g.colliders.remove(collider);
        collider = g.colliders.addCircle(pos.x, pos.z, 2.0, { top: pos.y + 2.4, tag: 'wagon' });
        colliderX = pos.x; colliderZ = pos.z;
      }
    }

    if (run && !unit) startUnit();
    if (unit) {
      unit.x = pos.x; unit.y = pos.y; unit.z = pos.z; unit.yaw = pos.yaw;
      unit.hp = state.caravan.wagon.hp; unit.maxHp = wagonMaxHp(state);
      unit.alive = !!state.caravan.run && unit.hp > 0;
    }

    const enemiesAlive = run ? g.mobs.aliveCount(m => m.team === 'hostile' && m.eventId && !m.passive && !m.leaving) : 0;
    const directives = caravanTick(state, dt, { playerX: g.hero.x, playerZ: g.hero.z, enemiesAlive, night: isNight(state), raining: isRaining(state) });
    for (const d of directives) handle(d);
    if (!state.caravan.run) { if (unit) endRun(); return; }

    checkEvents();
    const dist = Math.hypot(pos.x - g.hero.x, pos.z - g.hero.z);
    status = enemiesAlive > 0 ? 'combat' : obstacles.length ? 'obstacle' : state.caravan.run.active ? 'waiting' : dist > 30 ? 'waiting' : 'moving';
    lagToastT -= dt;
  }

  // ───────────── hooks used by other modules ─────────────

  function damageWagon(amount, source) {
    if (!state.caravan.run) return 0;
    const dealt = Math.max(1, Math.round(amount * 0.6));
    caravanReport(state, { type: 'wagon-damage', amount: dealt });
    g.fx.sparks({ x: pos.x, y: pos.y + 1.4, z: pos.z });
    g.audio.play('wagon-hit', { x: pos.x, z: pos.z });
    return dealt;
  }

  function interact(c, startChannel) {
    if (c.kind === 'obstacle') {
      const d = c.directive;
      const hasNeeds = !d.needs || hasItems(state, d.needs);
      const seconds = hasNeeds ? d.workSeconds : d.slowSeconds;
      startChannel(d.needs && hasNeeds ? 'Чиним и расчищаем' : 'Расчищаем путь', seconds, () => {
        caravanReport(state, { type: 'obstacle-cleared', usedItems: !!d.needs && hasNeeds });
        removeObstacle(c);
        g.audio.play('craft');
        emit('toast', { text: 'Путь свободен', kind: 'good' });
      }, 'gather');
      return;
    }
    // the wagon itself
    const toll = state.caravan.run ? pendingToll(state) : null;
    if (toll) {
      const res = payToll(state);
      if (!res.ok) emit('toast', { text: res.reason, kind: 'warn' });
      return;
    }
    if (state.caravan.run && state.caravan.wagon.hp < wagonMaxHp(state) && g.mobs.aliveCount(m => m.team === 'hostile' && m.eventId) === 0) {
      startChannel('Ремонт телеги', 4, () => {
        const res = repairWagon(state);
        emit('toast', { text: res.ok ? 'Телега подлатана' : res.reason, kind: res.ok ? 'good' : 'warn' });
        if (res.ok) g.audio.play('craft');
      }, 'gather');
      return;
    }
    emit('ui:open', { screen: 'caravan', params: {} });
  }

  function interactable() {
    if (!pos.valid || !wagon) return null;
    const run = state.caravan.run;
    const toll = run ? pendingToll(state) : null;
    let promptText = run ? 'Караван' : 'Караван: погрузка и сборы', promptSub = '';
    if (toll) { promptText = `Заплатить пошлину: ${toll.coins} монет`; promptSub = 'или выхватить оружие'; }
    else if (run && state.caravan.wagon.hp < wagonMaxHp(state)) { promptText = 'Починить телегу'; promptSub = `Нужен: ${itemName('wagonKit')}`; }
    return { kind: 'wagon', x: pos.x, z: pos.z, promptText, promptSub };
  }

  on('caravan:launched', () => { emit('zone:entered', { title: 'Караван вышел', sub: 'Держитесь рядом с телегой', kind: 'caravan' }); g.audio.play('horn'); });

  return {
    attach, update, interact, interactable,
    active: () => !!state?.caravan.run,
    wagonUnit: () => (unit && unit.alive ? unit : null),
    damageWagon,
    cargoLeft: () => state?.caravan.run?.cargoLeft || 0,
    /** A looter finished grabbing: he now carries one unit (lost only if he escapes). */
    stealCargo(mob) { emit('toast', { text: `${mob.name} тащит груз! Не дайте уйти`, kind: 'warn' }); return 1; },
    cargoEscaped(mob) { if (state.caravan.run) caravanReport(state, { type: 'cargo-stolen', count: mob.carrying || 1 }); },
    guardDown(mob) { if (state.caravan.run) caravanReport(state, { type: 'guard-down', guardId: mob.guardId }); },
    obstacles: () => obstacles.map(ob => {
      const d = ob.directive;
      ob.promptText = d.text || 'Расчистить путь';
      ob.promptSub = d.needs ? `Нужно: ${Object.entries(d.needs).map(([id, n]) => `${itemName(id)} ×${n}`).join(', ')} (иначе дольше)` : '';
      return ob;
    }),
    position: () => (pos.valid ? pos : null),
    hud() {
      const run = state?.caravan.run;
      if (!run) return null;
      const leg = LEGS[run.leg];
      return {
        legName: leg.name, progress: run.s / run.length, hp: state.caravan.wagon.hp, maxHp: wagonMaxHp(state),
        status, statusText: STATUS_TEXT[status], cargoLeft: run.cargoLeft, cargoTotal: run.cargoTotal,
        guards: g.mobs.list.filter(m => m.guardId).map(m => ({ name: m.name, hp: m.hp, maxHp: m.maxHp, alive: m.alive })),
        distance: Math.hypot(pos.x - g.hero.x, pos.z - g.hero.z),
      };
    },
    pushLabels(push) {
      if (!pos.valid || !wagon) return;
      const d = Math.hypot(pos.x - g.hero.x, pos.z - g.hero.z);
      if (d > 40) return;
      const run = state.caravan.run;
      push('wagon', pos.x, pos.y + 3.3, pos.z, 'Караван', run ? STATUS_TEXT[status] : 'на погрузке', 'wagon', run ? state.caravan.wagon.hp / wagonMaxHp(state) : null, false, 0, d, false);
      for (const ob of obstacles) push('ob' + ob.eventId, ob.x, ob.y + 2, ob.z, 'Препятствие', '', 'obstacle', null, false, 0, Math.hypot(ob.x - g.hero.x, ob.z - g.hero.z), false);
    },
    pushMarkers(out) {
      if (pos.valid) out.push({ id: 'caravan', kind: 'caravan', x: pos.x, z: pos.z, label: 'Караван', discovered: true });
      for (const ev of scoutedEvents(state)) if (ev.x !== undefined && !ev.done) out.push({ id: 'ambush:' + ev.id, kind: ev.kind === 'obstacle' ? 'obstacle' : 'ambush', x: ev.x, z: ev.z, label: ev.title, discovered: true });
    },
  };
}
