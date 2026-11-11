// City services (contextual, params {cityKey}): stable (coach, horse, wagon workshop), guards (mercenaries),
// rest (inn: sleep, meals, rumours).
// Sim: caravan.caravanOverview (+ the shared wagon / guards panels), time.sleepUntil / timeView, economy (shopStock,
// buyItem, marketNews), quests.questLeads, player.spendCoins. Engine: g.travelTo, g.hero.hp.
import { item as itemDef } from '../../data/items.js';
import { CITIES } from '../../data/world-map.js';
import { NPCS } from '../../data/npcs.js';
import { caravanOverview } from '../../sim/caravan.js';
import { sleepUntil, timeView } from '../../sim/time.js';
import { shopStock, buyItem, marketNews } from '../../sim/economy.js';
import { questLeads } from '../../sim/quests.js';
import { spendCoins } from '../../sim/player.js';
import { icon } from '../icons.js';
import { el, sectionTitle, button, coins, tag, itemTooltip } from '../kit.js';
import {
  act, live, safe, render, note, pageHead, fact, cityName, npcLabel, currentCityKey,
  HORSE_PRICE, hasHorse, buyHorse, coachFare, payCoach, STATE_EVENTS,
} from '../screen-kit.js';
import { wagonSection, guardsSection } from './caravan-parts.js';
import { trainButton } from './train.js';

const BED_PRICE = 8;

function serviceScreen(g, ui, build) {
  let cityKey = 'valley';
  const root = el('div.svc-view');
  const refresh = () => {
    if (g.state) render(root, () => build(cityKey, refresh));
  };
  const watch = live(STATE_EVENTS, refresh);
  return {
    el: root,
    onOpen(params = {}) {
      cityKey = (params && params.cityKey) || currentCityKey(g) || 'valley';
      watch.start();
      refresh();
    },
    onClose: () => watch.stop(),
  };
}

const keeper = (cityKey, role) => {
  const npc = NPCS[`${cityKey}:${role}`];
  return npc ? `${npc.name}, ${npc.title} · ${cityName(cityKey)}` : cityName(cityKey);
};

// ───────────────────────── stable ─────────────────────────

function stableView(g, ui, cityKey) {
  const state = g.state;
  const overview = caravanOverview(state);

  const routes = el('div.svc-cards');
  for (const city of CITIES) {
    if (city.key === cityKey) continue;
    const known = !!state.world.discovered[city.key];
    const fare = coachFare(cityKey, city.key);
    const poor = state.player.coins < fare;
    const busy = !!state.caravan.run;
    const go = async () => {
      const agreed = await ui.confirm({ title: `Ехать: ${city.name}?`, text: `Проезд стоит ${fare} монет, дорога займёт около шести часов.`, yes: 'Ехать' });
      if (!agreed || !act(ui, () => payCoach(state, cityKey, city.key))) return;
      ui.closeAll();
      g.travelTo(city.key);
    };
    routes.append(el('div.svc-card', { class: known ? '' : 'locked' }, [
      el('span.svc-card-icon', null, icon(known ? 'city' : 'lock')),
      el('div.svc-card-main', null, [
        el('div.svc-card-name', { text: known ? city.name : 'Неизвестный город' }),
        el('div.svc-card-desc', { text: known ? city.desc : 'Почтовая карета ходит только туда, где вы уже бывали.' }),
      ]),
      known ? coins(fare, { class: poor ? 'lacking' : '' }) : null,
      button('Ехать', { small: true, primary: known && !poor, disabled: !known || poor || busy, title: busy ? 'Сначала доведите караван' : poor ? 'Не хватает монет' : '', onClick: go }),
    ]));
  }

  const owned = hasHorse(state);
  const poorHorse = state.player.coins < HORSE_PRICE;
  const horse = el('div.svc-card.tall', { class: owned ? 'owned' : '' }, [
    el('span.svc-card-icon', null, icon(owned ? 'check' : 'dash')),
    el('div.svc-card-main', null, [
      el('div.svc-card-name', null, ['Верховая лошадь', owned ? tag('ваша', 'good') : null]),
      el('div.svc-card-desc', { text: owned ? `Свистните — прибежит. Сесть в седло и спешиться: клавиша ${g.input.caption('mount')}. В бою лошадь сбрасывает седока.` : `Смирная кобыла из здешней конюшни. Верхом вдвое быстрее; сесть в седло — клавиша ${g.input.caption('mount')}.` }),
    ]),
    owned ? null : coins(HORSE_PRICE, { class: poorHorse ? 'lacking' : '' }),
    owned ? null : button('Купить', { small: true, primary: !poorHorse, disabled: poorHorse, onClick: () => act(ui, () => buyHorse(state), 'Лошадь ваша. В седло — клавиша ' + g.input.caption('mount')) }),
  ]);

  return [
    pageHead('Конюшня', keeper(cityKey, 'stablemaster'), [fact('Монеты', coins(state.player.coins))]),
    el('div.svc-columns', null, [
      el('div.svc-col.kit-scroll.interactive', null, [
        sectionTitle('Почтовая карета'), routes,
        state.caravan.run ? note('Пока караван в пути, карета вас не возьмёт.', 'warning', 'warn') : null,
        sectionTitle('Лошадь'), horse,
      ]),
      el('div.svc-col.kit-scroll.interactive', null, wagonSection(g, ui, overview, { enabled: true })),
    ]),
  ];
}

