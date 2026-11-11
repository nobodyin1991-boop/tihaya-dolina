// Skills (menu tab): the five class abilities as large cards (rank pips, current numbers, next-rank preview,
// requirements, key), the basic attack and the perk catalogue. Learning happens at trainers — the screen only informs.
// Sim: classes (abilitiesOf, resolveAbility, rankRequiredLevel), progression (abilityRank, abilityCost, hasPerk,
// learningPoints, TRAINING), stats.derivedStats. Engine: g.heroCtl.stats(), g.input.caption.
import { CLASSES, ABILITY_MAX_RANK, abilitiesOf, resolveAbility, rankRequiredLevel } from '../../data/classes.js';
import { PERKS } from '../../data/perks.js';
import { STATUS } from '../../sim/combat.js';
import { abilityRank, abilityCost, hasPerk, learningPoints, TRAINING } from '../../sim/progression.js';
import { derivedStats } from '../../sim/stats.js';
import { getRep } from '../../sim/reputation.js';
import { icon } from '../icons.js';
import { el, sectionTitle, costLine, tag, keyHint, tabs, sections, STAT_NAMES } from '../kit.js';
import { live, safe, render, percent, pips, note, cityName, ROLE_NAMES, STATE_EVENTS } from '../screen-kit.js';

const CITY_ORDER = ['valley', 'ford', 'harbor'];
const SHAPE_NAMES = {
  'aoe-self': 'вокруг себя', 'melee-single': 'одна цель', 'melee-arc': 'дуга перед собой', 'self-buff': 'на себя',
  projectile: 'снаряд', 'aoe-target': 'по области', cone: 'конус', chain: 'цепь', dash: 'рывок', line: 'линия',
};
const BUFF_NAMES = {
  ...STAT_NAMES, attackMult: 'урон', damageTakenMult: 'получаемый урон', moveSpeedMult: 'скорость',
  staminaRegenMult: 'восстановление сил', blockPower: 'блок', companionAttackMult: 'урон спутника',
};

/** City whose combat trainer teaches the given ability rank. */
function trainerCityFor(rank) {
  return CITY_ORDER.find(key => (TRAINING.abilityRankCap[key] || 0) >= rank) || 'harbor';
}

const seconds = value => `${String(Math.round(value * 10) / 10).replace('.', ',')} с`;

function effectText(effect) {
  const name = STATUS[effect.type]?.name;
  const time = effect.duration ? ` ${seconds(effect.duration)}` : '';
  switch (effect.type) {
    case 'buff': {
      const share = Math.abs(effect.value) <= 2 ? percent(Math.abs(effect.value)) : String(effect.value);
      return `${BUFF_NAMES[effect.stat] || effect.stat} ${effect.value > 0 ? '+' : '−'}${share}${time ? ` на${time}` : ''}`;
    }
    case 'heal': return `лечение ${percent(effect.value || 0)} здоровья`;
    case 'hot': return `лечение ${percent((effect.value || 0) * (effect.duration || 1))} здоровья за${time}`;
    case 'shield': return `щит ${percent(effect.value || 0)} здоровья${time ? ` на${time}` : ''}`;
    case 'knockback': return `отбрасывание ${effect.value} м`;
    case 'slow': case 'weaken': case 'mark':
      return `${(name || effect.type).toLowerCase()} ${effect.value ? percent(effect.value) : ''}${time ? ` на${time}` : ''}`.replace('  ', ' ');
    default: return `${(name || effect.type).toLowerCase()}${time}`;
  }
}

/** Facts of an ability at a rank: [[label, text]]. */
function abilityFacts(ability, attack) {
  const facts = [];
  if (ability.power > 0) facts.push(['Урон', `${Math.round(ability.power * attack)} (×${String(ability.power).replace('.', ',')} атаки)`]);
  const params = ability.params || {};
  if (params.hits) facts.push(['Ударов', String(params.hits)]);
  if (params.jumps) facts.push(['Перескоков', String(params.jumps)]);
  if (params.maxTargets) facts.push(['Целей', `до ${params.maxTargets}`]);
  if (ability.effects.length) facts.push(['Эффекты', ability.effects.map(effectText).join(' · ')]);
  return facts;
}

export function registerSkillsScreen(ui, g) {
  ui.registerScreen({
    id: 'skills', title: 'Умения', action: 'skills', tab: { order: 30, icon: 'skills' },
    create: () => createSkills(g, ui),
  });
}

