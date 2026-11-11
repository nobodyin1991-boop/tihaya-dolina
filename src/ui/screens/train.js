// Training {cityKey, role} (contextual): everything an NPC teaches — attributes, ability ranks, perks,
// professions and recipes — with learning-point and coin costs.
// Sim: progression (availableTraining, trainAttribute, learnAbility, learnPerk, learningPoints, abilityRank),
// crafting (chooseProfession, buySecondProfessionSlot, learnRecipe), classes.resolveAbility.
import { ABILITY_MAX_RANK, ABILITIES } from '../../data/classes.js';
import { RECIPES } from '../../data/recipes.js';
import { NPCS } from '../../data/npcs.js';
import { availableTraining, trainAttribute, learnAbility, learnPerk, learningPoints } from '../../sim/progression.js';
import { chooseProfession, buySecondProfessionSlot, learnRecipe } from '../../sim/crafting.js';
import { icon } from '../icons.js';
import { el, listDetail, listRow, sectionTitle, costLine, button, coins, tag, itemTooltip } from '../kit.js';
import { act, live, safe, render, note, pageHead, fact, pips, cityName, currentCityKey, ROLE_NAMES, STATE_EVENTS } from '../screen-kit.js';

const KIND_GROUPS = {
  attribute: 'Характеристики', ability: 'Умения', perk: 'Таланты', profession: 'Профессия', 'second-slot': 'Профессия', recipe: 'Рецепты',
};
const KIND_ICONS = { attribute: 'character', ability: 'skills', perk: 'star', profession: 'crafting', 'second-slot': 'plus', recipe: 'note' };

/** Does this NPC role teach anything in the city right now? */
export function teaches(state, role, cityKey) {
  return (safe(() => availableTraining(state, role, cityKey), []) || []).length > 0;
}

/** «Учиться» button for service screens of NPCs that also teach (captain, elder, trader, masters); null if nothing to learn. */
export function trainButton(ui, g, role, cityKey, label = 'Учиться') {
  if (!teaches(g.state, role, cityKey)) return null;
  return button(label, { small: true, icon: 'star', title: `${ROLE_NAMES[role] || 'Наставник'} учит за очки обучения и монеты`, onClick: () => ui.open('train', { cityKey, role }) });
}

export function registerTrainScreen(ui, g) {
  ui.registerScreen({ id: 'train', title: 'Обучение', create: () => createTrain(g, ui) });
}

