// Quest rules: flags slice, declarative conditions and the matching of world events to objectives. Pure.
// Effects (which start quests, give items…) live in sim/quests.js; this file has no dependency on it.
import { registerSlice } from './state.js';
import { emit } from '../core/events.js';
import { regionAt } from '../world/terrain.js';
import { cityByKey, poiById, REGIONS, LEGS, CITIES } from '../data/world-map.js';
import { countItem, hasItems } from './inventory.js';
import { manifestProgress } from './caravan-core.js';

registerSlice('flags', {
  init: () => ({}),
  migrate(flags) {
    if (!flags || typeof flags !== 'object' || Array.isArray(flags)) throw new Error('Повреждены отметки сюжета');
    return flags;
  },
});

export const getFlag = (state, name) => !!state.flags[name];

/** Set or clear a story flag. Emits `flag:changed {name, value}`. Returns true if the value changed. */
export function setFlagRaw(state, name, value = true) {
  if (getFlag(state, name) === !!value) return false;
  if (value) state.flags[name] = true;
  else delete state.flags[name];
  emit('flag:changed', { name, value: !!value });
  return true;
}

/** Creature families usable in `kill {family}` objectives and bounties. */
export const CREATURE_FAMILIES = {
  wolves: ['wolf', 'alpha_wolf', 'frost_wolf'],
  boars: ['boar', 'thorn_boar'],
  bandits: ['bandit_thug', 'bandit_archer', 'bandit_brute', 'bandit_scout', 'bandit_looter', 'bandit_chief_kosoy', 'bandit_chief_raven'],
  deserters: ['deserter', 'deserter_crossbow', 'bandit_chief_sotnik'],
  spiders: ['giant_spider', 'spiderling'],
  lizards: ['lizard', 'stoneback', 'ridge_drake'],
  lurkers: ['marsh_lurker'],
  predators: ['wolf', 'alpha_wolf', 'frost_wolf', 'fox', 'lynx', 'bear', 'shadow_cat'],
  game: ['rabbit', 'deer', 'elk', 'goat', 'boar'],
};

// ───────────────────────── quest status (shared by conditions and the journal) ─────────────────────────

/** Raw status from the slice: 'active' | 'ready' | 'done' | 'none'. ('available' is decided in quests.js.) */
export function rawQuestStatus(state, questId) {
  if (state.quests.done[questId] !== undefined) return 'done';
  const entry = state.quests.active[questId];
  if (!entry) return 'none';
  return entry.ready ? 'ready' : 'active';
}

function questCond(state, cond) {
  const status = rawQuestStatus(state, cond.quest);
  if (cond.stage !== undefined && state.quests.active[cond.quest]?.stage !== cond.stage) return false;
  switch (cond.state) {
    case undefined: return true;
    case 'started': return status !== 'none';
    case 'notStarted': return status === 'none';
    case 'notDone': return status !== 'done';
    case 'open': return status === 'active' || status === 'ready';
    default: return status === cond.state;
  }
}

/**
 * Evaluate a declarative condition (or an array of them — all must hold).
 * {quest, state?, stage?} · {rep:[cityKey, min]} · {flag} · {notFlag} · {stage:n} (caravan stage ≥ n) · {stageBelow:n}
 * · {has:{itemId:n}} · {coins:n} · {level:n} · {any:[…]} · {all:[…]} · {not:cond}
 */
export function checkCondition(state, cond) {
  if (!cond) return true;
  if (Array.isArray(cond)) return cond.every(sub => checkCondition(state, sub));
  if (cond.any) return cond.any.some(sub => checkCondition(state, sub));
  if (cond.all) return cond.all.every(sub => checkCondition(state, sub));
  if (cond.not) return !checkCondition(state, cond.not);
  if (cond.quest) return questCond(state, cond);
  if (cond.rep) return (state.rep?.[cond.rep[0]] || 0) >= cond.rep[1];
  if (cond.flag) return getFlag(state, cond.flag);
  if (cond.notFlag) return !getFlag(state, cond.notFlag);
  if (cond.stageBelow !== undefined) return (state.caravan?.stage || 0) < cond.stageBelow;
  if (cond.stage !== undefined) return (state.caravan?.stage || 0) >= cond.stage;
  if (cond.has) return hasItems(state, cond.has);
  if (cond.coins !== undefined) return state.player.coins >= cond.coins;
  if (cond.level !== undefined) return state.player.level >= cond.level;
  return true;
}

/** Turn a quest's `requires` block into a condition list. */
export function requirementConditions(requires = {}) {
  const conds = [];
  for (const questId of requires.quests || []) conds.push({ quest: questId, state: 'done' });
  if (requires.stage !== undefined) conds.push({ stage: requires.stage });
  if (requires.rep) conds.push({ rep: requires.rep });
  if (requires.level) conds.push({ level: requires.level });
  if (requires.flag) conds.push({ flag: requires.flag });
  if (requires.notFlag) conds.push({ notFlag: requires.notFlag });
  return conds;
}

// ───────────────────────── objectives ─────────────────────────

/** Target amount of an objective. */
export function objectiveNeed(objective) {
  switch (objective.type) {
    case 'trade': return objective.profit;
    case 'level': return objective.level;
    case 'rep': return objective.value;
    default: return objective.count || 1;
  }
}

