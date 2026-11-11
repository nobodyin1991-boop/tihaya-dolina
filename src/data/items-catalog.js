// The full item catalog. Importing this module registers every item in data/items.js.
//
// Sources: items-materials.js (raw, intermediates, trophies, trade, cargo), items-gear.js
// (weapons, armour, shields, cloaks, trinkets, bags, tools), items-consumables.js (food, medicine)
// plus one generated recipe note per `learn: 'note'` recipe.
//
// Values of crafted items: the catalogs may leave `value` undefined; it is then derived as
// CRAFT_MARKUP × (sum of input values) / count. An explicit value of a crafted item is a floor,
// so a product is never worth less than what went into it.
import { registerItems, ITEMS } from './items.js';
import { MATERIAL_ITEMS, CARGO_GOOD_IDS, TRADE_GOOD_IDS } from './items-materials.js';
import { GEAR_ITEMS, UNIQUE_GEAR_IDS } from './items-gear.js';
import { CONSUMABLE_ITEMS } from './items-consumables.js';
import { RECIPES, RECIPE_LIST, noteIdFor } from './recipes.js';
import { PROFESSIONS } from './professions.js';

export { CARGO_GOOD_IDS, TRADE_GOOD_IDS, UNIQUE_GEAR_IDS };

/** Crafted product value relative to the value of its inputs. */
export const CRAFT_MARKUP = 1.2;

const NOTE_RARITY_BY_LEVEL = [
  [13, 'epic'],
  [9, 'rare'],
  [0, 'fine'],
];

function noteRarity(level) {
  for (const [minLevel, rarity] of NOTE_RARITY_BY_LEVEL) {
    if (level >= minLevel) return rarity;
  }
  return 'fine';
}

/** Build the note items that teach `learn: 'note'` recipes. */
function buildRecipeNotes(catalog) {
  const notes = {};
  for (const recipe of RECIPE_LIST) {
    if (recipe.learn !== 'note') continue;
    const product = catalog[recipe.output];
    const profession = PROFESSIONS[recipe.profession];
    notes[noteIdFor(recipe.id)] = {
      name: `Запись: ${product.name}`,
      type: 'note',
      icon: 'note',
      rarity: noteRarity(recipe.level),
      tier: Math.min(6, Math.ceil(recipe.level / 3)),
      cat: 'note',
      value: recipe.price,
      teaches: recipe.id,
      desc: `Рецепт для профессии «${profession.name}» (${recipe.level} ур.). Прочтите, чтобы выучить.`,
    };
  }
  return notes;
}

/** Fill in / raise the values of crafted items from their recipes (depth-first over inputs). */
function deriveCraftedValues(catalog) {
  const done = new Set();
  const visiting = new Set();

  function resolve(id) {
    const def = catalog[id];
    if (!def) throw new Error(`Recipe references unknown item: ${id}`);
    if (done.has(id)) return def.value;
    if (visiting.has(id)) throw new Error(`Recipe cycle at item: ${id}`);
    visiting.add(id);
    const recipe = RECIPES[id];
    if (recipe) {
      let inputValue = 0;
      for (const [inputId, amount] of Object.entries(recipe.inputs)) {
        inputValue += resolve(inputId) * amount;
      }
      const derived = Math.ceil((inputValue * CRAFT_MARKUP) / recipe.count);
      def.value = Math.max(def.value ?? 0, derived);
    } else if (def.value === undefined || def.value === null) {
      throw new Error(`Item without value and without recipe: ${id}`);
    }
    visiting.delete(id);
    done.add(id);
    return def.value;
  }

  for (const id of Object.keys(catalog)) resolve(id);
}

function buildCatalog() {
  const catalog = {};
  for (const source of [MATERIAL_ITEMS, GEAR_ITEMS, CONSUMABLE_ITEMS]) {
    for (const [id, def] of Object.entries(source)) {
      if (catalog[id]) throw new Error(`Duplicate item id across catalogs: ${id}`);
      catalog[id] = { ...def };
    }
  }
  deriveCraftedValues(catalog);
  Object.assign(catalog, buildRecipeNotes(catalog));
  return catalog;
}

const CATALOG = buildCatalog();
registerItems(CATALOG);

/** Ids of every item defined by this catalog. */
export const CATALOG_ITEM_IDS = Object.keys(CATALOG);

/** All registered items of a type ('weapon', 'armor', 'consumable', …). */
export const itemsOfType = type => Object.values(ITEMS).filter(def => def.type === type);

/** Ids of note items that teach recipes. */
export const RECIPE_NOTE_IDS = CATALOG_ITEM_IDS.filter(id => CATALOG[id].teaches);
