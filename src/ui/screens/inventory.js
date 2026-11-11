// Inventory (menu tab): bag list with category filters and sorting, item card with comparison and actions,
// paper-doll of the equipment slots with a derived-stats summary.
// Sim: inventory (countItem, removeItem, usedSlots, totalSlots), equipment (equip, unequip, canEquip, equipmentList,
// isUpgrade, equipSlotOf), consumables (isUsable, cooldownLeft), stats (derivedStats). Engine: g.heroCtl.useItem /
// setQuickSlot / quickSlots / stats.
import { item as itemDef } from '../../data/items.js';
import { EQUIP_SLOTS, countItem, removeItem, usedSlots, totalSlots } from '../../sim/inventory.js';
import { equip, unequip, canEquip, equipmentList, isUpgrade, equipSlotOf } from '../../sim/equipment.js';
import { isUsable, cooldownLeft } from '../../sim/consumables.js';
import { derivedStats } from '../../sim/stats.js';
import {
  el, clear, listDetail, listRow, itemSlot, sectionTitle, statRow, button, coins, segmented, numberStepper, modal,
  tag, sections, isTouch, ITEM_TYPE_NAMES, SLOT_NAMES,
} from '../kit.js';
import { act, live, safe, render, itemCard, gameNow, percent, STATE_EVENTS } from '../screen-kit.js';

const RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, fine: 3, common: 4 };
const TYPE_ORDER = { weapon: 0, armor: 1, bag: 2, tool: 3, consumable: 4, material: 5, trade: 6, note: 7, quest: 8 };
const SLOT_SHORT = { offhand: 'Л. рука', armor: 'Грудь', tool: 'Инстр.', trinket: 'Украш.' };
const SLOT_GHOSTS = {
  weapon: 'sword', offhand: 'shield', armor: 'armor', helmet: 'helmet', gloves: 'gloves', boots: 'boots',
  cloak: 'cloak', bag: 'bag', tool: 'tool', trinket: 'gem',
};

/** Bag category of an item (the filter strip). */
export function bagCategory(def) {
  if (def.type === 'weapon') return 'weapon';
  if (def.type === 'armor') return 'armor';
  if (def.type === 'consumable') return 'consumable';
  if (def.type === 'trade' || def.cat === 'cargo') return 'goods';
  if (def.type === 'material') return 'material';
  if (def.type === 'quest') return 'quest';
  return 'misc';
}

const SORTERS = {
  type: (a, b) => (TYPE_ORDER[a.def.type] ?? 9) - (TYPE_ORDER[b.def.type] ?? 9) || a.def.name.localeCompare(b.def.name, 'ru'),
  name: (a, b) => a.def.name.localeCompare(b.def.name, 'ru'),
  value: (a, b) => b.def.value - a.def.value || a.def.name.localeCompare(b.def.name, 'ru'),
  rarity: (a, b) => (RARITY_ORDER[a.def.rarity] ?? 9) - (RARITY_ORDER[b.def.rarity] ?? 9) || b.def.value - a.def.value,
};

export function registerInventoryScreen(ui, g) {
  ui.registerScreen({
    id: 'inventory', title: 'Инвентарь', action: 'inventory', tab: { order: 10, icon: 'inventory' },
    create: () => createInventory(g, ui),
  });
}

