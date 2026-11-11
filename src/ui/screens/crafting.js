// Crafting (menu tab, also opened by a master's dialogue with {atStation:[profession]}): professions overview,
// recipe book per profession with filters, recipe detail with have/need, craft ×N, and the gathering panel.
// Sim: crafting (heroProfessions, professionInfo, recipeBook, craftable, craft), gathering (gatherSkillInfo,
// NODE_TYPES, regionsForNode), data professions / recipes.
import { item as itemDef } from '../../data/items.js';
import { PROFESSIONS, PROFESSION_MAX_LEVEL, GATHER_SKILLS, GATHER_MAX_LEVEL, SECOND_PROFESSION } from '../../data/professions.js';
import { heroProfessions, professionInfo, recipeBook, craftable, craft } from '../../sim/crafting.js';
import { gatherSkillInfo, NODE_TYPES, regionsForNode } from '../../sim/gathering.js';
import { icon } from '../icons.js';
import {
  el, clear, listDetail, listRow, sectionTitle, costLine, button, numberStepper, bar, tag, tabs, itemTooltip, statRow,
} from '../kit.js';
import { act, live, safe, render, note, itemChip, currentCityKey, STATE_EVENTS } from '../screen-kit.js';
import { SHOPS } from '../../data/economy.js';
import { trainButton } from './train.js';

const PROFESSION_ICONS = {
  apothecary: 'potion', smith: 'ingot', carpenter: 'plank', leatherworker: 'leather', farmer: 'bread', tailor: 'cloth', mason: 'block',
};
const levelGroup = level => (level <= 3 ? 'Ученик · уровни 1–3' : level <= 7 ? 'Подмастерье · уровни 4–7' : level <= 11 ? 'Мастер · уровни 8–11' : 'Искусник · уровни 12–15');

export function registerCraftingScreen(ui, g) {
  ui.registerScreen({
    id: 'crafting', title: 'Ремесло', action: 'crafting', tab: { order: 40, icon: 'crafting' },
    create: () => createCrafting(g, ui),
  });
}

