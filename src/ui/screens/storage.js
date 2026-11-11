// Storage (contextual): bag ↔ personal stash kept by the banker (one stash for all three cities), expansion.
// Sim: storage (deposit, withdraw, expandStorage, storageUpgradeCost, storageUsedSlots), inventory (usedSlots, totalSlots).
import { item as itemDef } from '../../data/items.js';
import { deposit, withdraw, expandStorage, storageUpgradeCost, storageUsedSlots, STORAGE_RULES } from '../../sim/storage.js';
import { usedSlots, totalSlots } from '../../sim/inventory.js';
import { el, sectionTitle, button, coins, itemSlot, emptyState } from '../kit.js';
import { act, live, render, pageHead, fact, STATE_EVENTS } from '../screen-kit.js';

const TYPE_ORDER = { weapon: 0, armor: 1, bag: 2, tool: 3, consumable: 4, material: 5, trade: 6, note: 7, quest: 8 };

function sorted(items) {
  return Object.entries(items)
    .map(([id, count]) => ({ id, count, def: itemDef(id) }))
    .sort((a, b) => (TYPE_ORDER[a.def.type] ?? 9) - (TYPE_ORDER[b.def.type] ?? 9) || a.def.name.localeCompare(b.def.name, 'ru'));
}

export function registerStorageScreen(ui, g) {
  ui.registerScreen({ id: 'storage', title: 'Склад', create: () => createStorage(g, ui) });
}

function createStorage(g, ui) {
  const state = () => g.state;
  const head = el('div.sto-head');
  const bagGrid = el('div.sto-grid.kit-scroll.interactive');
  const stashGrid = el('div.sto-grid.kit-scroll.interactive');
  const bagTitle = el('div');
  const stashTitle = el('div');

  function move(entry, toStash, event) {
    const count = event && (event.shiftKey || event.type === 'contextmenu') ? entry.count : 1;
    act(ui, () => (toStash ? deposit(state(), entry.id, count) : withdraw(state(), entry.id, count)));
  }

  function grid(items, toStash, emptyText) {
    const list = sorted(items);
    if (!list.length) return emptyState(emptyText, toStash ? 'inventory' : 'chest');
    const tip = [{ text: toStash ? 'Щелчок — положить 1 · Shift или ПКМ — все' : 'Щелчок — взять 1 · Shift или ПКМ — все', kind: 'dim' }];
    return list.map(entry => itemSlot(entry.id, entry.count, {
      tooltip: tip,
      onClick: event => move(entry, toStash, event),
      onContext: event => move(entry, toStash, event),
    }));
  }

  async function expand() {
    const cost = storageUpgradeCost(state());
    if (cost === null) return;
    const agreed = await ui.confirm({ title: 'Расширить склад?', text: `+${STORAGE_RULES.slotsPerUpgrade} ячеек за ${cost} монет.`, yes: 'Расширить' });
    if (agreed) act(ui, () => expandStorage(state()));
  }

  function refresh() {
    const st = state();
    if (!st) return;
    const cost = storageUpgradeCost(st);
    const poor = cost !== null && st.player.coins < cost;
    render(head, () => pageHead('Личный склад', 'Хранитель держит ваш ларь под замком; он общий для всех трёх городов.', [
      fact('Монеты', coins(st.player.coins)),
      cost === null
        ? fact('Расширение', 'предел достигнут')
        : el('div.sto-expand', null, [button(`Расширить +${STORAGE_RULES.slotsPerUpgrade}`, { small: true, icon: 'plus', disabled: poor, onClick: expand }), coins(cost, { class: poor ? 'lacking' : '' })]),
    ]));
    render(bagTitle, () => sectionTitle('Сумка', `${usedSlots(st)} / ${totalSlots(st)} ячеек`));
    render(stashTitle, () => sectionTitle('Склад', `${storageUsedSlots(st)} / ${st.storage.slots} ячеек`));
    render(bagGrid, () => grid(st.inv.items, true, 'Сумка пуста'));
    render(stashGrid, () => grid(st.storage.items, false, 'На складе пусто — сложите сюда то, что не нужно в дороге'));
  }

  const watch = live(STATE_EVENTS, refresh);
  return {
    el: el('div.sto-view', null, [head, el('div.sto-panes', null, [el('div.sto-pane', null, [bagTitle, bagGrid]), el('div.sto-pane', null, [stashTitle, stashGrid])])]),
    onOpen() {
      watch.start();
      refresh();
    },
    onClose: () => watch.stop(),
    hints: () => [{ key: 'ЛКМ', label: 'Переложить 1' }, { key: 'Shift+ЛКМ', label: 'Переложить все' }],
  };
}
