// City markets: dynamic prices, shops, buying and selling, daily drift, market events. Pure.
// Slice `economy`: {
//   day, seed,
//   prosperity: { valley, ford, harbor }        — 0..3, raised by arriving caravans
//   stock: { cityKey: { itemId: number } }      — only deviations from the normal (target) stock
//   events: [{ cityKey, cat, kind, mult, daysLeft, text }]
//   news: [{ day, cityKey, text }]              — last few lines for the UI
// }
//
// ── Balance assumptions ──────────────────────────────────────────────────────────────────────
// • price = item.value × cityMultiplier × eventMultiplier × stockFactor(stock / target), where
//   stockFactor = (stock/target)^-0.4 clamped to 0.6…1.8. Buying drains the stock (each next unit
//   is dearer), selling floods it (each next unit pays less), every day 25 % of the gap closes.
// • Merchants pay a share of the price: trade goods 90 %, caravan cargo 75 %, materials 55 %,
//   consumables 45 %, gear 30 %. Money is tight early: a wolf is worth ~8 coins of loot, a tier-2
//   weapon costs ~95, the first ability ranks 30–80.
// • Trade goods cost ×0.65 where produced and ×1.4–1.9 where wanted. One leg (valley→ford) roughly
//   doubles the money put into goods before flooding; a full ring with 300 coins of starting
//   capital returns well over twice that, and the harbor→valley leg (the most dangerous road)
//   has the widest margins. Stock limits (5–30 units per good) cap the profit of one run.
// • Reputation (0..100) improves prices by up to 10 %, perks and trinkets by up to ~17 %; the total
//   is capped at 25 % and a sale never pays more than 95 % of the purchase price in the same city.
// • Crafted goods are valued at 1.2 × inputs (items-catalog.js), so crafting from bought
//   materials loses money while crafting from gathered ones (or hauling cargo to a city that
//   wants it) pays for the craftsman's work.
import { registerSlice, ok, fail } from './state.js';
import { emit } from '../core/events.js';
import { makeRng } from '../core/noise.js';
import { ITEMS } from '../data/items.js';
import {
  CITY_KEYS, MAX_PROSPERITY, SHOPS, SELL_RATIO, STOCK_CURVE, DAILY_DRIFT, MAX_PRICE_BONUS,
  REPUTATION_PRICE_BONUS, EVENT_CATEGORIES, MARKET_EVENTS, EVENT_CHANCE, MAX_ACTIVE_EVENTS,
  CITY_LOCATIVE, cityMultiplier, priceKind, targetStock,
} from '../data/economy.js';
import { addItem, countItem, removeItem, roomFor } from './inventory.js';
import { addCoins } from './player.js';
import { derivedStats } from './stats.js';

const NEWS_LIMIT = 8;
const SELL_CEILING = 0.95;   // a sale pays at most this share of the purchase price

const emptyCityMap = value => Object.fromEntries(CITY_KEYS.map(key => [key, value()]));

registerSlice('economy', {
  init: () => ({
    day: 0,
    seed: (Date.now() % 2147483647) | 0,
    prosperity: emptyCityMap(() => 0),
    stock: emptyCityMap(() => ({})),
    events: [],
    news: [],
  }),
  migrate(slice) {
    if (typeof slice.prosperity !== 'object' || slice.prosperity === null) throw new Error('Повреждены данные рынка');
    slice.day = Number.isFinite(slice.day) ? slice.day : 0;
    slice.seed = Number.isFinite(slice.seed) ? slice.seed : 1;
    slice.stock ??= {};
    for (const cityKey of CITY_KEYS) {
      const value = slice.prosperity[cityKey];
      slice.prosperity[cityKey] = Number.isInteger(value) ? Math.max(0, Math.min(MAX_PROSPERITY, value)) : 0;
      slice.stock[cityKey] ??= {};
      for (const [itemId, amount] of Object.entries(slice.stock[cityKey])) {
        if (!ITEMS[itemId] || !Number.isFinite(amount)) delete slice.stock[cityKey][itemId];
      }
    }
    slice.events = Array.isArray(slice.events) ? slice.events : [];
    slice.news = Array.isArray(slice.news) ? slice.news : [];
    return slice;
  },
});

