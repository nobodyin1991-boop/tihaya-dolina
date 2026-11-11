// Creatures at runtime: spawning, AI, attacks, death. Hostile wildlife, bandits and friendly guards share this code;
// the `team` decides who they fight ('hostile' attacks the hero, guards and the wagon; 'player' attacks hostiles).
import { CREATURES } from '../data/creatures.js';
import { creatureStats } from '../sim/combat.js';
import { createCreature } from '../entities/creature-models.js';
import { walkHeightAt, waterDepthAt, inBounds, isSafeZone } from '../world/terrain.js';
import { newUnitId, addStatus, tickStatuses, isControlled, isRooted, speedMult, damageMult, takenMult, dist2D, yawTo, turnToward } from './units.js';

const ACTIVE_RADIUS = 150;     // AI runs inside this distance from the hero
const MODEL_IN = 140, MODEL_OUT = 175;
const CORPSE_SECONDS = 150;

export function createMobs(g) {
  const mobs = [];
  const rand = Math.random;

  // ───────────── spawning ─────────────

  /**
   * opts: { team='hostile', home, anchor (unit to escort), scripted, role:'attacker'|'looter'|'boss', packKey, poiId, eventId, elite, name, focusWagon }
   */
  function spawn(creatureId, level, x, z, opts = {}) {
    const def = CREATURES[creatureId];
    if (!def) { console.warn('Unknown creature', creatureId); return null; }
    const stats = creatureStats(creatureId, level);
    const eliteMult = opts.elite ? 1.6 : 1;
    const mob = {
      id: newUnitId(), kind: 'mob', team: opts.team || 'hostile',
      creatureId, def, name: opts.name || def.name, level, elite: !!opts.elite, boss: !!def.boss,
      stats, x, z, y: walkHeightAt(x, z), yaw: rand() * Math.PI * 2,
      radius: (def.radius || 0.5) * (def.scale || 1), height: (def.height || 1.4) * (def.scale || 1),
      hp: Math.round(stats.hp * eliteMult), maxHp: Math.round(stats.hp * eliteMult), alive: true,
      statuses: [], stunImmune: 0,
      home: opts.home || { x, z }, anchor: opts.anchor || null,
      scripted: !!opts.scripted, role: opts.role || 'attacker', focusWagon: !!opts.focusWagon,
      packKey: opts.packKey || null, poiId: opts.poiId || null, eventId: opts.eventId || null,
      state: 'idle', stateT: rand() * 4, wanderTo: null,
      target: null, provoked: false, ignoreT: 0,
      attackCd: 0.5 + rand(), special: {}, windup: null, charge: null, push: null,
      speedNow: 0, carrying: 0, fleeT: 0,
      corpseT: 0, looted: false, actor: null, distHero: Infinity,
      passive: !!opts.passive, leaving: false, guardId: opts.guardId || null, loot: null,
    };
    for (const a of def.abilities || []) mob.special[a.type] = (a.cooldown || 8) * (0.4 + rand() * 0.6);
    mobs.push(mob);
    return mob;
  }

  function remove(mob) {
    const i = mobs.indexOf(mob);
    if (i >= 0) mobs.splice(i, 1);
    dropActor(mob);
    clearWindup(mob);
  }

  function dropActor(mob) {
    if (!mob.actor) return;
    g.scene.remove(mob.actor.group);
    mob.actor.dispose();
    mob.actor = null;
  }

  function manageActor(mob) {
    const d = mob.distHero;
    if (!mob.actor && d < MODEL_IN) {
      mob.actor = createCreature(mob.creatureId, { seed: mob.id * 7919, elite: mob.elite });
      mob.height = mob.actor.height || mob.height;
      mob.radius = Math.max(0.35, mob.actor.radius || mob.radius);
      g.scene.add(mob.actor.group);
      if (!mob.alive) mob.actor.setStance('dead');
    } else if (mob.actor && d > MODEL_OUT) {
      dropActor(mob);
    }
    if (mob.actor) {
      mob.actor.group.position.set(mob.x, mob.y, mob.z);
      mob.actor.group.rotation.y = mob.yaw;
      mob.actor.setLod(d < 35 ? 0 : d < 80 ? 1 : 2);
    }
  }

  // ───────────── targeting ─────────────

  function enemiesOf(mob) {
    if (mob.team === 'hostile') return g.playerSideUnits();
    return mobs;   // filtered by caller
  }

  function pickTarget(mob) {
    const hero = g.hero;
    if (mob.team === 'player') {
      let best = null, bd = 26;
      const cx = mob.anchor ? mob.anchor.x : mob.x, cz = mob.anchor ? mob.anchor.z : mob.z;
      for (const m of mobs) {
        if (m.team !== 'hostile' || !m.alive || (!m.target && !m.scripted)) continue;
        const d = Math.hypot(m.x - cx, m.z - cz);
        if (d < bd) { bd = d; best = m; }
      }
      return best;
    }
    if (mob.ignoreT > 0 || mob.passive) return null;
    const wagon = g.wagonUnit();
    if (mob.role === 'looter' && wagon && wagon.alive && g.cargoLeft() > 0 && !mob.carrying) return wagon;
    if (mob.scripted) {
      if (mob.focusWagon && wagon && wagon.alive) return wagon;
      let best = null, bd = Infinity;
      for (const u of enemiesOf(mob)) {
        if (!u.alive) continue;
        let d = dist2D(mob, u);
        if (u.kind === 'wagon') d *= 1.5;
        if (d < bd) { bd = d; best = u; }
      }
      return best;
    }
    // wild creatures
    if (!hero.alive || isSafeZone(hero.x, hero.z)) return null;
    if (mob.provoked) return mob.distHero < (mob.def.leashRadius || 40) * 1.4 ? hero : null;
    if (mob.def.aggressive && mob.distHero < (mob.def.aggroRadius || 14) && hero.level - mob.level < 7) return hero;
    return null;
  }

  // ───────────── movement ─────────────

  function moveToward(mob, tx, tz, speed, dt, faceYaw = null) {
    const dx = tx - mob.x, dz = tz - mob.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05 || isRooted(mob)) { mob.speedNow = 0; return d; }
    const step = Math.min(d, speed * speedMult(mob) * dt);
    let nx = mob.x + dx / d * step, nz = mob.z + dz / d * step;
    const res = g.colliders.resolve(nx, nz, mob.radius * 0.8, mob.y);
    nx = res.x; nz = res.z;
    if (!inBounds(nx, nz) || waterDepthAt(nx, nz) > 1.1) { mob.speedNow = 0; return d; }
    const moved = Math.hypot(nx - mob.x, nz - mob.z);
    mob.x = nx; mob.z = nz; mob.y = walkHeightAt(nx, nz);
    mob.speedNow = moved / Math.max(dt, 1e-4);
    turnToward(mob, faceYaw ?? Math.atan2(dx, dz), 9, dt);
    return d;
  }

  // ───────────── attacks ─────────────

  function clearWindup(mob) {
    if (mob.windup?.marker) mob.windup.marker.remove();
    mob.windup = null;
  }

  function startWindup(mob, kind, seconds, extra = {}) {
    mob.windup = { kind, t: seconds, total: seconds, ...extra };
    mob.speedNow = 0;
    if (mob.actor) mob.actor.play(kind === 'shot' || kind === 'volley' ? 'shoot' : kind === 'heavy' ? 'heavy' : kind === 'charge' ? 'charge' : kind === 'howl' ? 'howl' : kind === 'steal' ? 'gather' : 'attack', seconds + 0.25);
  }

  function strike(mob, target, mult, effects = true) {
    if (!target || !target.alive) return;
    const amount = mob.stats.damage * mult * damageMult(mob) * (0.88 + rand() * 0.24) * (mob.elite ? 1.25 : 1);
    const landed = g.damageUnit(target, amount, mob, { mult });
    if (!landed || !effects) return;
    for (const a of mob.def.abilities || []) {
      if (a.type === 'poison' && rand() < (a.chance ?? 0.35)) addStatus(target, 'poison', a.duration || 6, mob.stats.damage * (a.value ?? 0.18), mob);
      if (a.type === 'bleed' && rand() < (a.chance ?? 0.3)) addStatus(target, 'bleed', a.duration || 5, mob.stats.damage * (a.value ?? 0.2), mob);
      if (a.type === 'web' && rand() < (a.chance ?? 0.4)) addStatus(target, 'slow', a.duration || 3.5, a.value ?? 0.45, mob);
    }
  }

  function shoot(mob, target, mult) {
    const kind = mob.def.projectile || (mob.creatureId.includes('crossbow') ? 'bolt' : 'arrow');
    const from = { x: mob.x, y: mob.y + mob.height * 0.75, z: mob.z };
    const aim = { x: target.x, y: target.y + (target.height || 1.6) * 0.6, z: target.z };
    g.audio.play('bow', { x: mob.x, z: mob.z, volume: 0.5 });
    g.fx.projectile(from, aim, {
      kind, color: 0xd8cfb4, speed: 38,
      onHit: () => {
        if (!mob.alive && rand() < 0.5) return;
        if (Math.hypot(target.x - aim.x, target.z - aim.z) < 1.7 + (target.radius || 0.4)) strike(mob, target, mult);
      },
    });
  }

  function resolveWindup(mob) {
    const w = mob.windup;
    const target = mob.target;
    mob.windup = null;
    if (w.marker) w.marker.remove();
    const reach = (mob.def.attackRange || 1.6) + mob.radius;
    switch (w.kind) {
      case 'melee':
        if (target && dist2D(mob, target) <= reach + (target.radius || 0.4) + 0.9) strike(mob, target, 1);
        break;
      case 'shot':
        if (target) shoot(mob, target, 1);
        break;
      case 'volley':
        if (target) for (let i = 0; i < 3; i++) setTimeout(() => { if (mob.alive && target.alive) shoot(mob, target, 0.55); }, i * 160);
        break;
      case 'heavy': {
        g.fx.ring({ x: w.x, y: walkHeightAt(w.x, w.z) + 0.1, z: w.z }, { color: 0xd2543f, radius: w.radius, duration: 0.35 });
        g.fx.dust({ x: w.x, y: walkHeightAt(w.x, w.z), z: w.z });
        g.audio.play('impact', { x: w.x, z: w.z, volume: 0.9, pitch: 0.7 });
        for (const u of enemiesOf(mob)) {
          if (!u.alive || u.team === mob.team) continue;
          if (Math.hypot(u.x - w.x, u.z - w.z) <= w.radius + (u.radius || 0.4)) {
            strike(mob, u, w.mult, false);
            g.knockback(u, mob, 6);
            if (w.stun) addStatus(u, 'stun', w.stun, 0, mob);
          }
        }
        break;
      }
      case 'charge': {
        const tx = target ? target.x : mob.x + Math.sin(mob.yaw), tz = target ? target.z : mob.z + Math.cos(mob.yaw);
        const d = Math.hypot(tx - mob.x, tz - mob.z) || 1;
        mob.charge = { dx: (tx - mob.x) / d, dz: (tz - mob.z) / d, t: Math.min(1.3, (d + 5) / 13), mult: w.mult, hit: false };
        break;
      }
      case 'howl':
        g.audio.creature(mob.creatureId, 'aggro', mob.x, mob.z);
        for (const m of mobs) if (m.alive && m.team === mob.team && dist2D(m, mob) < 16) addStatus(m, 'fury', w.duration || 8, w.buff || 0.2, mob);
        for (let i = 0; i < (w.count || 0); i++) {
          const a = rand() * Math.PI * 2;
          const add = spawn(w.summon, mob.level - (mob.boss ? 1 : 0), mob.x + Math.cos(a) * 6, mob.z + Math.sin(a) * 6, { scripted: mob.scripted, eventId: mob.eventId, poiId: mob.poiId, packKey: mob.packKey });
          if (add) { add.provoked = true; add.target = mob.target; }
        }
        g.fx.ring({ x: mob.x, y: mob.y + 0.2, z: mob.z }, { color: 0xd2543f, radius: 8, duration: 0.6 });
        break;
      case 'steal':
        if (target && target.kind === 'wagon' && dist2D(mob, target) < 4.5 && g.cargoLeft() > 0) {
          mob.carrying = g.stealCargo(mob);
          mob.fleeT = 14;
        }
        break;
    }
  }

  function trySpecial(mob, target, d) {
    for (const a of mob.def.abilities || []) {
      if (mob.special[a.type] > 0) continue;
      const cd = a.cooldown || 8;
      if (a.type === 'heavy' && d < (mob.def.attackRange || 2) + mob.radius + 1.6) {
        const r = a.radius || 2.8;
        const fx = mob.x + Math.sin(mob.yaw) * (r * 0.6), fz = mob.z + Math.cos(mob.yaw) * (r * 0.6);
        const marker = g.fx.marker({ x: fx, y: walkHeightAt(fx, fz) + 0.08, z: fz }, { color: 0xd2543f, radius: r });
        startWindup(mob, 'heavy', a.windup || 1.0, { x: fx, z: fz, radius: r, mult: a.power || 2.2, marker, stun: a.stun || 0 });
        mob.special.heavy = cd; return true;
      }
      if (a.type === 'charge' && d > 6 && d < 17) {
        startWindup(mob, 'charge', a.windup || 0.7, { mult: a.power || 1.8 });
        mob.special.charge = cd; return true;
      }
      if (a.type === 'howl' && d < 18 && (!a.atHpBelow || mob.hp < mob.maxHp * a.atHpBelow)) {
        startWindup(mob, 'howl', 0.8, { summon: a.summon, count: a.summon && !mob.summoned ? a.count : 0, buff: a.buffDamage, duration: a.duration });
        mob.summoned = true;
        mob.special.howl = cd; return true;
      }
      if (a.type === 'volley' && mob.def.ranged && d < (mob.def.attackRange || 16)) {
        startWindup(mob, 'volley', 0.8);
        mob.special.volley = cd; return true;
      }
    }
    return false;
  }

  // ───────────── behaviour ─────────────

  function fight(mob, dt) {
    const target = mob.target;
    const d = dist2D(mob, target);
    const def = mob.def;
    const run = def.speed || 5;
    const faceYaw = yawTo(mob, target);

    if (mob.role === 'looter' && target.kind === 'wagon') {
      if (d > 3.4) moveToward(mob, target.x, target.z, run, dt);
      else { mob.speedNow = 0; turnToward(mob, faceYaw, 9, dt); if (!mob.windup) startWindup(mob, 'steal', 4.0); }
      return;
    }

    if (mob.attackCd <= 0 && trySpecial(mob, target, d)) return;

    if (def.ranged) {
      const far = def.attackRange || 16;
      if (d > far) moveToward(mob, target.x, target.z, run, dt);
      else if (d < (def.ranged.keepDistance || far * 0.5) * 0.7) {
        // back off while facing the target
        moveToward(mob, mob.x - (target.x - mob.x), mob.z - (target.z - mob.z), run * 0.75, dt, faceYaw);
      } else { mob.speedNow = 0; turnToward(mob, faceYaw, 9, dt); }
      if (mob.attackCd <= 0 && d <= far + 1.5 && !g.colliders.segmentBlocked(mob.x, mob.z, target.x, target.z, 0.2, 2)) {
        startWindup(mob, 'shot', 0.5);
        mob.attackCd = (def.attackInterval || 2.4) * (0.9 + rand() * 0.2);
      }
      return;
    }

    const reach = (def.attackRange || 1.6) + mob.radius + (target.radius || 0.4);
    if (d > reach) moveToward(mob, target.x, target.z, run, dt);
    else {
      mob.speedNow = 0;
      turnToward(mob, faceYaw, 10, dt);
      if (mob.attackCd <= 0) {
        startWindup(mob, 'melee', 0.32);
        mob.attackCd = (def.attackInterval || 1.8) * (0.9 + rand() * 0.2);
      }
    }
  }

  function idle(mob, dt) {
    const def = mob.def;
    if (mob.anchor) {
      // escort: keep a loose formation around the anchor (the wagon)
      const slot = mob.id % 4;
      const ax = mob.anchor.x + Math.cos(mob.anchor.yaw + slot * 1.57 + 0.78) * 5;
      const az = mob.anchor.z - Math.sin(mob.anchor.yaw + slot * 1.57 + 0.78) * 5;
      const d = Math.hypot(ax - mob.x, az - mob.z);
      if (d > 1.5) moveToward(mob, ax, az, d > 8 ? (def.speed || 5) : 2.6, dt); else mob.speedNow = 0;
      return;
    }
    const dHome = Math.hypot(mob.x - mob.home.x, mob.z - mob.home.z);
    if (mob.state === 'return') {
      if (dHome < 2) { mob.state = 'idle'; mob.hp = mob.maxHp; mob.provoked = false; }
      else moveToward(mob, mob.home.x, mob.home.z, (def.speed || 5) * 0.9, dt);
      return;
    }
    if (mob.passive) { mob.speedNow = 0; turnToward(mob, yawTo(mob, g.hero), 4, dt); return; }
    if (mob.scripted) {
      // scripted attackers without a target close in on the wagon / hero
      const goal = g.wagonUnit() || g.hero;
      if (dist2D(mob, goal) > 6) moveToward(mob, goal.x, goal.z, def.speed || 5, dt); else mob.speedNow = 0;
      return;
    }
    mob.stateT -= dt;
    if (mob.wanderTo) {
      const d = moveToward(mob, mob.wanderTo.x, mob.wanderTo.z, Math.min(1.6, (def.speed || 5) * 0.3), dt);
      if (d < 0.6 || mob.stateT <= 0) { mob.wanderTo = null; mob.stateT = 2 + rand() * 6; }
    } else {
      mob.speedNow = 0;
      if (mob.stateT <= 0) {
        const a = rand() * Math.PI * 2, r = 3 + rand() * 9;
        mob.wanderTo = { x: mob.home.x + Math.cos(a) * r, z: mob.home.z + Math.sin(a) * r };
        mob.stateT = 7;
        if (mob.distHero < 40 && rand() < 0.25) g.audio.creature(mob.creatureId, 'idle', mob.x, mob.z);
      }
    }
  }

  function think(mob, dt) {
    mob.attackCd -= dt;
    mob.ignoreT -= dt;
    for (const k in mob.special) mob.special[k] -= dt;

    if (mob.push) {
      const p = mob.push;
      const res = g.colliders.resolve(mob.x + p.vx * dt, mob.z + p.vz * dt, mob.radius * 0.8, mob.y);
      if (waterDepthAt(res.x, res.z) < 1.1) { mob.x = res.x; mob.z = res.z; mob.y = walkHeightAt(res.x, res.z); }
      p.vx *= Math.exp(-dt * 7); p.vz *= Math.exp(-dt * 7); p.t -= dt;
      if (p.t <= 0) mob.push = null;
    }

    if (mob.charge) {
      const c = mob.charge;
      c.t -= dt;
      const before = mob.x + mob.z;
      moveToward(mob, mob.x + c.dx * 20, mob.z + c.dz * 20, 13, dt);
      if (!c.hit) for (const u of enemiesOf(mob)) {
        if (!u.alive || u.team === mob.team) continue;
        if (dist2D(mob, u) < mob.radius + (u.radius || 0.4) + 0.5) { c.hit = true; strike(mob, u, c.mult); g.knockback(u, mob, 7); break; }
      }
      if (c.t <= 0 || c.hit || Math.abs(mob.x + mob.z - before) < 0.01) { mob.charge = null; mob.attackCd = 1.2; }
      return;
    }

    if (mob.windup) {
      mob.speedNow = 0;
      if (mob.target && mob.target.alive && mob.windup.kind !== 'heavy') turnToward(mob, yawTo(mob, mob.target), 6, dt);
      mob.windup.t -= dt;
      if (mob.windup.t <= 0) resolveWindup(mob);
      return;
    }

    // a looter carrying cargo, or a frightened animal, runs away
    if (mob.fleeT > 0) {
      mob.fleeT -= dt;
      const from = mob.carrying ? (g.wagonUnit() || g.hero) : g.hero;
      const d = dist2D(mob, from) || 1;
      moveToward(mob, mob.x + (mob.x - from.x) / d * 12, mob.z + (mob.z - from.z) / d * 12, (mob.def.speed || 5) * 1.05, dt);
      if ((mob.carrying || mob.leaving) && (mob.fleeT <= 0 || d > 55)) { if (mob.carrying) g.cargoEscaped(mob); remove(mob); }
      return;
    }

    // leash for wild creatures
    if (!mob.scripted && !mob.anchor && mob.team === 'hostile') {
      const dHome = Math.hypot(mob.x - mob.home.x, mob.z - mob.home.z);
      if (dHome > (mob.def.leashRadius || 40)) { mob.target = null; mob.provoked = false; mob.state = 'return'; mob.ignoreT = 5; }
    }

    if (!mob.target || !mob.target.alive || (mob.target.kind === 'hero' && !mob.scripted && isSafeZone(mob.target.x, mob.target.z))) {
      const had = !!mob.target;
      mob.target = pickTarget(mob);
      if (mob.target && !had) {
        if (mob.distHero < 45) g.audio.creature(mob.creatureId, 'aggro', mob.x, mob.z);
        if (mob.actor) mob.actor.setStance('combat');
        // skittish animals flee instead of fighting
        if (mob.def.flees && mob.target.kind === 'hero') { mob.fleeT = 6; mob.target = null; }
      } else if (!mob.target && had && mob.actor) mob.actor.setStance('idle');
    } else if (mob.scripted && mob.team === 'hostile' && Math.random() < dt * 0.4) {
      mob.target = pickTarget(mob) || mob.target;   // re-evaluate now and then
    }

    if (mob.target) fight(mob, dt); else idle(mob, dt);
  }

  // ───────────── public: damage & death ─────────────

  /** Apply damage to a mob. Returns the amount actually dealt. */
  function damage(mob, amount, source, opts = {}) {
    if (!mob.alive) return 0;
    const dealt = Math.max(1, Math.round(amount * takenMult(mob)));
    mob.hp -= dealt;
    if (source && source.alive !== false && mob.team === 'hostile') {
      mob.provoked = true;
      if (mob.state === 'return') mob.state = 'idle';
      mob.ignoreT = 0;
      if (!mob.target || (source.kind === 'hero' && mob.target.kind !== 'hero' && rand() < 0.5)) mob.target = source;
      mob.passive = false;
      if (mob.packKey) for (const m of mobs) if (m.packKey === mob.packKey && m.alive && !m.target) { m.provoked = true; m.passive = false; m.target = source; }
    }
    if (mob.hp <= 0) { die(mob, source); return dealt; }
    if (mob.actor && dealt > mob.maxHp * 0.04 && !mob.windup) mob.actor.play('hit', 0.3);
    if (opts.interrupt && mob.windup && !mob.boss) clearWindup(mob);
    return dealt;
  }

  function die(mob, killer) {
    mob.alive = false; mob.hp = 0;
    mob.target = null; mob.charge = null; mob.statuses.length = 0;
    clearWindup(mob);
    mob.corpseT = CORPSE_SECONDS;
    mob.speedNow = 0;
    if (mob.actor) mob.actor.setStance('dead');
    g.audio.creature(mob.creatureId, 'death', mob.x, mob.z);
    g.onMobKilled(mob, killer);
  }

  function knock(mob, fromX, fromZ, speed) {
    if (mob.boss) speed *= 0.3;
    const d = Math.hypot(mob.x - fromX, mob.z - fromZ) || 1;
    mob.push = { vx: (mob.x - fromX) / d * speed, vz: (mob.z - fromZ) / d * speed, t: 0.35 };
  }

  // ───────────── update ─────────────

  function update(dt) {
    const hero = g.hero;
    for (let i = mobs.length - 1; i >= 0; i--) {
      const mob = mobs[i];
      mob.distHero = Math.hypot(mob.x - hero.x, mob.z - hero.z);
      manageActor(mob);
      if (!mob.alive) {
        mob.corpseT -= dt;
        if (mob.corpseT <= 0 || (mob.looted && mob.corpseT < CORPSE_SECONDS - 6)) remove(mob);
        continue;
      }
      if (mob.distHero > ACTIVE_RADIUS && !mob.scripted && !mob.anchor) { mob.speedNow = 0; continue; }
      tickStatuses(mob, dt, (u, kind, amount, s) => {
        if (kind === 'dot') { const dealt = damage(u, amount, s.source); g.fx.floatText({ x: u.x, y: u.y + u.height + 0.3, z: u.z }, String(dealt), { color: s.type === 'poison' ? '#8fb86a' : '#ff8a3a', size: 0.8 }); }
        else u.hp = Math.min(u.maxHp, u.hp + amount);
      });
      if (!mob.alive) continue;
      if (isControlled(mob)) { mob.speedNow = 0; clearWindup(mob); mob.charge = null; }
      else think(mob, dt);
      if (mob.actor) mob.actor.update(dt, { speed: mob.speedNow });
    }
    separate();
  }

  function separate() {
    for (let i = 0; i < mobs.length; i++) {
      const a = mobs[i];
      if (!a.alive || a.distHero > 60) continue;
      for (let j = i + 1; j < mobs.length; j++) {
        const b = mobs[j];
        if (!b.alive) continue;
        const dx = b.x - a.x, dz = b.z - a.z, min = (a.radius + b.radius) * 0.9;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = (min - d) * 0.5;
        a.x -= dx / d * push; a.z -= dz / d * push;
        b.x += dx / d * push; b.z += dz / d * push;
      }
    }
  }

  /** Remove every mob matching a predicate (cell unload, event cleanup). */
  function removeWhere(pred) {
    for (let i = mobs.length - 1; i >= 0; i--) if (pred(mobs[i])) remove(mobs[i]);
  }

  return {
    list: mobs, spawn, remove, removeWhere, update, damage, knock,
    /** Living hostile mobs within `r` of a point. */
    hostilesNear(x, z, r, out = []) {
      out.length = 0;
      for (const m of mobs) if (m.alive && m.team === 'hostile' && Math.hypot(m.x - x, m.z - z) <= r + m.radius) out.push(m);
      return out;
    },
    aliveCount: pred => { let n = 0; for (const m of mobs) if (m.alive && pred(m)) n++; return n; },
  };
}
