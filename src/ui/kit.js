// UI kit «Янтарь и сумрак»: every reusable widget of the menu screens.
// Styles live in styles/kit.css (classes are prefixed `kit-`). All factories return plain DOM elements;
// widgets with state expose it as methods/properties on the returned element or object.
//
//   import { el, listDetail, itemSlot, itemTooltip, tooltip, button, keyHint } from '../kit.js';
import { icon } from './icons.js';
import { item as itemDef } from '../data/items.js';
import { el, clear, tooltip, keyCaptionFor, formatNumber } from './kit-base.js';

export { el, clear, setText, setClass, plural, formatNumber, tooltip, modal, confirmDialog, setKitContext, isTouch, isMobileUi } from './kit-base.js';
export { listDetail, listRow, tabs, sections } from './kit-list.js';

export const RARITY_NAMES = { common: 'Обычное', fine: 'Добротное', rare: 'Редкое', epic: 'Превосходное', legendary: 'Легендарное' };
export const ITEM_TYPE_NAMES = {
  material: 'Материал', consumable: 'Расходуемое', weapon: 'Оружие', armor: 'Доспех', tool: 'Инструмент',
  bag: 'Сумка', trade: 'Торговый товар', quest: 'Сюжетный предмет', note: 'Записи',
};
export const SLOT_NAMES = {
  weapon: 'Оружие', offhand: 'Левая рука', armor: 'Нагрудник', helmet: 'Шлем', gloves: 'Перчатки', boots: 'Сапоги',
  cloak: 'Плащ', trinket: 'Амулет', bag: 'Сумка', tool: 'Инструмент',
};
export const STAT_NAMES = {
  maxHp: 'Здоровье', maxStamina: 'Выносливость', attack: 'Атака', armor: 'Броня', critChance: 'Шанс крит. удара',
  moveSpeed: 'Скорость', healPower: 'Сила лечения', gatherSpeed: 'Скорость сбора', priceBonus: 'Торговая скидка',
  staminaRegen: 'Восст. выносливости',
};
const WEIGHT_NAMES = { light: 'Лёгкая броня', medium: 'Средняя броня', heavy: 'Тяжёлая броня' };
const PERCENT_STATS = new Set(['critChance', 'moveSpeed', 'gatherSpeed', 'priceBonus']);

/** CSS colour of a rarity: rarityColor('rare') → 'var(--r-rare)'. */
export const rarityColor = rarity => `var(--r-${RARITY_NAMES[rarity] ? rarity : 'common'})`;

/**
 * Button in the display face.
 * @param {string} label
 * @param {{onClick?: Function, primary?: boolean, danger?: boolean, small?: boolean, disabled?: boolean, icon?: string, title?: string}} [opts]
 * @example button('Купить', { primary: true, onClick: buy })
 */
export function button(label, opts = {}) {
  const cls = `btn${opts.primary ? ' primary' : ''}${opts.danger ? ' danger' : ''}${opts.small ? ' small' : ''}`;
  const node = el('button', { class: cls, type: 'button', disabled: !!opts.disabled, onClick: opts.onClick }, [
    opts.icon ? icon(opts.icon) : null,
    el('span', { text: label }),
  ]);
  if (opts.title) tooltip.attach(node, opts.title);
  return node;
}

/**
 * Key cap with a caption: «[E] Взять». The first argument is an input action (`'interact'`) or a literal caption (`'Enter'`).
 * @param {string} actionOrCaption
 * @param {string} [label]
 * @param {{onClick?: Function}} [opts]  a click handler turns the hint into a clickable control
 * @example keyHint('interact', 'Взять всё', { onClick: takeAll })
 */
export function keyHint(actionOrCaption, label, opts = {}) {
  const caption = keyCaptionFor(actionOrCaption) || actionOrCaption;
  const node = el(opts.onClick ? 'button.kit-hint' : 'span.kit-hint', { onClick: opts.onClick, type: opts.onClick ? 'button' : undefined }, [
    el('span.key', { text: caption }),
    label ? el('span.kit-hint-label', { text: label }) : null,
  ]);
  return node;
}

/**
 * Section heading: small spaced caps with a hairline.
 * @param {string} text
 * @param {Node|string} [right]  optional content at the right edge (counter, hint)
 * @example sectionTitle('Снаряжение', '4 / 9')
 */
