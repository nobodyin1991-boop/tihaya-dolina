// Helpers shared by the gameplay screens (src/ui/screens/*): safe sim calls, live re-rendering on bus
// events, the full item card with comparison, reward lines, city / npc names and two tiny services
// (coach fare, buying a horse).
import { on } from '../core/events.js';
import { item as itemDef } from '../data/items.js';
import { CITIES, cityByKey } from '../data/world-map.js';
import { NPCS } from '../data/npcs.js';
import { canEquip, equipSlotOf, isUpgrade } from '../sim/equipment.js';
import { spendCoins } from '../sim/player.js';
import { countItem } from '../sim/inventory.js';
import { icon } from './icons.js';
import {
  el, clear, statRow, coins, itemTooltip, tag, tooltip, rarityColor, formatNumber, STAT_NAMES, SLOT_NAMES,
} from './kit.js';

const PERCENT_STATS = new Set(['critChance', 'moveSpeed', 'gatherSpeed', 'priceBonus']);

/** City display name by key («Тихая долина»). */
export const cityName = key => cityByKey(key)?.name || key || '';

/** Role captions for hints like «поговорите с конюхом». */
export const ROLE_NAMES = {
  quartermaster: 'интендант', elder: 'староста', captain: 'капитан стражи', innkeeper: 'трактирщик',
  stablemaster: 'конюх', trainer: 'боевой наставник', weaponsmith: 'оружейник', armorer: 'бронник',
  grocer: 'лавочник', trader: 'купец', banker: 'хранитель склада', apothecary: 'аптекарь', smith: 'кузнец',
  carpenter: 'столяр', leatherworker: 'кожевник', farmer: 'пекарь', tailor: 'портной', mason: 'каменщик',
};

/** «Имя, должность» of an npc id; falls back to the raw string (board requesters are plain names). */
export function npcLabel(npcId) {
  const npc = NPCS[npcId];
  if (!npc) return npcId || '';
  return npc.title ? `${npc.name}, ${npc.title}` : npc.name;
}

/** Role part of an npc id: 'valley:trader' → 'trader'. */
export const roleOf = npcId => String(npcId || '').slice(String(npcId || '').lastIndexOf(':') + 1);

/** Game time in seconds used by consumable cooldowns and buffs. */
export const gameNow = state => state.world?.clock || 0;

/** 0.12 → «12%». */
export const percent = (value, digits = 0) => `${(value * 100).toFixed(digits).replace('.', ',')}%`;

/** Run `fn`; an exception is logged and `fallback` returned (keeps a screen alive on an unexpected sim shape). */
export function safe(fn, fallback = null) {
  try {
    return fn();
  } catch (error) {
    console.error('[screens]', error);
    return fallback;
  }
}

/** Inline error placeholder shown instead of a broken block. */
export function errorBox(error) {
  return el('div.gs-error', null, [
    icon('warning'),
    el('div', null, [
      el('div.gs-error-title', { text: 'Не удалось показать раздел' }),
      el('div.gs-error-text', { text: error && error.message ? error.message : String(error) }),
    ]),
  ]);
}

/** Replace the content of `target` with `build()`; a failure renders an inline error instead of throwing. */
export function render(target, build) {
  try {
    clear(target, build());
  } catch (error) {
    console.error('[screens]', error);
    clear(target, errorBox(error));
  }
  return target;
}

/**
 * Show the outcome of a sim action: the failure reason as a warning toast, optionally a success toast.
 * @returns {boolean} result.ok
 * @example if (act(ui, () => equip(state, id), 'Надето')) refresh();
 */
export function act(ui, call, okText) {
  let result;
  try {
    result = typeof call === 'function' ? call() : call;
  } catch (error) {
    console.error('[screens]', error);
    ui.toast('Что-то пошло не так', 'bad');
    return false;
  }
  if (!result || !result.ok) {
    ui.toast((result && result.reason) || 'Не получилось', 'warn');
    return false;
  }
  if (okText) ui.toast(typeof okText === 'function' ? okText(result) : okText, 'good');
  return true;
}

/**
 * Re-render while a screen is open: `refresh` runs once per burst of the listed bus events
 * (deferred to a microtask, so it never runs inside the sim call that emitted the event).
 * @returns {{start: () => void, stop: () => void, now: () => void}}
 * @example const watch = live(['inv:changed', 'coins:changed'], refresh);  // onOpen: watch.start(); onClose: watch.stop();
 */
