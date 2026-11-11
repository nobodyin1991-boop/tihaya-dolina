// Dialogue (contextual, chrome-less, params {npcId}): lower-third conversation panel with a typewriter line,
// numbered answers and a small result card for quest starts / turn-ins. Service answers close the dialogue
// and open the mapped screen.
// Sim: dialogue (startDialogue, chooseOption). Engine: g.npcs.setTalking / byId.
import { on } from '../../core/events.js';
import { startDialogue, chooseOption } from '../../sim/dialogue.js';
import { QUESTS } from '../../data/quests.js';
import { SHOPS } from '../../data/economy.js';
import { PROFESSIONS } from '../../data/professions.js';
import { icon } from '../icons.js';
import { el, clear, coins, keyHint } from '../kit.js';
import { safe, rewardLine, cityName, roleOf, currentCityKey } from '../screen-kit.js';

const TYPE_SPEED = 55;   // characters per second
const KIND_ICONS = {
  quest: 'quest', questAccept: 'quest', questTurnIn: 'quest-done', questTalk: 'quest', questRemind: 'journal',
  service: 'coin', about: 'npc', rumor: 'speech', leave: 'exit', back: 'back', choice: 'speech',
};
const QUEST_KINDS = new Set(['quest', 'questAccept', 'questTurnIn', 'questTalk', 'questRemind']);
const RESULT_ICONS = { quest: 'quest', questDone: 'quest-done', item: 'crate', coins: 'coin', rep: 'city', fail: 'warning' };

/**
 * Map a dialogue `uiAction` to the screen to open.
 * @returns {{screen: string, params: object}|null}
 */
export function screenForAction(action, g) {
  const cityKey = action.cityKey || currentCityKey(g) || 'valley';
  const role = roleOf(action.npcId);
  switch (action.open) {
    case 'shop': {
      // the innkeeper has no stock of his own: he sells the city's food from the grocer's shelves
      const own = SHOPS[cityKey] && SHOPS[cityKey][role];
      return { screen: 'shop', params: own ? { cityKey, role } : { cityKey, role: 'grocer', only: 'food', title: 'Трактир: еда и питьё' } };
    }
    case 'trade': return { screen: 'trade', params: { cityKey } };
    case 'craft': return { screen: 'crafting', params: { atStation: PROFESSIONS[role] ? [role] : true, cityKey } };
    case 'train': return { screen: 'train', params: { cityKey, role } };
    case 'caravan': return { screen: 'caravan', params: {} };
    case 'storage': return { screen: 'storage', params: { cityKey } };
    case 'board': case 'bounties': case 'stable': case 'guards': case 'rest':
      return { screen: action.open, params: { cityKey } };
    default: return null;
  }
}

export function registerDialogueScreen(ui, g) {
  ui.registerScreen({
    id: 'dialogue', title: 'Разговор', chrome: false,
    create: () => createDialogue(g, ui),
  });
}

