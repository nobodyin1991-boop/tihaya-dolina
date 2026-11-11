// The player's hero at runtime: body movement, stats, taking damage, death and respawn, mount, companion, quick items.
// Attacks and abilities are in hero-combat.js.
import { emit, on } from '../core/events.js';
import { derivedStats } from '../sim/stats.js';
import { damageToPlayer, killReward } from '../sim/combat.js';
import { rollLoot } from '../sim/loot.js';
import { skinCorpse } from '../sim/gathering.js';
import { useItem as simUseItem, cooldownLeft, COOLDOWNS } from '../sim/consumables.js';
import { grantXp } from '../sim/player.js';
import { countItem } from '../sim/inventory.js';
import { item, ITEMS } from '../data/items.js';
import { CITIES } from '../data/world-map.js';
import { isDiscovered } from '../sim/worldstate.js';
import { getCityLayout } from '../world/city-layout.js';
import { cityAt, walkHeightAt, isSafeZone } from '../world/terrain.js';
import { createHero, } from '../entities/hero-models.js';
import { createHorse } from '../entities/creature-models.js';
import { createCompanion } from '../entities/companion.js';
import { createHeroBody, stepHero, findFreeSpot } from './hero-motion.js';
import { newUnitId, addStatus, tickStatuses, isControlled, isRooted, speedMult, takenMult, clearNegativeStatuses } from './units.js';
import { createHeroCombat } from './hero-combat.js';

const RESPAWN_SECONDS = 6;

