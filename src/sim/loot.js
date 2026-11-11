// Loot tables: creature drops, chests, skinning yields. Pure — nothing is added to the bag here;
// the caller decides what to do with the rolled bundle.
import '../data/items-catalog.js';
import { ITEMS } from '../data/items.js';
import { CREATURES } from '../data/creatures.js';
import { RECIPE_LIST, noteIdFor } from '../data/recipes.js';
import { creatureStats } from './combat.js';

export const LOOT_RULES = {
  eliteUniqueChance: 0.06,     // unique drop from an ordinary elite / lair-type creature
  bossNoteChance: 0.6,
  gearLevelWindow: 5,          // dropped gear requires a level within [level - window, level + 1]
  chestCoinsBase: 15,
  chestCoinsPerLevel: 12,
  chestGearChance: 0.45,
  chestNoteChance: 0.35,
  chestFieldnoteChance: 0.3,
};

const randomInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

function addTo(bundle, itemId, count) {
  if (count > 0) bundle[itemId] = (bundle[itemId] || 0) + count;
}

/** Ordinary (non-unique) weapons and armour a creature of `level` may carry. */
export function gearPool(level, classId = null) {
  const window = LOOT_RULES.gearLevelWindow;
  return Object.values(ITEMS).filter(def => {
    if (def.type !== 'weapon' && def.type !== 'armor') return false;
    if (def.unique) return false;
    const required = def.requiredLevel || 1;
    if (required > level + 1 || required < level - window) return false;
    return !classId || !def.classes || def.classes.includes(classId);
  });
}

function pickUnique(uniques, classId, rng) {
  if (!uniques?.length) return null;
  const usable = uniques.filter(id => !ITEMS[id]?.classes || !classId || ITEMS[id].classes.includes(classId));
  return pick(rng, usable.length ? usable : uniques);
}

function notePool(maxRecipeLevel, minRecipeLevel = 1) {
  return RECIPE_LIST
    .filter(recipe => recipe.learn === 'note' && recipe.level <= maxRecipeLevel && recipe.level >= minRecipeLevel)
    .map(recipe => noteIdFor(recipe.id));
}

/**
 * Roll the drop of a killed creature.
 * @param {string} creatureId
 * @param {number} level
 * @param {() => number} [rng]
 * @param {{classId?:string, elite?:boolean, coinMult?:number}} [options]
 *   classId — the hero's class: unique drops and gear prefer usable items;
 *   elite — this instance is the named beast of a lair: its unique drop is guaranteed;
 *   coinMult — bonus share of coins (perk «Гроза разбойников»).
 * @returns {{coins:number, items:Object<string, number>}}
 */
export function rollLoot(creatureId, level, rng = Math.random, options = {}) {
  const def = CREATURES[creatureId];
  const result = { coins: 0, items: {} };
  if (!def) return result;

  const [minCoins, maxCoins] = creatureStats(creatureId, level).coins;
  if (maxCoins > 0) {
    const bonus = def.family === 'bandit' ? 1 + (options.coinMult || 0) : 1;
    result.coins = Math.round(randomInt(rng, minCoins, maxCoins) * bonus);
  }

  for (const [itemId, chance, min, max] of def.loot.items) {
    if (rng() < chance) addTo(result.items, itemId, randomInt(rng, min, max));
  }

  if (def.loot.gearChance && rng() < def.loot.gearChance) {
    const pool = gearPool(level, options.classId);
    if (pool.length) addTo(result.items, pick(rng, pool).id, 1);
  }

  if (def.loot.uniques) {
    const guaranteed = def.boss || options.elite;
    if (guaranteed || rng() < LOOT_RULES.eliteUniqueChance) {
      addTo(result.items, pickUnique(def.loot.uniques, options.classId, rng), 1);
    }
  }

  if (def.boss && rng() < LOOT_RULES.bossNoteChance) {
    const notes = notePool(level + 2, Math.max(1, level - 6));
    if (notes.length) addTo(result.items, pick(rng, notes), 1);
  }
  return result;
}

/** Consumables found in chests, by the highest POI level they appear at. */
const CHEST_SUPPLIES = [
  { maxLevel: 5, items: ['salve', 'bandage', 'bread', 'stew', 'herbalTea', 'whetstone'] },
  { maxLevel: 10, items: ['tonic', 'ration', 'antidote', 'stypticPowder', 'weaponOil', 'staminaTonic'] },
  { maxLevel: 15, items: ['fieldkit', 'trailMeal', 'ironSkinSalve', 'focusDrops', 'tonic'] },
  { maxLevel: 99, items: ['lunarSalve', 'feast', 'fieldkit', 'swiftnessBrew', 'lunarElixir'] },
];

/** Valuables found in chests, by the highest POI level they appear at. */
const CHEST_VALUABLES = [
  { maxLevel: 5, items: ['fang', 'wolfPelt', 'copperIngot', 'honey'] },
  { maxLevel: 10, items: ['steel', 'salt', 'amber', 'reinforcedLeather'] },
  { maxLevel: 15, items: ['cobaltSteel', 'roughGem', 'wine', 'spice'] },
  { maxLevel: 99, items: ['mithril', 'roughGem', 'silk', 'pearls'] },
];

const bracket = (table, level) => table.find(row => level <= row.maxLevel);

/**
 * Roll the contents of a POI chest.
 * @param {number} poiLevel level of the point of interest
 * @param {() => number} [rng]
 * @param {{classId?:string}} [options]
 * @returns {{coins:number, items:Object<string, number>}}
 */
export function rollChest(poiLevel, rng = Math.random, options = {}) {
  const rules = LOOT_RULES;
  const result = { coins: 0, items: {} };
  const baseCoins = rules.chestCoinsBase + rules.chestCoinsPerLevel * poiLevel;
  result.coins = Math.round(baseCoins * (0.7 + rng() * 0.6));

  const supplies = bracket(CHEST_SUPPLIES, poiLevel).items;
  addTo(result.items, pick(rng, supplies), randomInt(rng, 1, 2));
  addTo(result.items, pick(rng, supplies), 1);

  const valuables = bracket(CHEST_VALUABLES, poiLevel).items;
  addTo(result.items, pick(rng, valuables), randomInt(rng, 1, 2));

  if (rng() < rules.chestGearChance) {
    const pool = gearPool(poiLevel, options.classId);
    if (pool.length) addTo(result.items, pick(rng, pool).id, 1);
  }
  if (rng() < rules.chestNoteChance) {
    const notes = notePool(poiLevel + 2, Math.max(1, poiLevel - 6));
    if (notes.length) addTo(result.items, pick(rng, notes), 1);
  }
  if (rng() < rules.chestFieldnoteChance) addTo(result.items, 'fieldnote', 1);
  return result;
}

/**
 * Hide yield of a carcass (before skill checks — see skinCorpse in gathering.js).
 * @returns {{itemId:string, count:number, tier:number}|null} null for creatures without a hide
 */
export function skinYield(creatureId, level, rng = Math.random) {
  const skin = CREATURES[creatureId]?.loot.skin;
  if (!skin) return null;
  let count = randomInt(rng, skin.count[0], skin.count[1]);
  const def = CREATURES[creatureId];
  if (level >= def.levelRange[1] && rng() < 0.3) count += 1;
  return { itemId: skin.item, count, tier: skin.tier };
}
