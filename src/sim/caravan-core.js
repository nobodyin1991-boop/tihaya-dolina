// Caravan slice and shared helpers (wagon stats, manifest, route planning). Pure.
// Public API is re-exported from sim/caravan.js — import from there.
import { registerSlice } from './state.js';
import { emit } from '../core/events.js';
import { makeRng, seedFrom } from '../core/noise.js';
import { LEGS, CITIES } from '../data/world-map.js';
import { legLength, legPoint } from '../world/terrain.js';
import { item } from '../data/items.js';
import { countItem } from './inventory.js';
import * as economy from './economy.js';
import {
  CARAVAN_LEGS, WAGON_TIERS, WAGON_UPGRADES, GUILD_POOLS, GUILD_RUN, LEG_PREP,
} from '../data/caravans.js';

/** Stage value meaning "the ring is restored, guild runs are open". */
export const RING_COMPLETE = 3;

registerSlice('caravan', {
  init: () => ({
    stage: 0,
    guildLeg: null, guildTier: 0, guildSeq: 0,
    manifest: null,
    delivered: {},
    wagon: { tier: 1, hp: WAGON_TIERS[0].maxHp, upgrades: {} },
    guards: [],
    bonus: {}, bonusCost: {},
    towDebt: 0,
    run: null,
    outbox: [],
    lastResult: null,
    stats: { arrived: 0, failed: 0, runs: 0 },
  }),
  migrate(caravan) {
    if (!Number.isInteger(caravan.stage) || caravan.stage < 0 || caravan.stage > RING_COMPLETE) throw new Error('Повреждены данные каравана');
    caravan.delivered ??= {};
    caravan.wagon ??= { tier: 1, hp: WAGON_TIERS[0].maxHp, upgrades: {} };
    caravan.wagon.upgrades ??= {};
    caravan.guards ??= [];
    caravan.bonus ??= {};
    caravan.bonusCost ??= {};
    caravan.towDebt ??= 0;
    caravan.outbox ??= [];
    caravan.run ??= null;
    caravan.stats ??= { arrived: 0, failed: 0, runs: 0 };
    caravan.guildTier ??= 0;
    caravan.guildSeq ??= 0;
    if (caravan.run?.active) caravan.run.active.issued = false; // the engine lost its spawns — send again
    return caravan;
  },
});

// ───────────────────────── listener (quests subscribe without an import cycle) ─────────────────────────

let listener = null;

/** Register the single sim-side listener for caravan events: fn(state, type, payload). */
export function setCaravanListener(fn) {
  listener = fn;
}

/** Publish a caravan event to the bus and to the sim listener. */
export function notify(state, type, payload) {
  emit(type, payload);
  if (listener) listener(state, type, payload);
}

// ───────────────────────── flags and conditions ─────────────────────────

/** Evaluate a flag condition: {flag} | {notFlag} | {any:[…]} | {all:[…]}. `hasFlag(name)` supplies flag values. */
export function flagCond(cond, hasFlag) {
  if (!cond) return true;
  if (cond.any) return cond.any.some(sub => flagCond(sub, hasFlag));
  if (cond.all) return cond.all.every(sub => flagCond(sub, hasFlag));
  if (cond.flag) return hasFlag(cond.flag);
  if (cond.notFlag) return !hasFlag(cond.notFlag);
  return true;
}

/** Flag reader for the current state. In guild runs the story camps count as destroyed and no deals hold. */
export function flagReader(state, guild = false) {
  if (guild) return name => name.startsWith('poi:');
  return name => !!state.flags?.[name];
}

// ───────────────────────── legs, cities, manifest ─────────────────────────

export const isGuildStage = state => state.caravan.stage >= RING_COMPLETE;

/** Leg being prepared (0..2) or null when the ring is complete and no guild contract is chosen. */
export function currentLeg(state) {
  const caravan = state.caravan;
  if (caravan.run) return caravan.run.leg;
  return isGuildStage(state) ? caravan.guildLeg : caravan.stage;
}

export const legDef = leg => CARAVAN_LEGS[leg];
export const originCity = leg => CITIES[LEGS[leg].from];
export const destCity = leg => CITIES[LEGS[leg].to];