function createSkills(g, ui) {
  let perkFilter = 'all';
  const head = el('div.skl-head');
  const cards = el('div.skl-cards.kit-scroll.interactive');
  const perkList = el('div.skl-perks.kit-scroll.interactive');
  const perkTabs = tabs({
    small: true,
    tabs: [{ id: 'all', label: 'Все' }, { id: 'owned', label: 'Изучены' }, { id: 'open', label: 'Доступны' }],
    onChange: id => {
      perkFilter = id;
      render(perkList, perks);
    },
  });

  function abilityCard(def, attack) {
    const state = g.state;
    const rank = abilityRank(state, def.id);
    const current = resolveAbility(def.id, Math.max(1, rank));
    const maxed = rank >= ABILITY_MAX_RANK;
    const nextRank = Math.min(ABILITY_MAX_RANK, rank + 1);
    const next = maxed ? null : resolveAbility(def.id, nextRank);
    const needLevel = rankRequiredLevel(def.id, nextRank);
    const facts = el('div.skl-facts', null, abilityFacts(current, attack).map(([label, text]) => el('div.skl-fact', null, [el('span', { text: label }), el('b', { text })])));

    let nextBlock;
    if (maxed) nextBlock = el('div.skl-next.maxed', null, [icon('check'), el('span', { text: 'Высший ранг изучен' })]);
    else {
      const before = new Map(abilityFacts(current, attack));
      const changes = rank === 0 ? [] : abilityFacts(next, attack).filter(([label, text]) => before.get(label) !== text).map(([label, text]) => `${label}: ${text}`);
      const city = trainerCityFor(nextRank);
      const levelOk = state.player.level >= needLevel;
      nextBlock = el('div.skl-next', null, [
        el('div.skl-next-title', { text: rank === 0 ? 'Изучить умение' : `Ранг ${nextRank}` }),
        changes.length ? el('div.skl-next-changes', { text: changes.join(' · ') }) : null,
        el('div.skl-next-req', null, [
          tag(`уровень ${needLevel}`, levelOk ? 'good' : 'bad'),
          tag(`наставник: ${cityName(city)}`, state.world.discovered[city] ? 'gold' : ''),
        ]),
        costLine(abilityCost(def.id, nextRank), { coins: state.player.coins, lp: state.prog.lp }),
      ]);
    }

    return el('article.skl-card', { class: rank === 0 ? 'locked' : '' }, [
      el('div.skl-card-icon', null, [icon(def.icon), el('span.skl-card-key', null, keyHint(`ability${def.slot}`))]),
      el('div.skl-card-main', null, [
        el('div.skl-card-top', null, [
          el('span.skl-card-name', { text: def.name }),
          pips(rank, ABILITY_MAX_RANK),
          rank === 0 ? tag(state.player.level >= def.requiredLevel ? 'не изучено' : `с ${def.requiredLevel} уровня`, 'warn') : null,
        ]),
        el('div.skl-card-desc', { text: def.desc }),
        el('div.skl-card-meta', null, [
          el('span', null, [icon('clock'), `перезарядка ${seconds(def.cooldown)}`]),
          el('span', null, [icon('stamina'), `${def.staminaCost} выносливости`]),
          def.range ? el('span', null, [icon('target'), `${String(def.range).replace('.', ',')} м`]) : null,
          el('span', { text: SHAPE_NAMES[def.shape] || '' }),
        ]),
        facts,
      ]),
      nextBlock,
    ]);
  }

  function basicCard(cls, attack) {
    const basic = cls.basicAttack;
    return el('article.skl-card.basic', null, [
      el('div.skl-card-icon', null, [icon('sword'), el('span.skl-card-key', null, keyHint('attack'))]),
      el('div.skl-card-main', null, [
        el('div.skl-card-top', null, [el('span.skl-card-name', { text: 'Обычная атака' }), tag('всегда доступна', 'teal')]),
        el('div.skl-card-desc', { text: `${cls.name}: ${cls.desc}` }),
        el('div.skl-card-meta', null, [
          el('span', null, [icon('clock'), `раз в ${seconds(basic.interval)}`]),
          el('span', null, [icon('target'), `${String(basic.range).replace('.', ',')} м`]),
          el('span', { text: SHAPE_NAMES[basic.shape] || '' }),
        ]),
        el('div.skl-facts', null, el('div.skl-fact', null, [el('span', { text: 'Урон' }), el('b', { text: `${Math.round(basic.power * attack)} за удар` })])),
      ]),
      el('div.skl-next.maxed', null, [icon('info'), el('span', { text: 'Растёт с атакой: оружие, уровень, основная характеристика.' })]),
    ]);
  }

  function abilityCards() {
    const state = g.state;
    const cls = CLASSES[state.player.classId] || CLASSES.warrior;
    const stats = safe(() => g.heroCtl.stats(), null) || derivedStats(state);
    return [...abilitiesOf(cls.id).map(def => abilityCard(def, stats.attack)), basicCard(cls, stats.attack)];
  }

  function perkState(perk) {
    const state = g.state;
    if (hasPerk(state, perk.id)) return 'owned';
    if (state.player.level < perk.level) return 'locked';
    if (perk.requires && !hasPerk(state, perk.requires)) return 'locked';
    if (perk.rep && perk.city && getRep(state, perk.city) < perk.rep) return 'locked';
    return 'open';
  }

  function perks() {
    const state = g.state;
    const order = { owned: 0, open: 1, locked: 2 };
    const list = Object.values(PERKS)
      .map(perk => ({ perk, status: perkState(perk) }))
      .filter(entry => perkFilter === 'all' || entry.status === perkFilter)
      .sort((a, b) => order[a.status] - order[b.status] || a.perk.level - b.perk.level);
    if (!list.length) return el('div.chr-none', { text: perkFilter === 'owned' ? 'Вы ещё не изучили ни одного таланта.' : 'Сейчас нет доступных талантов.' });
    return list.map(({ perk, status }) => {
      const teacher = `${ROLE_NAMES[perk.teacher] || perk.teacher}${perk.city ? ` · ${cityName(perk.city)}` : ' · любой город'}`;
      const reqs = [];
      if (status !== 'owned') {
        reqs.push(tag(`уровень ${perk.level}`, state.player.level >= perk.level ? 'good' : 'bad'));
        if (perk.rep) reqs.push(tag(`репутация ${perk.rep}`, 'warn'));
        if (perk.requires) reqs.push(tag(`после «${PERKS[perk.requires]?.name || perk.requires}»`, hasPerk(state, perk.requires) ? 'good' : 'bad'));
      }
      return el('div.skl-perk', { class: status }, [
        el('span.skl-perk-icon', null, icon(status === 'owned' ? 'check' : status === 'locked' ? 'lock' : 'star')),
        el('div.skl-perk-main', null, [
          el('div.skl-perk-name', null, [perk.name, status === 'owned' ? tag('изучен', 'good') : null]),
          el('div.skl-perk-desc', { text: perk.desc }),
          el('div.skl-perk-teacher', null, [icon('npc'), `Учит: ${teacher}`]),
          status === 'owned' ? null : el('div.skl-perk-req', null, [reqs, costLine({ lp: perk.lp, coins: perk.coins }, { coins: state.player.coins, lp: state.prog.lp })]),
        ]),
      ]);
    });
  }

  function refresh() {
    const state = g.state;
    if (!state) return;
    const lp = safe(() => learningPoints(state), state.prog.lp);
    render(head, () => [
      el('div.skl-lp', { class: lp > 0 ? 'has' : '' }, [icon('star'), el('b.t-num', { text: String(lp) }), el('span', { text: 'очков обучения' })]),
      note('Умения и таланты изучаются у наставников в городах — за очки обучения и монеты. Старшие ранги знают только в Каменном Броде и Янтарной Гавани.'),
    ]);
    render(cards, abilityCards);
    render(perkList, perks);
  }

  const watch = live(STATE_EVENTS, refresh);
  const leftPane = el('div.skl-left', null, [head, sectionTitle('Боевые умения'), cards]);
  const rightPane = el('div.skl-right', null, [sectionTitle('Таланты'), perkTabs.el, perkList]);
  // mobile: abilities and perks are two sections of a side rail
  const rail = sections({ items: [
    { id: 'abilities', label: 'Умения', icon: 'skills', nodes: [leftPane] },
    { id: 'perks', label: 'Таланты', icon: 'star', nodes: [rightPane] },
  ] });
  return {
    el: el('div.skl-view', null, [rail.el, leftPane, rightPane]),
    onOpen() {
      watch.start();
      refresh();
    },
    onClose: () => watch.stop(),
    hints: () => [{ key: 'character', label: 'Персонаж', touch: false, onClick: () => ui.open('character') }],
  };
}
