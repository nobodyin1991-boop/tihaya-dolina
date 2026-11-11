// Crafting recipes of the seven professions. Pure data.
//
// Recipe schema:
//   { id, profession, level (1..15), inputs {itemId: n}, output, count, xp, time (sec),
//     learn: 'start' | 'trainer' | 'note', price, field? }
//   id      — equals the output item id (one recipe per product)
//   learn   — 'start': known as soon as the profession is chosen;
//             'trainer': bought from the profession master for `price` coins;
//             'note': learned by reading the note item `note_<id>` (sold by masters, found in chests)
//   field   — true: can be made anywhere; otherwise a workshop of the profession is required
import { ARMOR_SETS, ARMOR_SLOTS } from './items-gear.js';

const LEARN_PRICE_PER_LEVEL = 14;

/** Default profession xp for one craft of a recipe of this level. */
const defaultXp = level => 10 + level * 5;
/** Default crafting time in seconds. */
const defaultTime = level => Math.round(2 + level * 0.6);

/**
 * Compact rows: [output, level, learn, inputs, count = 1, extra = {}].
 * `extra` may override xp / time / price / field.
 */
const ROWS = {
  apothecary: [
    ['salve', 1, 'start', { herb: 3 }],
    ['bandage', 1, 'start', { herb: 2, cloth: 1 }, 2, { field: true }],
    ['herbalTea', 2, 'trainer', { herb: 3 }, 2, { field: true }],
    ['tannin', 2, 'trainer', { herb: 2, resin: 1 }, 2],
    ['glue', 2, 'trainer', { resin: 2, herb: 1 }, 2],
    ['antidote', 3, 'trainer', { rareHerb: 2, herb: 2 }],
    ['stypticPowder', 3, 'trainer', { rareHerb: 1, herb: 2 }, 2],
    ['herbalistKit', 4, 'trainer', { salve: 3, leather: 2, instruments: 1 }],
    ['medicineChest', 4, 'trainer', { salve: 4, bandage: 3, plank: 2 }],
    ['tonic', 5, 'trainer', { rareHerb: 4, herb: 3 }],
    ['weaponOil', 5, 'trainer', { resin: 2, rareHerb: 1 }, 2],
    ['staminaTonic', 6, 'trainer', { rareHerb: 2, mountainHerb: 1 }],
    ['surgeonKit', 6, 'note', { tonic: 2, reinforcedLeather: 1, instruments: 2 }],
    ['ironSkinSalve', 7, 'trainer', { mountainHerb: 2, tannin: 1 }],
    ['concentrate', 8, 'trainer', { mountainHerb: 3, rareHerb: 2 }, 2],
    ['focusDrops', 9, 'note', { mountainHerb: 2, concentrate: 1 }, 2],
    ['fieldkit', 10, 'trainer', { concentrate: 2, salve: 3 }],
    ['masterKit', 10, 'note', { fieldkit: 1, concentrate: 2, thickHide: 2, instruments: 2 }],
    ['fieldHospital', 10, 'note', { fieldkit: 2, medicineChest: 2, canvas: 2 }],
    ['swiftnessBrew', 11, 'note', { mountainHerb: 3, saffron: 1 }, 2],
    ['lunarExtract', 12, 'trainer', { moonHerb: 3, mountainHerb: 2 }, 2],
    ['lunarSalve', 13, 'note', { lunarExtract: 1, salve: 2 }, 2],
    ['lunarElixir', 15, 'note', { lunarExtract: 3, concentrate: 2 }, 2],
    ['lunarKit', 15, 'note', { lunarElixir: 1, elderLeather: 2, instruments: 3, lunarExtract: 2 }],
  ],

  smith: [
    ['ingot', 1, 'start', { ore: 3 }],
    ['fastener', 1, 'start', { ingot: 1 }, 3],
    ['sickle', 2, 'trainer', { ingot: 1, handle: 1 }],
    ['knife', 2, 'trainer', { ingot: 1, handle: 1 }],
    ['axe', 3, 'trainer', { ingot: 2, handle: 1 }],
    ['pickaxe', 3, 'trainer', { ingot: 2, handle: 1 }],
    ['copperIngot', 3, 'trainer', { copperOre: 3, coal: 1 }, 2],
    ['instruments', 4, 'trainer', { ingot: 1, copperIngot: 1 }],
    ['mechanism', 4, 'trainer', { ingot: 2, copperIngot: 1 }],
    ['coil', 4, 'trainer', { copperIngot: 2 }],
    ['toolCrate', 4, 'trainer', { ingot: 4, handle: 3, plank: 2 }],
    ['sword', 4, 'trainer', { ingot: 3, handle: 1, strap: 1 }],
    ['soldierClaymore', 4, 'trainer', { ingot: 5, handle: 1, strap: 1 }],
    ['ironTwins', 4, 'trainer', { ingot: 4, handle: 2, strap: 1 }],
    ['copperEmitter', 4, 'trainer', { coil: 2, mechanism: 1, handle: 1 }],
    ['ironShield', 5, 'trainer', { ingot: 4, plank: 2, strap: 1 }],
    ['steel', 5, 'trainer', { richOre: 3, coal: 2 }, 2],
    ['steelBlade', 6, 'trainer', { steel: 3, handle: 1, strap: 1 }],
    ['steelClaymore', 6, 'trainer', { steel: 4, handle: 1, strap: 1 }],
    ['steelTwins', 6, 'trainer', { steel: 3, handle: 2, strap: 1 }],
    ['steelAxe', 6, 'trainer', { steel: 2, handle: 1 }],
    ['steelPickaxe', 6, 'trainer', { steel: 2, handle: 1 }],
    ['steelSickle', 6, 'trainer', { steel: 1, handle: 1 }],
    ['steelKnife', 6, 'trainer', { steel: 1, handle: 1 }],
    ['lensEmitter', 7, 'note', { coil: 3, mechanism: 2, steel: 2 }],
    ['steelShield', 8, 'trainer', { steel: 4, strap: 2, plank: 2 }],
    ['cobaltSteel', 8, 'trainer', { cobaltOre: 3, coal: 3, copperOre: 2 }, 2],
    ['weaponCrate', 9, 'note', { steelBlade: 1, steel: 4, arrow: 4, plank: 3 }],
    ['masterBlade', 10, 'note', { cobaltSteel: 4, steel: 2, handle: 1 }],
    ['cobaltClaymore', 10, 'note', { cobaltSteel: 5, steel: 2, handle: 1 }],
    ['cobaltTwins', 10, 'note', { cobaltSteel: 4, steel: 2, handle: 2 }],
    ['cobaltEmitter', 10, 'note', { coil: 4, mechanism: 3, cobaltSteel: 2 }],
    ['towerShield', 11, 'note', { cobaltSteel: 4, beam: 1, strap: 2 }],
    ['masterAxe', 11, 'trainer', { cobaltSteel: 2, beam: 1 }],
    ['masterPickaxe', 11, 'trainer', { cobaltSteel: 2, beam: 1 }],
    ['masterSickle', 11, 'trainer', { cobaltSteel: 1, handle: 1 }],
    ['masterKnife', 11, 'trainer', { cobaltSteel: 1, handle: 1 }],
    ['mithril', 12, 'trainer', { mithrilOre: 3, coal: 2 }, 2],
    ['mithrilShield', 14, 'note', { mithril: 4, ironBeam: 1, strap: 2 }],
    ['mithrilBlade', 15, 'note', { mithril: 4, cobaltSteel: 2 }],
    ['mithrilClaymore', 15, 'note', { mithril: 5, cobaltSteel: 2 }],
    ['mithrilTwins', 15, 'note', { mithril: 4, cobaltSteel: 2, handle: 2 }],
    ['mithrilEmitter', 15, 'note', { coil: 4, mechanism: 3, mithril: 3 }],
  ],

  carpenter: [
    ['plank', 1, 'start', { wood: 3 }],
    ['handle', 1, 'start', { wood: 2 }],
    ['torch', 1, 'start', { wood: 1, resin: 1 }, 2, { field: true }],
    ['bow', 2, 'trainer', { wood: 3, thread: 2 }],
    ['arrow', 2, 'trainer', { wood: 1, fastener: 1 }, 2],
    ['cask', 3, 'trainer', { plank: 3, fastener: 1 }],
    ['shield', 3, 'trainer', { plank: 2, fastener: 2, strap: 1 }],
    ['spareWheel', 3, 'trainer', { plank: 3, fastener: 2 }],
    ['wagonKit', 4, 'trainer', { plank: 2, fastener: 2, glue: 1 }],
    ['huntBow', 4, 'trainer', { hardwood: 2, strap: 1, glue: 1 }],
    ['lightCrossbow', 4, 'trainer', { hardwood: 2, mechanism: 1, strap: 1 }],
    ['beam', 5, 'trainer', { hardwood: 4, resin: 2 }],
    ['longbow', 6, 'trainer', { hardwood: 5, beam: 1, glue: 1 }],
    ['steelCrossbow', 6, 'trainer', { beam: 1, mechanism: 2, steel: 1 }],
    ['carvedChest', 8, 'trainer', { ancientWood: 2, plank: 3, fastener: 2, glue: 1 }],
    ['bridgeKit', 10, 'note', { beam: 4, foundation: 1, fastener: 8, plank: 6 }],
    ['masterBow', 10, 'note', { ancientWood: 5, beam: 2, resin: 4 }],
    ['repeaterCrossbow', 10, 'note', { ancientWood: 3, mechanism: 3, cobaltSteel: 1 }],
    ['ironBeam', 12, 'trainer', { ironwood: 3, resin: 3 }],
    ['ironwoodBow', 15, 'note', { ironBeam: 3, ancientWood: 3, resin: 4 }],
    ['ironwoodCrossbow', 15, 'note', { ironBeam: 2, mechanism: 3, mithril: 1 }],
  ],

  leatherworker: [
    ['leather', 1, 'start', { hide: 3 }],
    ['strap', 1, 'start', { leather: 1 }, 2],
    ['pouch', 2, 'trainer', { leather: 2, strap: 1 }],
    ['hunterCharm', 3, 'trainer', { fang: 3, strap: 1 }],
    ['harnessSet', 4, 'trainer', { leather: 4, strap: 4, fastener: 2 }],
    ['bag', 4, 'trainer', { leather: 3, strap: 2, tannin: 1 }],
    ['wolfCloak', 5, 'trainer', { wolfPelt: 3, leather: 1, strap: 1 }],
    ['reinforcedLeather', 5, 'trainer', { fineHide: 3, hide: 2, tannin: 1 }],
    ['furBale', 6, 'trainer', { wolfPelt: 2, fineHide: 3, strap: 1 }],
    ['expeditionBag', 10, 'note', { thickHide: 4, reinforcedLeather: 3 }],
    ['elderLeather', 12, 'trainer', { pristineHide: 3, reinforcedLeather: 1 }],
    ['caravanPack', 14, 'note', { elderLeather: 3, thickHide: 3, strap: 4 }],
  ],

  farmer: [
    ['flour', 1, 'start', { wheat: 3 }, 2],
    ['flatbread', 1, 'start', { flour: 1 }, 2, { field: true }],
    ['roastMeat', 1, 'start', { meat: 1 }, 1, { field: true }],
    ['bread', 2, 'trainer', { flour: 2 }],
    ['fodder', 2, 'trainer', { wheat: 2, seed: 1 }, 2],
    ['stew', 3, 'trainer', { meat: 2, herb: 1 }, 1, { field: true }],
    ['driedMeat', 3, 'trainer', { meat: 2, salt: 1 }, 2],
    ['ration', 4, 'trainer', { bread: 1, driedMeat: 1, rareHerb: 1 }],
    ['provisionBarrel', 4, 'trainer', { bread: 3, driedMeat: 3, cask: 1 }],
    ['grainMeal', 5, 'trainer', { rye: 3, wheat: 2 }],
    ['honeyCake', 5, 'trainer', { flour: 2, honey: 1 }, 2],
    ['fishSoup', 6, 'trainer', { fish: 2, herb: 1 }],
    ['cheesePie', 6, 'trainer', { flour: 2, cheese: 1 }],
    ['trailMeal', 7, 'trainer', { grainMeal: 2, meat: 2 }, 2],
    ['ale', 8, 'trainer', { rye: 4, honey: 1 }, 2],
    ['feast', 10, 'note', { grainMeal: 3, trailMeal: 2 }, 2],
    ['guildProvisions', 10, 'note', { trailMeal: 3, provisionBarrel: 1, spice: 1 }],
    ['spicedMeal', 12, 'trainer', { saffron: 2, grainMeal: 2, meat: 2 }, 2],
    ['guildFeast', 15, 'note', { spicedMeal: 3, trailMeal: 2 }, 2],
  ],

  tailor: [
    ['cloth', 1, 'start', { flax: 3 }],
    ['thread', 1, 'start', { flax: 2 }],
    ['travelCloak', 3, 'trainer', { cloth: 3, thread: 2 }],
    ['canvas', 3, 'trainer', { cloth: 2, thread: 2 }],
    ['satchel', 3, 'trainer', { canvas: 2, thread: 2, strap: 1 }],
    ['tentBundle', 4, 'trainer', { canvas: 3, thread: 2, handle: 2 }],
    ['fineCloth', 7, 'trainer', { silkFiber: 3, thread: 1 }],
    ['fieldCoat', 9, 'note', { silkFiber: 5, canvas: 3, thread: 4 }],
    ['sailcloth', 10, 'note', { canvas: 4, fineCloth: 2, thread: 4 }],
    ['stormCloak', 11, 'note', { fineCloth: 4, canvas: 2, reinforcedLeather: 1 }],
    ['starCloth', 12, 'trainer', { starFlax: 3, thread: 2 }],
    ['starMantle', 15, 'note', { starCloth: 4, canvas: 2 }],
  ],

  mason: [
    ['cutStone', 1, 'start', { stone: 3 }],
    ['mortar', 1, 'start', { stone: 2 }],
    ['whetstone', 2, 'trainer', { stone: 2 }, 2],
    ['buildingStone', 3, 'trainer', { cutStone: 4, mortar: 2 }],
    ['stoneBlock', 3, 'trainer', { granite: 3, mortar: 1 }],
    ['millstone', 4, 'trainer', { granite: 2, cutStone: 2 }],
    ['milestone', 5, 'trainer', { stoneBlock: 2, cutStone: 2 }],
    ['furnaceLining', 6, 'trainer', { granite: 3, mortar: 2, coal: 1 }],
    ['marbleSlab', 8, 'trainer', { marble: 3 }],
    ['statuette', 8, 'note', { marble: 2 }],
    ['foundation', 9, 'trainer', { marble: 4, stoneBlock: 3, mortar: 3 }],
    ['amberPendant', 10, 'note', { amber: 1, copperIngot: 1, thread: 1 }],
    ['cutGem', 11, 'trainer', { roughGem: 1 }],
    ['basaltBlock', 12, 'trainer', { basalt: 3, mortar: 2 }],
    ['gemRing', 13, 'note', { cutGem: 1, mithril: 1 }],
    ['waystone', 15, 'note', { basaltBlock: 3, marble: 2 }],
  ],
};