const isCity = cityKey => CITY_KEYS.includes(cityKey);

/** Prosperity 0..3 of a city. */
export const prosperityOf = (state, cityKey) => state.economy.prosperity[cityKey] || 0;

/** Units of an item currently on the city market. */
export function stockOf(state, cityKey, itemId) {
  return state.economy.stock[cityKey]?.[itemId] ?? targetStock(cityKey, itemId);
}

function setStock(state, cityKey, itemId, amount) {
  const target = targetStock(cityKey, itemId);
  if (amount === target) delete state.economy.stock[cityKey][itemId];
  else state.economy.stock[cityKey][itemId] = Math.max(0, amount);
}

/** Price factor for a stock level (scarce → dear, flooded → cheap). */
export function stockFactor(stock, target) {
  if (stock <= 0) return STOCK_CURVE.max;
  const factor = (stock / target) ** -STOCK_CURVE.exponent;
  return Math.max(STOCK_CURVE.min, Math.min(STOCK_CURVE.max, factor));
}

function eventMultiplier(state, cityKey, itemId) {
  const cat = ITEMS[itemId]?.cat;
  let mult = 1;
  for (const event of state.economy.events) {
    if (event.cityKey === cityKey && event.cat === cat) mult *= event.mult;
  }
  return mult;
}

/** Market price of one unit at a given stock level (no personal bonuses). */
function unitPrice(state, cityKey, itemId, stock) {
  const def = ITEMS[itemId];
  if (!def) return 0;
  const target = targetStock(cityKey, itemId);
  return def.value * cityMultiplier(cityKey, itemId) * eventMultiplier(state, cityKey, itemId) * stockFactor(stock, target);
}

/** Personal price improvement 0..MAX_PRICE_BONUS from city reputation, perks, trinkets and wits. */
export function priceBonus(state, cityKey) {
  const reputation = Math.max(0, Math.min(100, state.rep?.[cityKey] ?? 0));
  const bonus = (reputation / 100) * REPUTATION_PRICE_BONUS + derivedStats(state).priceBonus;
  return Math.max(0, Math.min(MAX_PRICE_BONUS, bonus));
}

function buyPriceAt(state, cityKey, itemId, stock, bonus) {
  return Math.max(1, Math.ceil(unitPrice(state, cityKey, itemId, stock) * (1 - bonus)));
}

function sellPriceAt(state, cityKey, itemId, stock, bonus) {
  const def = ITEMS[itemId];
  if (!def || def.value <= 0 || def.type === 'quest') return 0;
  const ratio = Math.min(SELL_RATIO[priceKind(itemId)] * (1 + bonus), (1 - bonus) * SELL_CEILING);
  // The merchant prices the unit as if it were already on his shelf.
  return Math.max(1, Math.floor(unitPrice(state, cityKey, itemId, stock + 1) * ratio));
}

/** Price the hero pays for the next unit of an item in a city. */
export function buyPrice(state, cityKey, itemId) {
  return buyPriceAt(state, cityKey, itemId, stockOf(state, cityKey, itemId), priceBonus(state, cityKey));
}

/** Coins the hero gets for the next unit of an item in a city (0 = not for sale). */
export function sellPrice(state, cityKey, itemId) {
  return sellPriceAt(state, cityKey, itemId, stockOf(state, cityKey, itemId), priceBonus(state, cityKey));
}

/** Total cost of buying `count` units (prices rise as the stock drains). */
export function quoteBuy(state, cityKey, itemId, count) {
  const bonus = priceBonus(state, cityKey);
  const stock = stockOf(state, cityKey, itemId);
  let total = 0;
  for (let unit = 0; unit < count; unit++) total += buyPriceAt(state, cityKey, itemId, stock - unit, bonus);
  return total;
}

