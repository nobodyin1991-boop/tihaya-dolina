// Shop {cityKey, role, only?, title?} and trade {cityKey} (contextual): merchant stock on the left, the hero's bag
// on the right, the deal in the middle. The trade screen adds the three-city price table and market news.
// Sim: economy (shopStock, buyItem, sellItem, sellPrice, buyPrice, quoteBuy, quoteSell, priceComparison, marketNews,
// prosperityOf, stockOf), inventory.roomFor.
import { item as itemDef } from '../../data/items.js';
import { SHOP_NAMES, CITY_KEYS, MAX_PROSPERITY } from '../../data/economy.js';
import { TRADE_GOODS } from '../../data/caravans.js';
import {
  shopStock, buyItem, sellItem, sellPrice, buyPrice, quoteBuy, quoteSell, priceComparison, marketNews, prosperityOf, priceBonus,
} from '../../sim/economy.js';
import { roomFor, usedSlots, totalSlots } from '../../sim/inventory.js';
import { repRank } from '../../sim/reputation.js';
import { icon } from '../icons.js';
import {
  el, clear, sectionTitle, button, coins, numberStepper, tag, tabs, sections, listRow, itemTooltip, rarityColor, formatNumber, isMobileUi,
} from '../kit.js';
import { act, live, safe, render, note, itemCard, pageHead, fact, cityName, currentCityKey, percent, pips, STATE_EVENTS } from '../screen-kit.js';

const isFood = def => def.cooldownGroup === 'food' || def.cat === 'food' || def.cat === 'meal';

export function registerShopScreens(ui, g) {
  ui.registerScreen({ id: 'shop', title: 'Лавка', create: () => createShop(g, ui, false) });
  ui.registerScreen({ id: 'trade', title: 'Купеческий двор', create: () => createShop(g, ui, true) });
}

