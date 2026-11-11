// Deterministic placement of resource nodes and wild creature packs. Pure.
// The world is divided into square cells; the content of a cell depends only on its coordinates,
// so it is identical on every visit and never needs saving (only harvest timers are saved).
import { makeRng } from '../core/noise.js';
import { regionAt, heightAt, slopeAt, waterDepthAt, roadAt, cityAt, poiAt, inBounds } from '../world/terrain.js';
import { WORLD } from '../data/world-map.js';
import { NODE_TYPES } from './gathering.js';
import { CREATURES } from '../data/creatures.js';
import { nodeKey } from './worldstate.js';

export const SPAWN_CELL = 120;

/** Resource nodes per cell, by biome. */
const NODE_DENSITY = { meadow: 4, farmland: 6, forest: 5, darkforest: 5, highland: 5, mountain: 4, snow: 3, steppe: 4, coast: 3, swamp: 4, heath: 4, lake: 2 };
/** Creature packs per cell, by biome (fractional = probability of an extra pack). */
const PACK_DENSITY = { meadow: 1.1, farmland: 0.5, forest: 1.5, darkforest: 1.9, highland: 1.3, mountain: 1.2, snow: 1.2, steppe: 1.3, coast: 0.9, swamp: 1.7, heath: 1.4, lake: 0.6 };

const cellSeed = (cx, cz, salt) => ((cx + 1000) * 73856093) ^ ((cz + 1000) * 19349663) ^ (WORLD.seed * 83492791) ^ salt;

let nodeTable = null, creatureTable = null;

/** biome -> [{nodeType, def}] sorted by tier. */
function nodesByBiome() {
  if (nodeTable) return nodeTable;
  nodeTable = {};
  for (const [nodeType, def] of Object.entries(NODE_TYPES)) for (const b of def.biomes || []) (nodeTable[b] ||= []).push({ nodeType, def });
  return nodeTable;
}
/** biome -> [creature def] of wild beasts/monsters. */
function creaturesByBiome() {
  if (creatureTable) return creatureTable;
  creatureTable = {};
  for (const def of Object.values(CREATURES)) {
    if (def.family !== 'beast' && def.family !== 'monster') continue;
    if (def.boss) continue;
    for (const b of def.biomes || []) (creatureTable[b] ||= []).push(def);
  }
  return creatureTable;
}

function weightedPick(rng, list, weightOf) {
  let total = 0;
  for (const it of list) total += weightOf(it);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const it of list) { r -= weightOf(it); if (r <= 0) return it; }
  return list[list.length - 1];
}

function landOk(x, z, { cityMargin, roadMargin, maxSlope }) {
  if (!inBounds(x, z)) return false;
  if (waterDepthAt(x, z) > 0 || heightAt(x, z) < 0.5) return false;
  if (cityAt(x, z, cityMargin)) return false;
  if (poiAt(x, z, 6)) return false;
  if (roadAt(x, z, roadMargin)) return false;
  return slopeAt(x, z) <= maxSlope;
}

const cache = new Map();

/**
 * Content of a cell:
 *   nodes: [{key, nodeType, x, z, y, seed}]
 *   packs: [{key, creatureId, level, x, z, members:[{x, z}]}]
 */
