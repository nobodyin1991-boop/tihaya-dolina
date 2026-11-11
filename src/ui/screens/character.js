// Character sheet (menu tab): identity, level and XP, learning points, attributes, derived stats by group,
// perks, active buffs, reputation in the three cities, gathering skills and play statistics.
// Sim: player.xpProgress, progression.learningPoints, stats.derivedStats, consumables.activeBuffs,
// reputation.repRank, gathering.gatherSkillInfo. Engine: g.heroCtl.stats(), g.hero.statuses.
import { CLASSES, ATTRIBUTES, ATTRIBUTE_IDS } from '../../data/classes.js';
import { PERKS } from '../../data/perks.js';
import { GATHER_SKILLS, GATHER_MAX_LEVEL } from '../../data/professions.js';
import { CITIES } from '../../data/world-map.js';
import { STATUS } from '../../sim/combat.js';
import { xpProgress, MAX_LEVEL } from '../../sim/player.js';
import { learningPoints } from '../../sim/progression.js';
import { derivedStats } from '../../sim/stats.js';
import { activeBuffs } from '../../sim/consumables.js';
import { repRank } from '../../sim/reputation.js';
import { gatherSkillInfo } from '../../sim/gathering.js';
import { icon } from '../icons.js';
import { statusIcon, statusHarmful } from '../markers.js';
import { el, sectionTitle, statRow, bar, progressRing, tag, formatNumber, STAT_NAMES } from '../kit.js';
import { live, safe, render, percent, gameNow, note, STATE_EVENTS } from '../screen-kit.js';

const ATTRIBUTE_ICONS = { strength: 'sword', agility: 'dash', endurance: 'heart', wits: 'focus' };
const ATTRIBUTE_EFFECTS = {
  strength: 'Броня +0,5 за пункт; урон силовых классов',
  agility: 'Крит +0,4% и скорость +0,2% за пункт; урон ловких классов',
  endurance: 'Здоровье +5 и выносливость +2 за пункт',
  wits: 'Лечение +1%, сбор +0,5%, цены +0,2% за пункт; урон приборов',
};
const BUFF_STAT_NAMES = {
  ...STAT_NAMES, attackMult: 'Урон', damageTakenMult: 'Получаемый урон', moveSpeedMult: 'Скорость',
  staminaRegenMult: 'Восст. выносливости', maxHpMult: 'Здоровье', blockPower: 'Блок',
};

