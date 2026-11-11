// HUD: toasts / log (bottom-left), loot feed (bottom-right) and the level-up fanfare.
// Consumes events: toast {text, kind}, log {text}, loot:gained {coins, items, source}, player:xp {amount}, player:levelup {level}.
import { on } from '../../core/events.js';
import { item as itemDef } from '../../data/items.js';
import { icon } from '../icons.js';
import { el, formatNumber } from '../kit.js';

const TOAST_SECONDS = 4.2;
const LOG_SECONDS = 6;
const MAX_TOASTS = 5;
const MAX_LOOT = 7;
const KIND_ICONS = { info: 'info', good: 'check', warn: 'warning', bad: 'cross' };

export function createFeed(g, ui, hudLayer) {
  const toastBox = el('div.toasts');
  ui.layers.toast.append(toastBox);
  const lootBox = el('div.loot-feed');
  const fanfare = el('div.levelup');
  hudLayer.append(lootBox, fanfare);

  /** Live entries: {node, t} — aged on every frame. */
  const toasts = [];
  const loot = [];
  let xpLine = null;

  function drop(list, index) {
    const entry = list[index];
    list.splice(index, 1);
    entry.node.classList.add('out');
    setTimeout(() => entry.node.remove(), 320);
  }

  function push(list, box, node, seconds, max) {
    box.append(node);
    const entry = { node, t: seconds };
    list.push(entry);
    while (list.length > max) drop(list, 0);
    return entry;
  }

  function toast(text, kind = 'info') {
    if (!text) return;
    const last = toasts[toasts.length - 1];
    if (last && last.text === text && last.kind === kind) {
      last.t = TOAST_SECONDS;
      last.count += 1;
      last.counter.textContent = `×${last.count}`;
      return;
    }
    const counter = el('span.toast-count.t-num');
    const safeKind = KIND_ICONS[kind] ? kind : 'info';
    const node = el(`div.toast.${safeKind}`, null, [icon(KIND_ICONS[safeKind]), el('span.toast-text', { text }), counter]);
    const entry = push(toasts, toastBox, node, TOAST_SECONDS, MAX_TOASTS);
    Object.assign(entry, { text, kind, count: 1, counter });
  }

  function log(text) {
    if (!text) return;
    const entry = push(toasts, toastBox, el('div.toast.log', null, el('span.toast-text', { text })), LOG_SECONDS, MAX_TOASTS);
    entry.text = null;
  }

  function lootLine(className, iconNode, text, amount) {
    const node = el(`div.loot-line.${className}`, null, [
      el('span.loot-amount.t-num', { text: amount }),
      el('span.loot-text', { text }),
      iconNode,
    ]);
    return push(loot, lootBox, node, 4.5, MAX_LOOT);
  }

  on('toast', payload => {
    if (payload) toast(payload.text, payload.kind);
  });
  on('log', payload => {
    if (payload) log(payload.text);
  });
  on('loot:gained', payload => {
    if (!payload) return;
    if (payload.coins > 0) lootLine('coins', el('i.kit-coin'), 'Монеты', `+${formatNumber(payload.coins)}`);
    for (const id of Object.keys(payload.items || {})) {
      const def = itemDef(id);
      const entry = lootLine('item', icon(def.icon), def.name, `+${payload.items[id]}`);
      entry.node.style.setProperty('--rarity', `var(--r-${def.rarity})`);
    }
  });
  on('player:xp', payload => {
    if (!payload || !(payload.amount > 0)) return;
    if (xpLine && loot.includes(xpLine)) {
      xpLine.amount += payload.amount;
      xpLine.t = 3.5;
      xpLine.node.firstChild.textContent = `+${formatNumber(xpLine.amount)}`;
      return;
    }
    xpLine = lootLine('xp', icon('star'), 'Опыт', `+${formatNumber(payload.amount)}`);
    xpLine.amount = payload.amount;
    xpLine.t = 3.5;
  });
  on('player:levelup', payload => {
    const level = payload && payload.level ? payload.level : g.hero.level;
    fanfare.textContent = '';
    fanfare.append(
      el('div.levelup-rays'),
      el('div.levelup-eyebrow', { text: 'Новый уровень' }),
      el('div.levelup-number', { text: String(level) }),
      el('div.kit-orn', null, el('i')),
      el('div.levelup-sub', { text: 'Получено очко обучения. Наставники ждут в городе.' }),
    );
    fanfare.classList.remove('show');
    void fanfare.offsetWidth;
    fanfare.classList.add('show');
  });

  function age(list, dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      list[i].t -= dt;
      if (list[i].t <= 0) drop(list, i);
    }
  }

  function update(dt) {
    if (toasts.length) age(toasts, dt);
    if (loot.length) age(loot, dt);
  }

  return { update, toast, log };
}