export function cellContent(cx, cz) {
  const ck = cx * 4096 + cz;
  const hit = cache.get(ck);
  if (hit) return hit;

  const x0 = cx * SPAWN_CELL, z0 = cz * SPAWN_CELL;
  const nodes = [], packs = [];

  // —— resource nodes ——
  let rng = makeRng(cellSeed(cx, cz, 1));
  const table = nodesByBiome();
  const centreRegion = regionAt(x0 + SPAWN_CELL / 2, z0 + SPAWN_CELL / 2);
  const wantNodes = NODE_DENSITY[centreRegion.biome] ?? 3;
  for (let i = 0, tries = 0; nodes.length < wantNodes && tries < wantNodes * 6; tries++) {
    const x = x0 + rng() * SPAWN_CELL, z = z0 + rng() * SPAWN_CELL;
    const region = regionAt(x, z);
    const options = (table[region.biome] || []).filter(o => (o.def.minLevel || 1) <= region.level[1]);
    if (!options.length) continue;
    if (!landOk(x, z, { cityMargin: 30, roadMargin: 7, maxSlope: 0.3 })) continue;
    if (nodes.some(n => Math.hypot(n.x - x, n.z - z) < 14)) continue;
    // prefer nodes whose level requirement matches the region; rare tiers are rarer
    const pick = weightedPick(rng, options, o => {
      const gap = region.level[1] - (o.def.minLevel || 1);
      return (gap < 4 ? 1.6 : 1) / (o.def.tier || 1);
    });
    if (!pick) continue;
    nodes.push({ key: nodeKey(cx, cz, i), nodeType: pick.nodeType, x, z, y: heightAt(x, z), seed: (rng() * 1e9) | 0 });
    i++;
  }

  // —— creature packs ——
  rng = makeRng(cellSeed(cx, cz, 2));
  const ctable = creaturesByBiome();
  const density = PACK_DENSITY[centreRegion.biome] ?? 1;
  const wantPacks = Math.floor(density) + (rng() < density % 1 ? 1 : 0);
  for (let p = 0, tries = 0; packs.length < wantPacks && tries < wantPacks * 8; tries++) {
    const x = x0 + 12 + rng() * (SPAWN_CELL - 24), z = z0 + 12 + rng() * (SPAWN_CELL - 24);
    const region = regionAt(x, z);
    const [lo, hi] = region.level;
    const options = (ctable[region.biome] || []).filter(d => d.levelRange[0] <= hi && d.levelRange[1] >= lo);
    if (!options.length) continue;
    const def = weightedPick(rng, options, d => (d.aggressive ? 1 : 0.8) * (d.spawnWeight ?? 1));
    // keep predators off the caravan roads and away from town; harmless grazers may wander closer
    const margins = def.aggressive ? { cityMargin: 110, roadMargin: 38, maxSlope: 0.4 } : { cityMargin: 45, roadMargin: 14, maxSlope: 0.4 };
    if (!landOk(x, z, margins)) continue;
    if (packs.some(k => Math.hypot(k.x - x, k.z - z) < 45)) continue;
    const level = Math.max(def.levelRange[0], Math.min(def.levelRange[1], lo + Math.floor(rng() * (hi - lo + 1))));
    const [pmin, pmax] = def.packSize || [1, 1];
    const size = pmin + Math.floor(rng() * (pmax - pmin + 1));
    const members = [];
    for (let m = 0; m < size; m++) {
      const a = rng() * Math.PI * 2, r = m === 0 ? 0 : 2.5 + rng() * 5;
      const mx = x + Math.cos(a) * r, mz = z + Math.sin(a) * r;
      if (waterDepthAt(mx, mz) > 0) continue;
      members.push({ x: mx, z: mz });
    }
    if (!members.length) continue;
    packs.push({ key: `${cx},${cz},p${p}`, creatureId: def.id, level, x, z, members });
    p++;
  }

  const content = { nodes, packs };
  if (cache.size > 600) cache.clear();
  cache.set(ck, content);
  return content;
}

/** Bandit line-up for a camp of a given level: which creature id stands on each guard spot. */
export function banditRoster(poi, guardCount, rng) {
  const deserters = poi.id === 'camp-deserters';
  const pool = deserters
    ? ['deserter', 'deserter', 'deserter_crossbow', 'bandit_brute']
    : poi.level >= 10 ? ['bandit_thug', 'bandit_archer', 'bandit_scout', 'bandit_brute', 'bandit_archer']
    : ['bandit_thug', 'bandit_thug', 'bandit_archer', 'bandit_scout'];
  const out = [];
  for (let i = 0; i < guardCount; i++) out.push(pool[Math.floor(rng() * pool.length)]);
  return out;
}
