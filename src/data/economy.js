// Economy data: city price multipliers, sell ratios, shop assortments, market events. Pure data.
// The logic (dynamic stock, buying, selling, new day) lives in sim/economy.js.
import { ITEMS } from './items.js';
import './items-catalog.js';
import { WEAPON_LINES, ARMOR_SETS, ARMOR_SLOTS } from './items-gear.js';
import { RECIPE_LIST, noteIdFor } from './recipes.js';
import { PROFESSIONS, RECIPE_CITY_CAP } from './professions.js';

export const CITY_KEYS = ['valley', 'ford', 'harbor'];
export const MAX_PROSPERITY = 3;

/** Price multiplier per item category, per city: [valley, ford, harbor]. Cheap where produced. */
const CATEGORY_ROWS = {
  herb: [0.85, 1.1, 1.15],
  ore: [1.15, 0.8, 1.1],
  wood: [0.85, 1.15, 1.15],
  hide: [0.9, 1, 1.2],
  crop: [0.8, 1.2, 1.1],
  fiber: [0.85, 1.1, 1.1],
  stone: [1.1, 0.8, 1.15],
  food: [0.9, 1.15, 0.95],
  medicine: [1, 1.15, 1.1],
  metal: [1.15, 0.85, 1.1],
  timber: [0.9, 1.15, 1.2],
  leather: [0.95, 1.05, 1.2],
  meal: [0.9, 1.2, 1.05],
  cloth: [0.95, 1.1, 1.1],
  stonework: [1.1, 0.9, 1.3],
  trophy: [0.9, 1, 1.25],
  weapon: [1.1, 0.9, 1],
  armor: [1.05, 0.95, 1],
  tool: [1.05, 0.9, 1.05],
};

/** Per-item multipliers for trade goods and caravan cargo: [valley, ford, harbor]. */
const ITEM_ROWS = {
  // долина производит
  honey: [0.65, 1.4, 1.8],
  cheese: [0.65, 1.4, 1.8],
  grainSack: [0.65, 1.5, 1.7],
  lumberBale: [0.65, 1.45, 1.75],
  // Брод производит
  oreCrate: [1.5, 0.65, 1.6],
  coalSack: [1.45, 0.65, 1.6],
  toolCrate: [1.4, 0.7, 1.55],
  salt: [1.5, 0.65, 1.5],
  // Гавань привозит
  amber: [1.9, 1.5, 0.65],
  wine: [1.8, 1.5, 0.65],
  spice: [1.9, 1.5, 0.65],
  fishBarrel: [1.7, 1.45, 0.65],
  silk: [1.9, 1.5, 0.65],
  pearls: [1.85, 1.5, 0.7],
  // скупка у охотников
  furBale: [0.9, 1.2, 1.6],
  // караванный груз
  medicineChest: [1, 1.3, 1.2],
  provisionBarrel: [0.9, 1.35, 1.15],
  tentBundle: [1, 1.25, 1.2],
  spareWheel: [1, 1.2, 1.25],
  harnessSet: [1, 1.2, 1.3],
  buildingStone: [1.1, 0.9, 1.35],
  wagonKit: [1, 1, 1],
  weaponCrate: [1.3, 1, 1.4],
  fieldHospital: [1.2, 1.2, 1.4],
  guildProvisions: [1, 1.3, 1.4],
  sailcloth: [1, 1.1, 1.6],
  bridgeKit: [1.3, 1.2, 1.3],
};

/** Price multiplier of an item in a city (before stock, reputation and perks). */
export function cityMultiplier(cityKey, itemId) {
  const cityIndex = CITY_KEYS.indexOf(cityKey);
  if (cityIndex < 0) return 1;
  if (ITEM_ROWS[itemId]) return ITEM_ROWS[itemId][cityIndex];
  const row = CATEGORY_ROWS[ITEMS[itemId]?.cat];
  return row ? row[cityIndex] : 1;
}

