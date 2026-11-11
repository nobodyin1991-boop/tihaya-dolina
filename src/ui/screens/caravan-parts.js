// Building blocks of the caravan screens, reused by the stable and guards screens:
// the route strip, the wagon panel (tier, HP, upgrades, repair) and the guards panel (hire / dismiss).
// Sim: caravan (buyWagonUpgrade, hireGuard, dismissGuard, repairWagon, scoutedEvents).
import { buyWagonUpgrade, hireGuard, dismissGuard, repairWagon, scoutedEvents } from '../../sim/caravan.js';
import { roadAt } from '../../world/terrain.js';
import { cityByKey } from '../../data/world-map.js';
import { icon } from '../icons.js';
import { el, sectionTitle, button, bar, coins, tag, formatNumber, plural } from '../kit.js';
import { act, safe, note } from '../screen-kit.js';

const OBSTACLE_WORDS = /завал|мост|гряз|колес|обвал|взвоз|гать|брод|осыпь|поломк/i;

/** Position 0..1 of a world point along a leg (road lookup first, straight-line projection as a fallback). */
function alongLeg(leg, point) {
  const hit = safe(() => roadAt(point.x, point.z, 120), null);
  if (hit && hit.leg === leg.id && Number.isFinite(hit.s) && leg.length) return Math.max(0.03, Math.min(0.97, hit.s / leg.length));
  const from = cityByKey(leg.from);
  const to = cityByKey(leg.to);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const t = ((point.x - from.x) * dx + (point.z - from.z) * dz) / (dx * dx + dz * dz || 1);
  return Math.max(0.03, Math.min(0.97, t));
}

/**
 * Horizontal route strip: origin city, known road events, destination; the wagon rides along during a run.
 * @param {object} g
 * @param {object} ui
 * @param {object} overview  caravanOverview(state)
 */
export function routeStrip(g, ui, overview) {
  const leg = overview.leg;
  const run = overview.run;
  const events = (run ? run.knownEvents : safe(() => scoutedEvents(g.state), [])) || [];
  const scouted = run ? events.length > 0 || !!g.state.caravan.run?.revealed : events.length > 0;
  const track = el('div.car-route-track');
  const progress = run ? Math.max(0, Math.min(1, run.progress)) : 0;
  track.append(el('i.car-route-line'), el('i.car-route-done', { style: { width: `${progress * 100}%` } }));

  const kilometres = Math.max(1, Math.floor(leg.length / 500));
  for (let mark = 1; mark <= kilometres; mark++) {
    const share = (mark * 500) / leg.length;
    if (share > 0.97) break;
    track.append(el('span.car-route-tick', { style: { left: `${share * 100}%` } }, el('small.t-num', { text: mark % 2 === 0 ? `${mark / 2} км` : '' })));
  }
  for (const event of events) {
    const share = alongLeg(leg, event);
    const obstacle = OBSTACLE_WORDS.test(event.title || '');
    const node = el('span.car-route-event.interactive', { class: `${obstacle ? 'obstacle' : 'ambush'}${run && share < progress ? ' passed' : ''}`, style: { left: `${share * 100}%` } }, icon(obstacle ? 'obstacle' : 'ambush'));
    ui.tooltip.attach(node, el('div', null, [
      el('div.kit-tip-name', { text: event.title }),
      el('div.kit-tip-type', { text: `${obstacle ? 'Преграда' : 'Засада'} · примерно ${formatNumber(Math.round((share * leg.length) / 50) * 50)} м от ворот` }),
      event.hint ? el('div.kit-tip-desc', { text: event.hint }) : null,
    ]));
    track.append(node);
  }
  track.append(el('span.car-route-wagon', { class: run ? 'moving' : '', style: { left: `${progress * 100}%` } }, icon('wagon')));

  const city = (key, name, role) => el('div.car-route-city', null, [
    el('span.car-route-cityicon', null, icon('city')),
    el('span.car-route-cityname', { text: name }),
    el('span.car-route-cityrole', { text: role }),
  ]);
  const legend = scouted
    ? `${events.length} ${plural(events.length, 'известное место', 'известных места', 'известных мест')} на дороге`
    : 'Дорога не разведана — засады застанут врасплох';
  return el('div.car-route', null, [
    city(leg.from, leg.fromName, 'отправление'),
    el('div.car-route-mid', null, [track, el('div.car-route-legend', { class: scouted ? '' : 'warn' }, [icon(scouted ? 'eye' : 'warning'), legend])]),
    city(leg.to, leg.toName, 'назначение'),
  ]);
}

/**
 * Wagon panel: tier, HP, repair and the upgrade list.
 * @param {{enabled: boolean, hint?: string}} opts  `enabled: false` renders prices read-only with the hint
 */