export function sectionTitle(text, right) {
  return el('div.kit-section', null, [
    el('span.kit-section-text', { text }),
    el('i.kit-section-line'),
    right ? el('span.kit-section-right', null, right) : null,
  ]);
}

/**
 * «Label ......... value (+delta)» row for stat sheets.
 * @param {string} label
 * @param {string|number|Node} value
 * @param {number|string} [delta]  positive → green «+3», negative → red «−2»
 * @example statRow('Броня', 42, +6)
 */
export function statRow(label, value, delta) {
  let deltaNode = null;
  if (delta !== undefined && delta !== null && delta !== 0 && delta !== '') {
    const numeric = typeof delta === 'number' ? delta : parseFloat(delta);
    const text = typeof delta === 'number' ? `${delta > 0 ? '+' : '−'}${Math.abs(delta)}` : delta;
    deltaNode = el('span.kit-stat-delta', { class: numeric < 0 ? 'bad' : 'good', text });
  }
  return el('div.kit-stat', null, [
    el('span.kit-stat-label', { text: label }),
    el('i.kit-stat-dots'),
    el('span.kit-stat-value.t-num', null, value instanceof Node ? value : String(value)),
    deltaNode,
  ]);
}

/**
 * Amount of coins with the coin glyph.
 * @example coins(1250) → «● 1 250»
 */
export function coins(amount, opts = {}) {
  return el('span.kit-coins.t-num', { class: opts.class || '' }, [el('i.kit-coin'), formatNumber(amount)]);
}

/**
 * Price line: coins, learning points and item ingredients; what the player lacks is tinted red.
 * @param {{coins?: number, lp?: number, items?: Object<string, number>}} cost
 * @param {{coins?: number, lp?: number, items?: Object<string, number>}} [have]  current resources for the red tint
 * @example costLine({ coins: 120, items: { ingot: 2 } }, { coins: state.player.coins, items: state.inv.items })
 */
export function costLine(cost = {}, have) {
  const line = el('div.kit-cost');
  if (cost.coins) {
    const lacking = have && (have.coins || 0) < cost.coins;
    line.append(coins(cost.coins, { class: lacking ? 'lacking' : '' }));
  }
  if (cost.lp) {
    const lacking = have && (have.lp || 0) < cost.lp;
    line.append(el('span.kit-cost-lp.t-num', { class: lacking ? 'lacking' : '' }, [icon('star'), `${cost.lp} оч. обучения`]));
  }
  for (const id of Object.keys(cost.items || {})) {
    const need = cost.items[id];
    const def = itemDef(id);
    const owned = have && have.items ? have.items[id] || 0 : null;
    const lacking = owned !== null && owned < need;
    const text = owned === null ? `${def.name} ×${need}` : `${def.name} ${owned}/${need}`;
    const node = el('span.kit-cost-item', { class: lacking ? 'lacking' : '' }, [icon(def.icon), text]);
    node.style.setProperty('--rarity', rarityColor(def.rarity));
    tooltip.attach(node, () => itemTooltip(id));
    line.append(node);
  }
  return line;
}

/**
 * Horizontal bar. `kind` ∈ health | stamina | xp | gold | neutral | bad.
 * @param {{value: number, max: number, kind?: string, label?: string, text?: boolean}} opts  `text` shows «value / max»
 * @returns {HTMLElement & {set: (value: number, max?: number) => void}}
 * @example const hp = bar({ value: 40, max: 100, kind: 'health', text: true }); hp.set(55);
 */
export function bar(opts = {}) {
  const fill = el('i.kit-bar-fill');
  const text = opts.text ? el('span.kit-bar-text.t-num') : null;
  const node = el('div.kit-bar', { class: opts.kind || 'neutral' }, [
    fill,
    opts.label ? el('span.kit-bar-label', { text: opts.label }) : null,
    text,
  ]);
  let max = opts.max || 1;
  node.set = (value, nextMax) => {
    if (nextMax !== undefined) max = nextMax || 1;
    const fraction = Math.max(0, Math.min(1, value / max));
    fill.style.transform = `scaleX(${fraction.toFixed(4)})`;
    if (text) text.textContent = `${formatNumber(value)} / ${formatNumber(max)}`;
  };
  node.set(opts.value || 0);
  return node;
}