/** Share of the current price a merchant pays the player, by item kind. */
export const SELL_RATIO = {
  trade: 0.9,
  cargo: 0.75,
  material: 0.55,
  consumable: 0.45,
  gear: 0.3,
  note: 0.25,
};

/** "Normal" amount a city holds of an item it does not sell in a shop (drives the price curve). */
export const DEFAULT_TARGET = {
  trade: 14,
  cargo: 4,
  material: 20,
  consumable: 10,
  gear: 2,
  note: 2,
};

/** Price kind of an item: key into SELL_RATIO / DEFAULT_TARGET. */
export function priceKind(itemId) {
  const def = ITEMS[itemId];
  if (!def) return 'material';
  if (def.type === 'trade') return 'trade';
  if (def.cat === 'cargo') return 'cargo';
  if (def.type === 'consumable') return 'consumable';
  if (def.type === 'note' || def.type === 'quest') return 'note';
  if (def.type === 'material') return 'material';
  return 'gear';
}

/** Dynamic price curve: price factor for a stock/target ratio. Scarce → dear, flooded → cheap. */
export const STOCK_CURVE = { exponent: 0.4, min: 0.6, max: 1.8 };

/** Share of the gap to the target that a city restocks (or consumes) every day. */
export const DAILY_DRIFT = 0.25;

/** Reputation 0..100 and perks: maximal total price improvement, and its split. */
export const MAX_PRICE_BONUS = 0.25;
export const REPUTATION_PRICE_BONUS = 0.1; // at reputation 100

/** Highest gear tier sold in a city at prosperity 0..3 (weapons have 6 tiers, armour 5). */
export const GEAR_TIER_CAP = {
  valley: [2, 3, 4, 4],
  ford: [3, 4, 4, 5],
  harbor: [5, 6, 6, 6],
};

/** Smallest prosperity at which `tier` gear is sold in a city, or null if never. */
export function prosperityForTier(cityKey, tier) {
  const caps = GEAR_TIER_CAP[cityKey];
  for (let prosperity = 0; prosperity <= MAX_PROSPERITY; prosperity++) {
    if (caps[prosperity] >= tier) return prosperity;
  }
  return null;
}

const ALL = CITY_KEYS;
const FORD_UP = ['ford', 'harbor'];

/**
 * Hand-written assortments. Entry: [itemId, target, { cities?, prosperity?, level? }].
 * `prosperity` may be a number or a per-city map; a city missing from the map does not sell it.
 */
