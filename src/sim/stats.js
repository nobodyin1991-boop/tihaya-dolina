// Derived hero stats: class + level + attributes + equipment + perks (+ timed buffs). Pure.
// This module only reads state; the slices it reads are owned by player.js, inventory.js and
// progression.js (`prog`), so it has no slice of its own.
import '../data/items-catalog.js';
import { ITEMS } from '../data/items.js';
import { CLASSES } from '../data/classes.js';
import { PERKS } from '../data/perks.js';
import { totalSlots } from './inventory.js';

/** Tuning constants of the stat formulas. */
export const STAT_RULES = {
  hpPerEndurance: 5,
  staminaBase: 100,
  staminaPerEndurance: 2,
  staminaRegen: 8,            // per second
  attackPerLevel: 1.2,
  attackPerPrimary: 0.6,
  armorPerStrength: 0.5,
  critBase: 0.05,
  critPerAgility: 0.004,
  critMult: 1.5,
  moveSpeed: 5.6,             // m/s run
  speedPerAgility: 0.002,
  healPerWits: 0.01,
  gatherPerWits: 0.005,
  pricePerWits: 0.002,
  blockPowerBase: 0.3,        // share of damage removed by blocking without a shield
  minDamageTakenMult: 0.2,
  maxCritChance: 0.6,
};

/** Buff / gear stat keys that add up as multipliers (+0.1 = +10 %). */
const MULT_KEYS = ['attackMult', 'damageTakenMult', 'moveSpeedMult', 'staminaRegenMult', 'companionAttackMult', 'maxHpMult'];
/** Stat keys that add up as plain numbers. */
const FLAT_KEYS = ['maxHp', 'maxStamina', 'attack', 'armor', 'critChance', 'moveSpeed', 'healPower', 'gatherSpeed', 'priceBonus', 'blockPower'];
/** Perk effects that are passed through to the result unchanged (summed). */
const PERK_KEYS = [
  'nearWagonDamage', 'damageVsBandit', 'damageVsBeast', 'banditCoinMult', 'foodBonus',
  'mountSpeedMult', 'craftSaveChance', 'craftXpMult', 'wagonRepairBonus', 'bagSlots',
];

function emptyBonus() {
  const bonus = { gatherYield: {} };
  for (const key of [...MULT_KEYS, ...FLAT_KEYS, ...PERK_KEYS]) bonus[key] = 0;
  return bonus;
}

function addBonus(bonus, source) {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    if (key === 'gatherYield') {
      for (const [skill, chance] of Object.entries(value)) {
        bonus.gatherYield[skill] = (bonus.gatherYield[skill] || 0) + chance;
      }
    } else if (typeof value === 'number') {
      bonus[key] = (bonus[key] || 0) + value;
    }
  }
}

/** Items currently equipped, as definitions. */
export function equippedItems(state) {
  const items = [];
  for (const itemId of Object.values(state.inv?.equip || {})) {
    if (itemId && ITEMS[itemId]) items.push(ITEMS[itemId]);
  }
  return items;
}

/** Attributes of the hero (falls back to the class base before the `prog` slice exists). */
export function heroAttributes(state) {
  const cls = CLASSES[state.player.classId] || CLASSES.warrior;
  return { ...cls.attrs, ...(state.prog?.attrs || {}) };
}

/**
 * All derived stats of the hero.
 * @param {object} state game state
 * Timed buffs from consumables (slice `consum`) are applied automatically while they last.
 * @param {object|Array} [ctx] options; an array is taken as `ctx.buffs`
 * @param {Array<{stat:string, value:number}>} [ctx.buffs] extra buffs from the engine (entries without `stat` are ignored)
 * @param {number} [ctx.now] game time in seconds for buff expiry (default: state.world.clock)
 * @param {boolean} [ctx.nearWagon] hero is within WAGON_PERK_RADIUS of the caravan wagon
 * @param {boolean} [ctx.mounted] hero is riding
 * @returns {object} { level, classId, maxHp, maxStamina, staminaRegen, attack, weaponDamage, armor,
 *   critChance, critMult, moveSpeed, damageTakenMult, blockPower, healPower, gatherSpeed, priceBonus,
 *   carrySlots, damageVsBandit, damageVsBeast, banditCoinMult, foodBonus, mountSpeedMult,
 *   craftSaveChance, craftXpMult, wagonRepairBonus, gatherYield:{skill: chance}, attrs, companion|null }
 */