function createDialogue(g, ui) {
  let npcId = null;
  let node = null;
  let options = [];
  let cursor = 0;
  let fullText = '';
  let shown = 0;
  let typing = false;

  const nameNode = el('div.dlg-name');
  const titleNode = el('div.dlg-title');
  const textNode = el('p.dlg-text');
  const moreNode = el('span.dlg-more', null, [keyHint('Пробел'), 'дальше']);
  const resultsNode = el('div.dlg-results');
  const optionsNode = el('div.dlg-options');
  const panel = el('div.dlg-panel.interactive', null, [
    el('div.dlg-head', null, [el('span.dlg-portrait', null, icon('npc')), el('div', null, [nameNode, titleNode]), el('i.dlg-rule')]),
    el('div.dlg-body', null, [el('div.dlg-speech', null, [textNode, moreNode, resultsNode]), optionsNode]),
    el('div.dlg-hints', null, [keyHint('1–9', 'Ответ'), keyHint('↑↓'), keyHint('Enter', 'Выбрать'), keyHint('Esc', 'Уйти', { onClick: () => ui.close() })]),
  ]);
  const root = el('div.dlg-view', { onClick: event => {
    if (event.target === root || event.target.closest('.dlg-speech')) skip();
  } }, [el('div.dlg-shade'), panel]);

  function setLine(text) {
    fullText = text || '…';
    shown = 0;
    typing = true;
    textNode.textContent = '';
    panel.classList.add('typing');
  }

  function skip() {
    if (!typing) return false;
    typing = false;
    shown = fullText.length;
    textNode.textContent = fullText;
    panel.classList.remove('typing');
    return true;
  }

  function renderOptions() {
    clear(optionsNode);
    options.forEach((option, position) => {
      const quest = QUEST_KINDS.has(option.kind);
      const row = el('button.dlg-option', {
        type: 'button', disabled: !!option.disabled,
        class: `${position === cursor ? 'active' : ''} ${quest ? 'quest' : ''} k-${option.kind}`,
        onClick: () => choose(position),
        onMouseenter: () => setCursor(position),
      }, [
        el('span.dlg-option-num.t-num', { text: position < 9 ? String(position + 1) : '' }),
        el('span.dlg-option-icon', null, icon(KIND_ICONS[option.kind] || 'speech')),
        el('span.dlg-option-text', { text: option.text }),
        option.disabled ? el('span.dlg-option-lock', null, icon('lock')) : null,
      ]);
      optionsNode.append(row);
    });
  }

  function setCursor(position) {
    if (!options.length) return;
    cursor = (position + options.length) % options.length;
    [...optionsNode.children].forEach((child, index) => child.classList.toggle('active', index === cursor));
    const active = optionsNode.children[cursor];
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function showResults(results) {
    clear(resultsNode);
    for (const result of results || []) {
      const card = el('div.dlg-result', { class: result.kind }, [
        el('span.dlg-result-icon', null, icon(RESULT_ICONS[result.kind] || 'info')),
        el('div', null, [
          el('div.dlg-result-text', { text: result.text }),
          result.kind === 'questDone' && result.rewards ? rewardLine(result.rewards) : null,
          result.kind === 'coins' && result.amount > 0 ? coins(result.amount) : null,
          result.kind === 'rep' && result.cityKey ? el('div.dlg-result-sub', { text: `${cityName(result.cityKey)}: ${result.amount > 0 ? '+' : '−'}${Math.abs(result.amount)}` }) : null,
        ]),
      ]);
      resultsNode.append(card);
    }
  }

  function show(view, results) {
    node = view.node;
    options = view.options || [];
    cursor = Math.max(0, options.findIndex(option => !option.disabled));
    if (view.npc) {
      nameNode.textContent = view.npc.name;
      const place = view.npc.cityKey ? cityName(view.npc.cityKey) : '';
      titleNode.textContent = [view.npc.title, place].filter(Boolean).join(' · ');
    } else if (node && node.speakerName) nameNode.textContent = node.speakerName;
    setLine(node.text);
    showResults(results);
    renderOptions();
  }

  function choose(position) {
    const option = options[position];
    if (!option || !node) return;
    if (skip()) return;
    if (option.disabled) {
      ui.toast('Сейчас это невозможно', 'warn');
      return;
    }
    // quests that start or finish as a side effect (auto quests, talk objectives) are not listed in `results`
    const side = [];
    const stops = [
      on('quest:started', payload => side.push({ kind: 'quest', id: payload && payload.id })),
      on('quest:completed', payload => side.push({ kind: 'questDone', id: payload && payload.id })),
    ];
    const result = safe(() => chooseOption(g.state, npcId, node.id, option.index), { ok: false, reason: 'Разговор оборвался' });
    for (const stop of stops) stop();
    if (result && result.ok) result.results = mergeResults(result.results || [], side);
    if (!result.ok) {
      ui.toast(result.reason || 'Не получилось', 'warn');
      return;
    }
    const target = result.uiAction ? screenForAction(result.uiAction, g) : null;
    if (target) {
      ui.close();
      if (!ui.open(target.screen, target.params)) ui.toast('Здесь это пока недоступно', 'warn');
      return;
    }
    if (!result.node) {
      for (const note of result.results || []) if (note.kind === 'fail') ui.toast(note.text, 'warn');
      ui.close();
      return;
    }
    show(result, result.results);
  }

  function mergeResults(results, side) {
    const merged = results.slice();
    for (const extra of side) {
      const quest = QUESTS[extra.id];
      if (!quest || merged.some(entry => entry.id === extra.id && entry.kind === extra.kind)) continue;
      if (extra.kind === 'quest') merged.push({ kind: 'quest', id: extra.id, text: `Новое задание: «${quest.title}»` });
      else merged.push({ kind: 'questDone', id: extra.id, rewards: quest.rewards || {}, text: `Задание завершено: «${quest.title}»` });
    }
    return merged.sort((a, b) => (a.kind === 'questDone' ? 0 : 1) - (b.kind === 'questDone' ? 0 : 1));
  }

  function onKey(event) {
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    if (digit) {
      const position = Number(digit[1]) - 1;
      if (position < options.length) {
        skip();
        choose(position);
      }
      return true;
    }
    switch (event.code) {
      case 'Space':
        if (!skip()) choose(cursor);
        return true;
      case 'Enter': case 'NumpadEnter': case 'KeyE': case 'KeyF':
        if (!skip()) choose(cursor);
        return true;
      case 'ArrowDown': case 'KeyS': setCursor(cursor + 1); return true;
      case 'ArrowUp': case 'KeyW': setCursor(cursor - 1); return true;
      default: return false;
    }
  }

  return {
    el: root,
    onOpen(params) {
      npcId = params && params.npcId;
      clear(resultsNode);
      const start = safe(() => startDialogue(g.state, npcId), { ok: false, reason: 'С ним не о чем говорить' });
      if (!start || !start.ok) {
        ui.toast((start && start.reason) || 'С ним не о чем говорить', 'warn');
        Promise.resolve().then(() => {
          if (ui.isOpen('dialogue')) ui.close();
        });
        return;
      }
      show(start, null);
    },
    onClose() {
      typing = false;
      safe(() => g.npcs.setTalking(g.npcs.byId(npcId), false));
    },
    update(dt) {
      if (!typing) return;
      shown = Math.min(fullText.length, shown + dt * TYPE_SPEED);
      const count = Math.floor(shown);
      if (textNode.textContent.length !== count) textNode.textContent = fullText.slice(0, count);
      if (count >= fullText.length) skip();
    },
    onKey,
  };
}
