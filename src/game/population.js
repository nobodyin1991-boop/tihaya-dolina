// Fills the streamed world with things to do: resource nodes, wild packs, POI garrisons and chests.
import { on, emit } from '../core/events.js';
import { makeRng, seedFrom } from '../core/noise.js';
import { cellContent, SPAWN_CELL, banditRoster } from '../sim/spawns.js';
import { isHarvested, isChestOpened, isPoiCleared, markPoiCleared } from '../sim/worldstate.js';
import { NODE_TYPES } from '../sim/gathering.js';
import { CREATURES } from '../data/creatures.js';
import { poiById } from '../data/world-map.js';
import { getPoiLayout } from '../world/poi-layout.js';
import { createResourceNode } from '../world/resource-nodes.js';
import { createProp } from '../world/props.js';
import { regionAt, walkHeightAt } from '../world/terrain.js';

const CELL_RADIUS = 2;           // cells loaded around the hero in each direction
const NODE_MODEL_IN = 120, NODE_MODEL_OUT = 150;
const PACK_RESPAWN = 420;        // seconds before a killed pack returns

export function createPopulation(g) {
  const cells = new Map();       // "cx,cz" -> {nodes:[runtime], packKeys:[…]}
  const deadPacks = new Map();   // packKey -> world clock when it may respawn
  const pois = new Map();        // poiId -> {chest, hostile:boolean, cleared}
  let scanT = 0;

  // ───────────── resource nodes ─────────────

  function makeNode(spec) {
    return { ...spec, kind: 'node', def: NODE_TYPES[spec.nodeType], model: null, collider: 0, available: !isHarvested(g.state, spec.key) };
  }
  function showNode(node) {
    if (node.model || !node.available) return;
    node.model = createResourceNode(node.nodeType, node.seed);
    node.model.position.set(node.x, node.y, node.z);
    node.model.rotation.y = (node.seed % 628) / 100;
    g.scene.add(node.model);
    node.collider = g.colliders.addCircle(node.x, node.z, 0.55, { top: node.y + 1.2, tag: 'node' });
  }
  function hideNode(node) {
    if (!node.model) return;
    g.scene.remove(node.model);
    node.model.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    node.model = null;
    g.colliders.remove(node.collider);
    node.collider = 0;
  }

  // ───────────── spawn cells ─────────────

  function loadCell(cx, cz) {
    const content = cellContent(cx, cz);
    const cell = { nodes: content.nodes.map(makeNode), packKeys: [] };
    const now = g.state.world.clock;
    for (const pack of content.packs) {
      cell.packKeys.push(pack.key);
      if ((deadPacks.get(pack.key) || 0) > now) continue;
      spawnPack(pack);
    }
    cells.set(cx + ',' + cz, cell);
  }
  function spawnPack(pack) {
    for (const m of pack.members) g.mobs.spawn(pack.creatureId, pack.level, m.x, m.z, { packKey: pack.key, home: { x: m.x, z: m.z } });
  }
  function unloadCell(key) {
    const cell = cells.get(key);
    for (const node of cell.nodes) hideNode(node);
    const keys = new Set(cell.packKeys);
    g.mobs.removeWhere(m => keys.has(m.packKey) && !m.target);
    cells.delete(key);
  }

  // ───────────── POIs ─────────────

  function populatePoi(poiId) {
    const poi = poiById(poiId);
    const layout = getPoiLayout(poiId);
    const entry = { poi, layout, chest: null, hostile: false };
    pois.set(poiId, entry);
    const rng = makeRng(seedFrom(poiId) + (g.state.time?.day ?? 0));
    const cleared = isPoiCleared(g.state, poiId);

    if (!cleared && (poi.faction === 'bandit' || poi.faction === 'beast')) {
      entry.hostile = true;
      const guards = layout.spots.guards || [];
      if (poi.faction === 'bandit') {
        const roster = banditRoster(poi, guards.length, rng);
        guards.forEach((s, i) => g.mobs.spawn(roster[i], poi.level + (rng() < 0.3 ? 1 : 0), s.x, s.z, { poiId, home: { x: s.x, z: s.z }, packKey: 'poi:' + poiId }));
        if (poi.boss && layout.spots.boss) g.mobs.spawn(poi.boss, poi.level + 1, layout.spots.boss.x, layout.spots.boss.z, { poiId, home: layout.spots.boss, packKey: 'poi:' + poiId });
      } else {
        const creatureId = poi.creature || pickBeast(poi, rng);
        guards.forEach((s, i) => g.mobs.spawn(creatureId, poi.level, s.x, s.z, { poiId, home: { x: s.x, z: s.z }, packKey: 'poi:' + poiId, elite: i === 0 }));
      }
    }
    if (poi.chest && layout.spots.chest) {
      const spot = layout.spots.chest;
      const opened = isChestOpened(g.state, poiId);
      const model = createProp(opened ? 'chest-open' : 'chest');
      model.position.set(spot.x, walkHeightAt(spot.x, spot.z), spot.z);
      model.rotation.y = spot.yaw || 0;
      g.scene.add(model);
      entry.chest = { kind: 'chest', poiId, x: spot.x, z: spot.z, y: model.position.y, model, opened, collider: g.colliders.addCircle(spot.x, spot.z, 0.6, { top: model.position.y + 0.9 }) };
    }
  }

  function pickBeast(poi, rng) {
    const biome = regionAt(poi.x, poi.z).biome;
    const options = Object.values(CREATURES).filter(d => (d.family === 'beast' || d.family === 'monster') && d.aggressive && !d.boss && (d.biomes || []).includes(biome) && d.levelRange[0] <= poi.level + 1 && d.levelRange[1] >= poi.level - 2);
    return options.length ? options[Math.floor(rng() * options.length)].id : 'wolf';
  }

  function depopulatePoi(poiId) {
    const entry = pois.get(poiId);
    if (!entry) return;
    g.mobs.removeWhere(m => m.poiId === poiId);
    if (entry.chest) {
      g.scene.remove(entry.chest.model);
      entry.chest.model.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      g.colliders.remove(entry.chest.collider);
    }
    pois.delete(poiId);
  }

  /** Swap the chest model to its opened version. */
  function openChest(chest) {
    chest.opened = true;
    g.scene.remove(chest.model);
    const model = createProp('chest-open');
    model.position.copy(chest.model.position);
    model.rotation.copy(chest.model.rotation);
    chest.model = model;
    g.scene.add(model);
  }

  on('stream:poi-loaded', ({ poiId }) => populatePoi(poiId));
  on('stream:poi-unloading', ({ poiId }) => depopulatePoi(poiId));

  // ───────────── update ─────────────

  function update(dt) {
    const hero = g.hero;
    scanT -= dt;
    if (scanT <= 0) {
      scanT = 0.6;
      const hx = Math.floor(hero.x / SPAWN_CELL), hz = Math.floor(hero.z / SPAWN_CELL);
      let loaded = 0;
      for (let dx = -CELL_RADIUS; dx <= CELL_RADIUS && loaded < 2; dx++) for (let dz = -CELL_RADIUS; dz <= CELL_RADIUS && loaded < 2; dz++) {
        const key = (hx + dx) + ',' + (hz + dz);
        if (!cells.has(key)) { loadCell(hx + dx, hz + dz); loaded++; }
      }
      for (const key of [...cells.keys()]) {
        const [cx, cz] = key.split(',').map(Number);
        if (Math.abs(cx - hx) > CELL_RADIUS + 1 || Math.abs(cz - hz) > CELL_RADIUS + 1) unloadCell(key);
      }
      // node models near the hero; respawned nodes come back
      for (const cell of cells.values()) for (const node of cell.nodes) {
        if (!node.available && !isHarvested(g.state, node.key)) node.available = true;
        const d = Math.hypot(node.x - hero.x, node.z - hero.z);
        if (node.available && d < NODE_MODEL_IN) showNode(node);
        else if (node.model && (d > NODE_MODEL_OUT || !node.available)) hideNode(node);
      }
      // POIs whose garrison is dead become cleared
      for (const [poiId, entry] of pois) {
        if (!entry.hostile) continue;
        if (g.mobs.aliveCount(m => m.poiId === poiId) === 0) {
          entry.hostile = false;
          markPoiCleared(g.state, poiId);
          emit('world:poi-cleared', { poiId });
          emit('toast', { text: `${entry.poi.name}: зачищено`, kind: 'good' });
        }
      }
    }
  }

  /** A pack member died: once the whole pack is dead, start its respawn timer. */
  function notePackDeath(mob) {
    if (!mob.packKey || mob.packKey.startsWith('poi:')) return;
    if (g.mobs.aliveCount(m => m.packKey === mob.packKey) === 0) deadPacks.set(mob.packKey, g.state.world.clock + PACK_RESPAWN);
  }

  /** Called when a node was harvested (state already updated). */
  function nodeHarvested(node) {
    node.available = false;
    hideNode(node);
  }

  return {
    update, notePackDeath, nodeHarvested, openChest,
    /** Visit every interactable node/chest near a point. */
    forEachInteractable(x, z, r, fn) {
      for (const cell of cells.values()) for (const node of cell.nodes) {
        if (node.available && node.model && Math.hypot(node.x - x, node.z - z) < r) fn(node);
      }
      for (const entry of pois.values()) {
        const c = entry.chest;
        if (c && !c.opened && Math.hypot(c.x - x, c.z - z) < r) fn(c);
      }
    },
    poiHostile: poiId => !!pois.get(poiId)?.hostile,
    poiEntry: poiId => pois.get(poiId),
    /** Force-load the cells around a point (behind the loading screen). */
    preload(x, z) {
      const hx = Math.floor(x / SPAWN_CELL), hz = Math.floor(z / SPAWN_CELL);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!cells.has((hx + dx) + ',' + (hz + dz))) loadCell(hx + dx, hz + dz);
    },
  };
}