/**
 * Circular progress with a centred caption.
 * @param {{value: number, size?: string, label?: string|Node, kind?: string}} opts  `value` 0..1, `size` CSS length (default 4em)
 * @returns {HTMLElement & {set: (value: number, label?: string) => void}}
 * @example const ring = progressRing({ value: 0.4, label: '12' }); ring.set(0.5, '13');
 */
export function progressRing(opts = {}) {
  const caption = el('span.kit-ring-label', null, opts.label ?? '');
  const node = el('div.kit-ring', { class: opts.kind || '' }, [
    el('i.kit-ring-track'),
    el('i.kit-ring-arc'),
    caption,
  ]);
  if (opts.size) node.style.fontSize = opts.size;
  node.set = (value, label) => {
    node.style.setProperty('--p', Math.max(0, Math.min(1, value)).toFixed(4));
    if (label !== undefined) caption.textContent = label;
  };
  node.set(opts.value || 0);
  return node;
}

/**
 * Square item slot with a rarity frame, count badge and item tooltip.
 * @param {string|null} itemId  `null` renders an empty slot
 * @param {number} [count]      badge is shown for count > 1
 * @param {{onClick?: Function, onContext?: Function, selected?: boolean, equipped?: boolean, dim?: boolean, size?: string, tooltip?: boolean|Array, placeholder?: string}} [opts]
 *        `onContext` — right click; `equipped` draws a small gold marker; `placeholder` — icon key shown in an empty slot;
 *        `tooltip: false` disables the tooltip, an array is passed to itemTooltip as extra lines
 * @example grid.append(itemSlot('salve', 3, { onClick: () => use('salve'), onContext: () => drop('salve') }))
 */
export function itemSlot(itemId, count = 1, opts = {}) {
  const node = el('div.kit-slot.interactive');
  if (opts.size) node.style.fontSize = opts.size;
  if (!itemId) {
    node.classList.add('empty');
    if (opts.placeholder) node.append(icon(opts.placeholder, { class: 'kit-slot-ghost' }));
  } else {
    const def = itemDef(itemId);
    node.dataset.item = itemId;
    node.dataset.rarity = def.rarity;
    node.style.setProperty('--rarity', rarityColor(def.rarity));
    node.append(icon(def.icon, { class: 'kit-slot-icon' }));
    if (count > 1) node.append(el('span.kit-slot-count.t-num', { text: count > 9999 ? '9999+' : String(count) }));
    if (opts.equipped) node.append(el('i.kit-slot-equipped'));
    if (opts.tooltip !== false) tooltip.attach(node, () => itemTooltip(itemId, Array.isArray(opts.tooltip) ? opts.tooltip : undefined));
  }
  if (opts.selected) node.classList.add('selected');
  if (opts.dim) node.classList.add('dim');
  if (opts.onClick) {
    node.classList.add('clickable');
    node.addEventListener('click', event => opts.onClick(event, itemId));
  }
  if (opts.onContext) {
    node.addEventListener('contextmenu', event => {
      event.preventDefault();
      opts.onContext(event, itemId);
    });
  }
  return node;
}

function statLines(def) {
  const lines = [];
  if (def.damage) lines.push(['Урон', def.damage]);
  if (def.armor) lines.push(['Броня', def.armor]);
  if (def.slots) lines.push(['Ячейки', `+${def.slots}`]);
  for (const key of Object.keys(def.stats || {})) {
    const value = def.stats[key];
    const shown = PERCENT_STATS.has(key) ? `${Math.round(value * 100)}%` : value;
    lines.push([STAT_NAMES[key] || key, `${value > 0 ? '+' : ''}${shown}`]);
  }
  const use = def.use || {};
  if (use.heal) lines.push(['Лечение', `+${use.heal}`]);
  if (use.healOverTime) lines.push(['Лечение', `+${use.healOverTime.amount} за ${use.healOverTime.duration} с`]);
  if (use.stamina) lines.push(['Выносливость', `+${use.stamina}`]);
  if (use.buff && use.buff.name) lines.push(['Эффект', use.buff.name]);
  return lines;
}

/**
 * Tooltip body for an item: rarity-coloured name, type line, stats, description, value.
 * @param {string} itemId
 * @param {Array<string|Node|{text: string, kind?: 'good'|'bad'|'warn'|'dim'}>} [extraLines]  appended under the description
 * @returns {HTMLElement}
 * @example tooltip.attach(row, () => itemTooltip('steel', [{ text: 'В сумке: 4', kind: 'dim' }]))
 */
