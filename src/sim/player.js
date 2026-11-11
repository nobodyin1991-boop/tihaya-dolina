// Player slice: identity, level/xp, coins, position. Pure.
import { registerSlice } from './state.js';
import { emit } from '../core/events.js';

export const MAX_LEVEL = 20;

registerSlice('player', {
  init: ({ name = 'Путник', classId = 'warrior' } = {}) => ({
    name, classId,
    xp: 0, level: 1,
    hp: null,            // null = full; engine/combat fills in the number
    coins: 40,
    x: 0, z: 30, yaw: Math.PI, // spawn: main square of Тихая долина
    playSeconds: 0, deaths: 0, kills: 0,
  }),
  migrate(p) {
    if (typeof p.name !== 'string' || !Number.isFinite(p.xp) || !Number.isFinite(p.coins)) throw new Error('Повреждены данные героя');
    p.level = levelForXp(p.xp);
    p.deaths ??= 0; p.kills ??= 0; p.playSeconds ??= 0;
    return p;
  },
});

/** XP needed to go from `level` to `level+1`. */
export const xpToNext = level => 240 + 90 * (level - 1) + 10 * (level - 1) ** 2;
/** Total XP at which `level` starts. */
export function xpAtLevel(level) {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}
export function levelForXp(xp) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpAtLevel(level + 1)) level++;
  return level;
}
/** {level, current, required, fraction} for the XP bar. */
export function xpProgress(state) {
  const { xp, level } = state.player;
  if (level >= MAX_LEVEL) return { level, current: 0, required: 0, fraction: 1 };
  const current = xp - xpAtLevel(level), required = xpToNext(level);
  return { level, current, required, fraction: current / required };
}

export function grantXp(state, amount) {
  if (!(amount > 0)) return;
  const p = state.player;
  const before = p.level;
  p.xp += Math.round(amount);
  p.level = levelForXp(p.xp);
  emit('player:xp', { amount: Math.round(amount) });
  if (p.level > before) emit('player:levelup', { level: p.level, gained: p.level - before });
}

export function addCoins(state, amount) {
  state.player.coins = Math.max(0, Math.round(state.player.coins + amount));
  emit('coins:changed', { amount, total: state.player.coins });
}
export function spendCoins(state, amount) {
  if (state.player.coins < amount) return false;
  addCoins(state, -amount);
  return true;
}
