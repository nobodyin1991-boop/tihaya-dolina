// HUD: hotbar — 5 ability slots, the level badge, 4 quick-item slots.
// Consumes: g.heroCtl.hotbar(), g.heroCtl.quickSlots(), g.input.caption(), g.input.onAction (press flash), g.hero.stamina.
import { item as itemDef } from '../../data/items.js';
import { icon, setIcon } from '../icons.js';
import { el, setText, setClass, itemTooltip } from '../kit.js';

const ABILITY_COUNT = 5;
const QUICK_COUNT = 4;

function createSlot(kind, caption) {
  const glyph = icon('diamond', { class: 'slot-glyph' });
  const sweep = el('i.slot-sweep');
  const seconds = el('span.slot-seconds.t-num');
  const count = el('span.slot-count.t-num');
  const lock = icon('lock', { class: 'slot-lock' });
  const node = el(`div.slot.${kind}.interactive.empty`, null, [
    glyph, sweep, seconds, count, lock, el('i.slot-flash'), el('span.slot-key', { text: caption }),
  ]);
  return { el: node, glyph, sweep, seconds, count, cd: -1, wasCooling: false, data: null };
}

function paintCooldown(slot, cooldown, total) {
  const fraction = cooldown > 0 && total > 0 ? Math.min(1, cooldown / total) : 0;
  const stepped = Math.round(fraction * 200) / 200;
  if (stepped !== slot.cd) {
    slot.cd = stepped;
    slot.sweep.style.setProperty('--cd', String(stepped));
  }
  const cooling = cooldown > 0.05;
  setClass(slot.el, 'cooling', cooling);
  if (cooling) setText(slot.seconds, cooldown >= 9.95 ? Math.round(cooldown) : cooldown.toFixed(1));
  if (slot.wasCooling && !cooling) {
    slot.el.classList.remove('ping');
    void slot.el.offsetWidth;
    slot.el.classList.add('ping');
  }
  slot.wasCooling = cooling;
}

function flash(slot) {
  slot.el.classList.remove('pressed');
  void slot.el.offsetWidth;
  slot.el.classList.add('pressed');
}

function abilityTip(data) {
  if (!data || !data.abilityId) return null;
  return el('div.slot-tip', null, [
    el('div.kit-tip-name', { text: data.name || '' }),
    el('div.kit-tip-type', { text: `Ранг ${data.rank || 1}${data.staminaCost ? ` · ${data.staminaCost} выносливости` : ''}${data.cooldownTotal ? ` · ${data.cooldownTotal} с` : ''}` }),
    data.lockedReason ? el('div.kit-tip-line.bad', { text: data.lockedReason }) : null,
  ]);
}

export function createHotbar(g, ui, layer, badge) {
  const abilities = [];
  const quick = [];
  const abilityBox = el('div.hotbar-group.abilities');
  const quickBox = el('div.hotbar-group.quick');
  for (let i = 1; i <= ABILITY_COUNT; i++) {
    const slot = createSlot('ability', g.input.caption(`ability${i}`));
    ui.tooltip.attach(slot.el, () => abilityTip(slot.data));
    abilities.push(slot);
    abilityBox.append(slot.el);
  }
  for (let i = 1; i <= QUICK_COUNT; i++) {
    const slot = createSlot('quick', g.input.caption(`quick${i}`));
    ui.tooltip.attach(slot.el, () => (slot.itemId ? itemTooltip(slot.itemId) : 'Быстрый слот — назначается в инвентаре'));
    quick.push(slot);
    quickBox.append(slot.el);
  }
  layer.append(el('div.hotbar', null, [abilityBox, badge, quickBox]));

  g.input.onAction((action, pressed) => {
    if (!pressed) return;
    if (action.startsWith('ability')) {
      const slot = abilities[Number(action.slice(7)) - 1];
      if (slot) flash(slot);
    } else if (action.startsWith('quick') && action !== 'quickHeal') {
      const slot = quick[Number(action.slice(5)) - 1];
      if (slot) flash(slot);
    }
  });

  function updateAbility(slot, data) {
    slot.data = data || null;
    const has = !!(data && data.abilityId);
    setClass(slot.el, 'empty', !has);
    if (!has) {
      paintCooldown(slot, 0, 0);
      return;
    }
    setIcon(slot.glyph, data.icon || 'diamond');
    setClass(slot.el, 'locked', !!data.lockedReason);
    setClass(slot.el, 'unusable', !data.lockedReason && data.usable === false && !(data.cooldown > 0));
    paintCooldown(slot, data.lockedReason ? 0 : data.cooldown || 0, data.cooldownTotal || 0);
  }

  function updateQuick(slot, data) {
    const itemId = data ? data.itemId : null;
    if (slot.itemId !== itemId) {
      slot.itemId = itemId;
      setClass(slot.el, 'empty', !itemId);
      if (itemId) {
        const def = itemDef(itemId);
        setIcon(slot.glyph, def.icon);
        slot.el.style.setProperty('--rarity', `var(--r-${def.rarity})`);
      }
    }
    if (!itemId) {
      paintCooldown(slot, 0, 0);
      return;
    }
    setText(slot.count, data.count > 1 ? data.count : '');
    setClass(slot.el, 'unusable', !(data.count > 0));
    paintCooldown(slot, data.cooldown || 0, data.cooldownTotal || 0);
  }

  function update() {
    const bar = g.heroCtl.hotbar() || [];
    for (let i = 0; i < ABILITY_COUNT; i++) updateAbility(abilities[i], bar[i]);
    const items = g.heroCtl.quickSlots() || [];
    for (let i = 0; i < QUICK_COUNT; i++) updateQuick(quick[i], items[i]);
  }

  return { update };
}