const STATIC_SHOPS = {
  grocer: [
    ['flatbread', 12], ['bread', 10], ['roastMeat', 8], ['herbalTea', 6],
    ['stew', 6, { prosperity: { valley: 1, ford: 0, harbor: 0 } }],
    ['ration', 6, { prosperity: { valley: 2, ford: 0, harbor: 0 } }],
    ['fishSoup', 6, { cities: ['harbor'] }],
    ['trailMeal', 4, { prosperity: { ford: 1, harbor: 0 } }],
    ['salve', 8], ['bandage', 8],
    ['antidote', 5, { prosperity: { valley: 1, ford: 0, harbor: 0 } }],
    ['stypticPowder', 5, { prosperity: { valley: 1, ford: 0, harbor: 0 } }],
    ['tonic', 4, { prosperity: { ford: 0, harbor: 0, valley: 2 }, level: 5 }],
    ['fieldkit', 2, { prosperity: { ford: 2, harbor: 1 }, level: 10 }],
    ['torch', 10], ['whetstone', 6], ['wagonKit', 4], ['fodder', 10],
    ['sickle', 2], ['knife', 2], ['axe', 2], ['pickaxe', 2],
    ['pouch', 2], ['satchel', 2, { prosperity: { valley: 1, ford: 0, harbor: 0 } }],
    ['bag', 1, { prosperity: { valley: 2, ford: 0, harbor: 0 }, level: 4 }],
    ['luckyCoin', 1],
    ['compass', 1, { cities: FORD_UP, level: 6 }],
    ['minerLamp', 1, { cities: ['ford'], level: 6 }],
    ['fish', 20, { cities: ['harbor'] }],
  ],
  trader: [
    ['honey', 26, { cities: ['valley'] }], ['cheese', 22, { cities: ['valley'] }],
    ['grainSack', 30, { cities: ['valley'] }], ['lumberBale', 22, { cities: ['valley'] }],
    ['oreCrate', 20, { cities: ['ford'] }], ['coalSack', 22, { cities: ['ford'] }],
    ['toolCrate', 8, { cities: ['ford'] }], ['salt', 26, { cities: ['ford'] }],
    ['fishBarrel', 20, { cities: ['harbor'] }], ['wine', 16, { cities: ['harbor'] }],
    ['spice', 12, { cities: ['harbor'] }], ['amber', 10, { cities: ['harbor'] }],
    ['silk', 8, { cities: ['harbor'], prosperity: 1 }], ['pearls', 5, { cities: ['harbor'], prosperity: 1 }],
    ['guildSeal', 1, { cities: ['harbor'], prosperity: 1, level: 10 }],
    ['ironRing', 1, { cities: FORD_UP, level: 5 }],
  ],
  apothecary: [
    ['herb', 40], ['resin', 20],
    ['rareHerb', 20, { prosperity: { valley: 1, ford: 0, harbor: 0 } }],
    ['mountainHerb', 10, { prosperity: { ford: 1, harbor: 0 } }],
    ['tannin', 10], ['glue', 10],
    ['concentrate', 4, { prosperity: { ford: 2, harbor: 1 } }],
    ['sickle', 2], ['steelSickle', 1, { cities: FORD_UP }],
  ],
  smith: [
    ['ore', 40], ['coal', 24, { prosperity: { valley: 1, ford: 0, harbor: 0 } }],
    ['copperOre', 20, { prosperity: { valley: 1, ford: 0, harbor: 0 } }],
    ['richOre', 20, { prosperity: { valley: 2, ford: 0, harbor: 0 } }],
    ['cobaltOre', 8, { prosperity: { ford: 2, harbor: 1 } }],
    ['ingot', 14], ['fastener', 20],
    ['copperIngot', 8, { cities: FORD_UP }], ['mechanism', 6, { cities: FORD_UP }],
    ['instruments', 6, { cities: FORD_UP }], ['coil', 6, { cities: FORD_UP }],
    ['steel', 8, { prosperity: { ford: 1, harbor: 0 } }],
    ['pickaxe', 2], ['axe', 2], ['knife', 2], ['sickle', 2],
    ['steelPickaxe', 1, { cities: FORD_UP }], ['steelAxe', 1, { cities: FORD_UP }], ['steelKnife', 1, { cities: FORD_UP }],
    ['masterPickaxe', 1, { prosperity: { ford: 2, harbor: 1 }, level: 11 }],
    ['masterAxe', 1, { prosperity: { ford: 2, harbor: 1 }, level: 11 }],
  ],
  carpenter: [
    ['wood', 40], ['resin', 20],
    ['hardwood', 20, { prosperity: { valley: 1, ford: 0, harbor: 0 } }],
    ['ancientWood', 8, { prosperity: { ford: 2, harbor: 1 } }],
    ['plank', 16], ['handle', 14], ['arrow', 10], ['cask', 6], ['torch', 8],
    ['beam', 6, { cities: FORD_UP }],
    ['axe', 2], ['steelAxe', 1, { cities: FORD_UP }],
  ],
  leatherworker: [
    ['hide', 40],
    ['fineHide', 20, { prosperity: { valley: 1, ford: 0, harbor: 0 } }],
    ['thickHide', 8, { prosperity: { ford: 2, harbor: 1 } }],
    ['leather', 14], ['strap', 14],
    ['reinforcedLeather', 6, { cities: FORD_UP }],
    ['knife', 2], ['steelKnife', 1, { cities: FORD_UP }], ['masterKnife', 1, { prosperity: { ford: 2, harbor: 1 }, level: 11 }],
  ],
  farmer: [
    ['wheat', 40], ['seed', 20], ['meat', 20],
    ['rye', 20, { prosperity: { valley: 1, ford: 0, harbor: 0 } }],
    ['saffron', 8, { prosperity: { ford: 2, harbor: 1 } }],
    ['flour', 16], ['salt', 8], ['honey', 8], ['cheese', 8],
    ['fish', 20, { cities: ['harbor'] }],
    ['grainMeal', 6, { cities: FORD_UP }],
    ['sickle', 2], ['steelSickle', 1, { cities: FORD_UP }],
  ],
  tailor: [
    ['flax', 40],
    ['silkFiber', 20, { prosperity: { valley: 1, ford: 0, harbor: 0 } }],
    ['wool', 14],
    ['cloth', 14], ['thread', 20],
    ['canvas', 8, { prosperity: { valley: 1, ford: 0, harbor: 0 } }],
    ['fineCloth', 6, { prosperity: { ford: 1, harbor: 0 } }],
    ['sickle', 2], ['steelSickle', 1, { cities: FORD_UP }], ['masterSickle', 1, { prosperity: { ford: 2, harbor: 1 }, level: 11 }],
  ],
  mason: [
    ['stone', 40],
    ['granite', 20, { prosperity: { valley: 1, ford: 0, harbor: 0 } }],
    ['marble', 8, { prosperity: { ford: 2, harbor: 1 } }],
    ['cutStone', 14], ['mortar', 20], ['whetstone', 8],
    ['stoneBlock', 6, { cities: FORD_UP }],
    ['pickaxe', 2], ['steelPickaxe', 1, { cities: FORD_UP }],
  ],
};

