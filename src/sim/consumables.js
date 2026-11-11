// Using items: food, medicine, combat supplies, recipe notes. Pure.
// Slice `consum`: {
//   readyAt: { food, medicine, gear }   — game-time second when each cooldown group is ready
//   buffs:   [{ id, name, stat, value, until }] — timed bonuses from consumables (game seconds)
// }
// Time is passed in by the engine as `nowSeconds` (monotonic game time, e.g. player.playSeconds).
import '../data/items-catalog.js';
import { registerSlice, ok, fail } from './state.js';
import { emit } from '../core/events.js';
import { ITEMS } from '../data/items.js';
import { countItem, removeItem } from './inventory.js';
import { derivedStats } from './stats.js';
import { learnRecipe, addProfessionXp } from './crafting.js';

/** Cooldown of each group in seconds. */
export const COOLDOWNS = { food: 15, medicine: 10, gear: 2 };

/** «Крепкий едок»: food buffs last this many times the perk's foodBonus longer. */
const FOOD_BUFF_DURATION_FACTOR = 2;

registerSlice('consum', {
  init: () => ({ readyAt: {}, buffs: [] }),
  migrate(slice) {
    if (typeof slice.readyAt !== 'object' || slice.readyAt === null) slice.readyAt = {};
    if (!Array.isArray(slice.buffs)) slice.buffs = [];
    slice.buffs = slice.buffs.filter(buff => buff && typeof buff.stat === 'string' && Number.isFinite(buff.value) && Number.isFinite(buff.until));
    return slice;
  },
});

/** Seconds until a cooldown group is ready (0 = ready). */
export function cooldownLeft(state, group, nowSeconds) {
  return Math.max(0, (state.consum.readyAt[group] || 0) - nowSeconds);
}

/** Drop expired consumable buffs and return the active ones (for buff icons; derivedStats applies them itself). */
export function activeBuffs(state, nowSeconds) {
  const slice = state.consum;
  if (slice.buffs.some(buff => buff.until <= nowSeconds)) {
    slice.buffs = slice.buffs.filter(buff => buff.until > nowSeconds);
    emit('buffs:changed', {});
  }
  return slice.buffs;
}

function applyBuff(state, buff, duration, nowSeconds) {
  const slice = state.consum;
  slice.buffs = slice.buffs.filter(active => active.id !== buff.id);
  slice.buffs.push({ id: buff.id, name: buff.name, stat: buff.stat, value: buff.value, until: nowSeconds + duration });
  emit('buffs:changed', {});
}

function useNote(state, itemId, def) {
  if (def.teaches) {
    const learned = learnRecipe(state, def.teaches, { from: 'note' });
    if (!learned.ok) return learned;
    removeItem(state, itemId, 1);
    return ok({ effects: [{ type: 'recipe', recipeId: def.teaches }] });
  }
  if (def.professionXp) {
    const professionId = state.craft.main;
    if (!professionId) return fail('Сначала выберите профессию у мастера');
    removeItem(state, itemId, 1);
    addProfessionXp(state, professionId, def.professionXp);
    emit('toast', { text: `Опыт профессии +${def.professionXp}`, kind: 'good' });
    return ok({ effects: [{ type: 'professionXp', professionId, amount: def.professionXp }] });
  }
  return fail('Здесь нечего читать');
}

/**
 * Use one unit of an item. The engine owns the live hp / stamina, so nothing is healed here:
 * the effects are returned for the engine to apply. Timed buffs are the exception — they are
 * stored in consum.buffs and derivedStats() applies them by itself while they last.
 * @param {number} nowSeconds game time
 * @param {{hp?:number}} [options] hp — the hero's live hp; when given, pure healing items are
 *        refused at full health instead of being wasted
 * @returns ok({ effects: [
 *     { type:'heal', amount }                     — instant hp
 *     { type:'hot', amount, duration }            — heal `amount` evenly over `duration` s
 *     { type:'stamina', amount }
 *     { type:'cure', statuses:[statusId] }
 *     { type:'timed-buff', id, name, stat, value, duration } — informational (already applied via derivedStats)
 *   ], cooldownGroup, cooldown }) or fail(reason)
 */
export function useItem(state, itemId, nowSeconds = 0, options = {}) {
  const def = ITEMS[itemId];
  if (!def || countItem(state, itemId) < 1) return fail('Предмета нет в сумке');
  if (def.type === 'note') return useNote(state, itemId, def);
  if (def.type !== 'consumable' || !def.use) return fail('Этот предмет нельзя использовать');

  const group = def.cooldownGroup || 'medicine';
  const wait = cooldownLeft(state, group, nowSeconds);
  if (wait > 0) return fail(`Ещё рано: ${Math.ceil(wait)} с`);

  const use = def.use;
  activeBuffs(state, nowSeconds);
  const stats = derivedStats(state, { now: nowSeconds });
  const isFood = group === 'food';
  const healScale = isFood ? 1 + stats.foodBonus : stats.healPower;
  const onlyHeals = !use.buff && !use.cure && !use.stamina;
  if (onlyHeals && Number.isFinite(options.hp) && options.hp >= stats.maxHp) return fail('Здоровье уже полное');

  removeItem(state, itemId, 1);
  const effects = [];
  if (use.heal) effects.push({ type: 'heal', amount: Math.round(use.heal * healScale) });
  if (use.healOverTime) {
    effects.push({ type: 'hot', amount: Math.round(use.healOverTime.amount * healScale), duration: use.healOverTime.duration });
  }
  if (use.stamina) effects.push({ type: 'stamina', amount: use.stamina });
  if (use.cure?.length) effects.push({ type: 'cure', statuses: [...use.cure] });
  if (use.buff) {
    const stretch = isFood ? 1 + stats.foodBonus * FOOD_BUFF_DURATION_FACTOR : 1;
    const duration = Math.round(use.buff.duration * stretch);
    applyBuff(state, use.buff, duration, nowSeconds);
    effects.push({ type: 'timed-buff', id: use.buff.id, name: use.buff.name, stat: use.buff.stat, value: use.buff.value, duration });
  }

  const cooldown = def.cooldown ?? COOLDOWNS[group] ?? 0;
  state.consum.readyAt[group] = nowSeconds + cooldown;
  return ok({ effects, cooldownGroup: group, cooldown });
}

/** Can the item be used from the bag at all (for UI "use" buttons)? */
export function isUsable(itemId) {
  const def = ITEMS[itemId];
  if (!def) return false;
  if (def.type === 'consumable') return !!def.use;
  return def.type === 'note' && !!(def.teaches || def.professionXp);
}