export function itemTooltip(itemId, extraLines) {
  const def = itemDef(itemId);
  const typeParts = [ITEM_TYPE_NAMES[def.type] || 'Предмет'];
  if (def.slot && SLOT_NAMES[def.slot] && def.type !== 'weapon' && def.type !== 'tool' && def.type !== 'bag') typeParts.push(SLOT_NAMES[def.slot]);
  if (def.weight && WEIGHT_NAMES[def.weight]) typeParts.push(WEIGHT_NAMES[def.weight]);
  const head = el('div.kit-tip-head', null, [
    el('div.kit-tip-icon', null, icon(def.icon)),
    el('div', null, [
      el('div.kit-tip-name', { text: def.name }),
      el('div.kit-tip-type', { text: `${typeParts.join(' · ')} — ${RARITY_NAMES[def.rarity] || ''}` }),
    ]),
  ]);
  const body = el('div.kit-tip-item', null, head);
  body.style.setProperty('--rarity', rarityColor(def.rarity));
  const stats = statLines(def);
  if (stats.length) body.append(el('div.kit-tip-stats', null, stats.map(([label, value]) => statRow(label, value))));
  if (def.requiredLevel > 1) body.append(el('div.kit-tip-req', { text: `Требуется уровень ${def.requiredLevel}` }));
  if (def.desc) body.append(el('div.kit-tip-desc', { text: def.desc }));
  for (const line of extraLines || []) {
    if (line instanceof Node) body.append(line);
    else if (typeof line === 'string') body.append(el('div.kit-tip-line', { text: line }));
    else if (line) body.append(el('div.kit-tip-line', { class: line.kind || '', text: line.text }));
  }
  if (def.value > 0) body.append(el('div.kit-tip-value', null, [el('span', { text: 'Цена' }), coins(def.value)]));
  return body;
}

/**
 * Quantity picker «− 12 +» with min/max buttons; mouse wheel and ←/→ change the value.
 * @param {{value?: number, min?: number, max?: number, step?: number, onChange?: (value: number) => void}} opts
 * @returns {HTMLElement & {value: number}}
 * @example const qty = numberStepper({ value: 1, min: 1, max: owned, onChange: n => total.textContent = n * price });
 */
export function numberStepper(opts = {}) {
  const min = opts.min ?? 0;
  let max = opts.max ?? 999;
  const step = opts.step || 1;
  let value = Math.max(min, Math.min(max, opts.value ?? min));
  const field = el('input.kit-stepper-value.t-num', { type: 'text', inputMode: 'numeric', value: String(value) });
  const set = (next, silent) => {
    const clamped = Math.max(min, Math.min(max, Math.round(Number.isFinite(next) ? next : min)));
    const changed = clamped !== value;
    value = clamped;
    field.value = String(value);
    if (changed && !silent && opts.onChange) opts.onChange(value);
  };
  const side = (label, fn, cls) => el('button', { class: `kit-stepper-btn ${cls || ''}`, type: 'button', text: label, onClick: fn });
  const node = el('div.kit-stepper', null, [
    side('мин', () => set(min), 'edge'),
    side('−', event => set(value - step * (event.shiftKey ? 10 : 1))),
    field,
    side('+', event => set(value + step * (event.shiftKey ? 10 : 1))),
    side('макс', () => set(max), 'edge'),
  ]);
  field.addEventListener('change', () => set(parseInt(field.value, 10)));
  field.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp') set(value + step);
    else if (event.key === 'ArrowDown') set(value - step);
    else return;
    event.preventDefault();
  });
  node.addEventListener('wheel', event => {
    event.preventDefault();
    set(value - Math.sign(event.deltaY) * step);
  }, { passive: false });
  Object.defineProperty(node, 'value', { get: () => value, set: next => set(next, true) });
  node.setMax = next => {
    max = next;
    set(value, true);
  };
  return node;
}

/**
 * Placeholder for an empty list or panel.
 * @example emptyState('В сумке пусто', 'bag')
 */
export function emptyState(text, iconKey) {
  return el('div.kit-empty', null, [
    iconKey ? icon(iconKey, { class: 'kit-empty-icon' }) : el('i.kit-empty-diamond'),
    el('div.kit-empty-text', { text }),
  ]);
}

