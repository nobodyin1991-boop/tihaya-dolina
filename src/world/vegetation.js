// Vegetation streaming: trees, bushes, rocks, logs… scattered deterministically per 64 m cell and baked into
// static merged meshes, in three tiers per 256 m block:
//   far  — every 2nd tree as a 5-14 triangle blob, one mesh per block (always kept while the block is loaded)
//   mid  — every tree as a low-poly model, one mesh per block (inside quality.treeMid)
//   near — the block is expanded into its 16 cells; cells inside ~0.8 * treeNear get full-detail trees + ground props
// Budget (high, dense forest worst case): ~20 far + ~5 mid + ~25 near meshes in the frustum = ~50 draw calls,
// ~450k triangles; open country is a fraction of that. One shared material, zero per-frame CPU apart from the
// time-sliced generator (default 1.2 ms/frame + 0.7 ms for the grass clipmap). Trunks and big rocks of expanded blocks register circle colliders.
import * as THREE from 'three';
import { heightAt, roadAt, riverAt, cityAt, poiAt } from './terrain.js';
import { sampleBiome, BIOME_KEYS } from './terrain-paint.js';
import { REGIONS, RIVER } from '../data/world-map.js';
import { makeRng, noise2, smoothstep } from '../core/noise.js';
import { BakeWriter, floraMaterial } from './veg-kit.js';
import { buildTreeModels, TREE_KINDS } from './trees.js';
import { buildPropModels, PROP_KINDS } from './rocks.js';
import { createGroundCover } from './ground-cover.js';

const CELL = 64;
const BLOCK = 256;
const CELLS = BLOCK / CELL;          // cells per block side
const SUB = 8;                       // tree candidates per cell side (8 m jittered grid)
const WORLD_LIMIT = 3520;
const RIVER_CLEAR = RIVER.width / 2 + 3.5;
const TREE_STRIDE = 8;               // x, y, z, scale, yaw, model code, tint, scaleY
const PROP_STRIDE = 8;

// trees: probability per 8 m sub-cell; grove: extra probability inside noise "groves"; mix: [kind, weight];
// scale: [min, max]; props: expected count per cell at propDensity 1; big: expected boulders per cell
const RULES = {
  meadow:     { trees: 0.03,  grove: 0.42, mix: [['oak', 5], ['birch', 3], ['linden', 2.5], ['amberoak', 0.5]], scale: [0.85, 1.25], props: { bush: 5, rock: 1.2, log: 0.2, stump: 0.25, mushroom: 0.3 }, big: 0.05 },
  farmland:   { trees: 0.01,  grove: 0.10, mix: [['linden', 3], ['oak', 2], ['birch', 2]], scale: [0.85, 1.2], props: { bush: 2, rock: 0.4 }, big: 0 },
  forest:     { trees: 0.60,  grove: 0.25, mix: [['oak', 4], ['birch', 3], ['linden', 3], ['pine', 2], ['fir', 1.2], ['amberoak', 0.5]], scale: [0.85, 1.3], props: { bush: 9, fern: 11, mossrock: 2.5, log: 1.6, stump: 1.2, mushroom: 2.5 }, big: 0.25 },
  darkforest: { trees: 0.80,  grove: 0.15, mix: [['fir', 6], ['pine', 3], ['oak', 1], ['dead', 0.7]], scale: [1.0, 1.55], props: { fern: 15, mossrock: 4, log: 2.5, stump: 1.5, mushroom: 4, bush: 4 }, big: 0.5 },
  highland:   { trees: 0.025, grove: 0.42, mix: [['fir', 4], ['pine', 3], ['birch', 1.5]], scale: [0.75, 1.1], props: { rock: 6, bush: 3, drybush: 2, heather: 1.5 }, big: 0.5 },
  mountain:   { trees: 0.02,  grove: 0.30, mix: [['fir', 3], ['pine', 2], ['dead', 0.5]], scale: [0.6, 0.95], props: { rock: 10, drybush: 1.5 }, big: 1.4 },
  snow:       { trees: 0.13,  grove: 0.30, mix: [['snowfir', 6], ['dead', 0.4]], scale: [0.7, 1.15], props: { snowrock: 7 }, big: 1.0, bigKind: 'snowrock' },
  steppe:     { trees: 0.02,  grove: 0.10, mix: [['acacia', 5], ['dead', 0.6]], scale: [0.9, 1.3], props: { drybush: 9, rock: 3 }, big: 0.35 },
  coast:      { trees: 0.018, grove: 0.12, mix: [['pine', 3], ['acacia', 1.5], ['birch', 0.8]], scale: [0.7, 1.0], props: { rock: 2.5, drybush: 3, bush: 1 }, big: 0.25 },
  swamp:      { trees: 0.15,  grove: 0.30, mix: [['willow', 4], ['dead', 3], ['birch', 1]], scale: [0.8, 1.2], props: { reeds: 18, mossrock: 1.5, log: 2, bush: 2, mushroom: 1.5, fern: 4 }, big: 0.1, bigKind: 'mossrock' },
  heath:      { trees: 0.012, grove: 0.08, mix: [['birch', 2], ['pine', 2], ['dead', 1]], scale: [0.7, 1.0], props: { heather: 28, rock: 3, bush: 2 }, big: 0.4 },
  lake:       { trees: 0.18,  grove: 0.40, mix: [['willow', 3], ['birch', 3], ['oak', 2]], scale: [0.85, 1.2], props: { reeds: 9, bush: 5, rock: 1.5, fern: 3 }, big: 0.15 },
};
const RULE_BY_BIOME = BIOME_KEYS.map(key => RULES[key] || null);
const DARKFOREST = BIOME_KEYS.indexOf('darkforest');
const SNOW_BIOME = BIOME_KEYS.indexOf('snow');
const GLOOMWOOD = REGIONS.findIndex(r => r.id === 'gloomwood');
const REEDS = PROP_KINDS.indexOf('reeds');
const GIANT = TREE_KINDS.indexOf('giantoak');
const WILLOW = TREE_KINDS.indexOf('willow');