// ───────────────────────── guards ─────────────────────────

function guardsView(g, ui, cityKey) {
  const state = g.state;
  const overview = caravanOverview(state);
  const origin = overview.leg ? overview.leg.from : null;
  const here = origin === cityKey;
  const danger = overview.readiness ? overview.readiness.danger : null;
  return [
    pageHead('Наём охраны', keeper(cityKey, 'captain'), [
      danger ? fact('Дорога', danger.label, danger.rating >= 2 ? 'warn' : 'good') : null,
      fact('Монеты', coins(state.player.coins)),
      trainButton(ui, g, 'captain', cityKey, 'Учиться у капитана'),
      button('Награды за головы', { small: true, icon: 'skull', onClick: () => ui.open('bounties', { cityKey }) }),
    ]),
    el('div.svc-columns', null, [
      el('div.svc-col.kit-scroll.interactive', null, [
        guardsSection(g, ui, overview, { enabled: here, hint: origin ? `Караван сейчас готовится в городе ${cityName(origin)} — бойцов нанимают там.` : 'Сначала возьмите подряд у интенданта.' }),
      ]),
      el('div.svc-col.kit-scroll.interactive', null, [
        sectionTitle('Что нужно знать'),
        note('Капитан даёт столько бойцов, насколько вам доверяет город: от одного чужаку до четырёх почётному гражданину.', 'shield'),
        note('Каждому бойцу нужно две порции еды из вашей сумки на рейс. Голодный боец дерётся на два уровня хуже.', 'meal'),
        note('Бойцы идут рядом с телегой и принимают удар на себя. Павшие в отряд не возвращаются; по прибытии уцелевшие получают расчёт.', 'swords'),
        note('Отпущенному до выезда бойцу возвращается половина платы.', 'coin'),
        overview.leg ? el('div.svc-leg', null, [sectionTitle('Ближайший рейс'), el('div.svc-leg-name', { text: `${overview.leg.fromName} → ${overview.leg.toName}` }), el('div.svc-card-desc', { text: overview.leg.brief })]) : null,
      ]),
    ]),
  ];
}

// ───────────────────────── rest ─────────────────────────