export const SHOP_ROLES = ['weaponsmith', 'armorer', 'grocer', 'trader', ...Object.keys(PROFESSIONS)];

/** Display names of shops by role. */
export const SHOP_NAMES = {
  weaponsmith: 'Оружейная лавка',
  armorer: 'Лавка бронника',
  grocer: 'Бакалея и дорожные припасы',
  trader: 'Купеческий двор',
  apothecary: 'Аптека',
  smith: 'Кузница',
  carpenter: 'Столярная мастерская',
  leatherworker: 'Кожевенная мастерская',
  farmer: 'Пекарня и амбар',
  tailor: 'Портняжная мастерская',
  mason: 'Камнерезный двор',
};

function staticEntries(role, cityKey) {
  const entries = [];
  for (const [itemId, target, options = {}] of STATIC_SHOPS[role] || []) {
    if (options.cities && !options.cities.includes(cityKey)) continue;
    let prosperity = options.prosperity ?? 0;
    if (typeof prosperity === 'object') {
      if (prosperity[cityKey] === undefined) continue;
      prosperity = prosperity[cityKey];
    }
    entries.push({ itemId, target, prosperity, level: options.level ?? 0 });
  }
  return entries;
}

function gearEntry(cityKey, itemId, tier, target) {
  const prosperity = prosperityForTier(cityKey, tier);
  if (prosperity === null) return null;
  return { itemId, target, prosperity, level: ITEMS[itemId].requiredLevel ?? 0 };
}

function weaponsmithEntries(cityKey) {
  const entries = [];
  for (const line of WEAPON_LINES) {
    line.rows.forEach(([itemId], index) => {
      const entry = gearEntry(cityKey, itemId, index + 1, 2);
      if (entry) entries.push(entry);
    });
  }
  const veteran = gearEntry(cityKey, 'veteranBlade', 4, 1);
  if (veteran) entries.push(veteran);
  return entries;
}

const ARMORER_EXTRAS = ['shield', 'ironShield', 'steelShield', 'towerShield', 'mithrilShield', 'travelCloak', 'wolfCloak', 'fieldCoat', 'stormCloak'];

