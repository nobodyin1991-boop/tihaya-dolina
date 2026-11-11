// Hero offence: targeting, basic attacks and the five class abilities.
// Ability data comes from data/classes.js; this file implements each `shape`.
import { emit } from '../core/events.js';
import { CLASSES, abilitiesOf, resolveAbility } from '../data/classes.js';
import { abilityRank } from '../sim/progression.js';
import { damageToCreature } from '../sim/combat.js';
import { isSafeZone } from '../world/terrain.js';
import { addStatus, isControlled, damageMult, angleDiff, dist2D, yawTo } from './units.js';

const TARGET_RANGE = 40;

export function createHeroCombat(g, hero, deps) {
  let state = null;
  let classDef = null;
  let abilities = [];                 // ability defs ordered by slot (index 0 = slot 1)
  const cooldowns = {};               // abilityId -> seconds left
  let attackT = 0;                    // time until the next basic attack may start
  let busyT = 0;                      // an attack/cast animation is playing
  let lockT = 0;                      // keep facing the target for this long
  let dodgeQueued = false;
  const pending = [];                 // delayed effects: {t, fn}
  const scratch = [];

  function attach(s) {
    state = s;
    classDef = CLASSES[s.player.classId];
    abilities = abilitiesOf(s.player.classId);
    for (const k of Object.keys(cooldowns)) delete cooldowns[k];
    pending.length = 0;
  }

  const later = (t, fn) => pending.push({ t, fn });
  const chest = u => ({ x: u.x, y: u.y + (u.height || 1.6) * 0.6, z: u.z });
  const isRanged = () => (classDef.basicAttack?.range || 2) > 5;

  // ───────────── targeting ─────────────

  function hostile(m) { return m.alive && m.team === 'hostile'; }

  /** Best hostile in front of the camera within `range` (+slack). */
  function pickTarget(range) {
    const camYaw = g.cameraRig.yaw;
    let best = null, bs = Infinity;
    for (const m of g.mobs.list) {
      if (!hostile(m)) continue;
      const d = dist2D(hero, m) - m.radius;
      if (d > range + 4) continue;
      const off = Math.abs(angleDiff(camYaw, yawTo(hero, m)));
      if (off > 1.25 && d > 5) continue;
      // peaceful animals are only picked when nothing dangerous is around
      const calm = !m.def.aggressive && !m.provoked && !m.scripted ? 12 : 0;
      const score = d + off * 9 + calm;
      if (score < bs) { bs = score; best = m; }
    }
    return best;
  }

  function cycleTarget() {
    scratch.length = 0;
    for (const m of g.mobs.list) if (hostile(m) && m.distHero < TARGET_RANGE) scratch.push(m);
    if (!scratch.length) { hero.target = null; return; }
    scratch.sort((a, b) => a.distHero - b.distHero);
    const i = scratch.indexOf(hero.target);
    hero.target = scratch[(i + 1) % scratch.length];
    g.audio.play('tab', { volume: 0.5 });
  }

  function ensureTarget(range) {
    const t = hero.target;
    if (t && t.alive && dist2D(hero, t) - t.radius <= range + 4) return t;
    const picked = pickTarget(range);
    if (picked) hero.target = picked;
    return picked;
  }

  function face(target, seconds = 0.45) {
    const body = deps.body();
    body.lockYaw = yawTo(hero, target);
    lockT = seconds;
  }

  /** Hostiles inside a cone in front of the hero. */
  function inArc(range, angleDeg, maxTargets = 8) {
    const half = (angleDeg / 2) * Math.PI / 180;
    scratch.length = 0;
    for (const m of g.mobs.list) {
      if (!hostile(m)) continue;
      const d = dist2D(hero, m) - m.radius;
      if (d > range) continue;
      if (d > 0.9 && Math.abs(angleDiff(hero.yaw, yawTo(hero, m))) > half) continue;
      scratch.push(m);
    }
    scratch.sort((a, b) => dist2D(hero, a) - dist2D(hero, b));
    scratch.length = Math.min(scratch.length, maxTargets);
    return scratch.slice();
  }

  // ───────────── damage ─────────────

  function hit(mob, power, effects, rank, opts = {}) {
    if (!mob || !mob.alive) return;
    const st = deps.stats();
    const crit = Math.random() < (st.critChance || 0.05);
    const res = damageToCreature(st, { power, crit }, { level: mob.level, armor: mob.stats.armor || 0, family: mob.def.family, markValue: mob.statuses.find(x => x.type === 'mark')?.value }, hero.level, Math.random);
    let amount = typeof res === 'number' ? res : res.amount ?? res.damage ?? 0;
    amount *= damageMult(hero);
    const dealt = g.mobs.damage(mob, amount, hero, { interrupt: opts.interrupt });
    deps.enterCombat();
    if (dealt > 0) {
      const p = { x: mob.x, y: mob.y + mob.height + 0.25, z: mob.z };
      if (g.settings.damageNumbers) g.fx.floatText(p, String(dealt), { color: crit ? '#f0a830' : '#f1ead6', size: crit ? 1.3 : 0.95, crit });
      g.fx.impact(chest(mob), { color: opts.color ?? 0xffe2b0, size: crit ? 1.2 : 0.8 });
      if (mob.def.family === 'bandit' || mob.def.family === 'beast' || mob.def.family === 'monster') g.fx.blood(chest(mob));
      g.audio.play(crit ? 'crit' : 'hit-flesh', { x: mob.x, z: mob.z, volume: 0.7, throttleMs: 60 });
      if (crit) g.cameraRig.addShake(0.12);
    }
    applyEffects(mob, effects, rank);
  }

  function effectNumbers(effect, rank) {
    const r = rank || {};
    const duration = r[effect.type + 'Duration'] ?? r.duration ?? effect.duration ?? 3;
    const value = r[effect.type] ?? r.value ?? effect.value ?? 0;
    return { duration, value };
  }

  function applyEffects(mob, effects, rank) {
    if (!effects || !mob || !mob.alive) return;
    const st = deps.stats();
    for (const e of effects) {
      const { duration, value } = effectNumbers(e, rank);
      switch (e.type) {
        case 'stun': addStatus(mob, 'stun', mob.boss ? duration * 0.4 : duration, 0, hero); break;
        case 'slow': addStatus(mob, 'slow', duration, value || 0.4, hero); break;
        case 'weaken': addStatus(mob, 'weaken', duration, value || 0.25, hero); break;
        case 'mark': addStatus(mob, 'mark', duration, value || 0.2, hero); break;
        case 'taunt': mob.target = hero; break;
        case 'knockback': g.mobs.knock(mob, hero.x, hero.z, value || 7); break;
        case 'burn': case 'bleed': case 'poison':
          addStatus(mob, e.type, duration, st.attack * (value || 0.2), hero);
          break;
      }
    }
  }

  function applySelfEffects(effects, rank) {
    const st = deps.stats();
    const actor = deps.actor();
    for (const e of effects || []) {
      const { duration, value } = effectNumbers(e, rank);
      switch (e.type) {
        case 'buff': {
          const map = { attackMult: 'fury', critChance: 'fury', damageTakenMult: 'guard', moveSpeedMult: 'haste', companionAttackMult: 'overdrive' };
          const type = map[e.stat] || 'fury';
          addStatus(hero, type, duration, Math.abs(value) || 0.2, hero);
          break;
        }
        case 'shield': hero.shield = Math.max(hero.shield, st.maxHp * (value || 0.2)); later(duration || 8, () => { hero.shield = 0; }); break;
        case 'heal': {
          const amount = Math.round(st.maxHp * (value || 0.2) * (st.healPower || 1));
          hero.hp = Math.min(st.maxHp, hero.hp + amount);
          g.fx.floatText({ x: hero.x, y: hero.y + 2.1, z: hero.z }, '+' + amount, { color: '#8fd08a', size: 1 });
          g.fx.heal({ x: hero.x, y: hero.y + 1, z: hero.z });
          break;
        }
        case 'hot': addStatus(hero, 'regen', duration, st.maxHp * (value || 0.04) * (st.healPower || 1), hero); break;
      }
    }
    if (actor) g.fx.aura(actor.group, { color: 0xecd08c, duration: 0.9 });
  }

  // ───────────── shapes ─────────────

  const SELF_EFFECTS = new Set(['buff', 'shield', 'heal', 'hot']);
  const splitEffects = effects => ({
    onSelf: (effects || []).filter(e => SELF_EFFECTS.has(e.type) || e.target === 'self'),
    onEnemy: (effects || []).filter(e => !SELF_EFFECTS.has(e.type) && e.target !== 'self'),
  });

  /** Execute an attack description. Returns false if it could not start (no target, out of range). */
  function perform(def, power, rank) {
    const fxDef = def.fx || {};
    const color = fxDef.color ?? 0xfff0c8;
    const params = def.params || {};
    const range = def.range || 2.4;
    const actor = deps.actor();
    const { onSelf, onEnemy } = splitEffects(def.effects);
    const anim = fxDef.anim || 'attack';
    const sound = fxDef.sound;
    const play = (dur) => { if (actor) actor.play(anim, dur); busyT = dur; };
    const sfx = () => { if (sound) g.audio.play(sound, { volume: 0.55 }); };

    switch (def.shape) {
      case 'melee-arc': {
        const t = ensureTarget(range);
        if (t) face(t);
        play(0.5);
        later(0.2, () => {
          sfx(); g.audio.play('swing', { volume: 0.4 });
          g.fx.slash({ x: hero.x, y: hero.y + 1.1, z: hero.z }, hero.yaw, { color, radius: range + 0.4, angle: params.angle || 120, duration: 0.28 });
          const targets = inArc(range + 0.5, params.angle || 120, params.maxTargets || 6);
          targets.forEach((m, i) => hit(m, power * (i === 0 ? 1 : 0.75), onEnemy, rank, { color, interrupt: onEnemy.some(e => e.type === 'stun') }));
        });
        break;
      }
      case 'melee-single': {
        const t = ensureTarget(range);
        if (t && dist2D(hero, t) - t.radius > range + 1.2) return fail('Слишком далеко');
        if (t) face(t);
        play(0.45);
        later(0.18, () => {
          sfx(); g.audio.play('swing', { volume: 0.4 });
          g.fx.thrust({ x: hero.x, y: hero.y + 1.15, z: hero.z }, hero.yaw, { color, length: range + 0.6 });
          const victim = t && t.alive && dist2D(hero, t) - t.radius <= range + 1.4 ? t : inArc(range + 0.4, 70, 1)[0];
          const hits = params.hits || 1;
          if (victim) for (let h = 0; h < hits; h++) later(h * 0.14, () => hit(victim, power / hits, h === hits - 1 ? onEnemy : [], rank, { color, interrupt: true }));
        });
        break;
      }
      case 'projectile': {
        const t = ensureTarget(range);
        if (!t) return fail('Нет цели');
        if (dist2D(hero, t) - t.radius > range) return fail('Слишком далеко');
        face(t, 0.6);
        play(0.55);
        const count = params.maxTargets || 1;
        const victims = [t];
        if (count > 1) for (const m of g.mobs.list) { if (victims.length >= count) break; if (m !== t && hostile(m) && dist2D(m, t) < (params.radius || 7)) victims.push(m); }
        later(0.25, () => {
          sfx();
          victims.forEach((m, i) => {
            g.fx.projectile({ x: hero.x, y: hero.y + 1.35, z: hero.z }, chest(m), {
              kind: params.projectile || fxDef.projectile || 'arrow', color, speed: params.projectileSpeed || 42,
              onHit: () => hit(m, power * (i === 0 ? 1 : 0.7), onEnemy, rank, { color }),
            });
          });
        });
        break;
      }
      case 'aoe-self': {
        play(0.55);
        const radius = params.radius || 5;
        later(0.22, () => {
          sfx();
          g.fx.ring({ x: hero.x, y: hero.y + 0.15, z: hero.z }, { color, radius, duration: 0.45 });
          for (const m of g.mobs.hostilesNear(hero.x, hero.z, radius, [])) hit(m, power, onEnemy, rank, { color });
        });
        break;
      }
      case 'aoe-target': {
        const t = ensureTarget(range);
        const radius = params.radius || 4;
        const at = t ? { x: t.x, y: t.y, z: t.z } : { x: hero.x + Math.sin(hero.yaw) * Math.min(range, 9), y: hero.y, z: hero.z + Math.cos(hero.yaw) * Math.min(range, 9) };
        if (t && dist2D(hero, t) > range + 2) return fail('Слишком далеко');
        if (t) face(t, 0.6);
        play(0.6);
        later(0.25, () => {
          sfx();
          g.fx.projectile({ x: hero.x, y: hero.y + 1.4, z: hero.z }, { x: at.x, y: at.y + 0.4, z: at.z }, {
            kind: params.projectile || 'capsule', color, speed: params.projectileSpeed || 26,
            onHit: () => {
              g.fx.ring({ x: at.x, y: at.y + 0.15, z: at.z }, { color, radius, duration: 0.5 });
              g.fx.smoke({ x: at.x, y: at.y + 0.3, z: at.z });
              for (const m of g.mobs.hostilesNear(at.x, at.z, radius, [])) hit(m, power, onEnemy, rank, { color });
            },
          });
        });
        break;
      }
      case 'chain': {
        const t = ensureTarget(range);
        if (!t) return fail('Нет цели');
        if (dist2D(hero, t) - t.radius > range) return fail('Слишком далеко');
        face(t, 0.6);
        play(0.5);
        later(0.22, () => {
          sfx();
          const chain = [t];
          let from = { x: hero.x, y: hero.y + 1.3, z: hero.z };
          for (let j = 0; j < (params.jumps || 3); j++) {
            const last = chain[chain.length - 1];
            let next = null, nd = params.radius || 8;
            for (const m of g.mobs.list) {
              if (!hostile(m) || chain.includes(m)) continue;
              const d = dist2D(m, last);
              if (d < nd) { nd = d; next = m; }
            }
            if (!next) break;
            chain.push(next);
          }
          chain.forEach((m, i) => {
            g.fx.beam(from, chest(m), { color, duration: 0.25 });
            from = chest(m);
            hit(m, power * Math.pow(0.75, i), onEnemy, rank, { color });
          });
        });
        break;
      }
      case 'dash': {
        const body = deps.body();
        const dist = params.dashDistance || 7;
        const t = ensureTarget(dist + 3);
        const yaw = t ? yawTo(hero, t) : hero.yaw;
        body.dodgeDirX = Math.sin(yaw); body.dodgeDirZ = Math.cos(yaw);
        body.dodgeT = Math.min(0.42, dist / 20); body.invulnerable = Math.max(body.invulnerable, 0.25);
        play(0.45);
        sfx();
        later(0.24, () => {
          g.fx.slash({ x: hero.x, y: hero.y + 1.1, z: hero.z }, hero.yaw, { color, radius: 3.2, angle: 150, duration: 0.25 });
          for (const m of inArc(3.4, 170, params.maxTargets || 4)) hit(m, power, onEnemy, rank, { color });
        });
        break;
      }
      case 'leap-back': {
        const body = deps.body();
        const t = ensureTarget(range || 12);
        if (t) { face(t, 0.7); hit(t, power, onEnemy, rank, { color }); }
        const yaw = hero.yaw + Math.PI;
        body.dodgeDirX = Math.sin(yaw); body.dodgeDirZ = Math.cos(yaw);
        body.dodgeT = Math.min(0.42, (params.dashDistance || 7) / 20); body.invulnerable = Math.max(body.invulnerable, 0.3);
        if (actor) actor.play('dodge', 0.42);
        busyT = 0.3;
        sfx();
        break;
      }
      case 'self-buff': case 'heal-self': case 'companion':
        play(0.5);
        sfx();
        
        break;
      default:
        return fail('Умение не работает');
    }
    if (onSelf.length) applySelfEffects(onSelf, rank);
    return true;
  }

  function fail(text) {
    emit('toast', { text, kind: 'warn' });
    g.audio.play('error', { volume: 0.4, throttleMs: 500 });
    return false;
  }

  // ───────────── public actions ─────────────

  function canAct() {
    return hero.alive && !isControlled(hero) && busyT <= 0 && !g.interaction.busy();
  }

  function basicAttack() {
    if (!canAct() || attackT > 0) return;
    const basic = classDef.basicAttack || { range: 2.4, interval: 1.1, shape: 'melee-arc' };
    if (isSafeZone(hero.x, hero.z)) return;
    if (hero.mounted) deps.dismount();
    const st = deps.stats();
    const ranged = isRanged();
    if (ranged && !ensureTarget(basic.range)) return;
    const okStart = perform({ ...basic, effects: basic.effects || [] }, basic.power || 1, null);
    if (okStart) attackT = (basic.interval || 1.1) / (st.attackSpeed || 1);
  }

  function useAbility(slot) {
    const def = abilities[slot - 1];
    if (!def || !hero.alive) return false;
    const rankN = abilityRank(state, def.id);
    if (!rankN) return fail('Умение не изучено — найдите наставника');
    if (cooldowns[def.id] > 0) { g.audio.play('error', { volume: 0.3, throttleMs: 500 }); return false; }
    if (!canAct()) return false;
    const offensive = !['self-buff', 'heal-self', 'companion'].includes(def.shape);
    if (offensive && isSafeZone(hero.x, hero.z)) return fail('В городе оружие в ножнах');
    const body = deps.body();
    const cost = def.staminaCost || 0;
    if (body.stamina < cost) return fail('Не хватает сил');
    if (hero.mounted) deps.dismount();
    const resolved = resolveAbility(def.id, rankN);
    if (!perform(resolved, resolved.power ?? 1, null)) return false;
    body.stamina -= cost; body.staminaDelay = 1;
    cooldowns[def.id] = def.cooldown ?? 8;
    deps.enterCombat();
    emit('ability:used', { id: def.id, slot });
    return true;
  }

  function update(dt) {
    attackT -= dt; busyT -= dt;
    for (const k in cooldowns) if (cooldowns[k] > 0) cooldowns[k] -= dt;
    const body = deps.body();
    if (lockT > 0) { lockT -= dt; if (lockT <= 0) body.lockYaw = null; else if (hero.target?.alive) body.lockYaw = yawTo(hero, hero.target); }
    for (let i = pending.length - 1; i >= 0; i--) {
      pending[i].t -= dt;
      if (pending[i].t <= 0) { const fn = pending[i].fn; pending.splice(i, 1); if (hero.alive) fn(); }
    }
    const t = hero.target;
    if (t && (!t.alive || dist2D(hero, t) > TARGET_RANGE + 8)) hero.target = null;
    if (g.input.isDown('attack') && g.input.gameplay) basicAttack();
  }

  g.input.onAction((action, pressed) => {
    if (!pressed || !state || g.phase !== 'playing' || g.paused) return;
    if (action === 'target') cycleTarget();
    else if (action === 'dodge') dodgeQueued = true;
    else if (action.startsWith('ability')) useAbility(+action.slice(7));
  });

  return {
    attach, update, useAbility,
    busy: () => busyT > 0,
    consumeDodge() { const d = dodgeQueued; dodgeQueued = false; return d; },
    hotbar() {
      return abilities.map(def => {
        const rankN = abilityRank(state, def.id);
        const total = def.cooldown ?? 8;
        const left = Math.max(0, cooldowns[def.id] || 0);
        const lockedReason = !rankN ? (state.player.level < (def.requiredLevel || 1) ? `Требуется уровень ${def.requiredLevel}` : 'Не изучено') : null;
        return { slot: def.slot, abilityId: def.id, name: def.name, icon: def.icon, rank: rankN, cooldown: left, cooldownTotal: total, usable: !lockedReason && left <= 0 && deps.body().stamina >= (def.staminaCost || 0), lockedReason, staminaCost: def.staminaCost || 0 };
      });
    },
  };
}
