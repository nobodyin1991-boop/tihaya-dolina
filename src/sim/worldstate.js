// World slice: everything about the world that must survive a reload —
// harvested nodes, opened chests, cleared POIs, explored map cells, discovered places.
import { registerSlice } from './state.js';
import { emit } from '../core/events.js';

export const MAP_CELL = 60;   // fog-of-war cell size in metres

registerSlice('world', {
  init: () => ({
    harvested: {},     // nodeKey -> game-seconds timestamp when it respawns
    chests: {},        // poiId -> true (opened)
    cleared: {},       // poiId -> day number when cleared (bandits return after a while unless permanent)
    explored: {},      // "cx,cz" -> 1
    discovered: { valley: 1 },   // cityKey | poiId -> 1 (shown on the map with a name)
    clock: 0,          // game-seconds played; respawn timers are measured against it
  }),
  migrate(w) {
    for (const k of ['harvested', 'chests', 'cleared', 'explored', 'discovered']) if (!w[k] || typeof w[k] !== 'object') w[k] = {};
    if (!Number.isFinite(w.clock)) w.clock = 0;
    w.discovered.valley = 1;
    return w;
  },
});

export function tickWorld(state, dt) {
  state.world.clock += dt;
}

export const nodeKey = (cellX, cellZ, index) => `${cellX},${cellZ},${index}`;
export const isHarvested = (state, key) => (state.world.harvested[key] || 0) > state.world.clock;
export function markHarvested(state, key, respawnSeconds) {
  state.world.harvested[key] = state.world.clock + respawnSeconds;
}
/** Drop expired timers so the save does not grow forever. */
export function pruneHarvested(state) {
  const h = state.world.harvested, now = state.world.clock;
  for (const k of Object.keys(h)) if (h[k] <= now) delete h[k];
}

export const isChestOpened = (state, poiId) => !!state.world.chests[poiId];
export function markChestOpened(state, poiId) { state.world.chests[poiId] = true; }

/** Bandit camps stay empty for `days` game days after being cleared. */
export const POI_RESPAWN_DAYS = 6;
export function isPoiCleared(state, poiId) {
  const day = state.world.cleared[poiId];
  if (day === undefined) return false;
  if (day === -1) return true;                                   // permanently cleared (story)
  return (state.time?.day ?? 0) - day < POI_RESPAWN_DAYS;
}
export function markPoiCleared(state, poiId, permanent = false) {
  state.world.cleared[poiId] = permanent ? -1 : (state.time?.day ?? 0);
}

/** Reveal fog-of-war cells around a point. Returns true if anything new was revealed. */
export function reveal(state, x, z, radius = 150) {
  const ex = state.world.explored;
  const r = Math.ceil(radius / MAP_CELL);
  const cx = Math.floor(x / MAP_CELL), cz = Math.floor(z / MAP_CELL);
  let changed = false;
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    if (dx * dx + dz * dz > r * r + 1) continue;
    const key = (cx + dx) + ',' + (cz + dz);
    if (!ex[key]) { ex[key] = 1; changed = true; }
  }
  return changed;
}
export const isExplored = (state, x, z) => !!state.world.explored[Math.floor(x / MAP_CELL) + ',' + Math.floor(z / MAP_CELL)];

/** Mark a city/POI as discovered (named on the map). Emits 'world:discovered' the first time. */
export function discover(state, id, name) {
  if (state.world.discovered[id]) return false;
  state.world.discovered[id] = 1;
  emit('world:discovered', { id, name });
  return true;
}
export const isDiscovered = (state, id) => !!state.world.discovered[id];