function createCrafting(g, ui) {
  let atStation = false;
  let active = null;          // profession id | 'gather'
  let quantity = 1;
  let cityKey = null;
  const strip = el('div.crf-strip');
  const body = el('div.crf-body');
  const gatherPanel = el('div.crf-gather.kit-scroll.interactive');
  const state = () => g.state;
  const stationOptions = () => ({ atStation });
  const atStationOf = professionId => atStation === true || (Array.isArray(atStation) && atStation.includes(professionId));

  const view = listDetail({
    items: [],
    emptyText: 'Нет рецептов',
    filters: [
      { id: 'can', label: 'Доступные', test: entry => entry.canCraft },
      { id: 'known', label: 'Изученные', test: entry => entry.known },
      { id: 'all', label: 'Все' },
    ],
    keyOf: entry => entry.recipe.id,
    groupOf: entry => levelGroup(entry.recipe.level),
    renderRow: entry => {
      const def = itemDef(entry.recipe.output);
      return listRow({
        icon: def.icon, label: def.name, rarity: def.rarity, dim: !entry.canCraft,
        sub: !entry.known ? 'не изучен' : entry.canCraft ? (entry.trivial ? 'мало опыта' : 'можно изготовить') : shortReason(entry.reason),
        badge: entry.recipe.field ? 'в поле' : undefined,
        right: `ур. ${entry.recipe.level}`,
      });
    },
    renderDetail: entry => safe(() => recipeDetail(entry), null),
    onSelect: () => {
      quantity = 1;
      ui.refreshHints();
    },
    onActivate: entry => doCraft(entry),
    class: 'crf-list',
  });

  function shortReason(reason) {
    if (!reason) return '';
    return reason.length > 44 ? `${reason.slice(0, 42)}…` : reason;
  }

  function doCraft(entry) {
    if (!entry) return;
    const count = Math.max(1, quantity);
    if (act(ui, () => craft(state(), entry.recipe.id, { ...stationOptions(), count }))) quantity = 1;
  }

  function recipeDetail(entry) {
    const st = state();
    const recipe = entry.recipe;
    const profession = PROFESSIONS[recipe.profession];
    const check = entry.known ? craftable(st, recipe.id, stationOptions()) : { ok: false, reason: 'Рецепт не изучен' };
    const max = check.ok ? Math.max(1, Math.min(99, check.maxCount)) : 1;
    quantity = Math.min(quantity, max);
    const total = el('span.crf-total.t-num');
    const paintTotal = () => {
      total.textContent = `получится ${recipe.count * quantity} шт. · ${Math.round(recipe.time * quantity)} с`;
    };
    const stepper = numberStepper({ value: quantity, min: 1, max, onChange: value => {
      quantity = value;
      paintTotal();
    } });
    paintTotal();

    const station = recipe.field
      ? tag('можно в поле', 'teal')
      : tag(`нужна мастерская: ${profession.station}`, atStationOf(recipe.profession) ? 'good' : 'warn');
    const learnHint = entry.known ? null
      : note(recipe.learn === 'note' ? 'Рецепт изучается по записям: их продают мастера и прячут сундуки.' : `Рецепту учит мастер (${profession.name.toLowerCase()}) за ${recipe.price} монет.`, 'lock');

    return el('div.crf-detail', null, [
      el('div.gs-itemcard', null, itemTooltip(recipe.output, [{ text: `За раз: ${recipe.count} шт.`, kind: 'dim' }])),
      sectionTitle('Материалы'),
      costLine({ items: recipe.inputs }, { items: st.inv.items }),
      sectionTitle('Изготовить', check.ok ? `хватит на ${check.maxCount}` : ''),
      check.ok ? null : note(check.reason, 'warning', 'warn'),
      el('div.gs-actions', null, [
        check.ok ? stepper : null,
        button('Изготовить', { primary: true, icon: 'crafting', disabled: !check.ok, onClick: () => doCraft(entry) }),
        check.ok ? total : null,
      ]),
      sectionTitle('Работа'),
      el('div.crf-work', null, [
        statRow('Время', `${recipe.time} с`),
        statRow('Опыт профессии', check.ok ? `+${check.xp}` : `+${recipe.xp}`),
        statRow('Уровень рецепта', recipe.level),
        el('div.crf-tags', null, [station, entry.trivial ? tag('простой рецепт — мало опыта', '') : null]),
      ]),
      learnHint,
    ]);
  }

  // ───────────── professions strip ─────────────

  function professionCard(professionId, slotLabel) {
    const st = state();
    const profession = PROFESSIONS[professionId];
    const info = professionInfo(st, professionId);
    const xpBar = bar({ value: info.current, max: info.required || 1, kind: 'gold' });
    if (!info.required) xpBar.set(1, 1);
    return el('button.crf-prof', { type: 'button', class: active === professionId ? 'active' : '', onClick: () => setActive(professionId) }, [
      el('span.crf-prof-icon', null, icon(PROFESSION_ICONS[professionId] || 'crafting')),
      el('span.crf-prof-main', null, [
        el('span.crf-prof-slot', { text: slotLabel }),
        el('span.crf-prof-name', { text: profession.name }),
        xpBar,
        el('span.crf-prof-xp.t-num', { text: info.required ? `уровень ${info.level} · ${info.current} / ${info.required}` : `уровень ${info.level} — предел (${PROFESSION_MAX_LEVEL})` }),
      ]),
      atStationOf(professionId) ? tag('у мастерской', 'good') : null,
    ]);
  }

  function emptySlot(label, text) {
    return el('div.crf-prof.empty', null, [
      el('span.crf-prof-icon', null, icon('lock')),
      el('span.crf-prof-main', null, [el('span.crf-prof-slot', { text: label }), el('span.crf-prof-hint', { text })]),
    ]);
  }

  function renderStrip() {
    const st = state();
    const [main, second] = [st.craft.main, st.craft.second];
    const nodes = [];
    nodes.push(main ? professionCard(main, 'Основное ремесло') : emptySlot('Основное ремесло', 'Выберите профессию у любого мастера в городе — это бесплатно.'));
    if (second) nodes.push(professionCard(second, 'Второе ремесло'));
    else if (st.craft.secondSlot) nodes.push(emptySlot('Второе ремесло', 'Слот открыт — выберите профессию у мастера.'));
    else nodes.push(emptySlot('Второе ремесло', `Открывается у мастера с ${SECOND_PROFESSION.level} уровня за ${SECOND_PROFESSION.coins} монет.`));
    nodes.push(el('button.crf-prof.gather', { type: 'button', class: active === 'gather' ? 'active' : '', onClick: () => setActive('gather') }, [
      el('span.crf-prof-icon', null, icon('herb')),
      el('span.crf-prof-main', null, [el('span.crf-prof-slot', { text: 'Для всех' }), el('span.crf-prof-name', { text: 'Сбор ресурсов' }), el('span.crf-prof-xp', { text: 'навыки и где что искать' })]),
    ]));
    // at a master's workshop: his lessons (profession, recipes) and his shop are one click away
    if (Array.isArray(atStation) && atStation.length && cityKey) {
      const role = atStation[0];
      const shop = SHOPS[cityKey] && SHOPS[cityKey][role] && SHOPS[cityKey][role].length
        ? button('Лавка мастера', { small: true, icon: 'coin', onClick: () => ui.open('shop', { cityKey, role }) })
        : null;
      nodes.push(el('div.crf-master', null, [trainButton(ui, g, role, cityKey, 'Учиться у мастера'), shop]));
    }
    return nodes;
  }

  // ───────────── gathering ─────────────

  const gatherTabs = tabs({
    small: true,
    tabs: Object.values(GATHER_SKILLS).map(skill => ({ id: skill.id, label: skill.name })),
    onChange: () => render(gatherPanel, gathering),
  });

  function gathering() {
    const st = state();
    const skill = GATHER_SKILLS[gatherTabs.active];
    const info = gatherSkillInfo(st, skill.id);
    const skillBar = bar({ value: info.current, max: info.required || 1, kind: 'stamina', text: !!info.required });
    if (!info.required) skillBar.set(1, 1);
    const rows = Object.values(NODE_TYPES).filter(node => node.skill === skill.id).map(node => {
      const regions = safe(() => regionsForNode(node.id), []) || [];
      const able = info.level >= node.requiredSkill;
      return el('div.crf-node', { class: able ? '' : 'locked' }, [
        itemChip(node.id),
        el('span.crf-node-req', null, [tag(`навык ${node.requiredSkill}`, able ? 'good' : 'bad'), node.toolBonus ? tag(`инструмент ${node.toolBonus} ур.`, '') : null]),
        el('span.crf-node-where', { text: regions.length ? regions.map(region => `${region.name} (${region.level[0]}–${region.level[1]})`).join(' · ') : 'в этих краях не встречается' }),
      ]);
    });
    if (skill.id === 'skinning') rows.push(note('Шкуры снимаются с убитых зверей: чем опаснее зверь, тем выше нужен навык.', 'info'));
    return [
      el('div.crf-skillhead', null, [
        el('div', null, [
          el('div.crf-skill-name', { text: `${skill.name} — уровень ${info.level}${info.level >= GATHER_MAX_LEVEL ? ' (предел)' : ''}` }),
          el('div.crf-skill-sub', { text: `${skill.verb}. Навык растёт сам, когда вы собираете. Нужен профессии «${PROFESSIONS[skill.profession].name}».` }),
        ]),
        skillBar,
      ]),
      sectionTitle('Что и где растёт', 'регион (уровень существ)'),
      rows.length ? rows : el('div.chr-none', { text: 'Нет известных мест.' }),
    ];
  }

  // ───────────── assembly ─────────────

  function setActive(id) {
    active = id;
    refresh();
  }

  function refresh() {
    const st = state();
    if (!st) return;
    const owned = heroProfessions(st);
    if (active !== 'gather' && !owned.includes(active)) active = owned[0] || 'gather';
    render(strip, renderStrip);
    if (active === 'gather') {
      clear(body, [gatherTabs.el, gatherPanel]);
      render(gatherPanel, gathering);
    } else {
      if (view.el.parentNode !== body) clear(body, view.el);
      view.setItems(safe(() => recipeBook(st, active, stationOptions()), []) || []);
    }
    ui.refreshHints();
  }

  const watch = live(STATE_EVENTS, refresh);
  return {
    el: el('div.crf-view', null, [strip, body]),
    onOpen(params) {
      atStation = params && params.atStation ? params.atStation : false;
      cityKey = (params && params.cityKey) || (atStation ? currentCityKey(g) : null);
      const preferred = Array.isArray(atStation) ? atStation.find(id => heroProfessions(state()).includes(id)) : null;
      if (preferred) active = preferred;
      quantity = 1;
      watch.start();
      refresh();
      if (active !== 'gather' && view.selected === null) view.setFilter('known');
    },
    onClose: () => watch.stop(),
    onKey: event => (active !== 'gather' ? view.handleKey(event) : false),
    hints() {
      if (active === 'gather') return [];
      const list = [{ key: '↑↓', label: 'Рецепт' }];
      if (view.selected && view.selected.canCraft) list.push({ key: 'Enter', label: 'Изготовить', touch: false, onClick: () => doCraft(view.selected) });
      return list;
    },
  };
}
