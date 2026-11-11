// City reputation. Slice `rep` = {valley, ford, harbor}, each 0..100. Pure.
// Other modules read `state.rep[cityKey]` directly (prices, quest gates, guard limits).
import { registerSlice } from './state.js';
import { emit } from '../core/events.js';
import { CITIES } from '../data/world-map.js';

export const REP_MAX = 100;

/** Ranks, lowest first. `min` = reputation at which the rank starts. */
export const REP_RANKS = [
  { index: 0, min: 0, name: 'Чужак', desc: 'Тебя терпят. Цены — как для проезжего.' },
  { index: 1, min: 15, name: 'Знакомый', desc: 'С тобой здороваются. Капитан доверит второго бойца.' },
  { index: 2, min: 35, name: 'Свой', desc: 'Тебе наливают в долг и говорят правду о дороге.' },
  { index: 3, min: 60, name: 'Уважаемый', desc: 'Твоё слово имеет вес. Мастера берут твои заказы вне очереди.' },
  { index: 4, min: 85, name: 'Почётный гражданин', desc: 'Твоё имя знают дети. Город — твой дом.' },
];

const cityKeys = () => CITIES.map(city => city.key);

registerSlice('rep', {
  init: () => Object.fromEntries(cityKeys().map(key => [key, 0])),
  migrate(rep) {
    for (const key of cityKeys()) {
      if (!Number.isFinite(rep[key])) rep[key] = 0;
      rep[key] = Math.min(REP_MAX, Math.max(0, rep[key]));
    }
    return rep;
  },
});

/** Current reputation value in a city (0 for unknown keys). */
export const getRep = (state, cityKey) => state.rep?.[cityKey] || 0;

/** Rank object for a reputation value. */
export function rankForValue(value) {
  let rank = REP_RANKS[0];
  for (const candidate of REP_RANKS) if (value >= candidate.min) rank = candidate;
  return rank;
}

/**
 * Rank of the player in a city.
 * @returns {{index, name, desc, value, next: number|null, fraction: number}}
 */
export function repRank(state, cityKey) {
  const value = getRep(state, cityKey);
  const rank = rankForValue(value);
  const nextRank = REP_RANKS[rank.index + 1] || null;
  const span = nextRank ? nextRank.min - rank.min : 1;
  return {
    index: rank.index, name: rank.name, desc: rank.desc, value,
    next: nextRank ? nextRank.min : null,
    fraction: nextRank ? (value - rank.min) / span : 1,
  };
}

/** Change reputation by `amount` (may be negative). Emits `rep:changed` and a toast on a new rank. Returns the new value. */
export function addRep(state, cityKey, amount) {
  if (!(cityKey in state.rep) || !amount) return getRep(state, cityKey);
  const before = state.rep[cityKey];
  const after = Math.min(REP_MAX, Math.max(0, before + amount));
  if (after === before) return after;
  state.rep[cityKey] = after;
  emit('rep:changed', { cityKey, value: after, delta: after - before });
  const rankBefore = rankForValue(before);
  const rankAfter = rankForValue(after);
  if (rankAfter.index > rankBefore.index) {
    const city = CITIES.find(c => c.key === cityKey);
    emit('toast', { text: `${city.name}: теперь ты «${rankAfter.name}»`, kind: 'good' });
  }
  return after;
}

/** How many mercenaries the captain of `cityKey` will let the player hire (1..4). */
export function guardLimit(state, cityKey) {
  return Math.min(4, 1 + repRank(state, cityKey).index);
}