function playTime(seconds) {
  const total = Math.floor(seconds || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
}

export function registerCharacterScreen(ui, g) {
  ui.registerScreen({
    id: 'character', title: 'Персонаж', action: 'character', tab: { order: 20, icon: 'character' },
    create: () => createCharacter(g, ui),
  });
}

function createCharacter(g, ui) {
  const left = el('div.chr-col.kit-scroll.interactive');
  const middle = el('div.chr-col.kit-scroll.interactive');
  const right = el('div.chr-col.kit-scroll.interactive');

  function identity() {
    const state = g.state;
    const player = state.player;
    const cls = CLASSES[player.classId] || CLASSES.warrior;
    const xp = xpProgress(state);
    const lp = safe(() => learningPoints(state), state.prog.lp);
    const stats = currentStats();
    const ring = progressRing({ value: xp.fraction, label: String(player.level), size: '6.2em', kind: 'xp' });
    const xpBar = bar({ value: xp.current, max: xp.required || 1, kind: 'xp', text: !!xp.required, label: xp.required ? 'Опыт' : 'Достигнут предел' });
    const attrs = el('div.chr-attrs');
    for (const id of ATTRIBUTE_IDS) {
      const primary = cls.primary === id;
      const row = el('div.chr-attr', { class: primary ? 'primary' : '' }, [
        el('span.chr-attr-icon', null, icon(ATTRIBUTE_ICONS[id])),
        el('div.chr-attr-text', null, [
          el('div.chr-attr-name', null, [ATTRIBUTES[id].name, primary ? tag('основная', 'gold') : null]),
          el('div.chr-attr-desc', { text: ATTRIBUTE_EFFECTS[id] }),
        ]),
        el('span.chr-attr-value.t-num', { text: String(stats.attrs[id]) }),
      ]);
      ui.tooltip.attach(row, ATTRIBUTES[id].desc);
      attrs.append(row);
    }
    return [
      el('div.chr-id', null, [
        ring,
        el('div.chr-id-text', null, [
          el('div.chr-name', { text: player.name }),
          el('div.chr-class', { text: cls.name }),
          el('div.chr-class-desc', { text: cls.desc }),
        ]),
      ]),
      xpBar,
      el('div.chr-level-line', null, [
        el('span', { text: player.level >= MAX_LEVEL ? `Уровень ${player.level} — предел` : `Уровень ${player.level} · до следующего ${formatNumber(xp.required - xp.current)} опыта` }),
      ]),
      el('div.chr-lp', { class: lp > 0 ? 'has' : '' }, [
        icon('star'),
        el('div', null, [
          el('div.chr-lp-value', null, [el('b.t-num', { text: String(lp) }), ' очков обучения']),
          el('div.chr-lp-hint', { text: lp > 0 ? 'Потратьте их у наставников в городах: характеристики, умения, таланты.' : 'Новые очки даёт каждый уровень (+3).' }),
        ]),
      ]),
      sectionTitle('Характеристики'),
      attrs,
    ];
  }

  function currentStats() {
    return safe(() => g.heroCtl.stats(), null) || derivedStats(g.state);
  }

  function derived() {
    const state = g.state;
    const stats = currentStats();
    const one = value => value.toFixed(1).replace('.', ',');
    const blocks = [
      sectionTitle('Нападение'),
      statRow('Атака', Math.round(stats.attack)),
      statRow('Урон оружия', Math.round(stats.weaponDamage || 0)),
      statRow('Шанс крит. удара', percent(stats.critChance, 1)),
      statRow('Множитель крит. удара', `×${one(stats.critMult)}`),
      stats.damageVsBandit ? statRow('Урон по разбойникам', `+${percent(stats.damageVsBandit)}`) : null,
      stats.damageVsBeast ? statRow('Урон по зверям', `+${percent(stats.damageVsBeast)}`) : null,
      stats.companion ? statRow(`Спутник: ${stats.companion.name}`, `атака ${Math.round(stats.companion.attack)} · здоровье ${stats.companion.maxHp}`) : null,
      sectionTitle('Защита'),
      statRow('Здоровье', Math.round(stats.maxHp)),
      statRow('Броня', Math.round(stats.armor)),
      statRow('Получаемый урон', percent(stats.damageTakenMult)),
      statRow('Сила блока', percent(stats.blockPower)),
      statRow('Сила лечения', percent(stats.healPower)),
      sectionTitle('Походные'),
      statRow('Выносливость', Math.round(stats.maxStamina)),
      statRow('Восст. выносливости', `${one(stats.staminaRegen)} / с`),
      statRow('Скорость бега', `${one(stats.moveSpeed)} м/с`),
      statRow('Скорость сбора', percent(stats.gatherSpeed)),
      statRow('Торговая скидка', percent(stats.priceBonus || 0, 1)),
      statRow('Ячейки сумки', stats.carrySlots),
    ];

    blocks.push(sectionTitle('Активные эффекты'));
    const now = gameNow(state);
    const buffs = safe(() => activeBuffs(state, now), []) || [];
    const statuses = (g.hero.statuses || []).filter(status => status && status.type);
    if (!buffs.length && !statuses.length) blocks.push(el('div.chr-none', { text: 'Нет действующих эффектов. Еда и снадобья дают временные прибавки.' }));
    for (const buff of buffs) {
      const left = Math.max(0, Math.ceil(buff.until - now));
      const value = Math.abs(buff.value) < 1 ? percent(Math.abs(buff.value)) : String(buff.value);
      blocks.push(el('div.chr-buff', null, [
        icon('meal'),
        el('span.chr-buff-name', { text: buff.name || 'Эффект' }),
        el('span.chr-buff-effect', { text: `${BUFF_STAT_NAMES[buff.stat] || buff.stat} ${buff.value > 0 ? '+' : '−'}${value}` }),
        el('span.chr-buff-time.t-num', { text: left >= 60 ? `${Math.ceil(left / 60)} мин` : `${left} с` }),
      ]));
    }
    for (const status of statuses) {
      blocks.push(el('div.chr-buff', { class: statusHarmful(status.type) ? 'harm' : '' }, [
        icon(statusIcon(status.type)),
        el('span.chr-buff-name', { text: STATUS[status.type]?.name || status.type }),
        el('span.chr-buff-effect'),
        el('span.chr-buff-time.t-num', { text: `${Math.max(0, Math.ceil(status.t || 0))} с` }),
      ]));
    }

    blocks.push(sectionTitle('Таланты', String(state.prog.perks.length)));
    if (!state.prog.perks.length) blocks.push(note('Талантов пока нет. Им учат капитаны, старосты, купцы и мастера — за очки обучения и монеты.'));
    for (const perkId of state.prog.perks) {
      const perk = PERKS[perkId];
      if (!perk) continue;
      blocks.push(el('div.chr-perk', null, [icon('star'), el('div', null, [el('div.chr-perk-name', { text: perk.name }), el('div.chr-perk-desc', { text: perk.desc })])]));
    }
    return blocks;
  }

  function world() {
    const state = g.state;
    const blocks = [sectionTitle('Репутация')];
    for (const city of CITIES) {
      const rank = repRank(state, city.key);
      const known = !!state.world.discovered[city.key];
      const repBar = bar({ value: rank.value, max: 100, kind: 'gold' });
      const card = el('div.chr-rep', { class: known ? '' : 'unknown' }, [
        el('div.chr-rep-head', null, [
          el('span.chr-rep-city', null, [icon('city'), known ? city.name : 'Неизвестный город']),
          el('span.chr-rep-rank', { text: known ? rank.name : '—' }),
        ]),
        repBar,
        el('div.chr-rep-foot', null, [
          el('span.t-num', { text: `${Math.round(rank.value)} / 100` }),
          el('span', { text: rank.next !== null ? `следующее звание — на ${rank.next}` : 'высшее звание' }),
        ]),
      ]);
      ui.tooltip.attach(card, known ? `${rank.name}. ${rank.desc} Репутация улучшает цены и число бойцов, которых даст капитан.` : 'Вы ещё не бывали в этом городе.');
      blocks.push(card);
    }

    blocks.push(sectionTitle('Навыки сбора'));
    const skills = el('div.chr-skills');
    for (const skill of Object.values(GATHER_SKILLS)) {
      const info = gatherSkillInfo(state, skill.id);
      const skillBar = bar({ value: info.current, max: info.required || 1, kind: 'stamina' });
      if (!info.required) skillBar.set(1, 1);
      skills.append(el('div.chr-skill', null, [
        el('span.chr-skill-name', { text: skill.name }),
        skillBar,
        el('span.chr-skill-level.t-num', { text: `${info.level}${info.level >= GATHER_MAX_LEVEL ? ' макс' : ''}` }),
      ]));
    }
    blocks.push(skills);

    const player = state.player;
    const caravan = state.caravan?.stats || {};
    blocks.push(
      sectionTitle('Летопись'),
      statRow('В пути', playTime(player.playSeconds)),
      statRow('День', state.time ? state.time.day : 1),
      statRow('Побеждено врагов', player.kills || 0),
      statRow('Поражений', player.deaths || 0),
      statRow('Караванов доведено', caravan.arrived || 0),
      statRow('Караванов потеряно', caravan.failed || 0),
      statRow('Заданий выполнено', Object.keys(state.quests?.done || {}).length),
      statRow('Открыто мест', Object.keys(state.world?.discovered || {}).length),
    );
    return blocks;
  }

  function refresh() {
    if (!g.state) return;
    render(left, identity);
    render(middle, derived);
    render(right, world);
  }

  const watch = live(STATE_EVENTS, refresh);
  return {
    el: el('div.chr-view', null, [left, middle, right]),
    onOpen() {
      watch.start();
      refresh();
    },
    onClose: () => watch.stop(),
    hints: () => [{ key: 'skills', label: 'Умения', onClick: () => ui.open('skills') }],
  };
}