/** Total income of selling `count` units (prices fall as the market floods). */
export function quoteSell(state, cityKey, itemId, count) {
  const bonus = priceBonus(state, cityKey);
  const stock = stockOf(state, cityKey, itemId);
  let total = 0;
  for (let unit = 0; unit < count; unit++) total += sellPriceAt(state, cityKey, itemId, stock + unit, bonus);
  return total;
}

function lockReason(state, cityKey, entry) {
  if (prosperityOf(state, cityKey) < entry.prosperity) return 'Появится, когда город окрепнет (приведите сюда караван)';
  if (state.player.level < entry.level) return `Нужен уровень ${entry.level}`;
  return null;
}

/**
 * Assortment of a shop.
 * @param {string} role 'weaponsmith' | 'armorer' | 'grocer' | 'trader' | a profession id
 * @returns [{ itemId, price, stock, locked? }] — `locked` is the reason the entry is unavailable
 */
export function shopStock(state, cityKey, role) {
  const entries = SHOPS[cityKey]?.[role];
  if (!entries) return [];
  return entries.map(entry => {
    const locked = lockReason(state, cityKey, entry);
    const row = {
      itemId: entry.itemId,
      price: buyPrice(state, cityKey, entry.itemId),
      stock: locked ? 0 : Math.floor(stockOf(state, cityKey, entry.itemId)),
    };
    if (locked) row.locked = locked;
    return row;
  });
}

/**
 * Buy from a shop.
 * @returns ok({itemId, count, total}) or fail(reason)
 */
export function buyItem(state, cityKey, role, itemId, count = 1) {
  if (!Number.isInteger(count) || count <= 0) return fail('Неверное количество');
  const entry = SHOPS[cityKey]?.[role]?.find(candidate => candidate.itemId === itemId);
  if (!entry) return fail('Здесь это не продают');
  const locked = lockReason(state, cityKey, entry);
  if (locked) return fail(locked);
  const stock = Math.floor(stockOf(state, cityKey, itemId));
  if (stock < count) return fail(stock > 0 ? `В наличии только ${stock}` : 'Товар закончился — загляните завтра');
  const total = quoteBuy(state, cityKey, itemId, count);
  if (state.player.coins < total) return fail(`Не хватает монет: нужно ${total}`);
  if (roomFor(state, itemId) < count) return fail('Сумка заполнена');

  addCoins(state, -total);
  addItem(state, itemId, count);
  setStock(state, cityKey, itemId, stockOf(state, cityKey, itemId) - count);
  emit('trade:buy', { cityKey, itemId, count, total });
  return ok({ itemId, count, total });
}

/**
 * Sell from the bag to the city market (any merchant buys anything).
 * @returns ok({itemId, count, total}) or fail(reason)
 */
export function sellItem(state, cityKey, itemId, count = 1) {
  if (!Number.isInteger(count) || count <= 0) return fail('Неверное количество');
  if (!isCity(cityKey)) return fail('Здесь некому продать');
  if (countItem(state, itemId) < count) return fail('В сумке нет столько предметов');
  if (sellPrice(state, cityKey, itemId) <= 0) return fail('Это никто не купит');
  const total = quoteSell(state, cityKey, itemId, count);

  removeItem(state, itemId, count);
  addCoins(state, total);
  setStock(state, cityKey, itemId, stockOf(state, cityKey, itemId) + count);
  emit('trade:sell', { cityKey, itemId, count, total });
  return ok({ itemId, count, total });
}

function pushNews(state, cityKey, text) {
  state.economy.news.unshift({ day: state.economy.day, cityKey, text });
  state.economy.news.length = Math.min(state.economy.news.length, NEWS_LIMIT);
}

