// Caravan (menu tab, also opened by `ui:open {screen:'caravan'}`): the heart of the game.
// Preparation: leg header, route strip, manifest, bonus cargo, wagon, guards, readiness, payout, launch.
// On the road: live run status, toll, repair, abandon. After the ring: guild contract picker.
// Sim: caravan (caravanOverview, contributeCargo, contributeAll, loadBonusCargo, unloadBonusCargo, selectGuildLeg,
// launchCaravan, payToll, repairWagon, abandonRun), economy (sellPrice, buyPrice), inventory.countItem.
import { item as itemDef } from '../../data/items.js';
import { TRADE_GOODS, GUILD_SALE_BONUS, DANGER_LABELS } from '../../data/caravans.js';
import {
  caravanOverview, contributeCargo, contributeAll, loadBonusCargo, unloadBonusCargo, selectGuildLeg,
  launchCaravan, payToll, repairWagon, abandonRun,
} from '../../sim/caravan.js';
import { sellPrice, buyPrice } from '../../sim/economy.js';
import { countItem } from '../../sim/inventory.js';
import { icon } from '../icons.js';
import {
  el, sectionTitle, button, bar, coins, tag, progressRing, modal, emptyState, itemTooltip, rarityColor, formatNumber,
} from '../kit.js';
import { act, live, safe, render, note, fact, cityName, currentCityKey, percent, STATE_EVENTS } from '../screen-kit.js';
import { routeStrip, wagonSection, guardsSection } from './caravan-parts.js';

const CATEGORY_ICONS = { provisions: 'bread', materials: 'plank', goods: 'crate', medicine: 'salve' };
const DANGER_KINDS = ['good', 'teal', 'warn', 'bad', 'bad'];

export function registerCaravanScreen(ui, g) {
  ui.registerScreen({
    id: 'caravan', title: 'Караван', action: 'caravan', tab: { order: 70, icon: 'caravan' },
    create: () => createCaravan(g, ui),
  });
}