function createShop(g, ui, isTrade) {
  let cityKey = 'valley';
  let role = 'grocer';
  let only = null;
  let title = '';
  let side = 'buy';            // which pane owns the selection
  let selectedId = null;
  let quantity = 1;
  let page = 'deal';           // trade only: deal | market
  let dealOpen = false;        // mobile: the deal card is shown instead of the list (master → detail)
  const state = () => g.state;

  const head = el('div.shp-head');
  const stockList = el('div.shp-list.kit-scroll.interactive');
  const bagList = el('div.shp-list.kit-scroll.interactive');
  const deal = el('div.shp-deal.kit-scroll.interactive');
  const market = el('div.shp-market.kit-scroll.interactive');
  const stockPane = el('div.shp-pane', null, [sectionTitle('Товар торговца'), stockList]);
  const bagPane = el('div.shp-pane', null, [sectionTitle('Ваша сумка', 'что купят'), bagList]);
  const columns = el('div.shp-columns', null, [stockPane, deal, bagPane]);
  const pageTabs = isTrade ? tabs({
    tabs: [{ id: 'deal', label: 'Торг' }, { id: 'market', label: 'Цены трёх городов' }],
    onChange: id => {
      page = id;
      refresh();
    },
  }) : null;
  const body = el('div.shp-body');
  // mobile: buying and selling are two sections of a side rail (plus the price table on the trade screen);
  // a tap on a row opens the deal card full-width with a «Назад» bar
  const rail = sections({
    items: [
      { id: 'buy', label: 'Купить', icon: 'coin', nodes: [stockPane] },
      { id: 'sell', label: 'Продать', icon: 'inventory', nodes: [bagPane] },
      ...(isTrade ? [{ id: 'market', label: 'Цены', icon: 'city', nodes: [] }] : []),
    ],
    onChange: id => {
      dealOpen = false;
      if (id === 'market') {
        pageTabs.set('market');
        return;
      }
      side = id;
      selectedId = null;
      quantity = 1;
      if (page === 'market') pageTabs.set('deal');
      else refresh();
    },
  });

  function closeDeal() {
    dealOpen = false;
    columns.classList.remove('m-deal');
  }

  function stock() {
    const rows = safe(() => shopStock(state(), cityKey, role), []) || [];
    return only === 'food' ? rows.filter(row => isFood(itemDef(row.itemId))) : rows;
  }

  function bag() {
    const st = state();
    return Object.entries(st.inv.items)
      .map(([itemId, count]) => ({ itemId, count, price: safe(() => sellPrice(st, cityKey, itemId), 0) }))
      .filter(row => row.price > 0)
      .sort((a, b) => b.price * b.count - a.price * a.count);
  }

  function select(nextSide, itemId, tapped) {
    side = nextSide;
    selectedId = itemId;
    quantity = 1;
    if (tapped && isMobileUi()) dealOpen = true;
    refresh();
  }

  function trendTag(itemId) {
    const rows = safe(() => priceComparison(state(), itemId), null);
    if (!rows || rows.length < 2) return null;
    const here = rows.find(row => row.cityKey === cityKey);
    if (!here) return null;
    const buys = rows.map(row => row.buy);
    if (here.buy <= Math.min(...buys) && Math.max(...buys) > here.buy * 1.15) return 'cheap';
    if (here.buy >= Math.max(...buys) && Math.min(...buys) < here.buy * 0.87) return 'dear';
    return null;
  }

  function renderStock() {
    const rows = stock();
    if (!rows.length) return el('div.chr-none', { text: 'Сегодня торговцу нечего предложить.' });
    return rows.map(row => {
      const def = itemDef(row.itemId);
      const trend = trendTag(row.itemId);
      const node = el('div.kit-row.shp-row', { class: `${side === 'buy' && selectedId === row.itemId ? 'selected' : ''} ${row.locked ? 'locked' : ''}`, onClick: () => select('buy', row.itemId, true), onDblclick: () => buy(row.itemId, 1) },
        listRow({
          icon: row.locked ? 'lock' : def.icon, label: def.name, rarity: def.rarity, dim: !!row.locked || row.stock <= 0,
          sub: row.locked || (row.stock > 0 ? `в наличии ${row.stock}` : 'раскуплено'),
          badge: trend === 'cheap' ? 'дёшево' : trend === 'dear' ? 'дорого' : undefined,
          right: coins(row.price, { class: state().player.coins < row.price ? 'lacking' : '' }),
        }));
      ui.tooltip.attach(node, () => itemTooltip(row.itemId, row.locked ? [{ text: row.locked, kind: 'warn' }] : undefined));
      return node;
    });
  }

  function renderBag() {
    const rows = bag();
    if (!rows.length) return el('div.chr-none', { text: 'В сумке нет ничего на продажу.' });
    return rows.map(row => {
      const def = itemDef(row.itemId);
      const node = el('div.kit-row.shp-row', { class: side === 'sell' && selectedId === row.itemId ? 'selected' : '', onClick: () => select('sell', row.itemId, true), onDblclick: () => sell(row.itemId, 1) },
        listRow({ icon: def.icon, label: def.name, rarity: def.rarity, sub: `×${row.count}`, right: coins(row.price) }));
      ui.tooltip.attach(node, () => itemTooltip(row.itemId));
      return node;
    });
  }

  function buy(itemId, count) {
    act(ui, () => buyItem(state(), cityKey, role, itemId, count), result => `Куплено: ${itemDef(itemId).name} ×${result.count} за ${result.total}`);
  }

  function sell(itemId, count) {
    act(ui, () => sellItem(state(), cityKey, itemId, count), result => `Продано: ${itemDef(itemId).name} ×${result.count} за ${result.total}`);
  }

  function cityPrices(itemId) {
    const rows = safe(() => priceComparison(state(), itemId), []) || [];
    if (!rows.length) return null;
    const bestSell = Math.max(...rows.map(row => row.sell));
    const bestBuy = Math.min(...rows.map(row => row.buy));
    const table = el('div.shp-cities');
    table.append(el('div.shp-city.head', null, [el('span'), el('span', { text: 'купить' }), el('span', { text: 'продать' })]));
    for (const key of CITY_KEYS) {
      const row = rows.find(entry => entry.cityKey === key);
      if (!row) continue;
      table.append(el('div.shp-city', { class: key === cityKey ? 'here' : '' }, [
        el('span.shp-city-name', null, [cityName(key), key === cityKey ? tag('здесь', 'gold') : null]),
        el('span.t-num', { class: row.buy === bestBuy ? 'best' : '', text: formatNumber(row.buy) }),
        el('span.t-num', { class: row.sell === bestSell && row.sell > 0 ? 'best' : '', text: row.sell > 0 ? formatNumber(row.sell) : '—' }),
      ]));
    }
    return table;
  }

  function renderDeal() {
    const st = state();
    const buying = side === 'buy';
    const rows = buying ? stock() : bag();
    const row = rows.find(entry => entry.itemId === selectedId);
    if (!row) return el('div.kit-empty', null, [el('i.kit-empty-diamond'), el('div.kit-empty-text', { text: 'Выберите товар слева, чтобы купить, или вещь из сумки справа, чтобы продать' })]);
    const def = itemDef(row.itemId);
    const backBar = el('div.kit-detail-bar', null, [
      el('button.kit-detail-back.m-back', { type: 'button', onClick: closeDeal }, [icon('chevron-left'), el('span', { text: 'Назад' })]),
      el('span.kit-detail-backtitle', { text: buying ? 'Покупка' : 'Продажа' }),
    ]);
    // two groups (plain flow on desktop, two columns on mobile so the buy / sell controls need no scrolling)
    const info = el('div.shp-deal-info', null, [itemCard(st, row.itemId, { compare: buying }), sectionTitle('Цены по городам'), cityPrices(row.itemId)]);
    if (buying && row.locked) return [backBar, info, el('div.shp-deal-trade', null, note(row.locked, 'lock', 'warn'))];
    const blocks = [];
    const limit = buying
      ? Math.max(0, Math.min(row.stock, roomFor(st, row.itemId)))
      : row.count;
    const max = Math.max(1, Math.min(999, limit));
    quantity = Math.max(1, Math.min(quantity, max));
    const totalNode = el('span.shp-total');
    const quote = count => safe(() => (buying ? quoteBuy(st, cityKey, row.itemId, count) : quoteSell(st, cityKey, row.itemId, count)), 0);
    const actionButton = button(buying ? 'Купить' : 'Продать', { primary: true, icon: 'coin', onClick: () => (buying ? buy(row.itemId, quantity) : sell(row.itemId, quantity)) });
    const paint = () => {
      const total = quote(quantity);
      const poor = buying && st.player.coins < total;
      clear(totalNode, [el('span', { text: buying ? 'К оплате' : 'Вы получите' }), coins(total, { class: poor ? 'lacking' : '' }), quantity > 1 ? el('small.t-num', { text: `≈ ${formatNumber(total / quantity)} за шт.` }) : null]);
      actionButton.disabled = limit <= 0 || poor;
    };
    const stepper = numberStepper({ value: quantity, min: 1, max, onChange: value => {
      quantity = value;
      paint();
    } });
    paint();
    blocks.push(
      sectionTitle(buying ? 'Покупка' : 'Продажа', buying ? `в наличии ${row.stock}` : `в сумке ${row.count}`),
      buying && limit <= 0 ? note(row.stock <= 0 ? 'Товар закончился — загляните завтра.' : 'В сумке нет места.', 'warning', 'warn') : null,
      el('div.gs-actions', null, [stepper, actionButton]),
      totalNode,
      el('div.shp-hint', { text: buying ? 'Каждая следующая штука дороже: полки пустеют.' : `Каждая следующая штука дешевле: рынок насыщается. ${def.type === 'trade' ? 'Торговые товары выгоднее везти в другой город.' : ''}` }),
    );
    return [backBar, info, el('div.shp-deal-trade', null, blocks)];
  }

  // ───────────── trade: the three-city table ─────────────

  function renderMarket() {
    const st = state();
    const table = el('div.shp-arb');
    table.append(el('div.shp-arb-row.head', null, [
      el('span', { text: 'Товар' }),
      ...CITY_KEYS.map(key => el('span', { class: key === cityKey ? 'here' : '' }, [cityName(key), el('small', { text: 'купить / продать' })])),
      el('span', { text: 'Лучший рейс' }),
    ]));
    for (const itemId of TRADE_GOODS) {
      const def = itemDef(itemId);
      const prices = CITY_KEYS.map(key => ({ key, buy: safe(() => buyPrice(st, key, itemId), 0), sell: safe(() => sellPrice(st, key, itemId), 0) }));
      const cheapest = prices.reduce((a, b) => (b.buy < a.buy ? b : a));
      const dearest = prices.reduce((a, b) => (b.sell > a.sell ? b : a));
      const margin = dearest.sell - cheapest.buy;
      const name = el('span.shp-arb-name.interactive', null, [icon(def.icon), def.name]);
      name.style.setProperty('--rarity', rarityColor(def.rarity));
      ui.tooltip.attach(name, () => itemTooltip(itemId));
      table.append(el('div.shp-arb-row', null, [
        name,
        ...prices.map(price => el('span.t-num', { class: price.key === cityKey ? 'here' : '' }, [
          el('b', { class: price.key === cheapest.key ? 'cheap' : '', text: formatNumber(price.buy) }),
          ' / ',
          el('b', { class: price.key === dearest.key ? 'dear' : '', text: formatNumber(price.sell) }),
        ])),
        el('span.shp-arb-route', { class: margin > 0 ? 'good' : '' }, margin > 0 && cheapest.key !== dearest.key
          ? [`${cityName(cheapest.key)} → ${cityName(dearest.key)}`, el('b.t-num', { text: ` +${formatNumber(margin)}` })]
          : '—'),
      ]));
    }
    const news = safe(() => marketNews(st), []) || [];
    return [
      el('p.car-hint', { text: 'Зелёным — где дешевле всего купить, янтарём — где дороже всего продать. Товары грузятся в телегу как попутный груз и продаются гильдией с надбавкой.' }),
      table,
      sectionTitle('Вести с рынков'),
      news.length ? news.map(line => el('div.shp-news', { class: line.kind || '' }, [
        icon(line.kind === 'shortage' ? 'arrow-up' : line.kind === 'surplus' ? 'arrow-down' : 'speech'),
        el('span.shp-news-city', { text: cityName(line.cityKey) }),
        el('span', { text: line.text }),
        el('small.t-num', { text: line.daysLeft ? `ещё ${line.daysLeft} дн.` : line.day !== undefined ? `день ${line.day}` : '' }),
      ])) : el('div.chr-none', { text: 'На рынках тихо: цены держатся обычные.' }),
    ];
  }

  function renderHead() {
    const st = state();
    const rank = repRank(st, cityKey);
    const prosperity = prosperityOf(st, cityKey);
    const bonus = safe(() => priceBonus(st, cityKey), 0);
    const prosper = el('span.shp-prosper', null, [pips(prosperity, MAX_PROSPERITY)]);
    ui.tooltip.attach(prosper, 'Достаток города. Каждый приведённый караван открывает в лавках новые товары.');
    return pageHead(title, `${cityName(cityKey)} · ${rank.name}`, [
      fact('Достаток города', prosper),
      fact('Ваша скидка', percent(bonus, 1), bonus > 0 ? 'good' : ''),
      fact('Сумка', `${usedSlots(st)} / ${totalSlots(st)}`),
      fact('Монеты', coins(st.player.coins)),
    ]);
  }

  function refresh() {
    if (!state()) return;
    render(head, renderHead);
    if (isTrade && page === 'market') {
      clear(body, market);
      render(market, renderMarket);
    } else {
      if (columns.parentNode !== body) clear(body, columns);
      const stockRows = stock();
      const bagRows = bag();
      const pool = side === 'buy' ? stockRows : bagRows;
      if (!pool.some(row => row.itemId === selectedId)) {
        dealOpen = false;
        if (pool.length) selectedId = pool[0].itemId;
        else if (side === 'sell' && stockRows.length) {
          side = 'buy';
          selectedId = stockRows[0].itemId;
        } else selectedId = null;
      }
      const tops = [stockList.scrollTop, bagList.scrollTop];
      render(stockList, renderStock);
      render(bagList, renderBag);
      stockList.scrollTop = tops[0];
      bagList.scrollTop = tops[1];
      render(deal, renderDeal);
    }
    columns.classList.toggle('m-deal', dealOpen);
    rail.set(isTrade && page === 'market' ? 'market' : side, true);
    ui.refreshHints();
  }

  function move(delta) {
    const pool = side === 'buy' ? stock() : bag();
    if (!pool.length) return;
    const index = Math.max(0, pool.findIndex(row => row.itemId === selectedId));
    const next = pool[Math.max(0, Math.min(pool.length - 1, index + delta))];
    select(side, next.itemId);
    const list = side === 'buy' ? stockList : bagList;
    const node = list.querySelector('.selected');
    if (node) node.scrollIntoView({ block: 'nearest' });
  }

  function switchSide() {
    const next = side === 'buy' ? 'sell' : 'buy';
    const pool = next === 'buy' ? stock() : bag();
    if (pool.length) select(next, pool[0].itemId);
  }

  function confirmDeal() {
    if (!selectedId) return;
    if (side === 'buy') buy(selectedId, quantity);
    else sell(selectedId, quantity);
  }

  const watch = live(STATE_EVENTS, refresh);
  return {
    el: el('div.shp-view', null, [head, pageTabs ? pageTabs.el : null, el('div.shp-main', null, [rail.el, body])]),
    onOpen(params = {}) {
      cityKey = (params && params.cityKey) || currentCityKey(g) || 'valley';
      role = isTrade ? 'trader' : (params && params.role) || 'grocer';
      only = (params && params.only) || null;
      title = (params && params.title) || (isTrade ? 'Купеческий двор' : SHOP_NAMES[role] || 'Лавка');
      side = 'buy';
      selectedId = null;
      quantity = 1;
      dealOpen = false;
      watch.start();
      refresh();
    },
    onClose: () => watch.stop(),
    onKey(event) {
      if (event.target && event.target.tagName === 'INPUT') return false;
      if (isTrade && event.code === 'KeyR') {
        pageTabs.step(1);
        return true;
      }
      if (page === 'market') return false;
      switch (event.code) {
        case 'ArrowDown': case 'KeyS': move(1); return true;
        case 'ArrowUp': case 'KeyW': move(-1); return true;
        case 'ArrowLeft': case 'ArrowRight': case 'Tab': case 'KeyA': case 'KeyD': switchSide(); return true;
        case 'Enter': case 'NumpadEnter': case 'KeyE': confirmDeal(); return true;
        default: return false;
      }
    },
    hints() {
      const list = [];
      if (isTrade) list.push({ key: 'R', label: page === 'market' ? 'К торгу' : 'Цены трёх городов', touch: false, onClick: () => pageTabs.step(1) });
      if (page === 'market') return list;
      list.push({ key: '↑↓', label: 'Товар' }, { key: 'Tab', label: side === 'buy' ? 'К сумке' : 'К прилавку', touch: false, onClick: switchSide });
      if (selectedId) list.push({ key: 'E', label: side === 'buy' ? 'Купить' : 'Продать', touch: false, onClick: confirmDeal });
      return list;
    },
  };
}
