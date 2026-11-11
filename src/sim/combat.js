// Combat mathematics: creature scaling, damage both ways, level-gap rules, status effects,
// kill rewards. Pure — the engine owns positions, timers and target selection.
//
// ── Balance assumptions ──────────────────────────────────────────────────────────────────────
// • A level-1 warrior (attack ≈ 25 with the starter two-hander) kills a level-1 wolf (110 hp)
//   in 4–5 basic hits and survives ~8 bites (19 damage before ~13 % armour mitigation, ~138 hp).
// • Creature hp grows +16 % of base per level (×4.0 at 20), damage +13 % (×3.5 at 20); the hero's
//   attack grows ×4 from level, weapon tiers and trained attributes, hp ×4 plus armour — so an
//   on-level fight stays 4–6 hits with on-tier gear and gets harder with outdated gear.
// • Armour: mitigation = armor / (armor + 50 + 10 × attackerLevel). Full heavy tier 5 ≈ 37 % at 20.
// • Level gap: within ±3 levels every level is ±15 % incoming / ∓5 % outgoing; beyond 3 levels
//   incoming damage doubles roughly every 1.5 levels and outgoing damage falls off quickly.
// • Bosses (chiefs) have 7–9× the hp of a same-level thug and hit ~1.7× harder.
// • Kill xp = (14 + 6 × level) × creature.xp, reduced for creatures 3+ levels below the hero.
//   With xpToNext from player.js this is ~12 on-level kills for level 2 and ~40 for level 20;
//   quests and caravans are expected to supply roughly half of all xp (level 20 ≈ end of the ring).
// • Beasts carry no coins (hides, meat and trophies are the hunter's income); bandits carry
//   3–8 coins × (1 + 0.25 per level), chiefs a purse worth a tier of gear.
import { CREATURES } from '../data/creatures.js';
import { clamp } from '../core/noise.js';

export const COMBAT_RULES = {
  hpPerLevel: 0.16,
  damagePerLevel: 0.13,
  armorPerLevel: 0.1,
  coinsPerLevel: 0.25,
  armorBase: 50,
  armorPerAttackerLevel: 10,
  softGap: 3,
  incomingPerLevel: 0.15,
  incomingHardBase: 1.45,
  incomingHardExponent: 0.65,
  incomingMax: 8,
  incomingEasyPerLevel: 0.07,
  incomingMin: 0.25,
  outgoingPerLevel: 0.05,
  outgoingHardPerLevel: 0.3,
  outgoingBonusPerLevel: 0.04,
  outgoingMax: 1.25,
  variance: 0.08,
  minDamage: 1,
  bossStunFactor: 0.5,
  killXpBase: 14,
  killXpPerLevel: 6,
  killXpFloor: 0.15,
};

/** Share of damage removed by `armor` against an attacker of `attackerLevel`. */
export function mitigation(armor, attackerLevel) {
  if (!(armor > 0)) return 0;
  return armor / (armor + COMBAT_RULES.armorBase + COMBAT_RULES.armorPerAttackerLevel * attackerLevel);
}

/** Multiplier of damage a creature deals to the hero, from the level gap. */
export function incomingMultiplier(playerLevel, creatureLevel) {
  const rules = COMBAT_RULES;
  const gap = creatureLevel - playerLevel;
  if (gap >= 0) {
    if (gap <= rules.softGap) return 1 + rules.incomingPerLevel * gap;
    return Math.min(rules.incomingMax, rules.incomingHardBase * 2 ** ((gap - rules.softGap) * rules.incomingHardExponent));
  }
  const lead = -gap;
  if (lead <= rules.softGap) return 1 - rules.incomingEasyPerLevel * lead;
  const softFloor = 1 - rules.incomingEasyPerLevel * rules.softGap;
  return Math.max(rules.incomingMin, softFloor * 0.85 ** (lead - rules.softGap));
}

