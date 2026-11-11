// Equipment actions: equip / unequip with class and level restrictions, bags, starter kits. Pure.
// Works on the `inv` slice owned by inventory.js (inv.equip, inv.extraSlots).
import '../data/items-catalog.js';
import { ok, fail } from './state.js';
import { emit } from '../core/events.js';
import { ITEMS } from '../data/items.js';
import { CLASSES } from '../data/classes.js';
import { EQUIP_SLOTS, STACK, addItem, countItem, removeItem, freeSlots, usedSlots, totalSlots } from './inventory.js';

/** Slot an item goes to, or null if it cannot be equipped. */
export function equipSlotOf(itemId) {
  const def = ITEMS[itemId];
  if (!def || !def.slot || !EQUIP_SLOTS.includes(def.slot)) return null;
  return def.slot;
}

/**
 * May the hero wear the item? ok({slot}) or fail(reason). Does not check the bag.
 */
export function canEquip(state, itemId) {
  const def = ITEMS[itemId];
  const slot = equipSlotOf(itemId);
  if (!def || !slot) return fail('Это нельзя надеть');
  const classId = state.player.classId;
  if (def.classes && !def.classes.includes(classId)) {
    const className = CLASSES[classId]?.name || 'ваш класс';
    return fail(`${className} не может это использовать`);
  }
  if (def.requiredLevel && state.player.level < def.requiredLevel) {
    return fail(`Нужен уровень ${def.requiredLevel}`);
  }
  return ok({ slot });
}

const bagSlots = itemId => ITEMS[itemId]?.slots || 0;

/**
 * Equip an item from the bag. The previously worn item returns to the bag.
 * @returns ok({slot, replaced}) or fail(reason)
 */
export function equip(state, itemId) {
  if (countItem(state, itemId) < 1) return fail('Предмета нет в сумке');
  const check = canEquip(state, itemId);
  if (!check.ok) return check;
  const slot = check.slot;
  const replaced = state.inv.equip[slot];
  if (replaced === itemId) return fail('Уже надето');

  // The swap must fit: the worn item comes back to the bag, and a smaller bag shrinks it.
  const capacityAfter = totalSlots(state) + (slot === 'bag' ? bagSlots(itemId) - bagSlots(replaced) : 0);
  const freesStack = countItem(state, itemId) === 1;
  const needsStack = !!replaced && countItem(state, replaced) % STACK === 0;
  const stacksAfter = usedSlots(state) - (freesStack ? 1 : 0) + (needsStack ? 1 : 0);
  if (stacksAfter > capacityAfter) return fail('Сначала освободите место в сумке');

  removeItem(state, itemId, 1);
  state.inv.equip[slot] = itemId;
  if (slot === 'bag') state.inv.extraSlots += bagSlots(itemId) - bagSlots(replaced);
  if (replaced) addItem(state, replaced, 1);
  emit('equip:changed', { slot, itemId, replaced: replaced || null });
  return ok({ slot, replaced: replaced || null });
}

/**
 * Take an item off into the bag.
 * @returns ok({slot, itemId}) or fail(reason)
 */
export function unequip(state, slot) {
  const itemId = state.inv.equip[slot];
  if (!itemId) return fail('Слот пуст');
  const needsNewStack = countItem(state, itemId) % STACK === 0;
  const lostSlots = slot === 'bag' ? bagSlots(itemId) : 0;
  if (freeSlots(state) - lostSlots < (needsNewStack ? 1 : 0)) return fail('Сумка заполнена');
  state.inv.equip[slot] = null;
  if (lostSlots) state.inv.extraSlots = Math.max(0, state.inv.extraSlots - lostSlots);
  addItem(state, itemId, 1);
  emit('equip:changed', { slot, itemId: null, replaced: itemId });
  return ok({ slot, itemId });
}

/** Equipment as [{slot, itemId, def}] for the UI. */
export function equipmentList(state) {
  return EQUIP_SLOTS.map(slot => {
    const itemId = state.inv.equip[slot];
    return { slot, itemId, def: itemId ? ITEMS[itemId] : null };
  });
}

/** Is `itemId` better than what is worn in its slot? (simple score: damage + armor + tier) */
export function isUpgrade(state, itemId) {
  const check = canEquip(state, itemId);
  if (!check.ok) return false;
  const score = id => {
    const def = ITEMS[id];
    if (!def) return -1;
    return (def.damage || 0) * 3 + (def.armor || 0) * 2 + (def.slots || 0) + (def.tier || 0);
  };
  return score(itemId) > score(state.inv.equip[check.slot]);
}

const COMMON_STARTER_BAG = { flatbread: 3, bandage: 2, torch: 1 };

/**
 * Starting equipment per class: worn items and bag contents.
 * The new-game flow calls grantStarterKit(state) once after createState().
 */
export const STARTER_KITS = {
  warrior: { equip: ['ironClaymore', 'militiaCoat'], bag: COMMON_STARTER_BAG },
  guardian: { equip: ['trainingBlade', 'shield', 'militiaCoat'], bag: COMMON_STARTER_BAG },
  scientist: { equip: ['fieldEmitter', 'paddedVest', 'clothShoes'], bag: { ...COMMON_STARTER_BAG, salve: 1 } },
  duelist: { equip: ['pairedKnives', 'vest', 'walkingBoots'], bag: COMMON_STARTER_BAG },
  archer: { equip: ['bow', 'vest', 'walkingBoots'], bag: COMMON_STARTER_BAG },
  medic: { equip: ['fieldSatchel', 'paddedVest', 'clothShoes'], bag: { ...COMMON_STARTER_BAG, salve: 2 } },
  engineer: { equip: ['handCrossbow', 'vest', 'walkingBoots'], bag: COMMON_STARTER_BAG },
};

/** Give and wear the class starter kit (idempotent per slot: occupied slots are left alone). */
export function grantStarterKit(state) {
  const kit = STARTER_KITS[state.player.classId] || STARTER_KITS.warrior;
  for (const itemId of kit.equip) {
    const slot = equipSlotOf(itemId);
    if (slot && !state.inv.equip[slot]) state.inv.equip[slot] = itemId;
  }
  for (const [itemId, count] of Object.entries(kit.bag)) addItem(state, itemId, count);
  emit('equip:changed', { slot: null, itemId: null, replaced: null });
  return ok({ kit });
}
