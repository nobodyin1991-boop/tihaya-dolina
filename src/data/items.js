// Item registry. Catalog modules call registerItems() at import time; everything else reads ITEMS / item().
//
// Item schema:
//   { id, name, type, icon, rarity, value, desc, ... }
//   type   ∈ 'material' | 'consumable' | 'weapon' | 'armor' | 'tool' | 'bag' | 'trade' | 'quest' | 'note'
//   icon   — key from the icon vocabulary in CLAUDE.md
//   rarity ∈ 'common' | 'fine' | 'rare' | 'epic' | 'legendary'
//   value  — base price in coins (cities apply their own multipliers)
//   tier   — 1..6 rough power/progression tier (optional)
//   weapon: { slot:'weapon'|'offhand', weaponKind, classes:[classId], damage, requiredLevel }
//   armor:  { slot:'armor'|'helmet'|'gloves'|'boots'|'cloak'|'offhand'|'trinket', armor, hp?, requiredLevel, weight:'light'|'medium'|'heavy' }
//   consumable: { use:{ heal?, healOverTime?, buff?, cure? }, cooldownGroup }
export const ITEMS = {};

export function registerItems(map) {
  for (const [id, def] of Object.entries(map)) {
    if (ITEMS[id]) throw new Error(`Duplicate item id: ${id}`);
    ITEMS[id] = { id, type: 'material', icon: 'crate', rarity: 'common', value: 1, desc: '', ...def };
  }
}

/** Item definition or a visible placeholder for unknown ids (never throws — saves may hold retired ids). */
export const item = id => ITEMS[id] || { id, name: `‹${id}›`, type: 'material', icon: 'crate', rarity: 'common', value: 0, desc: '' };
export const itemName = id => item(id).name;