/**
 * Armour-set recipes: one row makes four recipes (body, helmet, gloves, boots).
 * `main` is the base material, `extra` is added once per piece (twice for the body).
 * Body armour is learned one level later than the small pieces (or at `bodyLevel`).
 */
const SET_ROWS = [
  { set: 'light1', profession: 'tailor', level: 1, learn: 'trainer', main: 'cloth', extra: { thread: 1 } },
  { set: 'light2', profession: 'tailor', level: 4, learn: 'trainer', main: 'canvas', extra: { thread: 1 } },
  { set: 'light3', profession: 'tailor', level: 7, learn: 'trainer', main: 'fineCloth', extra: { canvas: 1 } },
  { set: 'light4', profession: 'tailor', level: 10, learn: 'note', main: 'fineCloth', extra: { canvas: 1, reinforcedLeather: 1 } },
  { set: 'light5', profession: 'tailor', level: 13, bodyLevel: 15, learn: 'note', main: 'starCloth', extra: { fineCloth: 1 } },
  { set: 'medium1', profession: 'leatherworker', level: 2, learn: 'trainer', main: 'leather', extra: { strap: 1 } },
  { set: 'medium2', profession: 'leatherworker', level: 4, learn: 'trainer', main: 'leather', extra: { fineHide: 1, tannin: 1 } },
  { set: 'medium3', profession: 'leatherworker', level: 7, learn: 'trainer', main: 'reinforcedLeather', extra: { leather: 1 } },
  { set: 'medium4', profession: 'leatherworker', level: 10, learn: 'note', main: 'reinforcedLeather', extra: { thickHide: 1 } },
  { set: 'medium5', profession: 'leatherworker', level: 13, bodyLevel: 15, learn: 'note', main: 'elderLeather', extra: { thickHide: 1 } },
  { set: 'heavy1', profession: 'smith', level: 2, learn: 'trainer', main: 'ingot', extra: { leather: 1 } },
  { set: 'heavy2', profession: 'smith', level: 4, learn: 'trainer', main: 'ingot', extra: { fastener: 2, strap: 1 } },
  { set: 'heavy3', profession: 'smith', level: 7, learn: 'trainer', main: 'steel', extra: { strap: 1 } },
  { set: 'heavy4', profession: 'smith', level: 10, learn: 'note', main: 'cobaltSteel', extra: { reinforcedLeather: 1 } },
  { set: 'heavy5', profession: 'smith', level: 13, bodyLevel: 15, learn: 'note', main: 'mithril', extra: { reinforcedLeather: 1 } },
];

