// Inventory slice: bag contents, equipment. Pure.
// The bag is a map itemId -> count; capacity is measured in slots, a slot holds STACK units.
import { registerSlice, ok, fail } from './state.js';
import { emit } from '../core/events.js';

export const STACK = 99;
export const BASE_SLOTS = 28;
/** Equipment slot ids. */
export const EQUIP_SLOTS = ['weapon', 'offhand', 'armor', 'helmet', 'gloves', 'boots', 'cloak', 'bag', 'tool', 'trinket'];

registerSlice('inv', {
  init: () => ({ items: {}, equip: Object.fromEntries(EQUIP_SLOTS.map(s => [s, null])), extraSlots: 0 }),
  migrate(inv) {
    if (!inv.items || typeof inv.items !== 'object') throw new Error('Повреждён инвентарь');
    for (const [id, n] of Object.entries(inv.items)) if (!Number.isInteger(n) || n <= 0) delete inv.items[id];
    inv.equip ??= {};
    for (const s of EQUIP_SLOTS) inv.equip[s] ??= null;
    inv.extraSlots ??= 0;
    return inv;
  },
});

export const countItem = (state, id) => state.inv.items[id] || 0;
export const slotsFor = n => Math.ceil(n / STACK);
export const usedSlots = state => Object.values(state.inv.items).reduce((sum, n) => sum + slotsFor(n), 0);
/** Total bag capacity in slots. Systems that grant slots (bags) add to inv.extraSlots. */
export const totalSlots = state => BASE_SLOTS + (state.inv.extraSlots || 0);
export const freeSlots = state => totalSlots(state) - usedSlots(state);

/** How many units of `id` still fit. */
export function roomFor(state, id) {
  const have = countItem(state, id);
  const inPartial = have ? slotsFor(have) * STACK - have : 0;
  return inPartial + freeSlots(state) * STACK;
}

/** Add up to `n` units. Returns the number actually added (0 if the bag is full). */
export function addItem(state, id, n = 1) {
  const add = Math.min(n, roomFor(state, id));
  if (add <= 0) return 0;
  state.inv.items[id] = countItem(state, id) + add;
  emit('inv:changed', { id, delta: add });
  return add;
}

/** Remove exactly `n` units; returns false (and removes nothing) if there are fewer. */
export function removeItem(state, id, n = 1) {
  const have = countItem(state, id);
  if (have < n) return false;
  if (have === n) delete state.inv.items[id]; else state.inv.items[id] = have - n;
  emit('inv:changed', { id, delta: -n });
  return true;
}

/** True if the bag holds every {id: count} of `need`. */
export const hasItems = (state, need) => Object.entries(need).every(([id, n]) => countItem(state, id) >= n);

/** Remove a whole {id: count} bundle atomically. */
export function removeItems(state, need) {
  if (!hasItems(state, need)) return fail('Не хватает предметов');
  for (const [id, n] of Object.entries(need)) removeItem(state, id, n);
  return ok();
}

/** Can the whole {id: count} bundle be added? */
export function canAddItems(state, bundle) {
  let slots = freeSlots(state);
  for (const [id, n] of Object.entries(bundle)) {
    const have = countItem(state, id);
    slots -= slotsFor(have + n) - slotsFor(have);
  }
  return slots >= 0;
}
