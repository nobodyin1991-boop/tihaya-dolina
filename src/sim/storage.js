// Personal stash kept by the `banker` NPC. One stash shared between all three cities. Pure.
// Slice `storage`: { items: { itemId: count }, slots: number, upgrades: number }
import { registerSlice, ok, fail } from './state.js';
import { emit } from '../core/events.js';
import { STACK, addItem, countItem, removeItem, roomFor, slotsFor } from './inventory.js';
import { spendCoins } from './player.js';

export const STORAGE_RULES = {
  baseSlots: 60,
  slotsPerUpgrade: 20,
  maxUpgrades: 5,
  upgradeBaseCost: 250,     // cost of upgrade n (1-based) = base × n
};

registerSlice('storage', {
  init: () => ({ items: {}, slots: STORAGE_RULES.baseSlots, upgrades: 0 }),
  migrate(slice) {
    if (!slice.items || typeof slice.items !== 'object') throw new Error('Повреждён склад');
    for (const [id, count] of Object.entries(slice.items)) {
      if (!Number.isInteger(count) || count <= 0) delete slice.items[id];
    }
    slice.upgrades = Number.isInteger(slice.upgrades) ? slice.upgrades : 0;
    slice.slots = STORAGE_RULES.baseSlots + slice.upgrades * STORAGE_RULES.slotsPerUpgrade;
    return slice;
  },
});

export const storedCount = (state, itemId) => state.storage.items[itemId] || 0;

export const storageUsedSlots = state => Object.values(state.storage.items).reduce((sum, count) => sum + slotsFor(count), 0);

export const storageFreeSlots = state => state.storage.slots - storageUsedSlots(state);

/** How many units of an item still fit into the stash. */
export function storageRoomFor(state, itemId) {
  const have = storedCount(state, itemId);
  const inPartial = have ? slotsFor(have) * STACK - have : 0;
  return inPartial + storageFreeSlots(state) * STACK;
}

/**
 * Move items from the bag to the stash.
 * @returns ok({itemId, count}) or fail(reason)
 */
export function deposit(state, itemId, count = 1) {
  if (!Number.isInteger(count) || count <= 0) return fail('Неверное количество');
  if (countItem(state, itemId) < count) return fail('В сумке нет столько предметов');
  if (storageRoomFor(state, itemId) < count) return fail('На складе нет места');
  removeItem(state, itemId, count);
  state.storage.items[itemId] = storedCount(state, itemId) + count;
  emit('storage:changed', { itemId, delta: count });
  return ok({ itemId, count });
}

/**
 * Move items from the stash to the bag.
 * @returns ok({itemId, count}) or fail(reason)
 */
export function withdraw(state, itemId, count = 1) {
  if (!Number.isInteger(count) || count <= 0) return fail('Неверное количество');
  if (storedCount(state, itemId) < count) return fail('На складе нет столько предметов');
  if (roomFor(state, itemId) < count) return fail('Сумка заполнена');
  const left = storedCount(state, itemId) - count;
  if (left > 0) state.storage.items[itemId] = left; else delete state.storage.items[itemId];
  addItem(state, itemId, count);
  emit('storage:changed', { itemId, delta: -count });
  return ok({ itemId, count });
}

/** Price of the next stash expansion, or null when fully expanded. */
export function storageUpgradeCost(state) {
  if (state.storage.upgrades >= STORAGE_RULES.maxUpgrades) return null;
  return STORAGE_RULES.upgradeBaseCost * (state.storage.upgrades + 1);
}

/** Buy +20 stash slots for coins. */
export function expandStorage(state) {
  const cost = storageUpgradeCost(state);
  if (cost === null) return fail('Склад уже расширен до предела');
  if (!spendCoins(state, cost)) return fail(`Нужно ${cost} монет`);
  state.storage.upgrades += 1;
  state.storage.slots += STORAGE_RULES.slotsPerUpgrade;
  emit('storage:changed', { itemId: null, delta: 0 });
  emit('toast', { text: `Склад расширен: ${state.storage.slots} ячеек`, kind: 'good' });
  return ok({ slots: state.storage.slots });
}