/** Multiplier of damage the hero deals to a creature, from the level gap. */
export function outgoingMultiplier(playerLevel, creatureLevel) {
  const rules = COMBAT_RULES;
  const gap = creatureLevel - playerLevel;
  if (gap > rules.softGap) {
    const softFloor = 1 - rules.outgoingPerLevel * rules.softGap;
    return softFloor / (1 + (gap - rules.softGap) * rules.outgoingHardPerLevel);
  }
  if (gap >= 0) return 1 - rules.outgoingPerLevel * gap;
  return Math.min(rules.outgoingMax, 1 + rules.outgoingBonusPerLevel * -gap);
}

/**
 * Stats of a creature at a level.
 * @returns {{id, level, hp, damage, armor, xp, coins:[number, number], boss:boolean, family:string}|null}
 */
export function creatureStats(creatureId, level) {
  const def = CREATURES[creatureId];
  if (!def) return null;
  const rules = COMBAT_RULES;
  const steps = Math.max(0, level - 1);
  const coinScale = 1 + rules.coinsPerLevel * steps;
  return {
    id: creatureId,
    level,
    family: def.family,
    boss: !!def.boss,
    hp: Math.round(def.baseHp * (1 + rules.hpPerLevel * steps)),
    damage: Math.round(def.baseDamage * (1 + rules.damagePerLevel * steps) * 10) / 10,
    armor: Math.round(def.armor * (1 + rules.armorPerLevel * steps)),
    xp: Math.round((rules.killXpBase + rules.killXpPerLevel * level) * def.xp),
    coins: [Math.round(def.loot.coins[0] * coinScale), Math.round(def.loot.coins[1] * coinScale)],
  };
}

/**
 * Damage of one hero hit.
 * @param {object} attackerStats result of derivedStats()
 * @param {{power?:number, crit?:boolean}} hit ability power (multiplier of attack); `crit` forces the outcome
 * @param {{level:number, armor:number, family?:string, markValue?:number}} target
 * @param {number} playerLevel
 * @param {() => number} [rng]
 * @returns {{damage:number, crit:boolean}}
 */
export function damageToCreature(attackerStats, hit, target, playerLevel, rng = Math.random) {
  const rules = COMBAT_RULES;
  const power = hit?.power ?? 1;
  const crit = hit?.crit ?? (rng() < attackerStats.critChance);
  let damage = attackerStats.attack * power;
  if (crit) damage *= attackerStats.critMult;
  damage *= 1 - rules.variance + rng() * rules.variance * 2;
  damage *= outgoingMultiplier(playerLevel, target.level);
  damage *= 1 - mitigation(target.armor, playerLevel);
  if (target.family === 'bandit') damage *= 1 + (attackerStats.damageVsBandit || 0);
  if (target.family === 'beast' || target.family === 'monster') damage *= 1 + (attackerStats.damageVsBeast || 0);
  if (target.markValue) damage *= 1 + target.markValue;
  return { damage: Math.max(rules.minDamage, Math.round(damage)), crit };
}

/**
 * Damage of one creature hit on the hero.
 * @param {object} attacker result of creatureStats()
 * @param {number} creatureLevel
 * @param {object} playerStats result of derivedStats()
 * @param {number} playerLevel
 * @param {{blocking?:boolean, power?:number, weakenValue?:number}} [options]
 * @returns {number} damage, at least 1
 */
export function damageToPlayer(attacker, creatureLevel, playerStats, playerLevel, options = {}) {
  let damage = attacker.damage * (options.power ?? 1);
  if (options.weakenValue) damage *= 1 - options.weakenValue;
  damage *= incomingMultiplier(playerLevel, creatureLevel);
  damage *= 1 - mitigation(playerStats.armor, creatureLevel);
  damage *= playerStats.damageTakenMult ?? 1;
  if (options.blocking) damage *= 1 - (playerStats.blockPower ?? 0.3);
  return Math.max(COMBAT_RULES.minDamage, Math.round(damage));
}

/**
 * Status effects. `kind`: control | dot | debuff | buff.
 * Dots tick every `interval` seconds for `value × basis` (basis: the applier's attack or damage).
 * `stacking: 'refresh'` — re-applying resets the duration and keeps the stronger value.
 */