function createInventory(g, ui) {
  let sortId = 'type';
  const state = () => g.state;
  const footer = el('div.inv-footer');
  const doll = el('div.inv-doll.kit-scroll.interactive');

  const sorter = segmented({
    options: [{ id: 'type', label: 'Тип' }, { id: 'name', label: 'Имя' }, { id: 'value', label: 'Цена' }, { id: 'rarity', label: 'Редкость' }],
    value: sortId,
    onChange: id => {
      sortId = id;
      refresh();
    },
  });

  const cat = name => entry => bagCategory(entry.def) === name;
  const view = listDetail({
    items: [],
    emptyText: 'В этой категории пусто',
    detailEmptyText: 'Сумка пуста',
    filters: [
      { id: 'all', label: 'Всё' }, { id: 'weapon', label: 'Оружие', test: cat('weapon') }, { id: 'armor', label: 'Броня', test: cat('armor') },
      { id: 'consumable', label: 'Расходники', test: cat('consumable') }, { id: 'material', label: 'Материалы', test: cat('material') },
      { id: 'goods', label: 'Товары', test: cat('goods') }, { id: 'quest', label: 'Задания', test: cat('quest') },
      { id: 'misc', label: 'Прочее', test: cat('misc') },
    ],
    renderRow: entry => {
      const quickIndex = quickIds().indexOf(entry.id);
      const upgrade = entry.def.slot ? safe(() => isUpgrade(state(), entry.id), false) : false;
      return listRow({
        icon: entry.def.icon, label: entry.def.name, rarity: entry.def.rarity,
        sub: ITEM_TYPE_NAMES[entry.def.type] || 'Предмет',
        badge: upgrade ? 'лучше' : quickIndex >= 0 ? `слот ${quickIndex + 1}` : undefined,
        right: entry.count > 1 ? `×${entry.count}` : '',
      });
    },
    renderDetail: entry => safe(() => detail(entry), null),
    onActivate: entry => primary(entry),
    onSelect: () => ui.refreshHints(),
    listFooter: el('div.inv-under', null, [el('div.inv-sort', null, [el('span.t-caps', { text: 'Сортировка' }), sorter]), footer]),
    class: 'inv-list',
  });

  function quickIds() {
    return safe(() => g.heroCtl.quickSlots().map(slot => slot.itemId), []) || [];
  }

  function entries() {
    const list = Object.entries(state().inv.items).map(([id, count]) => ({ id, count, def: itemDef(id) }));
    return list.sort(SORTERS[sortId]);
  }

  // ───────────── actions ─────────────

  function doEquip(entry) {
    act(ui, () => equip(state(), entry.id), `Надето: ${entry.def.name}`);
  }

  function doUse(entry) {
    safe(() => g.heroCtl.useItem(entry.id));
    refresh();
  }

  function setQuick(entry, slot) {
    const ids = quickIds();
    const next = ids[slot - 1] === entry.id ? null : entry.id;
    ids.forEach((id, index) => {
      if (id === entry.id && index !== slot - 1) g.heroCtl.setQuickSlot(index + 1, null);
    });
    g.heroCtl.setQuickSlot(slot, next);
    ui.toast(next ? `${entry.def.name} — быстрый слот ${slot}` : `Быстрый слот ${slot} свободен`, 'info');
    refresh();
  }

  async function drop(entry) {
    if (entry.def.type === 'quest') {
      ui.toast('Сюжетный предмет нельзя выбросить', 'warn');
      return;
    }
    let count = 1;
    if (entry.count > 1) {
      const stepper = numberStepper({ value: entry.count, min: 1, max: entry.count });
      const dialog = modal({
        title: 'Выбросить?',
        content: [el('p', { text: `${entry.def.name} — сколько выбросить? Вернуть будет нельзя.` }), el('div.gs-center', null, stepper)],
        buttons: [{ label: 'Выбросить', value: true, primary: true, danger: true }, { label: 'Отмена', value: false }],
      });
      if (!(await dialog.closed)) return;
      count = stepper.value;
    } else if (!(await ui.confirm({ title: 'Выбросить?', text: `${entry.def.name} пропадёт навсегда.`, yes: 'Выбросить', danger: true }))) {
      return;
    }
    if (removeItem(state(), entry.id, count)) ui.toast(`Выброшено: ${entry.def.name} ×${count}`, 'info');
  }

  function primary(entry) {
    if (!entry) return;
    if (equipSlotOf(entry.id)) doEquip(entry);
    else if (isUsable(entry.id)) doUse(entry);
  }

  // ───────────── detail ─────────────

  function detail(entry) {
    const st = state();
    const wearable = !!equipSlotOf(entry.id);
    const usable = isUsable(entry.id);
    const check = wearable ? canEquip(st, entry.id) : null;
    const actions = el('div.gs-actions');
    if (wearable) actions.append(button('Надеть', { primary: true, icon: 'check', disabled: !check.ok, title: check.ok ? '' : check.reason, onClick: () => doEquip(entry) }));
    if (usable) {
      const group = entry.def.cooldownGroup || 'medicine';
      const wait = entry.def.type === 'consumable' ? cooldownLeft(st, group, gameNow(st)) : 0;
      actions.append(button(entry.def.type === 'note' ? 'Прочитать' : wait > 0 ? `Использовать (${Math.ceil(wait)} с)` : 'Использовать', { primary: !wearable, icon: 'hand', onClick: () => doUse(entry) }));
    }
    actions.append(button('Выбросить', { danger: true, small: true, icon: 'trash', disabled: entry.def.type === 'quest', onClick: () => drop(entry) }));

    const blocks = [itemCard(st, entry.id, { owned: false }), sectionTitle('Действия', entry.count > 1 ? `в сумке ×${entry.count}` : ''), actions];
    if (entry.def.type === 'consumable' && usable) {
      const ids = quickIds();
      const row = el('div.inv-quick');
      for (let slot = 1; slot <= 4; slot++) {
        const mine = ids[slot - 1] === entry.id;
        const other = ids[slot - 1] && !mine ? itemDef(ids[slot - 1]).name : null;
        row.append(button(String(slot), {
          small: true, primary: mine, title: mine ? 'Снять с быстрого слота' : other ? `Сейчас здесь: ${other}` : isTouch() ? `Быстрый слот ${slot}` : `Клавиша ${g.input.caption(`quick${slot}`)}`,
          onClick: () => setQuick(entry, slot),
        }));
      }
      blocks.push(sectionTitle('Быстрый слот', ids.includes(entry.id) ? `назначен: ${ids.indexOf(entry.id) + 1}` : 'не назначен'), row);
    }
    return el('div.inv-detail', null, blocks);
  }

  // ───────────── paper-doll ─────────────

  function renderDoll() {
    const st = state();
    const grid = el('div.inv-slots');
    for (const { slot, itemId } of equipmentList(st)) {
      const node = itemSlot(itemId, 1, {
        placeholder: SLOT_GHOSTS[slot], size: '1em',
        tooltip: itemId ? [{ text: isTouch() ? 'Касание — снять в сумку' : 'Щелчок — снять в сумку', kind: 'dim' }] : false,
        onClick: itemId ? () => act(ui, () => unequip(st, slot), 'Снято') : undefined,
      });
      if (!itemId) ui.tooltip.attach(node, `${SLOT_NAMES[slot] || slot}: пусто`);
      grid.append(el('div.inv-slot', null, [node, el('span.inv-slot-name', { text: SLOT_SHORT[slot] || SLOT_NAMES[slot] || slot })]));
    }
    const stats = safe(() => g.heroCtl.stats(), null) || derivedStats(st);
    const worn = equipmentList(st).filter(entry => entry.itemId).length;
    return [
      sectionTitle('Снаряжение', `${worn} / ${EQUIP_SLOTS.length}`),
      grid,
      sectionTitle('Характеристики'),
      statRow('Здоровье', Math.round(stats.maxHp)),
      statRow('Выносливость', Math.round(stats.maxStamina)),
      statRow('Атака', Math.round(stats.attack)),
      statRow('Урон оружия', Math.round(stats.weaponDamage || 0)),
      statRow('Броня', Math.round(stats.armor)),
      statRow('Шанс крит. удара', percent(stats.critChance)),
      statRow('Скорость бега', `${stats.moveSpeed.toFixed(1).replace('.', ',')} м/с`),
      statRow('Торговая скидка', percent(stats.priceBonus || 0, 1)),
    ];
  }

  function refresh() {
    const st = state();
    if (!st) return;
    view.setItems(entries());
    const used = usedSlots(st);
    const total = totalSlots(st);
    clear(footer, [
      el('span.inv-capacity', { class: used >= total ? 'full' : '' }, [`Ячейки `, el('b.t-num', { text: `${used} / ${total}` })]),
      used >= total ? tag('сумка полна', 'bad') : null,
      coins(st.player.coins),
    ]);
    render(doll, renderDoll);
    ui.refreshHints();
  }

  const watch = live(STATE_EVENTS, refresh);
  // mobile: the bag (list ↔ item card) and the paper-doll with stats are two sections of a side rail
  const rail = sections({ items: [
    { id: 'bag', label: 'Сумка', icon: 'inventory', nodes: [view.el] },
    { id: 'doll', label: 'Снаряжение', icon: 'character', nodes: [doll] },
  ] });

  function onKey(event) {
    if (view.handleKey(event)) return true;
    const entry = view.selected;
    if (!entry) return false;
    if (event.code === 'Delete' || event.code === 'KeyX') {
      drop(entry);
      return true;
    }
    const digit = /^Digit([1-4])$/.exec(event.code);
    if (digit && entry.def.type === 'consumable' && isUsable(entry.id)) {
      setQuick(entry, Number(digit[1]));
      return true;
    }
    return false;
  }

  return {
    el: el('div.inv-view', null, [rail.el, view.el, doll]),
    onOpen() {
      watch.start();
      refresh();
    },
    onClose: () => watch.stop(),
    onKey,
    hints() {
      const entry = view.selected;
      const list = [{ key: '↑↓', label: 'Выбор' }];
      if (entry && equipSlotOf(entry.id)) list.push({ key: 'Enter', label: 'Надеть', touch: false, onClick: () => primary(entry) });
      else if (entry && isUsable(entry.id)) list.push({ key: 'Enter', label: 'Использовать', touch: false, onClick: () => primary(entry) });
      if (entry && entry.def.type === 'consumable') list.push({ key: '1–4', label: 'В быстрый слот' });
      if (entry) list.push({ key: 'X', label: 'Выбросить', touch: false, onClick: () => drop(entry) });
      return list;
    },
  };
}
