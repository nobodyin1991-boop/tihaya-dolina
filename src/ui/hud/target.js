// HUD: target frame under the compass.
// Consumes: g.hero.target {id, name, level, hp, maxHp, elite, boss, kind, team, statuses}, g.hero.level.
import { el, setText, setClass } from '../kit.js';
import { difficultyClass } from '../markers.js';
import { createStatusPips } from './vitals.js';

const FRIENDLY_TEAMS = new Set(['player', 'friendly', 'ally', 'npc', 'guard', 'caravan', 'neutral']);

export function createTarget(g, ui, layer) {
  const level = el('span.target-level.t-num');
  const name = el('span.target-name');
  const rank = el('span.target-rank');
  const ghost = el('i.vital-ghost');
  const fill = el('i.vital-fill');
  const hpText = el('span.target-hp.t-num');
  const pips = createStatusPips('target-pips');
  const rootEl = el('div.target', null, [
    el('div.target-head', null, [el('i.target-wing.left'), level, name, el('i.target-wing.right')]),
    el('div.target-bar', null, [el('i.vital-cap.left'), el('div.vital-track', null, [ghost, fill]), el('i.vital-cap.right')]),
    el('div.target-meta', null, [rank, hpText]),
    pips.el,
  ]);
  layer.append(rootEl);

  let lastId = null;
  let lastFraction = -1;
  let lastLevelClass = '';

  function update() {
    const target = g.hero.target;
    setClass(rootEl, 'show', !!target);
    if (!target) {
      lastId = null;
      return;
    }
    if (target.id !== lastId) {
      lastId = target.id;
      lastFraction = -1;
      rootEl.classList.add('snap');
    } else if (rootEl.classList.contains('snap')) rootEl.classList.remove('snap');
    setText(name, target.name || '');
    setText(level, target.level ?? '');
    const levelClass = difficultyClass(target.level || 1, g.hero.level || 1);
    if (levelClass !== lastLevelClass) {
      if (lastLevelClass) level.classList.remove(lastLevelClass);
      level.classList.add(levelClass);
      lastLevelClass = levelClass;
    }
    const friendly = FRIENDLY_TEAMS.has(target.team) || target.kind === 'npc';
    setClass(rootEl, 'friendly', friendly);
    setClass(rootEl, 'elite', !!target.elite && !target.boss);
    setClass(rootEl, 'boss', !!target.boss);
    setText(rank, target.boss ? 'Вожак' : target.elite ? 'Матёрый' : '');
    const max = target.maxHp > 0 ? target.maxHp : 1;
    const fraction = Math.round(Math.max(0, Math.min(1, target.hp / max)) * 500) / 500;
    if (fraction !== lastFraction) {
      lastFraction = fraction;
      const transform = `scaleX(${fraction})`;
      fill.style.transform = transform;
      ghost.style.transform = transform;
    }
    setText(hpText, `${Math.max(0, Math.ceil(target.hp))} / ${Math.round(max)}`);
    pips.update(target.statuses);
  }

  return { update };
}