function matchesCreature(objective, creatureId) {
  if (objective.creatureId) return objective.creatureId === creatureId;
  if (objective.family) return (CREATURE_FAMILIES[objective.family] || []).includes(creatureId);
  return true;
}

function killGain(objective, payload) {
  if (!matchesCreature(objective, payload.creatureId)) return 0;
  if (objective.poiId && payload.poiId !== objective.poiId) return 0;
  if (objective.regionId) {
    if (!Number.isFinite(payload.x) || regionAt(payload.x, payload.z).id !== objective.regionId) return 0;
  }
  return 1;
}

function visitGain(objective, payload) {
  if (objective.poiId) return payload.poiId === objective.poiId ? 1 : 0;
  if (objective.cityKey) return payload.cityKey === objective.cityKey ? 1 : 0;
  if (objective.regionId) return payload.regionId === objective.regionId ? 1 : 0;
  return 0;
}

function craftGain(objective, payload) {
  if (objective.itemId && payload.itemId !== objective.itemId) return 0;
  if (objective.recipeId && payload.recipeId !== objective.recipeId) return 0;
  return payload.count || 1;
}

function caravanGain(objective, type, payload) {
  if (type !== `caravan:${objective.event}`) return 0;
  if (objective.leg !== undefined && payload.leg !== objective.leg) return 0;
  if (objective.guild && !payload.guild) return 0;
  if (objective.eventId && payload.eventId !== objective.eventId) return 0;
  return 1;
}

/** How much a world event adds to an objective (0 = not relevant). */
export function objectiveGain(objective, type, payload) {
  switch (objective.type) {
    case 'kill': return type === 'world:kill' ? killGain(objective, payload) : 0;
    case 'gather': return type === 'world:gather' && payload.itemId === objective.itemId ? payload.count || 1 : 0;
    case 'craft': return type === 'craft:done' ? craftGain(objective, payload) : 0;
    case 'talk': return type === 'world:talk' && !objective.topic && payload.npcId === objective.npcId ? 1 : 0;
    case 'visit': return type === 'world:enter' ? visitGain(objective, payload) : 0;
    case 'clearPoi': return type === 'world:poi-cleared' && payload.poiId === objective.poiId ? 1 : 0;
    case 'chest': return type === 'world:chest' && payload.poiId === objective.poiId ? 1 : 0;
    case 'caravan': return caravanGain(objective, type, payload);
    case 'trade':
      if (type === 'caravan:trade-profit' || type === 'trade:sell') return Math.max(0, payload.profit || 0);
      return 0;
    default: return 0;
  }
}

function caravanLive(state, objective) {
  const caravan = state.caravan;
  if (!caravan || objective.leg === undefined || objective.guild) return null;
  if (objective.event === 'arrived') return caravan.stage > objective.leg ? 1 : null;
  if (objective.event === 'launched') return caravan.stage > objective.leg || caravan.run?.leg === objective.leg ? 1 : null;
  if (objective.event === 'manifest-full') {
    if (caravan.stage > objective.leg) return 1;
    if (caravan.stage !== objective.leg) return null;
    return manifestProgress(state).full ? 1 : null;
  }
  return null;
}

/**
 * Objectives whose progress is read from the state instead of counted from events.
 * Returns the current amount, or null if the objective is event-counted.
 */
export function liveAmount(state, objective) {
  switch (objective.type) {
    case 'collect':
    case 'deliver': return countItem(state, objective.itemId);
    case 'level': return state.player.level;
    case 'rep': return state.rep?.[objective.cityKey] || 0;
    case 'flag': {
      const names = objective.any || [objective.flag];
      return names.some(name => getFlag(state, name)) ? 1 : 0;
    }
    case 'clearPoi': return getFlag(state, `poi:${objective.poiId}`) ? 1 : null;
    case 'caravan': return caravanLive(state, objective);
    default: return null;
  }
}

// ───────────────────────── places and markers ─────────────────────────

/** World point of an npc: its city centre or its POI. npcId = '<cityKey|poiId>:<role>'. */
export function npcPlace(npcId) {
  const placeId = npcId.slice(0, npcId.lastIndexOf(':'));
  const place = cityByKey(placeId) || poiById(placeId);
  return place ? { x: place.x, z: place.z } : null;
}

/** Map marker for an objective, or null. */
export function objectiveMarker(objective) {
  if (objective.marker) return objective.marker;
  if (objective.poiId) {
    const poi = poiById(objective.poiId);
    return poi ? { x: poi.x, z: poi.z } : null;
  }
  if (objective.npcId) return npcPlace(objective.npcId);
  if (objective.cityKey) {
    const city = cityByKey(objective.cityKey);
    return city ? { x: city.x, z: city.z } : null;
  }
  if (objective.regionId) {
    const region = REGIONS.find(entry => entry.id === objective.regionId);
    return region ? { x: region.x, z: region.z } : null;
  }
  if (objective.type === 'caravan' && objective.leg !== undefined) {
    const city = CITIES[objective.event === 'arrived' ? LEGS[objective.leg].to : LEGS[objective.leg].from];
    return { x: city.x, z: city.z };
  }
  return null;
}