export function live(events, refresh) {
  let unsubscribe = [];
  let queued = false;
  let active = false;
  const flush = () => {
    queued = false;
    if (!active) return;
    try {
      refresh();
    } catch (error) {
      console.error('[screens] refresh', error);
    }
  };
  const schedule = () => {
    if (queued || !active) return;
    queued = true;
    Promise.resolve().then(flush);
  };
  return {
    start() {
      if (active) return;
      active = true;
      unsubscribe = events.map(type => on(type, schedule));
    },
    stop() {
      active = false;
      for (const fn of unsubscribe) fn();
      unsubscribe = [];
    },
    now: flush,
  };
}

/** Everything that may change what a menu shows — handy default for `live`. */
export const STATE_EVENTS = [
  'inv:changed', 'coins:changed', 'equip:changed', 'prog:changed', 'player:levelup', 'rep:changed',
  'quest:started', 'quest:updated', 'quest:completed', 'storage:changed', 'economy:changed', 'buffs:changed',
  'caravan:manifest', 'caravan:launched', 'caravan:arrived', 'caravan:failed', 'caravan:damaged', 'caravan:manifest-full',
];

// ───────────────────────── items ─────────────────────────

const statText = (key, value) => (PERCENT_STATS.has(key) ? percent(value) : String(Math.round(value * 10) / 10));

/**
 * Stat rows comparing an equippable item with what is worn in its slot.
 * @returns {{slot: string, wornId: string|null, rows: HTMLElement[], upgrade: boolean}|null} null for non-gear
 */
export function compareWithWorn(state, itemId) {
  const slot = equipSlotOf(itemId);
  if (!slot) return null;
  const def = itemDef(itemId);
  const wornId = state.inv.equip[slot] || null;
  const worn = wornId ? itemDef(wornId) : {};
  const rows = [];
  const push = (label, mine, theirs, format = v => String(v)) => {
    if (!mine && !theirs) return;
    const delta = (mine || 0) - (theirs || 0);
    const shown = delta === 0 ? null : `${delta > 0 ? '+' : '−'}${format(Math.abs(delta))}`;
    rows.push(statRow(label, format(mine || 0), shown));
  };
  push('Урон', def.damage, worn.damage);
  push('Броня', def.armor, worn.armor);
  push('Ячейки сумки', def.slots, worn.slots);
  const keys = new Set([...Object.keys(def.stats || {}), ...Object.keys(worn.stats || {})]);
  for (const key of keys) {
    push(STAT_NAMES[key] || key, (def.stats || {})[key], (worn.stats || {})[key], v => statText(key, v));
  }
  return { slot, wornId, rows, upgrade: isUpgrade(state, itemId) };
}

/**
 * Full item card for a detail pane: the tooltip body plus «в сумке», equip restrictions and a
 * comparison block against the worn item.
 * @param {object} state
 * @param {string} itemId
 * @param {{compare?: boolean, lines?: Array, owned?: boolean}} [opts]
 */
export function itemCard(state, itemId, opts = {}) {
  const lines = [...(opts.lines || [])];
  if (opts.owned !== false) {
    const have = countItem(state, itemId);
    if (have > 0) lines.push({ text: `В сумке: ${have}`, kind: 'dim' });
  }
  const card = el('div.gs-itemcard', null, itemTooltip(itemId, lines));
  if (opts.compare === false) return card;
  const cmp = safe(() => compareWithWorn(state, itemId));
  if (!cmp) return card;
  const check = safe(() => canEquip(state, itemId), { ok: true });
  const worn = cmp.wornId ? itemDef(cmp.wornId) : null;
  const head = el('div.gs-compare-head', null, [
    el('span', { text: worn ? 'Сейчас надето:' : `Слот «${SLOT_NAMES[cmp.slot] || cmp.slot}» пуст` }),
    worn ? el('b', { text: worn.name, style: { color: rarityColor(worn.rarity) } }) : null,
    cmp.upgrade ? tag('Лучше надетого', 'good') : null,
    check && !check.ok ? tag(check.reason, 'bad') : null,
  ]);
  if (cmp.wornId === itemId) return card;
  card.append(el('div.gs-compare', null, [head, cmp.rows.length ? el('div.gs-compare-rows', null, cmp.rows) : null]));
  return card;
}