/** Deterministic guild manifest for a leg. */
export function generateGuildManifest(leg, tier, seq) {
  const rng = makeRng(seedFrom(`guild:${leg}:${seq}`));
  const pool = [...GUILD_POOLS[leg]];
  const lines = [];
  const scale = 1 + GUILD_RUN.tierScale * tier;
  while (lines.length < GUILD_RUN.lines && pool.length) {
    const index = Math.floor(rng() * pool.length);
    const [itemId, baseCount, category, advance] = pool.splice(index, 1)[0];
    const count = Math.max(1, Math.round(baseCount * scale * (0.85 + rng() * 0.3)));
    lines.push({ itemId, count, category, advance });
  }
  return lines;
}

/** Manifest lines of the leg being prepared ([] when nothing is selected). */
export function manifestLines(state) {
  const leg = currentLeg(state);
  if (leg === null) return [];
  if (isGuildStage(state)) return state.caravan.manifest || [];
  return legDef(leg).manifest;
}

export function manifestProgress(state) {
  const lines = manifestLines(state);
  let total = 0;
  let done = 0;
  for (const line of lines) {
    total += line.count;
    done += Math.min(line.count, state.caravan.delivered[line.itemId] || 0);
  }
  return { total, done, full: lines.length > 0 && done >= total };
}

/** Contract fee for the current leg (guild tier applied). */
export function contractFee(state) {
  const leg = currentLeg(state);
  if (leg === null) return 0;
  const base = legDef(leg).fee;
  if (!isGuildStage(state) && !state.caravan.run?.guild) return base;
  return Math.round(base * GUILD_RUN.feeFactor * (1 + GUILD_RUN.feeScale * state.caravan.guildTier));
}

// ───────────────────────── wagon ─────────────────────────

export const wagonTier = state => WAGON_TIERS.find(t => t.tier === state.caravan.wagon.tier) || WAGON_TIERS[0];
export const upgradeDef = id => WAGON_UPGRADES.find(u => u.id === id) || null;
export const hasUpgrade = (state, id) => !!state.caravan.wagon.upgrades[id];

function installedUpgrades(state) {
  return WAGON_UPGRADES.filter(upgrade => hasUpgrade(state, upgrade.id));
}

export function wagonMaxHp(state) {
  const bonus = installedUpgrades(state).reduce((sum, upgrade) => sum + (upgrade.hpBonus || 0), 0);
  return Math.round(wagonTier(state).maxHp * (1 + bonus));
}

export function bonusCapacity(state) {
  const extra = installedUpgrades(state).reduce((sum, upgrade) => sum + (upgrade.bonusUnits || 0), 0);
  return wagonTier(state).bonusUnits + extra;
}

export const bonusUsed = state => Object.values(state.caravan.bonus).reduce((sum, n) => sum + n, 0);

export function wagonSpeedFactor(state) {
  return 1 + installedUpgrades(state).reduce((sum, upgrade) => sum + (upgrade.speedBonus || 0), 0);
}

// ───────────────────────── prices (economy with safe fallbacks) ─────────────────────────

function safePrice(fn, state, cityKey, itemId) {
  const price = fn ? fn(state, cityKey, itemId) : NaN;
  if (Number.isFinite(price) && price > 0) return price;
  return Math.max(1, item(itemId).value || 1);
}

export const sellPriceAt = (state, cityKey, itemId) => safePrice(economy.sellPrice, state, cityKey, itemId);
export const buyPriceAt = (state, cityKey, itemId) => safePrice(economy.buyPrice, state, cityKey, itemId);

export function raiseCityProsperity(state, cityKey) {
  if (economy.raiseProsperity) economy.raiseProsperity(state, cityKey);
}

/** Estimated income from the loaded bonus cargo at the destination. */
export function bonusSaleEstimate(state, leg, saleBonus) {
  const cityKey = destCity(leg).key;
  let total = 0;
  for (const [itemId, count] of Object.entries(state.caravan.bonus)) {
    total += Math.round(sellPriceAt(state, cityKey, itemId) * saleBonus) * count;
  }
  return total;
}

// ───────────────────────── route planning ─────────────────────────

