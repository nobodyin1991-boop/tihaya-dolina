// Professions and crafting. Pure.
// Slice `craft`: {
//   main: professionId|null, second: professionId|null, secondSlot: boolean,
//   xp: { professionId: number }, known: [recipeId]
// }
import '../data/items-catalog.js';
import { registerSlice, ok, fail } from './state.js';
import { emit } from '../core/events.js';
import { ITEMS, itemName } from '../data/items.js';
import { RECIPES, recipesOf } from '../data/recipes.js';
import {
  PROFESSIONS, PROFESSION_IDS, PROFESSION_MAX_LEVEL, SECOND_PROFESSION, RECIPE_CITY_CAP,
  professionProgress, craftXpFactor,
} from '../data/professions.js';
import { addItem, countItem, hasItems, removeItem, roomFor } from './inventory.js';
import { spendCoins } from './player.js';
import { derivedStats } from './stats.js';

registerSlice('craft', {
  init: () => ({ main: null, second: null, secondSlot: false, xp: {}, known: [] }),
  migrate(slice) {
    if (!Array.isArray(slice.known) || typeof slice.xp !== 'object' || slice.xp === null) {
      throw new Error('Повреждены данные ремесла');
    }
    if (slice.main && !PROFESSIONS[slice.main]) slice.main = null;
    if (slice.second && !PROFESSIONS[slice.second]) slice.second = null;
    slice.secondSlot = !!slice.secondSlot || !!slice.second;
    slice.known = slice.known.filter(id => RECIPES[id]);
    for (const [id, xp] of Object.entries(slice.xp)) {
      if (!PROFESSIONS[id] || !Number.isFinite(xp) || xp < 0) delete slice.xp[id];
    }
    return slice;
  },
});

/** Professions the hero has, main first. */
export const heroProfessions = state => [state.craft.main, state.craft.second].filter(Boolean);

export const hasProfession = (state, professionId) => heroProfessions(state).includes(professionId);

/** {level, current, required} of a profession (level 1 with no xp). */
export const professionInfo = (state, professionId) => professionProgress(state.craft.xp[professionId] || 0);

export const professionLevel = (state, professionId) => professionInfo(state, professionId).level;

export const knowsRecipe = (state, recipeId) => state.craft.known.includes(recipeId);

function learnStartRecipes(state, professionId) {
  for (const recipe of recipesOf(professionId)) {
    if (recipe.learn === 'start' && !knowsRecipe(state, recipe.id)) state.craft.known.push(recipe.id);
  }
}

/**
 * Take a profession: the main one if the hero has none, otherwise the bought second slot.
 * @returns ok({slot:'main'|'second'}) or fail(reason)
 */
export function chooseProfession(state, professionId) {
  const profession = PROFESSIONS[professionId];
  if (!profession) return fail('Неизвестная профессия');
  if (hasProfession(state, professionId)) return fail('Вы уже владеете этой профессией');
  let slot;
  if (!state.craft.main) {
    slot = 'main';
  } else if (state.craft.secondSlot && !state.craft.second) {
    slot = 'second';
  } else if (!state.craft.secondSlot) {
    return fail(`Вторую профессию можно взять с ${SECOND_PROFESSION.level} уровня за ${SECOND_PROFESSION.coins} монет`);
  } else {
    return fail('Обе профессии уже выбраны');
  }
  state.craft[slot] = professionId;
  state.craft.xp[professionId] ??= 0;
  learnStartRecipes(state, professionId);
  emit('toast', { text: `Новая профессия: ${profession.name}`, kind: 'good' });
  return ok({ slot });
}

/** Buy the second profession slot (level and coins from SECOND_PROFESSION). */
export function buySecondProfessionSlot(state) {
  if (state.craft.secondSlot) return fail('Второе ремесло уже открыто');
  if (!state.craft.main) return fail('Сначала выберите основную профессию');
  if (state.player.level < SECOND_PROFESSION.level) return fail(`Нужен уровень ${SECOND_PROFESSION.level}`);
  if (!spendCoins(state, SECOND_PROFESSION.coins)) return fail(`Нужно ${SECOND_PROFESSION.coins} монет`);
  state.craft.secondSlot = true;
  emit('toast', { text: 'Открыто второе ремесло — выберите его у мастера', kind: 'good' });
  return ok();
}

/** Add profession xp; returns the new level if it changed, else 0. */
export function addProfessionXp(state, professionId, amount) {
  if (!hasProfession(state, professionId) || !(amount > 0)) return 0;
  const before = professionLevel(state, professionId);
  state.craft.xp[professionId] = (state.craft.xp[professionId] || 0) + Math.round(amount);
  const after = professionLevel(state, professionId);
  if (after > before) {
    emit('toast', { text: `${PROFESSIONS[professionId].name}: уровень ${after}`, kind: 'good' });
    return after;
  }
  return 0;
}