/** Small «icon name ×n» chip with the item tooltip. */
export function itemChip(itemId, count, opts = {}) {
  const def = itemDef(itemId);
  const node = el('span.gs-chip', { class: opts.class || '' }, [
    icon(def.icon),
    el('span', { text: count !== undefined && count !== null ? `${def.name} ×${count}` : def.name }),
  ]);
  node.style.setProperty('--rarity', rarityColor(def.rarity));
  tooltip.attach(node, () => itemTooltip(itemId));
  return node;
}

/**
 * Reward line: coins, xp, reputation and items.
 * @param {{coins?: number, xp?: number, rep?: Object<string, number>, items?: Object<string, number>}} rewards
 */
export function rewardLine(rewards = {}) {
  const line = el('div.gs-rewards');
  if (rewards.coins) line.append(coins(rewards.coins));
  if (rewards.xp) line.append(el('span.gs-reward-xp.t-num', null, [icon('level'), `${formatNumber(rewards.xp)} опыта`]));
  for (const [cityKey, amount] of Object.entries(rewards.rep || {})) {
    if (amount) line.append(el('span.gs-reward-rep.t-num', null, [icon('city'), `${cityName(cityKey)} ${amount > 0 ? '+' : '−'}${Math.abs(amount)}`]));
  }
  for (const [itemId, count] of Object.entries(rewards.items || {})) line.append(itemChip(itemId, count));
  if (!line.childNodes.length) line.append(el('span.t-dim', { text: 'Благодарность' }));
  return line;
}

/** Rank pips «◆◆◇◇◇». */
export function pips(value, max) {
  const node = el('span.gs-pips');
  for (let index = 0; index < max; index++) node.append(el('i', { class: index < value ? 'on' : '' }));
  return node;
}

/** Page header inside a screen: display title, sub line and optional right-hand content. */
export function pageHead(title, sub, right) {
  return el('div.gs-head', null, [
    el('div.gs-head-text', null, [el('div.gs-head-title', { text: title }), sub ? el('div.gs-head-sub', null, sub) : null]),
    right ? el('div.gs-head-right', null, right) : null,
  ]);
}

/** «Label: value» pair used in compact fact strips. */
export function fact(label, value, kind) {
  return el('div.gs-fact', { class: kind || '' }, [el('span.gs-fact-label', { text: label }), el('span.gs-fact-value.t-num', null, value)]);
}

/** Note line with an icon (hints such as «Поговорите с конюхом»). */
export function note(text, iconKey = 'info', kind = '') {
  return el('div.gs-note', { class: kind }, [icon(iconKey), el('span', { text })]);
}

// ───────────────────────── services ─────────────────────────

export const HORSE_PRICE = 600;

/** Does the hero own a horse? */
export const hasHorse = state => !!state.world?.horse;

/**
 * Buy a horse at the stablemaster (the one sanctioned direct state write of the UI: `world.horse`).
 * @returns {{ok: boolean, reason?: string}}
 */
export function buyHorse(state) {
  if (hasHorse(state)) return { ok: false, reason: 'Лошадь у вас уже есть' };
  if (!spendCoins(state, HORSE_PRICE)) return { ok: false, reason: `Нужно ${HORSE_PRICE} монет` };
  state.world.horse = true;
  return { ok: true };
}

/** Coach fare between two cities: 40–90 coins by straight-line distance. */
export function coachFare(fromKey, toKey) {
  const from = cityByKey(fromKey);
  const to = cityByKey(toKey);
  if (!from || !to || from === to) return 0;
  let longest = 1;
  for (const a of CITIES) for (const b of CITIES) longest = Math.max(longest, Math.hypot(a.x - b.x, a.z - b.z));
  const share = Math.hypot(from.x - to.x, from.z - to.z) / longest;
  return Math.round((40 + 50 * share) / 5) * 5;
}

/** Pay the coach fare. @returns {{ok: boolean, reason?: string, fare?: number}} */
export function payCoach(state, fromKey, toKey) {
  const fare = coachFare(fromKey, toKey);
  if (!spendCoins(state, fare)) return { ok: false, reason: `Проезд стоит ${fare} монет` };
  return { ok: true, fare };
}

/** City the hero stands in (engine zone first, saved position as a fallback). */
export function currentCityKey(g) {
  return g.zone && g.zone.city ? g.zone.city.key : null;
}
