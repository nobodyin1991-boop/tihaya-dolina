// HUD: quest tracker and caravan tracker (right side).
// Consumes: ui.questTrackerProvider() → [{title, objectives:[{text, cur, need, done}]}],
//           g.caravanRun.hud() → {legName, progress, hp, maxHp, status, cargoLeft, cargoTotal, guards:[{name,hp,maxHp,alive}], distance}.
import { on } from '../../core/events.js';
import { icon } from '../icons.js';
import { el, clear, setText, setClass } from '../kit.js';
import { formatDistance } from '../markers.js';

const QUEST_REFRESH = 0.5;
const MAX_QUESTS = 4;
const STATUS_TEXT = {
  moving: 'В пути', travel: 'В пути', rolling: 'В пути', combat: 'Нападение!', ambush: 'Нападение!', stopped: 'Стоит',
  waiting: 'Ждёт вас', blocked: 'Дорога перекрыта', obstacle: 'Дорога перекрыта', repair: 'Ремонт', arrived: 'Прибыл',
};

function questNode(quest) {
  const objectives = (quest.objectives || []).map(o => {
    const counter = o.need > 1 ? ` ${Math.min(o.cur || 0, o.need)}/${o.need}` : '';
    return el('div.quest-obj', { class: o.done ? 'done' : '' }, [el('i.quest-mark'), el('span', { text: `${o.text}${counter}` })]);
  });
  return el('div.quest', null, [el('div.quest-title', { text: quest.title || '' }), objectives]);
}

export function createTrackers(g, ui, layer) {
  // —— caravan ——
  const legName = el('div.caravan-leg');
  const statusText = el('span.caravan-status');
  const distText = el('span.caravan-dist.t-num');
  const wagon = el('div.caravan-wagon', null, icon('wagon'));
  const lineFill = el('i.caravan-line-fill');
  const line = el('div.caravan-line', null, [lineFill, el('i.caravan-end.from'), el('i.caravan-end.to'), wagon]);
  const hpFill = el('i');
  const hpText = el('span.t-num');
  const cargoText = el('span.t-num');
  const guardBox = el('div.caravan-guards');
  const caravan = el('div.caravan-tracker', null, [
    el('div.caravan-head', null, [icon('wagon'), legName]),
    el('div.caravan-sub', null, [statusText, distText]),
    line,
    el('div.caravan-row', null, [icon('shield'), el('div.caravan-hp', null, hpFill), hpText]),
    el('div.caravan-row', null, [icon('crate'), el('span.caravan-label', { text: 'Груз' }), cargoText]),
    guardBox,
  ]);
  // —— quests ——
  const quests = el('div.quest-tracker');
  layer.append(el('div.hud-right', null, [caravan, quests]));

  let questIn = 0;
  let questSignature = '';
  let lastProgress = -1;
  let lastHp = -1;
  let guardSignature = '';
  let lineWidth = 0;
  new ResizeObserver(() => {
    lineWidth = line.clientWidth;
    lastProgress = -1;
  }).observe(line);

  function refreshQuests() {
    const provider = ui.questTrackerProvider;
    let list = null;
    try {
      list = provider ? provider() : null;
    } catch (error) {
      console.error('[hud] quest tracker provider', error);
    }
    const signature = list && list.length ? JSON.stringify(list.slice(0, MAX_QUESTS)) : '';
    if (signature === questSignature) return;
    questSignature = signature;
    clear(quests);
    if (!signature) return;
    quests.append(el('div.tracker-caption', { text: 'Задания' }));
    for (const quest of list.slice(0, MAX_QUESTS)) quests.append(questNode(quest));
  }
  for (const type of ['quest:started', 'quest:updated', 'quest:completed']) {
    on(type, () => {
      questIn = 0;
    });
  }

  function refreshGuards(guards) {
    let signature = '';
    for (let i = 0; i < guards.length; i++) {
      const guard = guards[i];
      signature += `${guard.name}:${guard.alive ? Math.round((guard.hp / (guard.maxHp || 1)) * 20) : 'x'};`;
    }
    if (signature === guardSignature) return;
    guardSignature = signature;
    clear(guardBox);
    for (const guard of guards) {
      const fill = el('i');
      fill.style.transform = `scaleX(${guard.alive ? Math.max(0, Math.min(1, guard.hp / (guard.maxHp || 1))) : 0})`;
      guardBox.append(el('div.caravan-guard', { class: guard.alive ? '' : 'dead' }, [
        icon(guard.alive ? 'sword' : 'skull'),
        el('span.caravan-guard-name', { text: guard.name }),
        el('div.caravan-guard-hp', null, fill),
      ]));
    }
  }

  function updateCaravan() {
    const hud = g.caravanRun ? g.caravanRun.hud() : null;
    setClass(caravan, 'show', !!hud);
    if (!hud) return;
    const combat = hud.status === 'combat' || hud.status === 'ambush';
    setClass(caravan, 'combat', combat);
    setText(legName, hud.legName || 'Караван');
    setText(statusText, STATUS_TEXT[hud.status] || 'В пути');
    setText(distText, hud.distance !== undefined && hud.distance !== null ? `до телеги ${formatDistance(hud.distance)}` : '');
    const progress = Math.round(Math.max(0, Math.min(1, hud.progress || 0)) * 500) / 500;
    if (progress !== lastProgress && lineWidth) {
      lastProgress = progress;
      lineFill.style.transform = `scaleX(${progress})`;
      wagon.style.transform = `translate3d(${Math.round(progress * lineWidth)}px, 0, 0)`;
    }
    const hp = Math.round(Math.max(0, Math.min(1, hud.hp / (hud.maxHp || 1))) * 200) / 200;
    if (hp !== lastHp) {
      lastHp = hp;
      hpFill.style.transform = `scaleX(${hp})`;
    }
    setText(hpText, `${Math.max(0, Math.ceil(hud.hp))} / ${Math.round(hud.maxHp || 0)}`);
    setText(cargoText, `${hud.cargoLeft ?? 0} / ${hud.cargoTotal ?? 0}`);
    refreshGuards(hud.guards || []);
  }

  function update(dt) {
    updateCaravan();
    questIn -= dt;
    if (questIn <= 0) {
      questIn = QUEST_REFRESH;
      refreshQuests();
    }
  }

  return { update };
}