export function createHeroController(g) {
  let state = null;
  let body = null;
  let actor = null, actorKey = '';
  let horse = null;
  let companion = null;           // {actor, x, z, y, yaw, shootT}
  let statsCache = null, statsT = 0;
  let combatT = 0, lastHitT = -99, respawnT = 0, stepAcc = 0, regenDelay = 0;
  const sideUnits = [];

  const hero = {
    id: newUnitId(), kind: 'hero', team: 'player', name: 'Герой', level: 1,
    x: 0, y: 0, z: 0, yaw: 0, radius: 0.42, height: 1.8,
    hp: 1, maxHp: 1, stamina: 100, maxStamina: 100, alive: true, mounted: false,
    statuses: [], stunImmune: 0, shield: 0, target: null, body: null,
  };

  const combat = createHeroCombat(g, hero, {
    stats: () => stats(),
    actor: () => actor,
    body: () => body,
    enterCombat: () => { combatT = 7; },
    dismount: () => setMounted(false),
  });

  // ───────────── setup ─────────────

  function attach(s) {
    state = s;
    const p = s.player;
    p.quick ??= [null, null, null, null];
    body = createHeroBody(p.x, p.z, p.yaw || 0);
    hero.body = body;
    hero.name = p.name;
    hero.statuses.length = 0;
    hero.alive = true;
    hero.target = null;
    g.hero = hero;
    statsCache = null;
    const st = stats();
    hero.hp = p.hp == null ? st.maxHp : Math.min(st.maxHp, Math.max(1, p.hp));
    body.stamina = st.maxStamina;
    rebuildActor();
    combat.attach(s);
    syncUnit();
  }

  /** After the surroundings are built: make sure we are not standing inside something. */
  function settle() {
    const spot = findFreeSpot(body.x, body.z, g.colliders);
    body.x = spot.x; body.z = spot.z; body.y = walkHeightAt(spot.x, spot.z);
    syncUnit();
  }

  function writeBack() {
    if (!state || !body) return;
    const p = state.player;
    p.x = body.x; p.z = body.z; p.yaw = body.yaw;
    p.hp = hero.alive ? Math.round(hero.hp) : null;
  }

  function gearLook() {
    const eq = state.inv.equip;
    const weapon = eq.weapon ? item(eq.weapon) : null;
    const armor = eq.armor ? item(eq.armor) : null;
    return { weaponKind: weapon?.weaponKind, tier: Math.max(weapon?.tier || 1, armor?.tier || 1), weight: armor?.weight || 'light' };
  }

  function rebuildActor() {
    const look = gearLook();
    const key = state.player.classId + JSON.stringify(look);
    if (actor && key === actorKey) return;
    if (actor) { g.scene.remove(actor.group); actor.dispose(); }
    actor = createHero(state.player.classId, { gear: look });
    actorKey = key;
    hero.height = actor.height || 1.8;
    g.scene.add(actor.group);
    if (state.player.classId === 'engineer' && !companion) {
      companion = { actor: createCompanion(), x: body.x - 1.5, z: body.z - 1.5, y: body.y, yaw: 0, shootT: 2, speedNow: 0 };
      g.scene.add(companion.actor.group);
    }
  }

  on('equip:changed', () => { if (state) { rebuildActor(); statsCache = null; } });
  on('player:levelup', () => { statsCache = null; if (state) { const st = stats(); hero.hp = st.maxHp; g.fx.aura(actor.group, { color: 0xecd08c, duration: 1.6 }); g.audio.play('levelup'); } });
  on('inv:changed', () => { statsCache = null; });

  // ───────────── stats ─────────────

  function stats() {
    if (!statsCache) {
      const wagon = g.caravanRun?.position?.();
      const nearWagon = !!wagon && g.caravanRun.active() && Math.hypot(wagon.x - hero.x, wagon.z - hero.z) < 25;
      statsCache = derivedStats(state, { buffs: hero.statuses, nearWagon, mounted: hero.mounted, now: state.world.clock });
      hero.maxHp = statsCache.maxHp;
      hero.maxStamina = statsCache.maxStamina || 100;
      hero.level = state.player.level;
      statsT = 0.5;
    }
    return statsCache;
  }

  // ───────────── damage ─────────────

  /** Central damage entry point for every unit kind. Returns true if the hit landed. */
  function damageUnit(target, amount, source, opts = {}) {
    if (!target || !target.alive) return false;
    if (target.kind === 'mob') {
      const dealt = g.mobs.damage(target, amount, source, opts);
      if (dealt && target.distHero < 40) g.fx.floatText({ x: target.x, y: target.y + target.height + 0.2, z: target.z }, String(dealt), { color: '#e8dfc8', size: 0.8 });
      return dealt > 0;
    }
    if (target.kind === 'wagon') { g.caravanRun.damageWagon(amount, source); return true; }
    // hero
    if (body.invulnerable > 0) {
      g.fx.floatText({ x: hero.x, y: hero.y + 2.1, z: hero.z }, 'Уклонение', { color: '#8fd08a', size: 0.8 });
      return false;
    }
    const st = stats();
    let dmg = source?.stats ? damageToPlayer(source.stats, source.level, st, hero.level, {}) * (opts.mult || 1) * (source.elite ? 1.25 : 1) : amount;
    dmg = Math.max(1, Math.round(dmg * takenMult(hero) * (0.9 + Math.random() * 0.2)));
    if (hero.shield > 0) { const absorbed = Math.min(hero.shield, dmg); hero.shield -= absorbed; dmg -= absorbed; }
    if (dmg <= 0) { g.fx.floatText({ x: hero.x, y: hero.y + 2.1, z: hero.z }, 'Поглощено', { color: '#9ec8e0', size: 0.8 }); return true; }
    hero.hp -= dmg;
    lastHitT = g.time; combatT = 7; regenDelay = 6;
    emit('hero:damaged', { amount: dmg, crit: (opts.mult || 1) > 1.5 });
    g.fx.floatText({ x: hero.x, y: hero.y + 2.1, z: hero.z }, '-' + dmg, { color: '#d2543f', size: 0.9 });
    g.audio.play('hit-flesh', { volume: 0.7 });
    g.cameraRig.addShake(Math.min(0.35, dmg / st.maxHp * 2));
    if (actor && !combat.busy()) actor.play('hit', 0.3);
    if (hero.mounted && dmg > st.maxHp * 0.08) setMounted(false);
    if (hero.hp <= 0) die(source);
    return true;
  }

  function knockback(unit, from, speed) {
    if (unit.kind === 'mob') { g.mobs.knock(unit, from.x, from.z, speed); return; }
    if (unit.kind !== 'hero' || body.invulnerable > 0) return;
    const d = Math.hypot(hero.x - from.x, hero.z - from.z) || 1;
    body.vx = (hero.x - from.x) / d * speed; body.vz = (hero.z - from.z) / d * speed;
    body.rootT = Math.max(body.rootT, 0.25);
  }

  function die(source) {
    hero.alive = false; hero.hp = 0;
    hero.statuses.length = 0; hero.target = null; hero.shield = 0;
    setMounted(false);
    state.player.deaths += 1;
    respawnT = RESPAWN_SECONDS;
    g.phase = 'dead';
    if (actor) actor.setStance('dead');
    g.audio.play('death');
    emit('hero:died', { reason: source?.name ? `Вас одолел: ${source.name}` : 'Вы пали', seconds: RESPAWN_SECONDS });
  }

  function respawn() {
    const st = stats();
    let spot;
    const wagon = g.caravanRun.active() ? g.caravanRun.position() : null;
    if (wagon) {
      // dragged back to the wagon; the raiders had time to do damage
      spot = { x: wagon.x - Math.sin(wagon.yaw) * 5, z: wagon.z - Math.cos(wagon.yaw) * 5, yaw: wagon.yaw };
      g.caravanRun.damageWagon(st.maxHp * 0.6);
      emit('toast', { text: 'Вас оттащили к телеге. Пока вы лежали, каравану досталось.', kind: 'bad' });
    } else {
      let best = CITIES[0], bd = Infinity;
      for (const c of CITIES) {
        if (!isDiscovered(state, c.key)) continue;
        const d = Math.hypot(c.x - body.x, c.z - body.z);
        if (d < bd) { bd = d; best = c; }
      }
      const r = getCityLayout(best.key).spots.respawn || { x: best.x, z: best.z, yaw: 0 };
      spot = r;
      emit('toast', { text: `Вас подобрали и довезли до города: ${best.name}`, kind: 'info' });
    }
    body.x = spot.x; body.z = spot.z; body.yaw = spot.yaw || 0;
    body.vx = body.vz = body.vy = 0; body.grounded = true;
    body.y = walkHeightAt(body.x, body.z);
    hero.alive = true;
    hero.hp = Math.round(st.maxHp * 0.6);
    body.stamina = st.maxStamina;
    body.invulnerable = 3;
    g.phase = 'playing';
    if (actor) actor.setStance('idle');
    g.mobs.list.forEach(m => { if (m.target === hero && !m.scripted) { m.target = null; m.provoked = false; m.state = 'return'; } });
    syncUnit();
    emit('hero:respawned', {});
  }

  // ───────────── kills & loot ─────────────

  function onMobKilled(mob, killer) {
    if (hero.target === mob) hero.target = null;
    if (mob.guardId) { g.caravanRun.guardDown(mob); return; }
    if (mob.team !== 'hostile') return;
    if (mob.carrying) emit('toast', { text: 'Груз отбит у мародёра', kind: 'good' });
    g.population.notePackDeath(mob);
    const near = Math.hypot(mob.x - hero.x, mob.z - hero.z) < 45;
    if (!near) return;
    const reward = killReward(mob.creatureId, mob.level, hero.level);
    const xp = Math.round((reward.xp || 0) * (mob.elite ? 1.6 : 1));
    if (xp > 0 && hero.alive) grantXp(state, xp);
    mob.loot = rollLoot(mob.creatureId, mob.level, Math.random, { classId: state.player.classId, elite: mob.elite || !!mob.def.elite, coinMult: stats().banditCoinMult || 1 });
    const skin = skinCorpse(state, mob.creatureId, mob.level, Math.random);
    if (skin?.ok && skin.itemId) mob.loot.items[skin.itemId] = (mob.loot.items[skin.itemId] || 0) + (skin.count || 1);
    if (mob.elite && mob.loot.coins) mob.loot.coins = Math.round(mob.loot.coins * 1.5);
    state.player.kills += 1;
    combatT = Math.max(combatT, 3);
    g.worldEvent('world:kill', { creatureId: mob.creatureId, family: mob.def.family, level: mob.level, x: mob.x, z: mob.z, poiId: mob.poiId, boss: !!mob.boss, eventId: mob.eventId });
  }

  // ───────────── items ─────────────

  function applyItemEffects(effects) {
    const st = stats();
    for (const e of effects || []) {
      const v = e.amount ?? e.value ?? 0;
      switch (e.type) {
        case 'heal': {
          const amount = Math.round(v <= 1 ? st.maxHp * v : v);
          hero.hp = Math.min(st.maxHp, hero.hp + amount);
          g.fx.heal({ x: hero.x, y: hero.y + 1, z: hero.z });
          g.fx.floatText({ x: hero.x, y: hero.y + 2.1, z: hero.z }, '+' + amount, { color: '#8fd08a', size: 0.9 });
          break;
        }
        case 'healOverTime': case 'hot': case 'regen':
          addStatus(hero, 'regen', e.duration || 10, (v <= 1 ? st.maxHp * v : v) / (e.duration || 10));
          break;
        case 'cure': clearNegativeStatuses(hero, e.statuses || ['poison', 'bleed', 'burn']); break;
        case 'stamina': body.stamina = Math.min(st.maxStamina, body.stamina + (v <= 1 ? st.maxStamina * v : v)); break;
        case 'timed-buff': case 'buff': {
          statsCache = null;
          break;
        }
      }
    }
  }

  function useItem(itemId) {
    if (!hero.alive || isControlled(hero)) return false;
    const def = item(itemId);
    const res = simUseItem(state, itemId, state.world.clock, { hp: hero.hp });
    if (!res.ok) { emit('toast', { text: res.reason, kind: 'warn' }); g.audio.play('error', { throttleMs: 400 }); return false; }
    applyItemEffects(res.effects);
    if (actor) actor.play('use', 0.8);
    g.audio.play(def.cooldownGroup === 'food' ? 'eat' : def.icon === 'potion' ? 'drink' : 'bandage');
    return true;
  }

  function quickHeal() {
    const meds = Object.keys(state.inv.items).map(id => ITEMS[id]).filter(d => d && d.type === 'consumable' && (d.use?.heal || d.use?.healOverTime));
    meds.sort((a, b) => (a.cooldownGroup === 'medicine' ? 0 : 1) - (b.cooldownGroup === 'medicine' ? 0 : 1) || (a.use.heal || 0) - (b.use.heal || 0));
    const ready = meds.filter(d => cooldownLeft(state, d.cooldownGroup, state.world.clock) <= 0);
    if (ready.length) meds.splice(0, meds.length, ...ready);
    const missing = hero.maxHp - hero.hp;
    const pick = meds.find(d => (d.use.heal || 0) >= missing * 0.6) || meds[meds.length - 1];
    if (pick) useItem(pick.id); else emit('toast', { text: 'Нет лечебных припасов', kind: 'warn' });
  }

  // ───────────── mount & companion ─────────────

  function setMounted(on) {
    if (on === hero.mounted) return;
    if (on) {
      if (!state.world.horse) { emit('toast', { text: 'У вас нет лошади. Спросите у конюха.', kind: 'info' }); return; }
      if (combatT > 0) { emit('toast', { text: 'Не в бою', kind: 'warn' }); return; }
      horse = createHorse({ seed: 7 });
      g.scene.add(horse.group);
    } else if (horse) {
      g.scene.remove(horse.group); horse.dispose(); horse = null;
    }
    hero.mounted = body.mounted = on;
    if (actor) actor.setStance(on ? 'mounted' : 'idle');
  }

  function updateCompanion(dt) {
    const c = companion;
    const tx = body.x - Math.sin(body.yaw) * 1.6 + Math.cos(body.yaw) * 1.4;
    const tz = body.z - Math.cos(body.yaw) * 1.6 - Math.sin(body.yaw) * 1.4;
    const d = Math.hypot(tx - c.x, tz - c.z);
    if (d > 30) { c.x = tx; c.z = tz; }
    else if (d > 0.4) {
      const sp = Math.min(d * 3, 9);
      c.x += (tx - c.x) / d * sp * dt; c.z += (tz - c.z) / d * sp * dt;
      c.yaw = Math.atan2(tx - c.x, tz - c.z);
      c.speedNow = sp;
    } else c.speedNow = 0;
    c.y = walkHeightAt(c.x, c.z);
    const target = hero.target;
    c.shootT -= dt;
    if (target && target.alive && combatT > 0 && Math.hypot(target.x - c.x, target.z - c.z) < 16) {
      c.yaw = Math.atan2(target.x - c.x, target.z - c.z);
      if (c.shootT <= 0) {
        c.shootT = hero.statuses.some(s => s.type === 'overdrive') ? 1.0 : 2.2;
        c.actor.play('shoot', 0.4);
        const dmg = stats().attack * 0.32;
        g.fx.projectile({ x: c.x, y: c.y + 0.7, z: c.z }, { x: target.x, y: target.y + target.height * 0.5, z: target.z }, { kind: 'bolt', color: 0xe0a030, speed: 40, onHit: () => damageUnit(target, dmg, hero) });
        g.audio.play('bolt', { x: c.x, z: c.z, volume: 0.4 });
      }
    }
    c.actor.group.position.set(c.x, c.y, c.z);
    c.actor.group.rotation.y = c.yaw;
    c.actor.update(dt, { speed: c.speedNow });
  }

  // ───────────── frame ─────────────

  function syncUnit() {
    hero.x = body.x; hero.y = body.y; hero.z = body.z; hero.yaw = body.yaw;
    hero.stamina = body.stamina;
    if (actor) {
      actor.group.position.set(body.x, body.y + (hero.mounted ? 1.25 : 0), body.z);
      actor.group.rotation.y = body.yaw;
    }
    if (horse) { horse.group.position.set(body.x, body.y, body.z); horse.group.rotation.y = body.yaw; }
  }

  function update(dt) {
    statsT -= dt;
    if (statsT <= 0) statsCache = null;
    const st = stats();
    hero.hp = Math.min(hero.hp, st.maxHp);

    if (!hero.alive) {
      respawnT -= dt;
      if (respawnT <= 0) respawn();
      if (actor) actor.update(dt, { speed: 0 });
      return;
    }

    tickStatuses(hero, dt, (u, kind, amount, s) => {
      if (kind === 'dot') {
        const dmg = Math.max(1, Math.round(amount));
        hero.hp -= dmg; lastHitT = g.time; regenDelay = 5;
        g.fx.floatText({ x: hero.x, y: hero.y + 2.1, z: hero.z }, '-' + dmg, { color: s.type === 'poison' ? '#8fb86a' : '#ff8a3a', size: 0.75 });
        if (hero.hp <= 0) die(s.source);
      } else hero.hp = Math.min(st.maxHp, hero.hp + amount);
    });
    if (!hero.alive) return;

    const input = g.input;
    const controlled = isControlled(hero);
    const intent = {
      mx: controlled ? 0 : (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0),
      mz: controlled ? 0 : (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0),
      sprint: input.isDown('sprint'), walk: input.isDown('walk'),
      jump: !controlled && input.isDown('jump'), dodge: !controlled && combat.consumeDodge(),
      camYaw: g.cameraRig.yaw,
    };
    body.slow = speedMult(hero) * (isRooted(hero) ? 0 : 1);
    const events = stepHero(body, dt, intent, st, g.colliders);
    for (const e of events) {
      if (e === 'jump') g.audio.play('jump', { volume: 0.5 });
      else if (e === 'land') { g.audio.play('land', { volume: 0.6 }); g.fx.dust({ x: body.x, y: body.y, z: body.z }); }
      else if (e === 'dodge') { g.audio.play('swing', { volume: 0.4, pitch: 0.8 }); if (actor) actor.play('dodge', 0.42); g.interaction.cancel(); }
    }
    if (body.grounded && body.moving) {
      stepAcc += body.speed * dt;
      if (stepAcc > (hero.mounted ? 3.2 : 2.1)) {
        stepAcc = 0;
        const surface = body.surface === 'water' ? 'water' : g.zone.city ? 'stone' : 'grass';
        g.audio.play('step-' + surface, { volume: body.sprinting ? 0.5 : 0.35, throttleMs: 120 });
        if (body.surface === 'water') g.fx.splash({ x: body.x, y: body.y + 0.05, z: body.z });
      }
    }

    combat.update(dt);

    // out-of-combat recovery
    combatT -= dt; regenDelay -= dt;
    if (combatT <= 0 && regenDelay <= 0 && hero.hp < st.maxHp) hero.hp = Math.min(st.maxHp, hero.hp + st.maxHp * 0.03 * dt);

    syncUnit();
    if (actor) actor.update(dt, { speed: hero.mounted ? 0 : body.speed, airborne: !body.grounded });
    if (horse) horse.update(dt, { speed: body.speed });
    if (companion) updateCompanion(dt);
  }

  g.input.onAction((action, pressed) => {
    if (!pressed || !state || g.phase !== 'playing' || g.paused) return;
    if (action === 'quickHeal') quickHeal();
    else if (action === 'mount') setMounted(!hero.mounted);
    else if (action.startsWith('quick')) { const id = state.player.quick[+action.slice(5) - 1]; if (id) useItem(id); }
  });

  return {
    attach, settle, writeBack, update, stats, damageUnit, knockback, onMobKilled, useItem,
    inCombat: () => combatT > 0,
    recentlyHit: () => g.time - lastHitT < 0.4,
    playAction: (name, dur) => { if (actor) actor.play(name, dur); },
    faceTo(x, z) { body.yaw = Math.atan2(x - body.x, z - body.z); },
    playerSideUnits() {
      sideUnits.length = 0;
      if (hero.alive) sideUnits.push(hero);
      const wagon = g.wagonUnit();
      if (wagon) sideUnits.push(wagon);
      for (const m of g.mobs.list) if (m.team === 'player' && m.alive) sideUnits.push(m);
      return sideUnits;
    },
    hotbar: () => combat.hotbar(),
    useAbility: slot => combat.useAbility(slot),
    quickSlots() {
      return state.player.quick.map((id, i) => {
        const group = id ? item(id).cooldownGroup : null;
        return { slot: i + 1, itemId: id, count: id ? countItem(state, id) : 0, cooldown: group ? cooldownLeft(state, group, state.world.clock) : 0, cooldownTotal: group ? COOLDOWNS[group] || 0 : 0 };
      });
    },
    setQuickSlot(slot, itemId) { state.player.quick[slot - 1] = itemId; emit('inv:changed', {}); },
    /** Teleport (travel by coach, debug). */
    teleport(x, z, yaw = 0) { body.x = x; body.z = z; body.yaw = yaw; body.y = walkHeightAt(x, z); body.vx = body.vz = 0; settle(); },
    isSafe: () => isSafeZone(body.x, body.z) && !!cityAt(body.x, body.z),
  };
}