export function wagonSection(g, ui, overview, opts = {}) {
  const state = g.state;
  const wagon = overview.wagon;
  const busy = !!overview.run;
  const enabled = opts.enabled !== false && !busy;
  const hp = bar({ value: wagon.hp, max: wagon.maxHp, kind: wagon.hp < wagon.maxHp * 0.4 ? 'bad' : 'health', text: true, label: 'Прочность' });
  const owned = wagon.upgrades.filter(upgrade => upgrade.owned).length;
  const box = el('section.car-panel.car-wagon', null, [
    sectionTitle('Телега', `ступень ${wagon.tier} · улучшений ${owned}`),
    el('div.car-wagon-head', null, [
      el('span.car-wagon-icon', null, icon('wagon')),
      el('div', null, [el('div.car-wagon-name', { text: wagon.name }), el('div.car-wagon-desc', { text: wagon.desc })]),
    ]),
    hp,
  ]);
  if (wagon.repairCost > 0) {
    box.append(el('div.car-repair', null, [
      el('span', null, ['Починка в городе: ', coins(wagon.repairCost)]),
      button('Починить', { small: true, icon: 'tool', disabled: !enabled, onClick: () => act(ui, () => repairWagon(state), 'Телега починена') }),
    ]));
  }
  const list = el('div.car-upgrades');
  for (const upgrade of wagon.upgrades) {
    const poor = state.player.coins < upgrade.price;
    let control;
    if (upgrade.owned) control = tag(upgrade.consumable ? 'запасено' : 'установлено', 'good');
    else if (upgrade.locked) control = tag('позже', '');
    else control = button('Купить', { small: true, disabled: !enabled || poor, title: poor ? 'Не хватает монет' : '', onClick: () => act(ui, () => buyWagonUpgrade(state, upgrade.id), upgrade.id.startsWith('tier') ? `Готово: ${upgrade.name}` : null) });
    const row = el('div.car-upgrade', { class: upgrade.owned ? 'owned' : upgrade.locked ? 'locked' : '' }, [
      el('span.car-upgrade-mark', null, icon(upgrade.owned ? 'check' : upgrade.locked ? 'lock' : 'plus')),
      el('div.car-upgrade-main', null, [
        el('div.car-upgrade-name', { text: upgrade.name }),
        el('div.car-upgrade-effect', { text: upgrade.locked ? upgrade.lockReason : upgrade.effect }),
      ]),
      upgrade.owned ? null : coins(upgrade.price, { class: poor && !upgrade.locked ? 'lacking' : '' }),
      control,
    ]);
    ui.tooltip.attach(row, `${upgrade.desc} ${upgrade.effect}.${upgrade.consumable ? ' Расходуется в рейсе.' : ''}`);
    list.append(row);
  }
  box.append(list);
  if (!enabled) box.append(note(busy ? 'Караван в пути — улучшения и ремонт только в городе.' : opts.hint || 'Улучшает и чинит телегу конюх.', 'npc'));
  return box;
}

/**
 * Guards panel: hired mercenaries, the pool of the origin city, reputation limit and provisions.
 * @param {{enabled: boolean, hint?: string}} opts
 */
export function guardsSection(g, ui, overview, opts = {}) {
  const state = g.state;
  const guards = overview.guards;
  if (!guards) return el('section.car-panel', null, [sectionTitle('Охрана'), note('Сначала выберите подряд гильдии.')]);
  const busy = !!overview.run;
  const enabled = opts.enabled !== false && !busy;
  const full = guards.hired.length >= guards.limit;
  const box = el('section.car-panel.car-guards', null, [
    sectionTitle('Охрана', `${guards.hired.length} / ${guards.limit} по репутации`),
  ]);
  const list = el('div.car-mercs');
  const hiredById = new Map(guards.hired.map(guard => [guard.id, guard]));
  for (const merc of guards.pool) {
    const mine = hiredById.get(merc.id);
    const poor = state.player.coins < merc.price;
    let control;
    if (mine) control = button('Отпустить', { small: true, disabled: !enabled, title: 'Вернётся половина платы', onClick: () => act(ui, () => dismissGuard(state, merc.id), result => `Боец отпущен, возвращено ${result.refund}`) });
    else control = button('Нанять', { small: true, primary: !full, disabled: !enabled || full || poor, title: full ? 'Капитан больше людей не даст — растите репутацию' : poor ? 'Не хватает монет' : '', onClick: () => act(ui, () => hireGuard(state, merc.id)) });
    list.append(el('div.car-merc', { class: mine ? 'hired' : '' }, [
      el('span.car-merc-icon', null, icon(mine ? 'shield' : 'npc')),
      el('div.car-merc-main', null, [
        el('div.car-merc-name', null, [merc.name, el('small', { text: `ур. ${mine ? mine.level : merc.level}` }), mine ? tag('в отряде', 'good') : null]),
        el('div.car-merc-line', { text: merc.line }),
      ]),
      mine ? null : coins(merc.price, { class: poor ? 'lacking' : '' }),
      control,
    ]));
  }
  // survivors of an earlier contract that are not in this city's pool
  for (const guard of guards.hired) {
    if (guards.pool.some(merc => merc.id === guard.id)) continue;
    list.append(el('div.car-merc.hired', null, [
      el('span.car-merc-icon', null, icon('shield')),
      el('div.car-merc-main', null, el('div.car-merc-name', null, [guard.name, el('small', { text: `ур. ${guard.level}` }), tag('в отряде', 'good')])),
      button('Отпустить', { small: true, disabled: !enabled, onClick: () => act(ui, () => dismissGuard(state, guard.id)) }),
    ]));
  }
  box.append(list);
  const food = guards.provisions;
  if (food.need > 0) {
    box.append(el('div.car-food', { class: food.ok ? 'ok' : 'bad' }, [
      icon(food.ok ? 'check' : 'warning'),
      el('span', { text: food.ok ? `Паёк для охраны собран: ${food.have} / ${food.need}` : `Паёк для охраны: ${food.have} / ${food.need} — возьмите в сумку хлеб, лепёшки или пайки, иначе бойцы ослабнут` }),
    ]));
  } else {
    box.append(el('div.car-food', null, [icon('info'), el('span', { text: 'Каждому бойцу нужно 2 порции еды из вашей сумки на рейс.' })]));
  }
  if (!enabled) box.append(note(busy ? 'Караван в пути — состав охраны не изменить.' : opts.hint || 'Бойцов нанимает капитан стражи города отправления.', 'npc'));
  return box;
}