function driftStocks(state) {
  for (const cityKey of CITY_KEYS) {
    const cityStock = state.economy.stock[cityKey];
    for (const [itemId, amount] of Object.entries(cityStock)) {
      const target = targetStock(cityKey, itemId);
      const step = Math.max(1, Math.round(target * DAILY_DRIFT));
      const next = amount < target ? Math.min(target, amount + step) : Math.max(target, amount - step);
      setStock(state, cityKey, itemId, next);
    }
  }
}

function rollMarketEvent(state, rng) {
  const economy = state.economy;
  if (economy.events.length >= MAX_ACTIVE_EVENTS || rng() >= EVENT_CHANCE) return null;
  const cityKey = CITY_KEYS[Math.floor(rng() * CITY_KEYS.length)];
  const cats = Object.keys(EVENT_CATEGORIES);
  const cat = cats[Math.floor(rng() * cats.length)];
  if (economy.events.some(event => event.cityKey === cityKey && event.cat === cat)) return null;
  const kind = rng() < 0.5 ? 'shortage' : 'surplus';
  const template = MARKET_EVENTS[kind];
  const [minDays, maxDays] = template.days;
  const event = {
    cityKey,
    cat,
    kind,
    mult: template.mult,
    daysLeft: minDays + Math.floor(rng() * (maxDays - minDays + 1)),
    text: template.text(CITY_LOCATIVE[cityKey], EVENT_CATEGORIES[cat]),
  };
  economy.events.push(event);
  pushNews(state, cityKey, event.text);
  return event;
}

/**
 * Advance the markets by one day: stocks drift back to normal, events expire, a new event may start.
 * @returns {{day:number, news:string[]}} lines that appeared today
 */
export function economyNewDay(state) {
  const economy = state.economy;
  economy.day += 1;
  driftStocks(state);
  for (const event of economy.events) event.daysLeft -= 1;
  economy.events = economy.events.filter(event => event.daysLeft > 0);

  const rng = makeRng((economy.seed + economy.day * 7919) | 0);
  const news = [];
  const event = rollMarketEvent(state, rng);
  if (event) {
    news.push(event.text);
    emit('log', { text: `Вести с рынка: ${event.text}` });
  }
  emit('economy:changed', { day: economy.day });
  return { day: economy.day, news };
}

/**
 * A caravan has arrived: the city grows (better gear tiers, more goods). Called by the caravan module.
 * @returns ok({cityKey, prosperity}) or fail(reason)
 */
export function raiseProsperity(state, cityKey) {
  if (!isCity(cityKey)) return fail('Неизвестный город');
  const current = prosperityOf(state, cityKey);
  if (current >= MAX_PROSPERITY) return ok({ cityKey, prosperity: current, changed: false });
  state.economy.prosperity[cityKey] = current + 1;
  const text = `${CITY_LOCATIVE[cityKey]} оживилась торговля: в лавках появились новые товары.`;
  pushNews(state, cityKey, text);
  emit('toast', { text, kind: 'good' });
  emit('economy:changed', { day: state.economy.day });
  return ok({ cityKey, prosperity: current + 1, changed: true });
}

/**
 * Market news for the UI: active events first, then recent lines.
 * @returns [{ cityKey, text, daysLeft?, kind?, day? }]
 */
export function marketNews(state) {
  const active = state.economy.events.map(event => ({
    cityKey: event.cityKey, text: event.text, daysLeft: event.daysLeft, kind: event.kind,
  }));
  const activeTexts = new Set(active.map(line => line.text));
  const recent = state.economy.news
    .filter(line => !activeTexts.has(line.text))
    .map(line => ({ cityKey: line.cityKey, text: line.text, day: line.day }));
  return [...active, ...recent];
}

/** Best city to sell an item right now: [{cityKey, price}] sorted by price (for trade hints). */
export function priceComparison(state, itemId) {
  return CITY_KEYS
    .map(cityKey => ({ cityKey, buy: buyPrice(state, cityKey, itemId), sell: sellPrice(state, cityKey, itemId) }))
    .sort((a, b) => b.sell - a.sell);
}