function restView(g, ui, cityKey, refresh, memo) {
  const state = g.state;
  const time = timeView(state);
  const hurt = g.hero.hp < g.hero.maxHp;

  const sleep = (hour, label) => {
    if (!spendCoins(state, BED_PRICE)) {
      ui.toast(`Койка стоит ${BED_PRICE} монет`, 'warn');
      return;
    }
    if (!act(ui, () => sleepUntil(state, hour))) return;
    g.hero.hp = g.hero.maxHp;
    safe(() => g.save());
    ui.toast(`Вы проспали до ${label}. Силы восстановлены.`, 'good');
    refresh();
  };

  const meals = (safe(() => shopStock(state, cityKey, 'grocer'), []) || [])
    .filter(row => !row.locked && itemDef(row.itemId).cooldownGroup === 'food')
    .slice(0, 5);
  const menu = el('div.svc-cards');
  for (const row of meals) {
    const def = itemDef(row.itemId);
    const poor = state.player.coins < row.price;
    const card = el('div.svc-card', null, [
      el('span.svc-card-icon', null, icon(def.icon)),
      el('div.svc-card-main', null, [el('div.svc-card-name', { text: def.name }), el('div.svc-card-desc', { text: def.desc })]),
      coins(row.price, { class: poor ? 'lacking' : '' }),
      button('Взять', { small: true, disabled: poor || row.stock <= 0, onClick: () => act(ui, () => buyItem(state, cityKey, 'grocer', row.itemId, 1), `В сумке: ${def.name}`) }),
    ]);
    ui.tooltip.attach(card.querySelector('.svc-card-main'), () => itemTooltip(row.itemId));
    menu.append(card);
  }

  const rumours = [];
  for (const lead of safe(() => questLeads(state), []) || []) rumours.push(`Слыхал, ${npcLabel(lead.giver)} ищет толкового человека. Дело зовётся «${lead.title}».`);
  for (const line of safe(() => marketNews(state), []) || []) rumours.push(line.text);
  if (!rumours.length) rumours.push('Тихо нынче. Живём, как жили.');
  const rumourBox = el('div.svc-rumour', null, memo.rumour !== null ? [icon('speech'), el('p', { text: `«${rumours[memo.rumour % rumours.length]}»` })] : el('p.t-dim', { text: 'Трактирщик протирает кружку и ждёт, пока вы спросите.' }));

  return [
    pageHead('Трактир', keeper(cityKey, 'innkeeper'), [
      fact('Сейчас', `${time.text} · ${time.partName}`),
      fact('Погода', time.weatherName),
      fact('Монеты', coins(state.player.coins)),
    ]),
    el('div.svc-columns', null, [
      el('div.svc-col.kit-scroll.interactive', null, [
        sectionTitle('Койка', el('span', null, coins(BED_PRICE))),
        el('p.car-hint', { text: `Сон лечит все раны и пропускает время. ${hurt ? 'Вам бы отлежаться.' : 'Вы здоровы — разве что переждать ночь.'} Ночью на дорогах опаснее.` }),
        el('div.gs-actions', null, [
          button('Спать до утра (06:00)', { primary: true, icon: 'sun', onClick: () => sleep(6, 'утра') }),
          button('Спать до вечера (19:00)', { icon: 'moon', onClick: () => sleep(19, 'вечера') }),
        ]),
        sectionTitle('Слухи'),
        rumourBox,
        el('div.gs-actions', null, button(memo.rumour === null ? 'Что слышно?' : 'А ещё что говорят?', { small: true, icon: 'speech', onClick: () => {
          memo.rumour = memo.rumour === null ? 0 : memo.rumour + 1;
          refresh();
        } })),
      ]),
      el('div.svc-col.kit-scroll.interactive', null, [
        sectionTitle('Стол'),
        meals.length ? menu : el('div.chr-none', { text: 'Сегодня кухня пуста.' }),
        note('Еда лечит вне боя и даёт долгие прибавки. Назначьте её в быстрый слот в инвентаре.', 'meal'),
      ]),
    ]),
  ];
}

export function registerServiceScreens(ui, g) {
  ui.registerScreen({ id: 'stable', title: 'Конюшня', create: () => serviceScreen(g, ui, cityKey => stableView(g, ui, cityKey)) });
  ui.registerScreen({ id: 'guards', title: 'Охрана каравана', create: () => serviceScreen(g, ui, cityKey => guardsView(g, ui, cityKey)) });
  ui.registerScreen({
    id: 'rest', title: 'Трактир',
    create: () => {
      const memo = { rumour: null };
      const screen = serviceScreen(g, ui, (cityKey, refresh) => restView(g, ui, cityKey, refresh, memo));
      const open = screen.onOpen;
      screen.onOpen = params => {
        memo.rumour = null;
        open(params);
      };
      return screen;
    },
  });
}