function rollCount(count, rng) {
  if (!Array.isArray(count)) return count;
  const [min, max] = count;
  return min + Math.floor(rng() * (max - min + 1));
}

function scaleCount(count, factor, role) {
  if (role === 'boss') return count;
  return Math.max(1, Math.round(count * factor));
}

function resolveGroups(groups, rng, factor, baseLevel) {
  return (groups || []).map(group => ({
    creatureId: group.creatureId,
    count: scaleCount(rollCount(group.count, rng), factor, group.role),
    level: baseLevel + (group.level || 0),
    side: group.side,
    role: group.role || 'attacker',
  }));
}

function resolveStep(step, rng, factor, baseLevel) {
  if (step.obstacle) return { type: 'obstacle', obstacle: { ...step.obstacle } };
  return {
    type: 'spawn',
    groups: resolveGroups(step.spawn, rng, factor, baseLevel),
    nightExtra: resolveGroups(step.nightExtra, rng, factor, baseLevel),
    toll: step.toll ? { ...step.toll } : null,
  };
}

function pickSteps(def, rng, hasFlag) {
  const replacement = (def.replaceIf || []).find(entry => flagCond(entry.if, hasFlag));
  if (replacement) return { steps: replacement.steps, title: replacement.title || def.title, boss: null };
  const options = [{ steps: def.steps, title: def.title }, ...(def.variants || [])];
  const roll = rng();
  const choice = options[Math.floor(roll * options.length)];
  return { steps: choice.steps, title: choice.title || def.title, boss: def.boss || null };
}

function weakFactor(def, hasFlag) {
  let factor = 1;
  for (const entry of def.weakIf || []) if (flagCond(entry.if, hasFlag)) factor *= entry.factor;
  return factor;
}

/**
 * Build the list of road events for one run. Deterministic for (leg, seed, flags).
 * @returns {Array<{id, title, hint, boss, s, steps, stepIndex, done}>}
 */
export function planEvents(state, leg, seed, { guild = false, tier = 0 } = {}) {
  const def = legDef(leg);
  const rng = makeRng(seed);
  const hasFlag = flagReader(state, guild);
  const length = legLength(leg);
  const guildFactor = guild ? 1.3 + GUILD_RUN.tierScale * tier : 1;
  const baseLevel = def.baseLevel + (guild ? 1 + Math.floor(tier / 2) : 0);
  const events = [];
  for (const eventDef of def.events) {
    const jitter = (rng() * 2 - 1) * (eventDef.jitter || 0);
    const picked = pickSteps(eventDef, rng, hasFlag);
    const factor = weakFactor(eventDef, hasFlag) * guildFactor;
    const steps = picked.steps.map(step => resolveStep(step, rng, factor, baseLevel));
    if (flagCond(eventDef.skipIf, hasFlag) && eventDef.skipIf) continue;
    events.push({
      id: eventDef.id, title: picked.title, hint: eventDef.hint, boss: picked.boss,
      s: Math.round((eventDef.at + jitter) * length), steps, stepIndex: 0, done: false,
    });
  }
  return events;
}

/** Rough threat number of a planned event list (for the danger rating). */
export function threatOf(events) {
  let threat = 0;
  for (const event of events) {
    for (const step of event.steps) {
      if (step.type !== 'spawn') continue;
      for (const group of step.groups) threat += group.role === 'boss' ? 5 : group.count;
    }
  }
  return threat;
}

/** World position of an event on a leg (for map markers). */
export function eventPoint(leg, s) {
  const point = legPoint(leg, s);
  return { x: point.x, z: point.z };
}

/** Optional preparation of a leg with done-state. */
export function prepList(state, leg) {
  const hasFlag = flagReader(state);
  return LEG_PREP[leg].map(prep => {
    let done = false;
    if (prep.flags) done = prep.flags.some(hasFlag);
    if (prep.item) done = countItem(state, prep.item) >= (prep.count || 1);
    if (prep.upgrade && hasUpgrade(state, prep.upgrade)) done = true;
    return { id: prep.id, label: prep.label, effect: prep.effect, done, kind: prep.item ? 'item' : 'deed' };
  });
}