/** Why a recipe cannot be learned right now (null = it can). Does not check coins. */
function learnObstacle(state, recipe) {
  if (!hasProfession(state, recipe.profession)) return `Нужна профессия «${PROFESSIONS[recipe.profession].name}»`;
  if (knowsRecipe(state, recipe.id)) return 'Рецепт уже изучен';
  const level = professionLevel(state, recipe.profession);
  if (level < recipe.level) return `Нужен уровень профессии ${recipe.level} (сейчас ${level})`;
  return null;
}

/**
 * Learn a recipe.
 * @param {object} [options]
 * @param {'trainer'|'note'|'free'} [options.from] trainer: pay the price at the master (default);
 *        note: learned from a note item (no payment); free: quest reward.
 * @param {string} [options.cityKey] city of the master (limits the recipe level he teaches)
 */
export function learnRecipe(state, recipeId, options = {}) {
  const recipe = RECIPES[recipeId];
  if (!recipe) return fail('Неизвестный рецепт');
  const from = options.from || 'trainer';
  const obstacle = learnObstacle(state, recipe);
  if (obstacle) return fail(obstacle);
  if (from === 'trainer') {
    if (recipe.learn === 'note') return fail('Этому учат только по записям');
    if (options.cityKey && recipe.level > RECIPE_CITY_CAP[options.cityKey]) {
      return fail('Здешний мастер этому не учит — спросите в городе покрупнее');
    }
    if (!spendCoins(state, recipe.price)) return fail(`Нужно ${recipe.price} монет`);
  }
  state.craft.known.push(recipeId);
  emit('toast', { text: `Изучен рецепт: ${itemName(recipe.output)}`, kind: 'good' });
  return ok({ recipeId });
}

function stationMatches(atStation, profession) {
  if (atStation === true) return true;
  if (Array.isArray(atStation)) return atStation.includes(profession);
  return atStation === profession;
}

/** A copy of the bag used to test "will the product fit once the inputs are gone". */
function bagAfterInputs(state, inputs, times) {
  const items = { ...state.inv.items };
  for (const [id, amount] of Object.entries(inputs)) {
    const left = (items[id] || 0) - amount * times;
    if (left > 0) items[id] = left; else delete items[id];
  }
  return { inv: { ...state.inv, items } };
}

/** How many times the inputs in the bag allow the recipe to be made. */
function maxByInputs(state, recipe) {
  let times = Infinity;
  for (const [id, amount] of Object.entries(recipe.inputs)) {
    times = Math.min(times, Math.floor(countItem(state, id) / amount));
  }
  return times;
}

/**
 * Can the recipe be crafted now?
 * @param {object} [options]
 * @param {true|string|string[]} [options.atStation] true (any workshop) or the profession id(s)
 *        of the workshop the hero stands at; omit when in the field
 * @returns ok({maxCount, time, xp}) or fail(reason)
 */
export function craftable(state, recipeId, options = {}) {
  const recipe = RECIPES[recipeId];
  if (!recipe) return fail('Неизвестный рецепт');
  const profession = PROFESSIONS[recipe.profession];
  if (!hasProfession(state, recipe.profession)) return fail(`Нужна профессия «${profession.name}»`);
  if (!knowsRecipe(state, recipeId)) return fail('Рецепт не изучен');
  const level = professionLevel(state, recipe.profession);
  if (level < recipe.level) return fail(`Нужен уровень профессии ${recipe.level}`);
  if (!recipe.field && !stationMatches(options.atStation, recipe.profession)) {
    return fail(`Нужна мастерская: ${profession.station}`);
  }
  if (!hasItems(state, recipe.inputs)) {
    const missing = Object.entries(recipe.inputs)
      .filter(([id, amount]) => countItem(state, id) < amount)
      .map(([id, amount]) => `${itemName(id)} ×${amount - countItem(state, id)}`);
    return fail(`Не хватает: ${missing.join(', ')}`);
  }
  if (roomFor(bagAfterInputs(state, recipe.inputs, 1), recipe.output) < recipe.count) return fail('Сумка заполнена');
  const xp = Math.max(1, Math.round(recipe.xp * craftXpFactor(level - recipe.level)));
  return ok({ maxCount: maxByInputs(state, recipe), time: recipe.time, xp });
}

/**
 * Craft a recipe `count` times (the engine runs the progress bar for `time` seconds first).
 * @param {object} [options] { atStation, count = 1, rng }
 * @returns ok({itemId, count, crafted, xp, time, saved, level}) or fail(reason)
 *   count — units of the product added; crafted — how many times the recipe ran;
 *   saved — runs whose materials were kept by «Бережливый мастер».
 */
