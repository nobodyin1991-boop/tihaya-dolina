// Journal (menu tab): quests grouped main / side / contracts & bounties, finished quests, rumours and leads.
// Also feeds the HUD quest tracker (tracked quest + up to two other active main quests).
// Sim: quests (listQuests, trackQuest, trackedQuest, questLeads), board.boardJournal (inside listQuests).
import { listQuests, trackQuest, trackedQuest, questLeads } from '../../sim/quests.js';
import { marketNews } from '../../sim/economy.js';
import { icon } from '../icons.js';
import { el, listDetail, listRow, sectionTitle, button, tag, tabs, bar } from '../kit.js';
import { act, live, safe, note, rewardLine, cityName, npcLabel, STATE_EVENTS } from '../screen-kit.js';

const CATEGORY_NAMES = { main: 'Главная история', side: 'Поручения', contract: 'Заказы горожан', bounty: 'Награды за головы' };
const CATEGORY_ICONS = { main: 'quest', side: 'diamond', contract: 'note', bounty: 'skull' };

/** Entries for the HUD tracker: [{title, objectives:[{text, cur, need, done}]}]. */
function trackerEntries(state) {
  const list = [];
  const tracked = trackedQuest(state);
  if (tracked) list.push(tracked);
  for (const quest of listQuests(state)) {
    if (list.length >= 3) break;
    if (quest.category !== 'main' || (tracked && quest.id === tracked.id)) continue;
    list.push(quest);
  }
  return list.map(quest => ({
    title: quest.title,
    objectives: quest.status === 'ready'
      ? [{ text: 'Вернуться за наградой', done: false }]
      : quest.objectives.map(objective => ({ text: objective.text, cur: objective.need > 1 ? objective.cur : undefined, need: objective.need > 1 ? objective.need : undefined, done: objective.done })),
  }));
}

export function registerJournalScreen(ui, g) {
  ui.setQuestTrackerProvider(() => (g.state && g.state.quests ? safe(() => trackerEntries(g.state), []) : []));
  ui.registerScreen({
    id: 'journal', title: 'Журнал', action: 'journal', tab: { order: 50, icon: 'journal' },
    create: () => createJournal(g, ui),
  });
}