/**
 * Vertical scroll container with the thin gold scrollbar.
 * @param {Node|Array} [children]
 * @param {{class?: string}} [opts]
 * @example scrollArea(rows, { class: 'recipe-list' })
 */
export function scrollArea(children, opts = {}) {
  return el('div.kit-scroll.interactive', { class: opts.class || '' }, children);
}

/**
 * Slider row control.
 * @param {{value: number, min?: number, max?: number, step?: number, format?: (v: number) => string, onChange?: (v: number) => void}} opts
 * @returns {HTMLElement & {value: number}}
 * @example slider({ value: 0.5, min: 0, max: 1, step: 0.05, format: v => `${Math.round(v * 100)}%`, onChange: setVolume })
 */
export function slider(opts = {}) {
  const min = opts.min ?? 0;
  const max = opts.max ?? 1;
  const format = opts.format || (v => String(v));
  const input = el('input.kit-slider-input', { type: 'range', min, max, step: opts.step ?? 0.01, value: opts.value ?? min });
  const readout = el('span.kit-slider-value.t-num');
  const node = el('div.kit-slider', null, [input, readout]);
  const paint = () => {
    const v = parseFloat(input.value);
    node.style.setProperty('--p', ((v - min) / (max - min || 1)).toFixed(4));
    readout.textContent = format(v);
  };
  input.addEventListener('input', () => {
    paint();
    if (opts.onChange) opts.onChange(parseFloat(input.value));
  });
  Object.defineProperty(node, 'value', {
    get: () => parseFloat(input.value),
    set: v => {
      input.value = v;
      paint();
    },
  });
  paint();
  return node;
}

/**
 * On/off switch.
 * @param {{value: boolean, onChange?: (v: boolean) => void}} opts
 * @returns {HTMLElement & {value: boolean}}
 * @example toggle({ value: settings.invertY, onChange: v => settings.set('invertY', v) })
 */
export function toggle(opts = {}) {
  let value = !!opts.value;
  const node = el('button.kit-toggle', { type: 'button' }, [el('i.kit-toggle-knob'), el('span.kit-toggle-text')]);
  const paint = () => {
    node.classList.toggle('on', value);
    node.lastChild.textContent = value ? 'Вкл' : 'Выкл';
  };
  node.addEventListener('click', () => {
    value = !value;
    paint();
    if (opts.onChange) opts.onChange(value);
  });
  Object.defineProperty(node, 'value', {
    get: () => value,
    set: v => {
      value = !!v;
      paint();
    },
  });
  paint();
  return node;
}

/**
 * Segmented choice (radio group drawn as joined buttons).
 * @param {{options: Array<{id: string, label: string, title?: string}>, value: string, onChange?: (id: string) => void}} opts
 * @returns {HTMLElement & {value: string}}
 * @example segmented({ options: [{ id: 'low', label: 'Низкое' }, { id: 'high', label: 'Высокое' }], value: 'high', onChange: g.setQuality })
 */
export function segmented(opts) {
  let value = opts.value;
  const node = el('div.kit-segmented');
  const paint = () => {
    for (const child of node.children) child.classList.toggle('active', child.dataset.id === String(value));
  };
  for (const option of opts.options) {
    const btn = el('button', { type: 'button', text: option.label, dataset: { id: option.id }, onClick: () => {
      if (value === option.id) return;
      value = option.id;
      paint();
      if (opts.onChange) opts.onChange(value);
    } });
    if (option.title) tooltip.attach(btn, option.title);
    node.append(btn);
  }
  Object.defineProperty(node, 'value', {
    get: () => value,
    set: v => {
      value = v;
      paint();
    },
  });
  paint();
  return node;
}

/**
 * Centred ornament rule: hairline — diamond — hairline.
 * @example panel.append(ornament())
 */
export function ornament() {
  return el('div.kit-orn', null, el('i'));
}

/**
 * Small coloured tag («урон», «поддержка», «новое»).
 * @example tag('Элита', 'warn')
 */
export function tag(text, kind) {
  return el('span.kit-tag', { class: kind || '', text });
}

/**
 * Titled panel block with a hairline frame — the standard container of a detail column.
 * @param {string|null} title
 * @param {Node|Array} children
 * @example panel('Награда', [costLine({ coins: 80 })])
 */
export function panel(title, children) {
  return el('section.kit-panel', null, [title ? sectionTitle(title) : null, children]);
}