function createCaravan(g, ui) {
  const root = el('div.car-view');
  const state = () => g.state;
  let overview = null;

  const inOrigin = () => !!overview && !!overview.leg && currentCityKey(g) === overview.leg.from;
  const inCity = () => !!currentCityKey(g);

  // ───────────── header ─────────────

  function header() {
    const leg = overview.leg;
    const danger = overview.readiness ? overview.readiness.danger : null;
    const here = inOrigin();
    return el('header.car-head', null, [
      el('div.car-head-main', null, [
        el('div.car-head-kicker', { text: overview.run ? 'Караван в пути' : overview.ringComplete ? `Гильдейский подряд · ступень ${overview.guild.tier + 1}` : `Перегон ${leg.id + 1} из 3 · торговое кольцо` }),
        el('div.car-head-title', null, [el('span', { text: leg.fromName }), el('i.car-head-arrow', null, icon('chevron-right')), el('span', { text: leg.toName })]),
        el('div.car-head-brief', { text: leg.brief }),
      ]),
      el('div.car-head-facts', null, [
        fact('Дорога', leg.name),
        fact('Длина', `${formatNumber(leg.length)} м`),
        danger ? fact('Опасность', danger.label, DANGER_KINDS[danger.rating]) : null,
        overview.run ? null : fact('Вы сейчас', here ? 'у ворот отправления' : cityName(currentCityKey(g)) || 'в дороге', here ? 'good' : 'warn'),
      ]),
    ]);
  }

  // ───────────── guild picker ─────────────

  function guildPicker() {
    if (!overview.guild || overview.run) return null;
    const row = el('div.car-guild-legs');
    for (const leg of overview.guild.legs) {
      row.append(button(leg.name, { primary: leg.selected, small: true, icon: leg.selected ? 'check' : 'caravan', onClick: () => pickGuildLeg(leg) }));
    }
    return el('div.car-guild', null, [
      el('div.car-guild-text', null, [
        el('b', { text: 'Кольцо замкнуто.' }),
        ` Гильдия даёт подряды на любую дорогу; ступень ${overview.guild.tier + 1}: грузы и засады растут вместе с оплатой.`,
      ]),
      row,
    ]);
  }

  async function pickGuildLeg(leg) {
    if (leg.selected) return;
    const delivered = Object.values(state().caravan.delivered || {}).some(count => count > 0);
    if (delivered && !(await ui.confirm({ title: 'Сменить подряд?', text: 'Сданный груз вернётся в сумку, ведомость будет новой.', yes: 'Сменить' }))) return;
    act(ui, () => selectGuildLeg(state(), leg.id), `Подряд: ${leg.name}`);
    refresh();
  }

  // ───────────── manifest ─────────────

  function manifestPanel() {
    const here = inOrigin();
    const progress = overview.manifestProgress;
    const canGive = overview.manifest.some(line => !line.done && line.inBag > 0);
    const box = el('section.car-panel.car-manifest', null, [
      sectionTitle('Грузовая ведомость', `${progress.done} / ${progress.total} · ${percent(progress.total ? progress.done / progress.total : 0)}`),
    ]);
    const groups = new Map();
    for (const line of overview.manifest) {
      if (!groups.has(line.category)) groups.set(line.category, []);
      groups.get(line.category).push(line);
    }
    for (const [category, lines] of groups) {
      const done = lines.reduce((sum, line) => sum + line.delivered, 0);
      const total = lines.reduce((sum, line) => sum + line.count, 0);
      box.append(el('div.car-group', { class: done >= total ? 'done' : '' }, [
        icon(CATEGORY_ICONS[category] || 'crate'),
        el('span.car-group-name', { text: lines[0].categoryName || category }),
        el('i'),
        el('span.car-group-count.t-num', { text: `${done} / ${total}` }),
      ]));
      for (const line of lines) box.append(manifestRow(line, here));
    }
    box.append(el('div.car-manifest-foot', null, [
      here ? null : note(`Груз принимает интендант в городе отправления (${overview.leg.fromName}).`, 'npc'),
      el('span.car-advance', { text: 'За каждую сданную единицу интендант платит небольшой задаток.' }),
      button('Сдать всё', { primary: canGive && here, icon: 'check', disabled: !here || !canGive, onClick: giveAll }),
    ]));
    return box;
  }

  function manifestRow(line, here) {
    const def = itemDef(line.itemId);
    const missing = line.count - line.delivered;
    const give = Math.min(missing, line.inBag);
    const lineBar = bar({ value: line.delivered, max: line.count, kind: line.done ? 'stamina' : 'gold' });
    const name = el('span.car-line-name.interactive', null, [icon(def.icon), el('span', { text: line.name })]);
    name.style.setProperty('--rarity', rarityColor(def.rarity));
    ui.tooltip.attach(name, () => itemTooltip(line.itemId, [{ text: `Задаток: ${line.advance} за штуку`, kind: 'dim' }]));
    let control;
    if (line.done) control = el('span.car-line-done', null, [icon('check'), 'собрано']);
    else control = button(give > 0 ? `Сдать ${give}` : 'Сдать', { small: true, disabled: !here || give <= 0, title: give <= 0 ? 'В сумке этого нет' : '', onClick: () => act(ui, () => contributeCargo(state(), line.itemId), result => `Принято: ${line.name} ×${result.accepted} (задаток ${result.advance})`) });
    return el('div.car-line', { class: line.done ? 'done' : give > 0 ? 'ready' : '' }, [
      name,
      lineBar,
      el('span.car-line-count.t-num', { text: `${line.delivered} / ${line.count}` }),
      el('span.car-line-bag.t-num', { class: line.inBag > 0 && !line.done ? 'has' : '', text: line.done ? '' : `в сумке ${line.inBag}` }),
      control,
    ]);
  }

  function giveAll() {
    act(ui, () => contributeAll(state()), result => `Сдано ${result.accepted} ед. груза, задаток ${result.advance}`);
  }

  // ───────────── bonus cargo ─────────────

  function bonusPanel() {
    const bonus = overview.bonus;
    const here = inOrigin() && !overview.run;
    const dest = bonus.sellsAt;
    const room = bonus.capacity - bonus.used;
    const capacity = bar({ value: bonus.used, max: bonus.capacity, kind: 'gold', text: true, label: 'Мест занято' });
    const box = el('section.car-panel.car-bonus', null, [
      sectionTitle('Попутный груз', `продаётся: ${cityName(dest)}`),
      el('p.car-hint', { text: `Свои торговые товары едут в телеге и продаются гильдией по прибытии с надбавкой ${percent(GUILD_SALE_BONUS - 1)}. Если телегу разобьют — половина пропадёт.` }),
      capacity,
    ]);
    const table = el('div.car-goods');
    let profitTotal = 0;
    for (const entry of bonus.items) {
      const profit = entry.estimate - entry.cost;
      profitTotal += profit;
      table.append(goodsRow(entry.itemId, `на телеге ×${entry.count}`, coins(entry.estimate), profit, [
        button('Снять', { small: true, disabled: !here, onClick: () => act(ui, () => unloadBonusCargo(state(), entry.itemId)) }),
      ], 'loaded'));
    }
    const inBag = Object.keys(state().inv.items).filter(id => TRADE_GOODS.includes(id) || itemDef(id).type === 'trade');
    for (const itemId of inBag) {
      const have = countItem(state(), itemId);
      const unit = safe(() => Math.round(sellPrice(state(), dest, itemId) * GUILD_SALE_BONUS), 0);
      const cost = safe(() => buyPrice(state(), overview.leg.from, itemId), 0);
      const load = count => act(ui, () => loadBonusCargo(state(), itemId, count));
      table.append(goodsRow(itemId, `в сумке ×${have}`, el('span', null, [coins(unit), el('small', { text: ' за шт.' })]), unit - cost, [
        button('+1', { small: true, disabled: !here || room <= 0, onClick: () => load(1) }),
        button('Всё', { small: true, primary: here && room > 0, disabled: !here || room <= 0, onClick: () => load(have) }),
      ], ''));
    }
    if (!bonus.items.length && !inBag.length) table.append(el('div.chr-none', { text: 'В сумке нет торговых товаров. Их продаёт купец: мёд, сыр, зерно, лес — дёшево здесь, дорого там.' }));
    box.append(table);
    if (bonus.items.length) {
      box.append(el('div.car-bonus-total', null, [
        el('span', { text: 'Ожидаемая выручка' }), coins(overview.expectedPayout.bonusSale),
        el('span.car-profit', { class: profitTotal >= 0 ? 'good' : 'bad', text: `прибыль ${profitTotal >= 0 ? '+' : '−'}${formatNumber(Math.abs(profitTotal))}` }),
      ]));
    }
    if (!here && !overview.run) box.append(note(`Грузить и снимать товар можно у телеги в городе отправления (${overview.leg.fromName}).`, 'npc'));
    return box;
  }

  function goodsRow(itemId, sub, price, profit, controls, cls) {
    const def = itemDef(itemId);
    const name = el('span.car-line-name.interactive', null, [icon(def.icon), el('span', { text: def.name })]);
    name.style.setProperty('--rarity', rarityColor(def.rarity));
    ui.tooltip.attach(name, () => itemTooltip(itemId));
    return el('div.car-good', { class: cls }, [
      name,
      el('span.car-good-sub.t-num', { text: sub }),
      el('span.car-good-price', null, price),
      el('span.car-profit.t-num', { class: profit >= 0 ? 'good' : 'bad', text: `${profit >= 0 ? '+' : '−'}${formatNumber(Math.abs(profit))}` }),
      el('span.car-good-controls', null, controls),
    ]);
  }

  // ───────────── readiness and launch ─────────────

  function launchRisks() {
    const ready = overview.readiness;
    const risks = [];
    if (ready.danger.rating >= 2) risks.push(`Дорога: ${ready.danger.label.toLowerCase()} (угроза ${ready.danger.threat}, защита ${ready.danger.protection}).`);
    if (!overview.guards.hired.length) risks.push('Охраны нет — отбиваться придётся в одиночку.');
    if (!ready.provisions.ok) risks.push('Охране не хватает пайка — бойцы пойдут ослабленными.');
    const undone = ready.prep.filter(prep => !prep.done).length;
    if (undone) risks.push(`Не сделано подготовки: ${undone} из ${ready.prep.length}.`);
    if (overview.wagon.hp < overview.wagon.maxHp) risks.push('Телега повреждена — почините её до выезда.');
    if (overview.towDebt > 0) risks.push(`С вас спишут долг за буксировку: ${overview.towDebt} монет.`);
    return risks;
  }

  async function launch() {
    const risks = launchRisks();
    const leg = overview.leg;
    const dialog = modal({
      title: 'Отправить караван?',
      wide: true,
      content: el('div.car-confirm', null, [
        el('p', { text: `${leg.fromName} → ${leg.toName}, ${formatNumber(leg.length)} м. Телега идёт, только пока вы рядом; бросите — придётся платить за буксировку.` }),
        risks.length ? el('ul.car-confirm-risks', null, risks.map(text => el('li', null, [icon('warning'), el('span', { text })]))) : el('div.car-confirm-ok', null, [icon('check'), 'Всё готово: груз собран, дорога разведана, охрана сыта.']),
        el('div.car-confirm-pay', null, ['Ожидаемая выплата: ', coins(overview.expectedPayout.total)]),
      ]),
      buttons: [{ label: 'В путь!', value: true, primary: true }, { label: 'Ещё подготовлюсь', value: false }],
    });
    if (!(await dialog.closed)) return;
    if (act(ui, () => launchCaravan(state()))) ui.closeAll();
  }

  function readinessPanel() {
    const ready = overview.readiness;
    const progress = overview.manifestProgress;
    const share = progress.total ? progress.done / progress.total : 0;
    const here = inOrigin();
    const ring = progressRing({ value: share, label: `${Math.round(share * 100)}%`, size: '5.4em' });
    const check = (done, text, sub, kind) => el('div.car-check', { class: `${done ? 'done' : ''} ${kind || ''}` }, [
      el('span.car-check-mark', null, icon(done ? 'check' : kind === 'must' ? 'cross' : 'diamond')),
      el('div', null, [el('div.car-check-text', { text }), sub ? el('div.car-check-sub', { text: sub }) : null]),
    ]);
    const list = el('div.car-checks', null, [
      check(progress.full, progress.full ? 'Ведомость закрыта' : 'Ведомость не закрыта', progress.full ? null : `Осталось собрать ${progress.total - progress.done} ед. груза`, 'must'),
      check(overview.wagon.hp > 0, 'Телега на ходу', overview.wagon.hp < overview.wagon.maxHp ? `Прочность ${overview.wagon.hp} / ${overview.wagon.maxHp}` : null, 'must'),
      check(here, 'Вы у ворот отправления', here ? null : `Караван ждёт в городе ${overview.leg.fromName}`, 'must'),
      overview.towDebt > 0 ? check(state().player.coins >= overview.towDebt, `Долг за буксировку: ${overview.towDebt}`, 'Спишется при выезде', 'must') : null,
    ]);
    const prep = el('div.car-checks');
    prep.append(check(overview.guards.hired.length > 0, `Охрана: ${overview.guards.hired.length} из ${overview.guards.limit}`, overview.guards.hired.length ? (ready.provisions.ok ? 'Паёк собран' : `Паёк: ${ready.provisions.have} / ${ready.provisions.need}`) : 'Наймите бойцов у капитана стражи', ready.provisions.ok ? '' : 'warn'));
    for (const item of ready.prep) prep.append(check(item.done, item.label, item.effect));

    const danger = ready.danger;
    const dangerBox = el('div.car-danger', { class: `d${danger.rating}` }, [
      el('div.car-danger-pips', null, DANGER_LABELS.map((label, index) => el('i', { class: index <= danger.rating ? 'on' : '' }))),
      el('div.car-danger-label', { text: danger.label }),
      el('div.car-danger-sub.t-num', { text: `угроза ${danger.threat} · защита ${danger.protection}` }),
    ]);
    ui.tooltip.attach(dangerBox, 'Оценка дороги: число врагов в засадах против вашей защиты — охраны, ступени телеги и улучшений. Разведка и расправа с главарями снижают угрозу.');

    const pay = overview.expectedPayout;
    const blockers = ready.blockers.slice();
    if (!here) blockers.push(`Вы не в городе ${overview.leg.fromName}`);
    const canGo = ready.canLaunch && here;
    const panel = el('section.car-panel.car-ready', null, [
      sectionTitle('Готовность'),
      el('div.car-ready-top', null, [ring, el('div.car-ready-text', null, [
        el('div.car-ready-title', { text: canGo ? 'Караван готов' : progress.full ? 'Почти готово' : 'Идёт погрузка' }),
        el('div.car-ready-sub', { text: `Груз ${progress.done} / ${progress.total}` }),
      ])]),
      list,
      sectionTitle('Подготовка', 'по желанию'),
      prep,
      sectionTitle('Дорога'),
      dangerBox,
      sectionTitle('Выплата по прибытии'),
      el('div.car-pay', null, [
        el('div.car-pay-row', null, [el('span', { text: 'Плата гильдии' }), coins(pay.fee)]),
        el('div.car-pay-row', null, [el('span', { text: 'Попутный груз' }), coins(pay.bonusSale)]),
        el('div.car-pay-row.total', null, [el('span', { text: 'Итого' }), coins(pay.total)]),
        el('div.car-pay-note', { text: 'Плата зависит от сохранности груза; без потерь — надбавка 10%.' }),
      ]),
    ]);
    const footer = el('div.car-launchbox', null, [
      el('button.car-launch', { type: 'button', disabled: !canGo, onClick: launch }, [icon('caravan'), el('span', { text: 'Отправить караван' })]),
      canGo ? null : el('div.car-blockers', null, blockers.map(text => el('div', null, [icon('lock'), text]))),
    ]);
    return [el('div.car-col-scroll.kit-scroll.interactive', null, panel), footer];
  }

  // ───────────── run ─────────────

  async function abandon() {
    const agreed = await ui.confirm({
      title: 'Бросить рейс?',
      text: 'Телегу оттащат обратно, уцелевший груз вернётся в ведомость, а за буксировку придётся заплатить перед следующим выездом.',
      yes: 'Бросить рейс', danger: true,
    });
    if (agreed && act(ui, () => abandonRun(state()))) refresh();
  }

  function runPanel() {
    const run = overview.run;
    const wagon = overview.wagon;
    const hud = safe(() => g.caravanRun.hud(), null);
    const status = run.toll ? 'Дорогу перекрыли' : run.activeEvent ? run.activeEvent.title : 'Караван идёт';
    const left = Math.max(0, Math.round(run.length - run.s));
    const hasKit = countItem(state(), 'wagonKit') > 0;
    const blocks = [
      sectionTitle('Рейс', `${percent(run.progress)} пути`),
      el('div.car-run-status', { class: run.toll || run.activeEvent ? 'alert' : '' }, [
        icon(run.toll ? 'coin' : run.activeEvent ? (run.activeEvent.kind === 'obstacle' ? 'obstacle' : 'ambush') : 'wagon'),
        el('div', null, [
          el('div.car-run-title', { text: status }),
          el('div.car-run-sub', { text: `Осталось ${formatNumber(left)} м${hud && Number.isFinite(hud.distance) ? ` · до телеги ${Math.round(hud.distance)} м` : ''}` }),
        ]),
      ]),
      bar({ value: run.s, max: run.length, kind: 'gold', label: 'Путь' }),
      bar({ value: wagon.hp, max: wagon.maxHp, kind: wagon.hp < wagon.maxHp * 0.4 ? 'bad' : 'health', text: true, label: 'Телега' }),
      bar({ value: run.cargoLeft, max: run.cargoTotal || 1, kind: 'stamina', text: true, label: 'Груз' }),
    ];
    if (run.toll) {
      const poor = state().player.coins < run.toll.coins;
      blocks.push(el('div.car-toll', null, [
        el('p', { text: run.toll.text || 'С вас требуют плату за проезд.' }),
        el('div.gs-actions', null, [
          button('Заплатить', { primary: true, icon: 'coin', disabled: poor, onClick: () => act(ui, () => payToll(state()), result => `Откупились за ${result.paid}`) }),
          coins(run.toll.coins, { class: poor ? 'lacking' : '' }),
          el('span.t-dim', { text: 'или закройте окно и деритесь' }),
        ]),
      ]));
    }
    blocks.push(el('div.gs-actions', null, [
      button('Починить набором', { icon: 'tool', disabled: wagon.hp >= wagon.maxHp || !hasKit, title: hasKit ? 'Тратит один ремкомплект, восстанавливает 40% прочности' : 'Нужен ремкомплект для телеги', onClick: () => act(ui, () => repairWagon(state()), 'Телега подлатана') }),
      button('Бросить рейс', { danger: true, icon: 'cross', onClick: abandon }),
    ]));
    return el('section.car-panel.car-run', null, blocks);
  }

  function runSide() {
    const guards = state().caravan.guards || [];
    const live = (safe(() => g.caravanRun.hud(), null) || {}).guards || [];
    const box = el('section.car-panel', null, [sectionTitle('Охрана в рейсе', `${guards.filter(guard => guard.alive).length} в строю`)]);
    if (!guards.length) box.append(el('div.chr-none', { text: 'Вы идёте без охраны.' }));
    for (const guard of guards) {
      const now = live.find(entry => entry.name === guard.name);
      box.append(el('div.car-merc', { class: guard.alive ? 'hired' : 'down' }, [
        el('span.car-merc-icon', null, icon(guard.alive ? 'shield' : 'skull')),
        el('div.car-merc-main', null, [
          el('div.car-merc-name', null, [guard.name, el('small', { text: `ур. ${guard.level}` })]),
          now && guard.alive ? bar({ value: now.hp, max: now.maxHp, kind: 'health' }) : el('div.car-merc-line', { text: guard.alive ? 'в строю' : 'выбыл из строя' }),
        ]),
      ]));
    }
    const pay = overview.expectedPayout;
    box.append(
      sectionTitle('Если дойдём'),
      el('div.car-pay', null, [
        el('div.car-pay-row', null, [el('span', { text: `Плата (сохранность ${percent(overview.run.integrity)})` }), coins(Math.round(pay.fee * overview.run.integrity))]),
        el('div.car-pay-row', null, [el('span', { text: 'Попутный груз' }), coins(pay.bonusSale)]),
      ]),
      sectionTitle('Что впереди'),
    );
    const known = overview.run.knownEvents || [];
    if (!known.length) box.append(el('div.chr-none', { text: 'Дорога не разведана — смотрите в оба.' }));
    for (const event of known) box.append(el('div.car-ahead', null, [icon('ambush'), el('div', null, [el('b', { text: event.title }), el('div', { text: event.hint || '' })])]));
    return box;
  }

  // ───────────── assembly ─────────────

  function build() {
    overview = caravanOverview(state());
    if (!overview.leg) {
      return [
        el('header.car-head', null, el('div.car-head-main', null, [
          el('div.car-head-kicker', { text: `Гильдейские подряды · ступень ${overview.guild ? overview.guild.tier + 1 : 1}` }),
          el('div.car-head-title', null, el('span', { text: 'Выберите дорогу' })),
          el('div.car-head-brief', { text: 'Торговое кольцо восстановлено. Теперь караваны ходят по всем трём дорогам — берите подряд у интенданта.' }),
        ])),
        guildPicker(),
        el('div.car-columns.single', null, [el('div.car-col.kit-scroll.interactive', null, wagonSection(g, ui, overview, { enabled: inCity(), hint: 'Улучшает телегу конюх в любом городе.' })), el('div.car-col', null, emptyState('Подряд не выбран', 'caravan'))]),
      ];
    }
    if (overview.run) {
      return [
        header(),
        routeStrip(g, ui, overview),
        el('div.car-columns.run', null, [
          el('div.car-col.kit-scroll.interactive', null, runPanel()),
          el('div.car-col.kit-scroll.interactive', null, runSide()),
          el('div.car-col.kit-scroll.interactive', null, wagonSection(g, ui, overview, { enabled: false })),
        ]),
      ];
    }
    const origin = inOrigin();
    return [
      header(),
      guildPicker(),
      routeStrip(g, ui, overview),
      el('div.car-columns', null, [
        el('div.car-col.kit-scroll.interactive', null, [manifestPanel(), bonusPanel()]),
        el('div.car-col.kit-scroll.interactive', null, [
          wagonSection(g, ui, overview, { enabled: inCity(), hint: 'Улучшает и чинит телегу конюх — загляните к нему в городе.' }),
          guardsSection(g, ui, overview, { enabled: origin, hint: `Бойцов нанимает капитан стражи в городе отправления (${overview.leg.fromName}).` }),
        ]),
        el('div.car-col.car-col-ready', null, readinessPanel()),
      ]),
    ];
  }

  function refresh() {
    if (!state()) return;
    const scroll = [...root.querySelectorAll('.kit-scroll')].map(node => node.scrollTop);
    render(root, build);
    root.querySelectorAll('.kit-scroll').forEach((node, index) => {
      node.scrollTop = scroll[index] || 0;
    });
    ui.refreshHints();
  }

  const watch = live([...STATE_EVENTS, 'caravan:ambush'], refresh);
  let timer = 0;
  return {
    el: root,
    onOpen() {
      watch.start();
      refresh();
    },
    onClose: () => watch.stop(),
    update(dt) {
      // unpaused cases only (the menu pauses the game): keep the run status fresh once a second
      if (!overview || !overview.run || g.paused) return;
      timer += dt;
      if (timer >= 1) {
        timer = 0;
        refresh();
      }
    },
    onKey(event) {
      if (!overview || !overview.leg || overview.run) return false;
      if (event.code === 'Enter' || event.code === 'NumpadEnter') {
        if (inOrigin() && overview.manifest.some(line => !line.done && line.inBag > 0)) giveAll();
        return true;
      }
      if (event.code === 'KeyG') {
        if (overview.readiness.canLaunch && inOrigin()) launch();
        else ui.toast(overview.readiness.blockers[0] || `Караван ждёт в городе ${overview.leg.fromName}`, 'warn');
        return true;
      }
      return false;
    },
    hints() {
      if (!overview || !overview.leg) return [];
      if (overview.run) return [{ key: 'map', label: 'Карта', onClick: () => ui.open('map', { focus: 'caravan' }) }];
      return [
        { key: 'Enter', label: 'Сдать всё', onClick: giveAll },
        { key: 'G', label: 'Отправить караван', onClick: () => (overview.readiness.canLaunch && inOrigin() ? launch() : ui.toast(overview.readiness.blockers[0] || 'Караван ещё не готов', 'warn')) },
        { key: 'map', label: 'Карта', onClick: () => ui.open('map', { focus: overview.leg.to }) },
      ];
    },
  };
}