function createTrain(g, ui) {
  let cityKey = 'valley';
  let role = 'trainer';
  const state = () => g.state;
  const head = el('div.trn-head');

  const view = listDetail({
    items: [],
    emptyText: 'Здесь вас больше ничему не научат',
    keyOf: offer => `${offer.kind}:${offer.id}`,
    groupOf: offer => KIND_GROUPS[offer.kind] || 'Прочее',
    renderRow: offer => listRow({
      icon: offer.known ? 'check' : offer.locked ? 'lock' : KIND_ICONS[offer.kind] || 'star',
      label: offer.name, dim: !!offer.locked || !!offer.known,
      sub: rowSub(offer),
      right: offer.known ? '' : el('span.trn-price', null, [offer.cost.lp ? el('span.trn-lp.t-num', null, [icon('star'), String(offer.cost.lp)]) : null, offer.cost.coins ? coins(offer.cost.coins) : null]),
    }),
    renderDetail: offer => safe(() => detail(offer), null),
    onSelect: () => ui.refreshHints(),
    onActivate: offer => learn(offer),
    class: 'trn-list',
  });

  function rowSub(offer) {
    if (offer.known) return 'уже изучено';
    if (offer.kind === 'attribute') return `${offer.value} → ${offer.next}`;
    if (offer.kind === 'ability') return offer.rank ? `ранг ${offer.rank} → ${offer.next}` : 'новое умение';
    if (offer.kind === 'recipe') return `рецепт ${offer.level} уровня`;
    return offer.locked || '';
  }

  function learn(offer) {
    if (!offer || offer.known) return;
    const st = state();
    const calls = {
      attribute: () => trainAttribute(st, offer.id, cityKey),
      ability: () => learnAbility(st, offer.id, cityKey),
      perk: () => learnPerk(st, offer.id, cityKey),
      profession: () => chooseProfession(st, offer.id),
      'second-slot': () => buySecondProfessionSlot(st),
      recipe: () => learnRecipe(st, offer.id, { from: 'trainer', cityKey }),
    };
    const call = calls[offer.kind];
    if (!call) return;
    act(ui, call);
    refresh();
  }

  function detail(offer) {
    const st = state();
    const blocks = [el('div.jrn-title', { text: offer.name }), el('div.jrn-tags', null, [tag(KIND_GROUPS[offer.kind] || '', 'gold'), offer.known ? tag('изучено', 'good') : null])];
    if (offer.kind === 'recipe' && RECIPES[offer.id]) {
      const recipe = RECIPES[offer.id];
      blocks.push(el('div.gs-itemcard', null, itemTooltip(recipe.output)), sectionTitle('Материалы'), costLine({ items: recipe.inputs }, { items: st.inv.items }));
    } else blocks.push(el('p.jrn-desc', { text: offer.desc || '' }));
    if (offer.kind === 'attribute') blocks.push(el('div.trn-step', null, [el('b.t-num', { text: String(offer.value) }), icon('chevron-right'), el('b.t-num.next', { text: String(offer.next) })]));
    if (offer.kind === 'ability') {
      const ability = ABILITIES[offer.id];
      blocks.push(el('div.trn-step', null, [pips(offer.rank, ABILITY_MAX_RANK), icon('chevron-right'), pips(offer.next, ABILITY_MAX_RANK)]));
      blocks.push(el('div.jrn-meta', null, [
        el('span', null, [icon('level'), `нужен уровень ${offer.requiredLevel}`]),
        ability ? el('span', null, [icon('clock'), `перезарядка ${ability.cooldown} с`]) : null,
        el('span', null, [icon('skills'), `клавиша ${g.input.caption(`ability${offer.slot}`)}`]),
      ]));
    }
    if (offer.kind === 'perk' && offer.requiredLevel > 1) blocks.push(el('div.jrn-meta', null, el('span', null, [icon('level'), `нужен уровень ${offer.requiredLevel}`])));
    if (offer.known) return el('div.trn-detail', null, blocks);
    blocks.push(sectionTitle('Цена'));
    const free = !offer.cost.lp && !offer.cost.coins;
    blocks.push(free ? el('div.t-dim', { text: 'Бесплатно' }) : costLine(offer.cost, { coins: st.player.coins, lp: st.prog.lp }));
    if (offer.locked) blocks.push(note(offer.locked, 'lock', 'warn'));
    blocks.push(el('div.gs-actions', null, button(offer.kind === 'profession' ? 'Стать учеником' : offer.kind === 'second-slot' ? 'Открыть' : 'Изучить', { primary: true, icon: 'star', disabled: !!offer.locked, onClick: () => learn(offer) })));
    return el('div.trn-detail', null, blocks);
  }

  function refresh() {
    const st = state();
    if (!st) return;
    const lp = safe(() => learningPoints(st), st.prog.lp);
    const npc = NPCS[`${cityKey}:${role}`];
    render(head, () => pageHead(npc ? npc.name : 'Наставник', `${npc ? npc.title : ROLE_NAMES[role] || ''} · ${cityName(cityKey)}`, [
      fact('Очки обучения', el('span.trn-lp.big', null, [icon('star'), String(lp)]), lp > 0 ? 'good' : ''),
      fact('Уровень', String(st.player.level)),
      fact('Монеты', coins(st.player.coins)),
    ]));
    view.setItems(safe(() => availableTraining(st, role, cityKey), []) || []);
    ui.refreshHints();
  }

  const watch = live(STATE_EVENTS, refresh);
  return {
    el: el('div.trn-view', null, [head, el('div.trn-body', null, view.el)]),
    onOpen(params = {}) {
      cityKey = (params && params.cityKey) || currentCityKey(g) || 'valley';
      role = (params && params.role) || 'trainer';
      watch.start();
      refresh();
    },
    onClose: () => watch.stop(),
    onKey(event) {
      if (view.handleKey(event)) return true;
      if (event.code === 'KeyE' && view.selected) {
        learn(view.selected);
        return true;
      }
      return false;
    },
    hints() {
      const list = [{ key: '↑↓', label: 'Выбор' }];
      const offer = view.selected;
      if (offer && !offer.known && !offer.locked) list.push({ key: 'E', label: 'Изучить', touch: false, onClick: () => learn(offer) });
      return list;
    },
  };
}