function armorerEntries(cityKey) {
  const entries = [];
  for (const set of ARMOR_SETS) {
    for (const slot of ARMOR_SLOTS) {
      const entry = gearEntry(cityKey, set.ids[slot], set.tier, 2);
      if (entry) entries.push(entry);
    }
  }
  for (const itemId of ARMORER_EXTRAS) {
    const entry = gearEntry(cityKey, itemId, ITEMS[itemId].tier, 1);
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Cargo goods and recipe notes a profession master sells in a city. */
function masterExtras(profession, cityKey) {
  const entries = [];
  const cap = RECIPE_CITY_CAP[cityKey];
  for (const recipe of RECIPE_LIST) {
    if (recipe.profession !== profession) continue;
    const product = ITEMS[recipe.output];
    if (product.cat === 'cargo' || recipe.output === 'toolCrate') {
      const isAdvanced = product.tier >= 3;
      if (isAdvanced && cityKey === 'valley') continue;
      entries.push({ itemId: recipe.output, target: isAdvanced ? 2 : 4, prosperity: isAdvanced ? 1 : 0, level: 0 });
    }
    if (recipe.learn === 'note' && recipe.level <= cap) {
      entries.push({ itemId: noteIdFor(recipe.id), target: 1, prosperity: recipe.level >= 12 ? 1 : 0, level: 0 });
    }
  }
  return entries;
}

function buildShops() {
  const shops = {};
  for (const cityKey of ALL) {
    shops[cityKey] = {
      weaponsmith: weaponsmithEntries(cityKey),
      armorer: armorerEntries(cityKey),
      grocer: staticEntries('grocer', cityKey),
      trader: staticEntries('trader', cityKey),
    };
    for (const profession of Object.keys(PROFESSIONS)) {
      shops[cityKey][profession] = [...staticEntries(profession, cityKey), ...masterExtras(profession, cityKey)];
    }
  }
  return shops;
}

/** SHOPS[cityKey][role] = [{ itemId, target, prosperity, level }] */
export const SHOPS = buildShops();

function buildTargets() {
  const targets = {};
  for (const cityKey of ALL) {
    targets[cityKey] = {};
    for (const entries of Object.values(SHOPS[cityKey])) {
      for (const entry of entries) {
        targets[cityKey][entry.itemId] = Math.max(targets[cityKey][entry.itemId] || 0, entry.target);
      }
    }
  }
  return targets;
}

const SHOP_TARGETS = buildTargets();

/** Normal stock of an item in a city: the shop target, or a default by item kind. */
export function targetStock(cityKey, itemId) {
  return SHOP_TARGETS[cityKey]?.[itemId] ?? DEFAULT_TARGET[priceKind(itemId)];
}

/** True if some shop of the city sells the item (at any prosperity). */
export const isStocked = (cityKey, itemId) => SHOP_TARGETS[cityKey]?.[itemId] !== undefined;

/** City names in the locative case for news lines. */
export const CITY_LOCATIVE = {
  valley: 'В Тихой долине',
  ford: 'В Каменном Броде',
  harbor: 'В Янтарной Гавани',
};

/** Categories that market events can hit, with the genitive used in the news line. */
export const EVENT_CATEGORIES = {
  crop: 'зерна',
  meal: 'провизии',
  medicine: 'лекарств',
  metal: 'металла',
  ore: 'руды',
  timber: 'досок и бруса',
  wood: 'леса',
  hide: 'шкур',
  leather: 'кожи',
  cloth: 'тканей',
  stone: 'камня',
  trade: 'привозных товаров',
  weapon: 'оружия',
  armor: 'доспехов',
};

/** Market event kinds. */
export const MARKET_EVENTS = {
  shortage: { mult: 1.4, days: [2, 4], text: (city, goods) => `${city} не хватает ${goods} — цены выросли.` },
  surplus: { mult: 0.72, days: [2, 4], text: (city, goods) => `${city} избыток ${goods} — цены упали.` },
};

/** Chance that a new market event starts on a new day. */
export const EVENT_CHANCE = 0.3;
export const MAX_ACTIVE_EVENTS = 3;