export function craft(state, recipeId, options = {}) {
  const check = craftable(state, recipeId, options);
  if (!check.ok) return check;
  const recipe = RECIPES[recipeId];
  const rng = options.rng || Math.random;
  const stats = derivedStats(state);
  const times = Math.max(1, Math.min(options.count || 1, check.maxCount));

  let crafted = 0;
  let produced = 0;
  let saved = 0;
  let xp = 0;
  for (let run = 0; run < times; run++) {
    if (!hasItems(state, recipe.inputs)) break;
    if (roomFor(bagAfterInputs(state, recipe.inputs, 1), recipe.output) < recipe.count) break;
    if (stats.craftSaveChance > 0 && rng() < stats.craftSaveChance) {
      saved++;
    } else {
      for (const [id, amount] of Object.entries(recipe.inputs)) removeItem(state, id, amount);
    }
    produced += addItem(state, recipe.output, recipe.count);
    crafted++;
    const level = professionLevel(state, recipe.profession);
    const gained = Math.max(1, Math.round(recipe.xp * craftXpFactor(level - recipe.level) * (1 + stats.craftXpMult)));
    xp += gained;
    addProfessionXp(state, recipe.profession, gained);
  }
  if (crafted === 0) return fail('Сумка заполнена');

  emit('craft:done', { recipeId, itemId: recipe.output, count: produced });
  emit('toast', { text: `Изготовлено: ${itemName(recipe.output)} ×${produced}`, kind: 'info' });
  return ok({
    itemId: recipe.output,
    count: produced,
    crafted,
    xp,
    time: recipe.time * crafted,
    saved,
    level: professionLevel(state, recipe.profession),
  });
}

/**
 * Recipe book of a profession for the UI.
 * @returns [{ recipe, known, canCraft, reason, trivial }] ordered by level
 */
export function recipeBook(state, professionId, options = {}) {
  const level = professionLevel(state, professionId);
  return recipesOf(professionId).map(recipe => {
    const known = knowsRecipe(state, recipe.id);
    const check = known ? craftable(state, recipe.id, options) : fail('Рецепт не изучен');
    return {
      recipe,
      known,
      canCraft: check.ok,
      reason: check.ok ? null : check.reason,
      trivial: craftXpFactor(level - recipe.level) < 1,
    };
  });
}

/**
 * What a profession master offers to teach in a city: professions to take and trainer recipes.
 * @returns [{ kind:'profession'|'second-slot'|'recipe', id, name, desc, cost:{coins, lp:0}, locked? }]
 */
export function masterTraining(state, professionId, cityKey) {
  const profession = PROFESSIONS[professionId];
  if (!profession) return [];
  const offers = [];
  if (!hasProfession(state, professionId)) {
    let locked;
    if (state.craft.main && !state.craft.secondSlot) locked = 'Нужно открыть второе ремесло';
    else if (state.craft.main && state.craft.second) locked = 'Обе профессии уже выбраны';
    offers.push({ kind: 'profession', id: professionId, name: profession.name, desc: profession.desc, cost: { coins: 0, lp: 0 }, locked });
    if (state.craft.main && !state.craft.secondSlot) {
      let slotLocked;
      if (state.player.level < SECOND_PROFESSION.level) slotLocked = `Нужен уровень ${SECOND_PROFESSION.level}`;
      else if (state.player.coins < SECOND_PROFESSION.coins) slotLocked = `Нужно ${SECOND_PROFESSION.coins} монет`;
      offers.push({
        kind: 'second-slot', id: 'second-slot', name: 'Второе ремесло',
        desc: 'Право освоить вторую профессию.',
        cost: { coins: SECOND_PROFESSION.coins, lp: 0 }, locked: slotLocked,
      });
    }
    return offers;
  }
  const cap = RECIPE_CITY_CAP[cityKey] ?? PROFESSION_MAX_LEVEL;
  for (const recipe of recipesOf(professionId)) {
    if (recipe.learn !== 'trainer' || knowsRecipe(state, recipe.id) || recipe.level > cap) continue;
    let locked = learnObstacle(state, recipe);
    if (!locked && state.player.coins < recipe.price) locked = `Нужно ${recipe.price} монет`;
    offers.push({
      kind: 'recipe',
      id: recipe.id,
      name: itemName(recipe.output),
      desc: ITEMS[recipe.output].desc,
      level: recipe.level,
      cost: { coins: recipe.price, lp: 0 },
      locked: locked || undefined,
    });
  }
  return offers;
}

export { PROFESSION_IDS };