/** Units of the main material per armour slot. */
const SET_MAIN_AMOUNT = { armor: 4, helmet: 2, gloves: 2, boots: 2 };

function buildRecipe(profession, [output, level, learn, inputs, count = 1, extra = {}]) {
  return {
    id: output,
    profession,
    level,
    inputs,
    output,
    count,
    xp: defaultXp(level),
    time: defaultTime(level),
    learn,
    price: learn === 'start' ? 0 : level * LEARN_PRICE_PER_LEVEL,
    field: false,
    ...extra,
  };
}

function buildSetRecipes(row) {
  const set = ARMOR_SETS.find(candidate => candidate.key === row.set);
  const recipes = [];
  for (const slot of ARMOR_SLOTS) {
    const isBody = slot === 'armor';
    const inputs = { [row.main]: SET_MAIN_AMOUNT[slot] };
    for (const [id, amount] of Object.entries(row.extra)) {
      inputs[id] = (inputs[id] || 0) + amount * (isBody ? 2 : 1);
    }
    const level = isBody ? (row.bodyLevel ?? row.level + 1) : row.level;
    recipes.push(buildRecipe(row.profession, [set.ids[slot], level, row.learn, inputs]));
  }
  return recipes;
}

function buildAll() {
  const list = [];
  for (const [profession, rows] of Object.entries(ROWS)) {
    for (const row of rows) list.push(buildRecipe(profession, row));
  }
  for (const row of SET_ROWS) list.push(...buildSetRecipes(row));
  return list;
}

/** All recipes as a flat list (sorted by profession, then level). */
export const RECIPE_LIST = buildAll().sort(
  (a, b) => a.profession.localeCompare(b.profession) || a.level - b.level,
);

/** Recipes by id. */
export const RECIPES = Object.fromEntries(RECIPE_LIST.map(recipe => [recipe.id, recipe]));

if (Object.keys(RECIPES).length !== RECIPE_LIST.length) {
  throw new Error('Duplicate recipe id in recipes.js');
}

/** Recipe definition or null. */
export const recipe = id => RECIPES[id] || null;

/** Recipes of one profession, ordered by level. */
export const recipesOf = profession => RECIPE_LIST.filter(entry => entry.profession === profession);

/** Id of the note item that teaches a `learn: 'note'` recipe. */
export const noteIdFor = recipeId => `note_${recipeId}`;