for (const key of Object.keys(RULES)) {
  const rule = RULES[key];
  rule.mixTotal = rule.mix.reduce((sum, m) => sum + m[1], 0);
  rule.mixIndex = rule.mix.map(m => TREE_KINDS.indexOf(m[0]));
  rule.propList = Object.keys(rule.props).map(kind => ({ kind: PROP_KINDS.indexOf(kind), count: rule.props[kind] }));
  rule.bigIndex = PROP_KINDS.indexOf(rule.bigKind || 'rock');
}

const cellSeed = (cx, cz, salt) => ((cx * 73856093) ^ (cz * 19349663) ^ (salt * 83492791)) >>> 0;

/**
 * Streaming vegetation + grass around the focus.
 * @param {{scene:THREE.Scene, camera:THREE.Camera, colliders:object, quality:object}} ctx
 * @returns {{update:(dt:number, focus:THREE.Vector3, budgetMs?:number)=>void, stats:()=>{cells:number, blocks:number, queued:number},
 *   groundCover:object, dispose:()=>void}}
 */
export function createVegetation(ctx) {
  const { scene, colliders, quality } = ctx;
  const material = floraMaterial();
  const treeModels = buildTreeModels();
  const propModels = buildPropModels();
  const treeList = TREE_KINDS.map(kind => treeModels[kind]);
  const propList = PROP_KINDS.map(kind => propModels[kind]);
  const writer = new BakeWriter();
  const group = new THREE.Group();
  group.name = 'vegetation';
  scene.add(group);
  const groundCover = quality.grassRadius > 0 ? createGroundCover(ctx) : null;

  const blocks = new Map();
  const order = [];
  const biome = { biome: 0, biome2: 0, w2: 0, region: 0 };
  const scratch = [];
  const nearRadius = quality.treeNear * 0.8;
  let focusX = Infinity;
  let focusZ = Infinity;
  let cellCount = 0;
  let pending = 0;

  // ───────────── scattering ─────────────

  function blockedGround(x, z, roadMargin, cityMargin, poiMargin) {
    const road = roadAt(x, z, 12);
    if (road && road.dist < road.road.halfWidth + roadMargin) return true;
    if (cityAt(x, z, cityMargin) || poiAt(x, z, poiMargin)) return true;
    const river = riverAt(x, z, RIVER_CLEAR + 2);
    return !!river && river.dist < RIVER_CLEAR;
  }

  function generateTrees(cx, cz) {
    const x0 = cx * CELL;
    const z0 = cz * CELL;
    const rng = makeRng(cellSeed(cx, cz, 1));
    scratch.length = 0;

    // a patriarch: at most one giant oak per dark-forest cell; the truly huge ones only in Сумрачная чаща
    let gx = 0, gz = 0, gr = 0;
    sampleBiome(x0 + CELL / 2, z0 + CELL / 2, biome);
    const gRoll = rng(), gPosX = rng(), gPosZ = rng(), gSize = rng(), gYaw = rng();
    if (biome.biome === DARKFOREST && gRoll < (biome.region === GLOOMWOOD ? 0.05 : 0.035)) {
      const x = x0 + 12 + gPosX * (CELL - 24);
      const z = z0 + 12 + gPosZ * (CELL - 24);
      const h = heightAt(x, z);
      if (h > 2 && h < 170 && !blockedGround(x, z, 8, 30, 8)) {
        const scale = biome.region === GLOOMWOOD ? 1.9 + gSize * 1.9 : 1.0 + gSize * 0.6;
        scratch.push(x, h, z, scale, gYaw * 6.283, GIANT * 4 + Math.floor(gSize * 2.99), 0.95 + gSize * 0.1, scale);
        gx = x; gz = z; gr = 7 * scale;
      }
    }

    for (let sj = 0; sj < SUB; sj++) {
      for (let si = 0; si < SUB; si++) {
        const x = x0 + (si + 0.15 + 0.7 * rng()) * (CELL / SUB);
        const z = z0 + (sj + 0.15 + 0.7 * rng()) * (CELL / SUB);
        const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(), r5 = rng(), r6 = rng();
        if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) continue;
        sampleBiome(x, z, biome);
        const b = r1 < biome.w2 * 0.5 ? biome.biome2 : biome.biome;
        const rule = RULE_BY_BIOME[b];
        if (!rule) continue;
        const n = noise2(x / 120, z / 120, 901) * 0.5 + 0.5;
        const n2 = noise2(x / 70 + 31, z / 70 - 17, 902) * 0.5 + 0.5;
        const p = rule.trees * (0.5 + n) + rule.grove * smoothstep(0.6, 0.78, n2);
        if (r2 >= p) continue;
        if (gr > 0 && Math.hypot(x - gx, z - gz) < gr) continue;
        const h = heightAt(x, z);
        // pick the species
        let pick = r4 * rule.mixTotal;
        let kind = rule.mixIndex[0];
        for (let m = 0; m < rule.mix.length; m++) {
          pick -= rule.mix[m][1];
          if (pick <= 0) { kind = rule.mixIndex[m]; break; }
        }
        if (h < (kind === WILLOW ? 0.45 : 0.9)) continue;
        const treeLine = b === SNOW_BIOME ? 185 : 205;
        if (r3 > smoothstep(treeLine, treeLine - 55, h)) continue;
        if (blockedGround(x, z, 3.5, 15, 2)) continue;
        const slope = Math.hypot(heightAt(x + 1.5, z) - h, heightAt(x, z + 1.5) - h) / 1.5;
        if (slope > 0.75) continue;
        const stunt = 1 - 0.35 * smoothstep(110, 190, h);
        const scale = (rule.scale[0] + (rule.scale[1] - rule.scale[0]) * r5) * stunt;
        scratch.push(x, h - 0.05, z, scale, r6 * 6.283, kind * 4 + Math.floor(r5 * 7.13) % 3, 0.86 + r3 * 0.26, scale * (0.92 + r1 * 0.2));
      }
    }
    return new Float32Array(scratch);
  }

  function generateProps(cx, cz) {
    const x0 = cx * CELL;
    const z0 = cz * CELL;
    const rng = makeRng(cellSeed(cx, cz, 2));
    scratch.length = 0;
    sampleBiome(x0 + CELL / 2, z0 + CELL / 2, biome);
    const rule = RULE_BY_BIOME[rng() < biome.w2 * 0.5 ? biome.biome2 : biome.biome];
    if (!rule) return new Float32Array(0);
    const place = (kind, big) => {
      const x = x0 + rng() * CELL;
      const z = z0 + rng() * CELL;
      const rs = rng(), ry = rng(), rv = rng();
      if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return;
      const h = heightAt(x, z);
      const isReed = kind === REEDS;
      if (isReed ? (h < -0.5 || h > 1.3) : h < 0.35) return;
      if (h > 260) return;
      if (blockedGround(x, z, big ? 4 : 1.2, big ? 12 : 4, big ? 3 : 0)) return;
      const slope = Math.hypot(heightAt(x + 1.2, z) - h, heightAt(x, z + 1.2) - h) / 1.2;
      const rocky = kind <= 2;
      if (slope > (rocky ? 1.1 : 0.6)) return;
      const variants = propList[kind].length;
      const scale = big ? 1.8 + rs * rs * 3.2 : rocky ? 0.35 + rs * rs * 1.0 : 0.75 + rs * 0.6;
      scratch.push(x, h - (rocky ? 0.12 * scale : 0.02), z, scale, ry * 6.283, kind * 4 + Math.floor(rv * variants) % variants, 0.88 + rv * 0.24, big ? 1 : 0);
    };
    for (let k = 0; k < rule.propList.length; k++) {
      const entry = rule.propList[k];
      const expected = entry.count * quality.propDensity;
      const count = Math.floor(expected + rng());
      for (let i = 0; i < count; i++) place(entry.kind, false);
    }
    const bigCount = Math.floor(rule.big + rng());
    for (let i = 0; i < bigCount; i++) place(rule.bigIndex, true);
    return new Float32Array(scratch);
  }

  // ───────────── baking ─────────────

  function bakeTrees(trees, lod, ox, oz, thin) {
    for (let i = 0; i < trees.length; i += TREE_STRIDE) {
      const code = trees[i + 5];
      const kind = code >> 2;
      if (thin && kind !== GIANT && ((i / TREE_STRIDE) & 1)) continue;
      const model = treeList[kind][code & 3].lods[lod];
      const tint = trees[i + 6];
      const grow = thin && kind !== GIANT ? 1.22 : 1;
      writer.append(model, trees[i] - ox, trees[i + 1], trees[i + 2] - oz, trees[i + 4], trees[i + 3] * grow, tint * 1.02, tint, tint * 0.96, trees[i + 7] * grow);
    }
  }

  function bakeProps(props, ox, oz, bigOnly) {
    for (let i = 0; i < props.length; i += PROP_STRIDE) {
      if (bigOnly && props[i + 7] === 0) continue;
      const code = props[i + 5];
      const entry = propList[code >> 2][code & 3];
      const tint = props[i + 6];
      writer.append(entry.model, props[i] - ox, props[i + 1], props[i + 2] - oz, props[i + 4], props[i + 3], tint, tint, tint);
    }
  }

  function makeMesh(x0, z0, cast) {
    const geometry = writer.build();
    if (!geometry) return null;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x0, 0, z0);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.castShadow = cast;
    mesh.receiveShadow = cast;
    group.add(mesh);
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  function dropMesh(mesh) {
    if (!mesh) return;
    group.remove(mesh);
    mesh.geometry.dispose();
  }

  // ───────────── block state machine ─────────────

  function makeBlock(bx, bz) {
    return {
      bx, bz, x0: bx * BLOCK, z0: bz * BLOCK, dist: 0, want: 2,
      trees: new Array(CELLS * CELLS).fill(null), generated: 0,
      far: null, farBuilt: false, mid: null, midBuilt: false,
      cells: null, expanded: false, colliderIds: [],
    };
  }

  function rectDistance(x0, z0, size) {
    const dx = Math.max(x0 - focusX, 0, focusX - x0 - size);
    const dz = Math.max(z0 - focusZ, 0, focusZ - z0 - size);
    return Math.hypot(dx, dz);
  }

  function refreshVisibility(block) {
    const showCells = block.want === 0 && block.expanded;
    const showMid = !showCells && block.want <= 1 && block.midBuilt;
    if (block.cells) for (const cell of block.cells) if (cell.mesh) cell.mesh.visible = showCells;
    if (block.mid) block.mid.visible = showMid;
    if (block.far) block.far.visible = !showCells && !showMid;
  }

  function addColliders(block) {
    for (let c = 0; c < block.trees.length; c++) {
      const trees = block.trees[c];
      for (let i = 0; i < trees.length; i += TREE_STRIDE) {
        const code = trees[i + 5];
        const entry = treeList[code >> 2][code & 3];
        const scale = trees[i + 3];
        block.colliderIds.push(colliders.addCircle(trees[i], trees[i + 2], Math.max(0.22, entry.trunk * scale), { top: trees[i + 1] + entry.height * trees[i + 7], tag: 'tree' }));
      }
      const props = block.cells[c].props;
      for (let i = 0; i < props.length; i += PROP_STRIDE) {
        const code = props[i + 5];
        const entry = propList[code >> 2][code & 3];
        const scale = props[i + 3];
        if (entry.radius * scale < 0.7) continue;
        block.colliderIds.push(colliders.addCircle(props[i], props[i + 2], entry.radius * scale * 0.85, { top: props[i + 1] + entry.height * scale, tag: 'rock' }));
      }
    }
  }

  function collapse(block) {
    if (block.cells) {
      for (const cell of block.cells) {
        dropMesh(cell.mesh);
        cellCount -= cell.mesh ? 1 : 0;
      }
    }
    block.cells = null;
    block.expanded = false;
    for (let i = 0; i < block.colliderIds.length; i++) colliders.remove(block.colliderIds[i]);
    block.colliderIds.length = 0;
  }

  function unload(block) {
    collapse(block);
    dropMesh(block.far);
    dropMesh(block.mid);
    blocks.delete(block.bx + ',' + block.bz);
  }

  function wantedCellLod(block, index, current) {
    const cx = block.x0 + (index % CELLS) * CELL;
    const cz = block.z0 + Math.floor(index / CELLS) * CELL;
    const d = rectDistance(cx, cz, CELL);
    if (d < nearRadius) return 0;
    if (d > nearRadius + 12) return 1;
    return current < 0 ? 1 : current;
  }

  /** One slice of work for a block; returns false when it has nothing left to do. */
  function processBlock(block) {
    if (block.generated < CELLS * CELLS) {
      const i = block.generated++;
      block.trees[i] = generateTrees(block.bx * CELLS + (i % CELLS), block.bz * CELLS + Math.floor(i / CELLS));
      return true;
    }
    if (!block.farBuilt) {
      writer.reset();
      for (const trees of block.trees) bakeTrees(trees, 2, block.x0, block.z0, true);
      block.far = makeMesh(block.x0, block.z0, false);
      block.farBuilt = true;
      refreshVisibility(block);
      return true;
    }
    if (block.want <= 1 && !block.midBuilt) {
      writer.reset();
      for (const trees of block.trees) bakeTrees(trees, 1, block.x0, block.z0, false);
      block.mid = makeMesh(block.x0, block.z0, false);
      block.midBuilt = true;
      refreshVisibility(block);
      return true;
    }
    if (block.want === 0) {
      if (!block.cells) {
        block.cells = [];
        for (let i = 0; i < CELLS * CELLS; i++) block.cells.push({ props: null, mesh: null, lod: -1 });
      }
      for (let i = 0; i < block.cells.length; i++) {
        const cell = block.cells[i];
        const cx = block.bx * CELLS + (i % CELLS);
        const cz = block.bz * CELLS + Math.floor(i / CELLS);
        if (!cell.props) {
          cell.props = generateProps(cx, cz);
          return true;
        }
        const lod = wantedCellLod(block, i, cell.lod);
        if (lod !== cell.lod) {
          writer.reset();
          bakeTrees(block.trees[i], lod, cx * CELL, cz * CELL, false);
          bakeProps(cell.props, cx * CELL, cz * CELL, lod === 1);
          const mesh = makeMesh(cx * CELL, cz * CELL, true);
          if (mesh) mesh.visible = block.expanded;
          cellCount += (mesh ? 1 : 0) - (cell.mesh ? 1 : 0);
          dropMesh(cell.mesh);
          cell.mesh = mesh;
          cell.lod = lod;
          return true;
        }
      }
      if (!block.expanded) {
        block.expanded = true;
        addColliders(block);
        refreshVisibility(block);
        return true;
      }
      return false;
    }
    if (block.cells) {
      collapse(block);
      refreshVisibility(block);
      return true;
    }
    if (block.want === 2 && block.midBuilt && block.dist > quality.treeMid + 96) {
      dropMesh(block.mid);
      block.mid = null;
      block.midBuilt = false;
      refreshVisibility(block);
      return true;
    }
    return false;
  }

  function reselect() {
    const reach = quality.treeDistance;
    const b0x = Math.floor((focusX - reach) / BLOCK), b1x = Math.floor((focusX + reach) / BLOCK);
    const b0z = Math.floor((focusZ - reach) / BLOCK), b1z = Math.floor((focusZ + reach) / BLOCK);
    for (let bz = b0z; bz <= b1z; bz++) {
      for (let bx = b0x; bx <= b1x; bx++) {
        if (Math.abs(bx * BLOCK + BLOCK / 2) > WORLD_LIMIT + BLOCK || Math.abs(bz * BLOCK + BLOCK / 2) > WORLD_LIMIT + BLOCK) continue;
        if (rectDistance(bx * BLOCK, bz * BLOCK, BLOCK) > reach) continue;
        const key = bx + ',' + bz;
        if (!blocks.has(key)) blocks.set(key, makeBlock(bx, bz));
      }
    }
    order.length = 0;
    for (const block of blocks.values()) {
      block.dist = rectDistance(block.x0, block.z0, BLOCK);
      if (block.dist > reach + 96) {
        unload(block);
        continue;
      }
      const before = block.want;
      if (block.dist < quality.treeNear) block.want = 0;
      else if (block.dist < quality.treeMid) block.want = block.want === 0 && block.dist < quality.treeNear + 24 ? 0 : 1;
      else block.want = block.want <= 1 && block.dist < quality.treeMid + 32 ? 1 : 2;
      if (before !== block.want) refreshVisibility(block);
      order.push(block);
    }
    order.sort((a, b) => a.dist - b.dist);
  }

  function update(dt, focus, budgetMs = 1.2) {
    if (Math.abs(focus.x - focusX) > 6 || Math.abs(focus.z - focusZ) > 6) {
      focusX = focus.x;
      focusZ = focus.z;
      reselect();
    }
    const deadline = performance.now() + budgetMs;
    pending = 0;
    for (let i = 0; i < order.length; i++) {
      const block = order[i];
      while (processBlock(block)) {
        if (performance.now() >= deadline) {
          pending = order.length - i;
          i = order.length;
          break;
        }
      }
    }
    if (groundCover) groundCover.update(dt, focus, Math.max(0.6, budgetMs * 0.6));
  }

  /** Giant oaks in the loaded blocks: [{x, z, height}] (debug / map helper). */
  function giants() {
    const list = [];
    for (const block of blocks.values()) {
      for (const trees of block.trees) {
        if (!trees) continue;
        for (let i = 0; i < trees.length; i += TREE_STRIDE) {
          const code = trees[i + 5];
          if ((code >> 2) === GIANT) list.push({ x: trees[i], z: trees[i + 2], height: treeList[GIANT][code & 3].height * trees[i + 7] });
        }
      }
    }
    return list;
  }

  function stats() {
    return { cells: cellCount, blocks: blocks.size, queued: pending + (groundCover ? groundCover.pending() : 0) };
  }

  function dispose() {
    for (const block of [...blocks.values()]) unload(block);
    scene.remove(group);
    if (groundCover) groundCover.dispose();
  }

  return { update, stats, giants, groundCover, dispose };
}