function createJournal(g, ui) {
  let mode = 'active';
  const state = () => g.state;
  const modeTabs = tabs({
    tabs: [{ id: 'active', label: 'Текущие' }, { id: 'done', label: 'Завершённые' }, { id: 'leads', label: 'Слухи и зацепки' }],
    onChange: id => {
      mode = id;
      refresh();
    },
  });

  const view = listDetail({
    items: [],
    emptyText: 'Здесь пока пусто',
    detailEmptyText: 'Задания дают жители городов — ищите отметку над головой',
    groupOf: entry => entry.group,
    renderRow: entry => (entry.lead ? leadRow(entry) : questRow(entry)),
    renderDetail: entry => safe(() => (entry.lead ? leadDetail(entry) : questDetail(entry)), null),
    onSelect: () => ui.refreshHints(),
    onActivate: entry => {
      if (!entry.lead && entry.status !== 'done' && entry.category in { main: 1, side: 1 }) track(entry);
    },
    class: 'jrn-list',
  });

  function questRow(quest) {
    const done = quest.objectives.filter(objective => objective.done).length;
    return listRow({
      icon: quest.status === 'done' ? 'quest-done' : CATEGORY_ICONS[quest.category] || 'quest',
      label: quest.title,
      sub: quest.status === 'ready' ? 'можно сдать' : quest.status === 'done' ? `завершено · ${cityName(quest.cityKey)}` : cityName(quest.cityKey),
      badge: quest.tracked ? 'отслеж.' : quest.status === 'ready' ? 'готово' : undefined,
      right: quest.status === 'active' && quest.objectives.length > 1 ? `${done}/${quest.objectives.length}` : '',
    });
  }

  const leadRow = entry => listRow({ icon: entry.icon, label: entry.title, sub: entry.sub });

  function showOnMap(focus, markerId) {
    if (markerId) ui.trackMarker(markerId);
    ui.open('map', { focus });
  }

  function track(quest) {
    act(ui, () => trackQuest(state(), quest.tracked ? null : quest.id), quest.tracked ? 'Отслеживание снято' : `Отслеживается: «${quest.title}»`);
  }

  function objectiveNode(objective) {
    const counted = objective.need > 1;
    const progress = counted ? bar({ value: objective.cur, max: objective.need, kind: objective.done ? 'stamina' : 'gold' }) : null;
    return el('div.jrn-objective', { class: objective.done ? 'done' : '' }, [
      el('span.jrn-objective-mark', null, icon(objective.done ? 'check' : 'diamond')),
      el('span.jrn-objective-text', { text: objective.text }),
      progress,
      counted ? el('span.jrn-objective-count.t-num', { text: `${objective.cur} / ${objective.need}` }) : null,
    ]);
  }

  function questDetail(quest) {
    const isStory = quest.category === 'main' || quest.category === 'side';
    const tags = [tag(CATEGORY_NAMES[quest.category] || 'Задание', quest.category === 'main' ? 'gold' : '')];
    if (quest.act) tags.push(tag(typeof quest.act === 'number' ? `акт ${quest.act}` : String(quest.act), ''));
    if (quest.status === 'ready') tags.push(tag('можно сдать', 'good'));
    if (quest.status === 'done') tags.push(tag(quest.doneDay ? `завершено на ${quest.doneDay}-й день` : 'завершено', 'good'));
    if (quest.stageCount > 1 && quest.status === 'active') tags.push(tag(`этап ${quest.stageIndex + 1} из ${quest.stageCount}`, 'teal'));

    const actions = el('div.gs-actions');
    if (quest.status !== 'done') {
      if (isStory) actions.append(button(quest.tracked ? 'Не отслеживать' : 'Отслеживать', { primary: !quest.tracked, icon: 'eye', onClick: () => track(quest) }));
      actions.append(button('Показать на карте', { icon: 'map', disabled: !quest.marker, title: quest.marker ? '' : 'Место пока неизвестно', onClick: () => showOnMap(`quest:${quest.id}`, `quest:${quest.id}`) }));
    }
    const turnIn = quest.turnIn && quest.turnIn !== quest.giver ? npcLabel(quest.turnIn) : null;
    return el('div.jrn-detail', null, [
      el('div.jrn-title', { text: quest.title }),
      el('div.jrn-tags', null, tags),
      el('div.jrn-meta', null, [
        el('span', null, [icon('npc'), `Дал: ${npcLabel(quest.giver)}`]),
        quest.cityKey ? el('span', null, [icon('city'), cityName(quest.cityKey)]) : null,
        turnIn && !String(quest.turnIn).endsWith(':board') ? el('span', null, [icon('quest-done'), `Сдать: ${turnIn}`]) : null,
      ]),
      el('p.jrn-desc', { text: quest.desc }),
      quest.status === 'done' ? null : sectionTitle('Что делать'),
      quest.status === 'done' ? null : el('p.jrn-stage', { text: quest.stage }),
      quest.objectives.length ? el('div.jrn-objectives', null, quest.objectives.map(objectiveNode)) : null,
      sectionTitle('Награда'),
      rewardLine(quest.rewards),
      actions,
    ]);
  }

  function leadDetail(entry) {
    return el('div.jrn-detail', null, [
      el('div.jrn-title', { text: entry.title }),
      el('div.jrn-tags', null, tag(entry.tag, entry.kind || '')),
      el('p.jrn-desc', { text: entry.text }),
      entry.focus ? el('div.gs-actions', null, button('Показать на карте', { icon: 'map', primary: true, onClick: () => showOnMap(entry.focus, null) })) : null,
      entry.hint ? note(entry.hint) : null,
    ]);
  }

  function leads() {
    const st = state();
    const list = [];
    for (const lead of safe(() => questLeads(st), []) || []) {
      const cityKey = String(lead.giver).split(':')[0];
      list.push({
        id: `lead:${lead.id}`, lead: true, group: 'Где продолжается история', icon: 'quest', title: lead.title,
        sub: npcLabel(lead.giver), tag: 'зацепка', kind: 'gold',
        text: `Говорят, ${npcLabel(lead.giver)} ищет толкового человека. Загляните — ${cityName(cityKey) || 'там'} ждёт.`,
        focus: cityName(cityKey) ? cityKey : null, hint: 'Задание появится в журнале, когда вы поговорите и согласитесь.',
      });
    }
    for (const [index, line] of (safe(() => marketNews(st), []) || []).entries()) {
      list.push({
        id: `news:${index}`, lead: true, group: 'Вести с рынков', icon: 'coin', title: cityName(line.cityKey),
        sub: line.daysLeft ? `ещё ${line.daysLeft} дн.` : line.day !== undefined ? `день ${line.day}` : '',
        tag: line.kind === 'shortage' ? 'нехватка — цены выше' : line.kind === 'surplus' ? 'избыток — цены ниже' : 'новость',
        kind: line.kind === 'shortage' ? 'warn' : line.kind === 'surplus' ? 'teal' : '',
        text: line.text, focus: line.cityKey, hint: 'Цены меняются каждый день; подробности — у купца («Торговля»).',
      });
    }
    return list;
  }

  function refresh() {
    const st = state();
    if (!st) return;
    const all = safe(() => listQuests(st, { includeDone: true }), []) || [];
    const active = all.filter(quest => quest.status !== 'done');
    const done = all.filter(quest => quest.status === 'done');
    modeTabs.setCount('active', active.length);
    modeTabs.setCount('done', done.length);
    let items;
    if (mode === 'leads') items = leads();
    else items = (mode === 'done' ? done : active).map(quest => ({ ...quest, group: CATEGORY_NAMES[quest.category] || 'Задания' }));
    view.setItems(items);
    ui.refreshHints();
  }

  const watch = live(STATE_EVENTS, refresh);
  const root = el('div.jrn-view', null, [modeTabs.el, el('div.jrn-body', null, view.el)]);
  return {
    el: root,
    onOpen() {
      watch.start();
      refresh();
      const tracked = (safe(() => trackedQuest(state()), null) || {}).id;
      if (mode === 'active' && tracked) view.select(tracked);
    },
    onClose: () => watch.stop(),
    onKey(event) {
      if (view.handleKey(event)) return true;
      const entry = view.selected;
      if (event.code === 'KeyT' && entry && !entry.lead && entry.status !== 'done' && (entry.category === 'main' || entry.category === 'side')) {
        track(entry);
        return true;
      }
      if (event.code === 'KeyF' && entry) {
        if (entry.lead && entry.focus) showOnMap(entry.focus, null);
        else if (!entry.lead && entry.marker) showOnMap(`quest:${entry.id}`, `quest:${entry.id}`);
        return true;
      }
      if (event.code === 'Tab') {
        modeTabs.step(event.shiftKey ? -1 : 1);
        return true;
      }
      return false;
    },
    hints() {
      const entry = view.selected;
      const list = [{ key: '↑↓', label: 'Выбор' }, { key: 'Tab', label: 'Раздел', onClick: () => modeTabs.step(1) }];
      if (entry && !entry.lead && entry.status !== 'done') {
        if (entry.category === 'main' || entry.category === 'side') list.push({ key: 'T', label: entry.tracked ? 'Не отслеживать' : 'Отслеживать', onClick: () => track(entry) });
        if (entry.marker) list.push({ key: 'F', label: 'На карте', onClick: () => showOnMap(`quest:${entry.id}`, `quest:${entry.id}`) });
      }
      return list;
    },
  };
}