export function derivedStats(state, context = {}) {
  const ctx = Array.isArray(context) ? { buffs: context } : (context || {});
  const cls = CLASSES[state.player.classId] || CLASSES.warrior;
  const level = state.player.level || 1;
  const attrs = heroAttributes(state);
  const rules = STAT_RULES;

  const bonus = emptyBonus();
  let weaponDamage = 0;
  let gearArmor = 0;
  for (const def of equippedItems(state)) {
    if (def.type === 'weapon') weaponDamage += def.damage || 0;
    gearArmor += def.armor || 0;
    addBonus(bonus, def.stats);
  }
  for (const perkId of state.prog?.perks || []) addBonus(bonus, PERKS[perkId]?.effects);
  const now = ctx.now ?? state.world?.clock ?? 0;
  const timed = (state.consum?.buffs || []).filter(buff => buff.until > now);
  for (const buff of [...timed, ...(ctx.buffs || [])]) {
    if (buff && typeof buff.stat === 'string' && typeof buff.value === 'number') {
      bonus[buff.stat] = (bonus[buff.stat] || 0) + buff.value;
    }
  }

  const baseHp = cls.hp + cls.hpPerLevel * (level - 1) + attrs.endurance * rules.hpPerEndurance + bonus.maxHp;
  const maxHp = Math.round(baseHp * (1 + bonus.maxHpMult));
  const maxStamina = Math.round(rules.staminaBase + attrs.endurance * rules.staminaPerEndurance + bonus.maxStamina);

  let attackMult = 1 + bonus.attackMult;
  if (ctx.nearWagon) attackMult += bonus.nearWagonDamage;
  const baseAttack = cls.attack + weaponDamage + rules.attackPerLevel * (level - 1)
    + attrs[cls.primary] * rules.attackPerPrimary + bonus.attack;
  const attack = Math.max(1, baseAttack * attackMult);

  const armor = Math.max(0, gearArmor + attrs.strength * rules.armorPerStrength + bonus.armor);
  const critChance = Math.min(rules.maxCritChance, rules.critBase + attrs.agility * rules.critPerAgility + bonus.critChance);
  const speedShare = 1 + attrs.agility * rules.speedPerAgility + bonus.moveSpeed;
  let moveSpeed = rules.moveSpeed * speedShare * (1 + bonus.moveSpeedMult);
  if (ctx.mounted) moveSpeed *= 1 + bonus.mountSpeedMult;

  const stats = {
    level,
    classId: cls.id,
    attrs,
    maxHp,
    maxStamina,
    staminaRegen: rules.staminaRegen * (1 + bonus.staminaRegenMult),
    attack,
    weaponDamage,
    armor,
    critChance,
    critMult: rules.critMult,
    moveSpeed,
    damageTakenMult: Math.max(rules.minDamageTakenMult, 1 + bonus.damageTakenMult),
    blockPower: Math.min(0.9, bonus.blockPower > 0 ? bonus.blockPower : rules.blockPowerBase),
    healPower: 1 + attrs.wits * rules.healPerWits + bonus.healPower,
    gatherSpeed: 1 + attrs.wits * rules.gatherPerWits + bonus.gatherSpeed,
    priceBonus: attrs.wits * rules.pricePerWits + bonus.priceBonus,
    carrySlots: totalSlots(state),
    damageVsBandit: bonus.damageVsBandit,
    damageVsBeast: bonus.damageVsBeast,
    banditCoinMult: bonus.banditCoinMult,
    foodBonus: bonus.foodBonus,
    mountSpeedMult: bonus.mountSpeedMult,
    craftSaveChance: bonus.craftSaveChance,
    craftXpMult: bonus.craftXpMult,
    wagonRepairBonus: bonus.wagonRepairBonus,
    gatherYield: bonus.gatherYield,
    companion: null,
  };

  if (cls.companion) {
    stats.companion = {
      name: cls.companion.name,
      maxHp: Math.round(maxHp * cls.companion.hpShare),
      attack: attack * cls.companion.attackShare * (1 + bonus.companionAttackMult),
      interval: cls.companion.interval,
      range: cls.companion.range,
      followDistance: cls.companion.followDistance,
    };
  }
  return stats;
}

/** Current hp as a number (player.hp === null means "full"). */
export function currentHp(state, stats = derivedStats(state)) {
  const hp = state.player.hp;
  return hp === null || hp === undefined ? stats.maxHp : Math.min(hp, stats.maxHp);
}
