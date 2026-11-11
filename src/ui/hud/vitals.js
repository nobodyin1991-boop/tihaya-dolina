// HUD: health / stamina bars (shrinking towards the centre), hero status pips, level badge and XP sliver.
// Consumes: g.hero.{hp,maxHp,stamina,maxStamina,level,statuses}, sim xpProgress(g.state), events hero:damaged, player:xp, player:levelup.
import { on } from '../../core/events.js';
import { xpProgress } from '../../sim/player.js';
import { icon, setIcon } from '../icons.js';
import { el, setText, setClass } from '../kit.js';
import { statusIcon, statusHarmful } from '../markers.js';

/**
 * Row of status pips with a draining ring. `update(statuses)` accepts [{type, t, total}].
 * Shared by the hero vitals and the target frame.
 */
export function createStatusPips(className) {
  const box = el(`div.status-pips.${className}`);
  const pool = [];
  function update(statuses) {
    const count = statuses ? Math.min(statuses.length, 8) : 0;
    for (let i = 0; i < count || i < pool.length; i++) {
      if (i >= pool.length) {
        const glyph = icon('star');
        const node = el('div.status-pip', null, [el('i.status-ring'), glyph]);
        node.glyph = glyph;
        box.append(node);
        pool.push(node);
      }
      const node = pool[i];
      if (i >= count) {
        if (!node.hidden) node.hidden = true;
        continue;
      }
      const status = statuses[i];
      if (node.hidden) node.hidden = false;
      if (node._type !== status.type) {
        node._type = status.type;
        setIcon(node.glyph, statusIcon(status.type));
        node.classList.toggle('harm', statusHarmful(status.type));
      }
      const left = status.total > 0 ? Math.round((status.t / status.total) * 40) / 40 : 1;
      if (node._left !== left) {
        node._left = left;
        node.style.setProperty('--left', String(left));
      }
    }
  }
  return { el: box, update };
}

function createVital(kind) {
  const ghost = el('i.vital-ghost');
  const fill = el('i.vital-fill');
  const num = el('span.vital-num.t-num');
  const node = el(`div.vital.${kind}.interactive`, null, [el('i.vital-cap.left'), el('div.vital-track', null, [ghost, fill]), el('i.vital-cap.right'), num]);
  let lastFraction = -1;
  let lastValue = -1;
  let showFor = 0;
  function update(dt, value, max) {
    const safeMax = max > 0 ? max : 1;
    const fraction = Math.max(0, Math.min(1, value / safeMax));
    const rounded = Math.round(fraction * 500) / 500;
    if (rounded !== lastFraction) {
      lastFraction = rounded;
      const transform = `scaleX(${rounded})`;
      fill.style.transform = transform;
      ghost.style.transform = transform;
    }
    const whole = Math.ceil(value);
    if (whole !== lastValue) {
      if (lastValue >= 0) showFor = 2.5;
      lastValue = whole;
      setText(num, `${whole} / ${Math.round(safeMax)}`);
    }
    if (showFor > 0) showFor -= dt;
    setClass(node, 'show-num', showFor > 0);
    return fraction;
  }
  return { el: node, update };
}

export function createVitals(g, ui, layer) {
  const health = createVital('health');
  const stamina = createVital('stamina');
  const pips = createStatusPips('hero-pips');
  const levelText = el('span.level-num.t-num', { text: '1' });
  const badge = el('div.level-badge.interactive', null, [el('i.level-frame'), levelText]);
  const xpFill = el('i.xp-fill');
  const xpBar = el('div.xp-bar', null, xpFill);
  const rootEl = el('div.vitals', null, [pips.el, health.el, stamina.el]);
  layer.append(rootEl, xpBar);

  let xpIn = 0;
  let lastXp = -1;
  let xpTip = '';

  function updateXp() {
    if (!g.state || !g.state.player) return;
    const progress = xpProgress(g.state);
    const fraction = Math.round(progress.fraction * 1000) / 1000;
    if (fraction !== lastXp) {
      lastXp = fraction;
      xpFill.style.transform = `scaleX(${fraction})`;
    }
    xpTip = progress.required ? `Опыт: ${progress.current} / ${progress.required}` : 'Достигнут высший уровень';
  }
  ui.tooltip.attach(badge, () => xpTip);

  on('hero:damaged', payload => {
    health.el.classList.remove('hit', 'crit');
    void health.el.offsetWidth;
    health.el.classList.add('hit');
    if (payload && payload.crit) health.el.classList.add('crit');
  });
  on('player:xp', () => {
    xpIn = 0;
    xpBar.classList.remove('gain');
    void xpBar.offsetWidth;
    xpBar.classList.add('gain');
  });
  on('player:levelup', () => {
    xpIn = 0;
  });

  function update(dt) {
    const hero = g.hero;
    const fraction = health.update(dt, hero.hp ?? 0, hero.maxHp ?? 1);
    stamina.update(dt, hero.stamina ?? 0, hero.maxStamina ?? 1);
    setClass(health.el, 'low', fraction < 0.3 && hero.alive !== false);
    pips.update(hero.statuses);
    setText(levelText, hero.level ?? 1);
    xpIn -= dt;
    if (xpIn <= 0) {
      xpIn = 1;
      updateXp();
    }
  }

  return { update, badge, lowHealth: () => health.el._c_low === true };
}