export const STATUS = {
  stun: {
    id: 'stun', name: 'Оглушение', kind: 'control', stacking: 'refresh',
    blocksActions: true, blocksMovement: true, bossFactor: COMBAT_RULES.bossStunFactor,
    desc: 'Цель не может двигаться и атаковать. На главарей действует вдвое меньше.',
  },
  slow: {
    id: 'slow', name: 'Замедление', kind: 'debuff', stacking: 'refresh',
    stat: 'moveSpeedMult', defaultValue: 0.4,
    desc: 'Скорость снижена на долю value.',
  },
  burn: {
    id: 'burn', name: 'Горение', kind: 'dot', stacking: 'refresh',
    interval: 1, basis: 'attack', defaultValue: 0.25, curedBy: ['stypticPowder', 'lunarSalve', 'lunarElixir'],
    desc: 'Урон огнём каждую секунду.',
  },
  bleed: {
    id: 'bleed', name: 'Кровотечение', kind: 'dot', stacking: 'refresh',
    interval: 1, basis: 'attack', defaultValue: 0.18, curedBy: ['bandage', 'stypticPowder', 'fieldkit', 'lunarElixir'],
    desc: 'Урон каждую секунду; перевязка останавливает.',
  },
  poison: {
    id: 'poison', name: 'Отравление', kind: 'dot', stacking: 'refresh',
    interval: 2, basis: 'attack', defaultValue: 0.2, curedBy: ['antidote', 'fieldkit', 'lunarElixir'],
    desc: 'Урон каждые две секунды; снимается противоядием.',
  },
  weaken: {
    id: 'weaken', name: 'Ослабление', kind: 'debuff', stacking: 'refresh',
    stat: 'damageDealtMult', defaultValue: 0.2,
    desc: 'Цель наносит меньше урона на долю value.',
  },
  mark: {
    id: 'mark', name: 'Уязвимость', kind: 'debuff', stacking: 'refresh',
    stat: 'damageTakenMult', defaultValue: 0.15,
    desc: 'Цель получает больше урона на долю value.',
  },
  taunt: {
    id: 'taunt', name: 'Вызов', kind: 'control', stacking: 'refresh',
    forcesTarget: true,
    desc: 'Цель атакует того, кто бросил вызов.',
  },
  buff: {
    id: 'buff', name: 'Усиление', kind: 'buff', stacking: 'refresh',
    desc: 'Временная прибавка к характеристике `stat` (см. derivedStats ctx.buffs).',
  },
  shield: {
    id: 'shield', name: 'Заслон', kind: 'buff', stacking: 'refresh',
    absorbs: true,
    desc: 'Поглощает урон в размере доли value от запаса здоровья.',
  },
  hot: {
    id: 'hot', name: 'Восстановление', kind: 'buff', stacking: 'refresh',
    interval: 1, basis: 'maxHp',
    desc: 'Лечение каждую секунду; value — доля запаса здоровья в секунду.',
  },
};

/** Duration of a status on a target (bosses shrug off part of control effects). */
export function statusDuration(statusId, duration, targetIsBoss = false) {
  const status = STATUS[statusId];
  if (!status) return duration;
  return targetIsBoss && status.bossFactor ? duration * status.bossFactor : duration;
}

/** Damage of one tick of a damage-over-time status applied by something with `sourceAttack`. */
export function statusTickDamage(statusId, value, sourceAttack) {
  const status = STATUS[statusId];
  if (!status || status.kind !== 'dot') return 0;
  const share = value ?? status.defaultValue;
  return Math.max(1, Math.round(sourceAttack * share * status.interval));
}

/**
 * Reward for a kill: xp shrinks when the creature is well below the hero.
 * @returns {{xp:number, coins:[number, number]}}
 */
export function killReward(creatureId, level, playerLevel) {
  const stats = creatureStats(creatureId, level);
  if (!stats) return { xp: 0, coins: [0, 0] };
  const relative = clamp(level / Math.max(1, playerLevel - 2), COMBAT_RULES.killXpFloor, 1);
  const xp = stats.xp > 0 ? Math.max(1, Math.round(stats.xp * relative)) : 0;
  return { xp, coins: stats.coins };
}
