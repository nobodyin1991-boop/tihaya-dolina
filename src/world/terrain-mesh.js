// Streaming LOD terrain: a quadtree of 32x32-cell nodes (1024 m roots down to 32 m leaves => 32 m .. 1 m cells).
// Budget: ~60-110 nodes alive, 25-55 in the frustum => 25-55 draw calls, ~2.3k triangles each (60-130k total),
// 1 shared material. Nodes are generated in time slices (default 2 ms per frame) nearest-first, with skirts to
// hide LOD cracks; parents stay on screen until all four children are ready, unused nodes are disposed after 8 s.
// Vertex colours carry the biome blend; the fragment shader adds roads, rock on slopes, snow line, field patches
// and procedural detail (no textures). Nodes that dip below sea level also carry a matching water patch (water.js).
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { sampleGround, makeGroundSample, ROAD_COLOR, hexToLinear } from './terrain-paint.js';
import { NOISE_GLSL } from './glsl.js';
import { atmo, applyShadowFade } from './sky.js';
import { buildWaterPatch, waterMaterials } from './water.js';

const GRID = 32;
const VERTS = GRID + 1;
const PAD = GRID + 3;              // height samples per row incl. a one-cell border for normals
const ROOT_SIZE = 1024;
const ROOT_SPAN = 4;               // roots cover [-4096, 4096]
const KEEP_SECONDS = 8;

const TERRAIN_VERT_PARS = /* glsl */`
attribute vec4 aMix;
varying vec4 vMix;
varying vec3 vTerrainPos;
varying vec3 vTerrainNormal;
`;

const TERRAIN_FRAG_PARS = /* glsl */`
varying vec4 vMix;
varying vec3 vTerrainPos;
varying vec3 vTerrainNormal;
uniform vec3 uRoadColor;
uniform vec3 uRockDark;
uniform vec3 uRockLight;
uniform vec3 uSnowColor;
uniform float uWet;
${NOISE_GLSL}
vec3 terrainBump(vec3 surfPos, vec3 surfNorm, vec2 dHdxy) {
  vec3 sigmaX = dFdx(surfPos);
  vec3 sigmaY = dFdy(surfPos);
  vec3 r1 = cross(sigmaY, surfNorm);
  vec3 r2 = cross(surfNorm, sigmaX);
  float det = dot(sigmaX, r1);
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  vec3 bent = abs(det) * surfNorm - grad;
  float len2 = dot(bent, bent);
  return len2 > 1e-16 ? bent * inversesqrt(len2) : surfNorm;
}
`;

const TERRAIN_FRAG_COLOR = /* glsl */`
  vec3 tp = vTerrainPos;
  vec3 tn = normalize(vTerrainNormal);
  float tSlope = 1.0 - tn.y;
  float tDist = length(vViewPosition);
  float tNear = 1.0 - smoothstep(30.0, 110.0, tDist);
  float tMid = 1.0 - smoothstep(350.0, 900.0, tDist);
  float nLow = wFbm3(tp.xz * 0.0125);
  float nMid = wNoise(tp.xz * 0.12 + 11.0);
  #if TERRAIN_OCTAVES >= 2
    float nHi = wNoise(tp.xz * 1.9);
  #else
    float nHi = 0.5;
  #endif
  #if TERRAIN_OCTAVES >= 3
    float nFine = wNoise(tp.xz * 7.3 + 5.0);
  #else
    float nFine = nHi;
  #endif
  float tDetail = mix(nHi, 0.55 * nHi + 0.45 * nFine, 1.0 - smoothstep(8.0, 36.0, tDist));
  vec3 tTurf = diffuseColor.rgb;
  vec3 tBase = tTurf * (0.84 + 0.32 * nLow);
  // slow drift between lush-cool and dry-warm country so wide views are never one flat colour
  float nPatch = wNoise(tp.xz * 0.0041 + 7.0);
  tBase *= mix(vec3(0.90, 1.03, 0.92), vec3(1.13, 1.03, 0.80), smoothstep(0.25, 0.75, nPatch));
  float tDry = smoothstep(0.52, 0.82, wNoise(tp.xz * 0.031 + 40.0));
  tBase = mix(tBase, tBase * vec3(1.17, 1.07, 0.80), tDry * 0.42 * (1.0 - vMix.y));
  tBase *= mix(1.0, 0.86 + 0.28 * nMid, tMid);

  // farmland: a warped patchwork of crops with furrows
  float tField = smoothstep(0.34, 0.6, vMix.w);
  if (tField > 0.0) {
    vec2 fuv = tp.xz / 52.0 + (vec2(nLow, wNoise(tp.zx * 0.017)) - 0.5) * 0.5;
    vec2 fcell = floor(fuv);
    vec2 ff = fract(fuv);
    float kind = wHash(fcell);
    float ang = wHash(fcell + 3.3) * 3.14159;
    float furrow = sin(dot(tp.xz, vec2(cos(ang), sin(ang))) * 2.6);
    vec3 crop = kind < 0.34 ? vec3(0.62, 0.45, 0.11) : kind < 0.58 ? vec3(0.20, 0.32, 0.08) : kind < 0.8 ? vec3(0.19, 0.13, 0.075) : vec3(0.30, 0.36, 0.16);
    crop *= 1.0 + 0.16 * furrow * (1.0 - smoothstep(60.0, 220.0, tDist));
    crop *= 0.86 + 0.28 * nLow;
    float inside = smoothstep(0.0, 0.045, ff.x) * smoothstep(1.0, 0.955, ff.x) * smoothstep(0.0, 0.045, ff.y) * smoothstep(1.0, 0.955, ff.y);
    tBase = mix(tBase, crop, tField * inside * 0.9);
  }
  tBase *= mix(1.0, 0.85 + 0.30 * tDetail, tNear);

  // bare rock on steep ground, with horizontal strata streaks
  // high ground turns to thin turf and scree before the bare rock starts
  float tAlpine = smoothstep(105.0, 185.0, tp.y + (nLow - 0.5) * 50.0);
  tBase = mix(tBase, mix(uRockLight, tBase, 0.45) * (0.9 + 0.2 * nMid), tAlpine * 0.55);
  float tRock = smoothstep(0.13, 0.31, tSlope + (nMid - 0.5) * 0.12 + (nLow - 0.5) * 0.10);
  float strata = wNoise(vec2(tp.y * 0.42 + nLow * 6.0, dot(tp.xz, vec2(0.021, 0.017))));
  vec3 rockCol = mix(uRockDark, uRockLight, strata) * (0.82 + 0.34 * nMid) * mix(1.0, 0.86 + 0.28 * tDetail, tNear);
  tBase = mix(tBase, rockCol, tRock);

  // snow line (pulled down in snowy regions), thin on cliffs
  float snowLine = mix(215.0, 62.0, vMix.z);
  float snowH = tp.y + (nLow - 0.5) * 70.0 + (nMid - 0.5) * 12.0;
  float tSnow = smoothstep(snowLine - 14.0, snowLine + 26.0, snowH) * (1.0 - smoothstep(0.46, 0.74, tSlope));
  float drift = wNoise(tp.xz * 0.21 + 3.0);
  vec3 snowCol = uSnowColor * (0.88 + 0.10 * nMid + 0.08 * drift) * mix(vec3(0.86, 0.93, 1.06), vec3(1.0), smoothstep(0.25, 0.7, nLow));
  tBase = mix(tBase, snowCol, tSnow);

  // trodden pads: pebbly break-up
  tBase *= mix(1.0, 0.80 + 0.36 * wNoise(tp.xz * 2.6 + 9.0), vMix.y * tNear);

  // roads: packed dirt with wheel ruts and a ragged, noise-broken edge
  float roadM = vMix.x + (nMid - 0.5) * 0.07 + (nHi - 0.5) * 0.06 * tNear;
  float tRoad = smoothstep(0.20, 0.285, roadM) * (1.0 - 0.75 * tSnow);
  vec3 roadCol = uRoadColor * (0.80 + 0.26 * nMid) * mix(1.0, 0.84 + 0.32 * tDetail, tNear);
  float rut = smoothstep(0.055, 0.0, abs(vMix.x - 0.43)) * (1.0 - smoothstep(90.0, 260.0, tDist));
  roadCol *= 1.0 - 0.20 * rut;
  float crown = smoothstep(0.58, 0.70, vMix.x) * smoothstep(0.35, 0.75, nLow + (nHi - 0.5) * 0.5);
  roadCol = mix(roadCol, tTurf * 0.9, crown * 0.45);
  tBase = mix(tBase, roadCol, tRoad);

  // rain darkens and glosses the ground, most of all the bare road
  float tWet = uWet * (0.45 + 0.55 * tRoad) * (1.0 - tSnow);
  tBase *= 1.0 - 0.30 * tWet;
  diffuseColor.rgb = tBase;
  float tRough = mix(mix(0.97, 0.80, tSnow), 0.42, tWet);
  float tBump = (tDetail * 0.07 * (1.0 - tSnow) + tSnow * drift * 0.5 + tRock * (nMid * 0.6 + nHi * 0.12) - rut * tRoad * 0.05) * tNear;
`;

function createTerrainMaterial(quality) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  material.defines = { TERRAIN_OCTAVES: quality.terrainOctaves };
  material.onBeforeCompile = shader => {
    shader.uniforms.uRoadColor = { value: new THREE.Color().fromArray(ROAD_COLOR) };
    shader.uniforms.uRockDark = { value: new THREE.Color().fromArray(hexToLinear(0x5b5953)) };
    shader.uniforms.uRockLight = { value: new THREE.Color().fromArray(hexToLinear(0x9a9282)) };
    shader.uniforms.uSnowColor = { value: new THREE.Color().fromArray(hexToLinear(0xcbd5de)) };
    shader.uniforms.uWet = atmo.uWet;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + TERRAIN_VERT_PARS)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vMix = aMix;
        vTerrainPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vTerrainNormal = normal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TERRAIN_FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + TERRAIN_FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (tNear > 0.0) normal = terrainBump(-vViewPosition, normal, vec2(dFdx(tBump), dFdy(tBump)));`);
    applyShadowFade(shader);
  };
  material.customProgramCacheKey = () => 'terrain' + quality.terrainOctaves;
  return material;
}

// shared index template: grid triangles + double-sided skirts
function buildIndexTemplate() {
  const idx = [];
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const a = j * VERTS + i;
      const b = a + 1;
      const c = a + VERTS;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const skirtBase = VERTS * VERTS;
  for (let side = 0; side < 4; side++) {
    for (let k = 0; k < GRID; k++) {
      const top0 = edgeVertex(side, k);
      const top1 = edgeVertex(side, k + 1);
      const low0 = skirtBase + side * VERTS + k;
      const low1 = low0 + 1;
      idx.push(top0, low0, top1, top1, low0, low1);
      idx.push(top0, top1, low0, top1, low1, low0);
    }
  }
  return new Uint16Array(idx);
}
function edgeVertex(side, k) {
  if (side === 0) return k;                         // north edge (j = 0)
  if (side === 1) return GRID * VERTS + k;          // south edge
  if (side === 2) return k * VERTS;                 // west edge
  return k * VERTS + GRID;                          // east edge
}
const INDEX_TEMPLATE = buildIndexTemplate();
const VERTEX_COUNT = VERTS * VERTS + 4 * VERTS;

/**
 * Chunked LOD terrain around a focus point.
 * @param {{scene:THREE.Scene, quality:object}} ctx
 * @returns {{update:(focus:THREE.Vector3, budgetMs?:number)=>void, readyAround:(x:number, z:number, radius:number)=>boolean,
 *   stats:()=>{nodes:number, visible:number, queued:number}, material:THREE.Material, dispose:()=>void}}
 */
export function createTerrain(ctx) {
  const { scene, quality } = ctx;
  const material = createTerrainMaterial(quality);
  const waterMaterial = waterMaterials(quality).sea;
  const group = new THREE.Group();
  group.name = 'terrain';
  scene.add(group);

  const roots = [];
  for (let rz = -ROOT_SPAN; rz < ROOT_SPAN; rz++) {
    for (let rx = -ROOT_SPAN; rx < ROOT_SPAN; rx++) roots.push(makeNode(rx * ROOT_SIZE, rz * ROOT_SIZE, ROOT_SIZE));
  }

  const queue = [];                 // wanted leaves without a mesh, nearest first
  const leaves = [];                // wanted leaves of the last selection
  const built = new Set();          // nodes that own a mesh
  const heights = new Float32Array(PAD * PAD);
  const sample = makeGroundSample();
  let job = null;
  let clock = 0;
  let lastTime = performance.now();
  let focusX = Infinity;
  let focusZ = Infinity;
  let visibleCount = 0;

  function makeNode(x0, z0, size) {
    return { x0, z0, size, children: null, mesh: null, water: null, queued: false, inView: false, wantSplit: false, cover: false, exist: false, lastUsed: 0, dist: 0 };
  }

  function rectDistance(node, x, z) {
    const dx = Math.max(node.x0 - x, 0, x - node.x0 - node.size);
    const dz = Math.max(node.z0 - z, 0, z - node.z0 - node.size);
    return Math.hypot(dx, dz);
  }

  // pass 1 (post-order): decide the wanted detail and what could cover each node right now
  function select(node) {
    const d = rectDistance(node, focusX, focusZ);
    node.dist = d;
    node.inView = d < quality.viewDistance;
    node.wantSplit = node.inView && node.size > quality.terrainMinNode && d < node.size * quality.terrainDetail;
    let childrenCover = false;
    let childrenExist = false;
    if (node.wantSplit && !node.children) {
      const h = node.size / 2;
      node.children = [makeNode(node.x0, node.z0, h), makeNode(node.x0 + h, node.z0, h), makeNode(node.x0, node.z0 + h, h), makeNode(node.x0 + h, node.z0 + h, h)];
    }
    if (node.children) {
      childrenCover = true;
      childrenExist = true;
      for (let i = 0; i < 4; i++) {
        const c = node.children[i];
        if (node.wantSplit) select(c); else refreshExisting(c);
        if (!c.cover) childrenCover = false;
        if (!c.exist) childrenExist = false;
      }
    }
    node.exist = !!node.mesh || childrenExist;
    if (!node.inView) {
      node.cover = true;
    } else if (node.wantSplit) {
      node.cover = childrenCover || !!node.mesh;
    } else {
      node.cover = node.exist;
      leaves.push(node);
      if (!node.mesh && !node.queued) {
        node.queued = true;
        queue.push(node);
      }
    }
    node.childrenCover = childrenCover;
    node.childrenExist = childrenExist;
  }

  function refreshExisting(node) {
    let childrenExist = false;
    if (node.children) {
      childrenExist = true;
      for (let i = 0; i < 4; i++) {
        refreshExisting(node.children[i]);
        if (!node.children[i].exist) childrenExist = false;
      }
    }
    node.inView = false;
    node.wantSplit = false;
    node.childrenExist = childrenExist;
    node.exist = !!node.mesh || childrenExist;
    node.cover = node.exist;
  }

  function show(node, on) {
    if (!node.mesh) return;
    node.mesh.visible = on;
    if (on) {
      node.lastUsed = clock;
      visibleCount++;
    }
  }
  function hideTree(node) {
    show(node, false);
    if (node.children) for (let i = 0; i < 4; i++) hideTree(node.children[i]);
  }
  function showExisting(node) {
    if (node.mesh) {
      show(node, true);
      if (node.children) for (let i = 0; i < 4; i++) hideTree(node.children[i]);
    } else if (node.children) {
      show(node, false);
      for (let i = 0; i < 4; i++) showExisting(node.children[i]);
    }
  }
  // pass 2 (pre-order): show exactly one covering set of meshes
  function apply(node) {
    if (!node.inView) {
      hideTree(node);
      return;
    }
    if (node.wantSplit) {
      if (node.childrenCover || !node.mesh) {
        show(node, false);
        for (let i = 0; i < 4; i++) apply(node.children[i]);
      } else {
        show(node, true);
        for (let i = 0; i < 4; i++) hideTree(node.children[i]);
      }
    } else if (node.mesh) {
      show(node, true);
      if (node.children) for (let i = 0; i < 4; i++) hideTree(node.children[i]);
    } else if (node.children && node.childrenExist) {
      for (let i = 0; i < 4; i++) showExisting(node.children[i]);
    } else if (node.children) {
      for (let i = 0; i < 4; i++) hideTree(node.children[i]);
    }
  }

  function disposeNode(node) {
    if (!node.mesh) return;
    group.remove(node.mesh);
    node.mesh.geometry.dispose();
    if (node.water) node.water.geometry.dispose();
    node.mesh = null;
    node.water = null;
    built.delete(node);
  }

  // drop meshes nobody looked at for a while, and prune empty branches
  function sweep(node) {
    if (node.children) {
      let empty = true;
      for (let i = 0; i < 4; i++) {
        const c = node.children[i];
        sweep(c);
        if (c.mesh || c.children || c.queued || c === (job && job.node)) empty = false;
      }
      if (empty && !node.wantSplit) node.children = null;
    }
    if (node.mesh && !node.mesh.visible && clock - node.lastUsed > KEEP_SECONDS) disposeNode(node);
  }

  function startJob(node) {
    const cell = node.size / GRID;
    job = {
      node, cell, row: 0, phase: 0, minH: Infinity, maxH: -Infinity,
      position: new Float32Array(VERTEX_COUNT * 3),
      normal: new Float32Array(VERTEX_COUNT * 3),
      color: new Float32Array(VERTEX_COUNT * 3),
      mix: new Uint8Array(VERTEX_COUNT * 4),
      murk: new Uint8Array(VERTS * VERTS),
    };
  }

  // one row of work; returns true when the node is finished
  function stepJob() {
    const { node, cell } = job;
    if (job.phase === 0) {
      const j = job.row;
      const z = node.z0 + (j - 1) * cell;
      for (let i = 0; i < PAD; i++) heights[j * PAD + i] = heightAt(node.x0 + (i - 1) * cell, z);
      if (++job.row === PAD) {
        job.phase = 1;
        job.row = 0;
      }
      return false;
    }
    const j = job.row;
    const z = node.z0 + j * cell;
    for (let i = 0; i < VERTS; i++) {
      const hi = (j + 1) * PAD + i + 1;
      const h = heights[hi];
      const x = node.x0 + i * cell;
      const v = j * VERTS + i;
      job.position[v * 3] = i * cell;
      job.position[v * 3 + 1] = h;
      job.position[v * 3 + 2] = j * cell;
      const nx = heights[hi - 1] - heights[hi + 1];
      const nz = heights[hi - PAD] - heights[hi + PAD];
      const inv = 1 / Math.hypot(nx, 2 * cell, nz);
      job.normal[v * 3] = nx * inv;
      job.normal[v * 3 + 1] = 2 * cell * inv;
      job.normal[v * 3 + 2] = nz * inv;
      sampleGround(x, z, h, cell, sample);
      job.color[v * 3] = sample.r;
      job.color[v * 3 + 1] = sample.g;
      job.color[v * 3 + 2] = sample.b;
      job.mix[v * 4] = Math.round(sample.road * 255);
      job.mix[v * 4 + 1] = Math.round(sample.pad * 255);
      job.mix[v * 4 + 2] = Math.round(Math.min(1, sample.snow) * 255);
      job.mix[v * 4 + 3] = Math.round(Math.min(1, sample.farm) * 255);
      job.murk[v] = Math.round(Math.min(1, sample.swamp * 1.4) * 255);
      if (h < job.minH) job.minH = h;
      if (h > job.maxH) job.maxH = h;
    }
    if (++job.row < VERTS) return false;
    finishJob();
    return true;
  }

  function finishJob() {
    const { node, cell, position, normal, color, mix } = job;
    const skirt = cell * 1.5 + 1.5;
    const base = VERTS * VERTS;
    for (let side = 0; side < 4; side++) {
      for (let k = 0; k < VERTS; k++) {
        const src = edgeVertex(side, k);
        const dst = base + side * VERTS + k;
        position[dst * 3] = position[src * 3];
        position[dst * 3 + 1] = position[src * 3 + 1] - skirt;
        position[dst * 3 + 2] = position[src * 3 + 2];
        for (let c = 0; c < 3; c++) {
          normal[dst * 3 + c] = normal[src * 3 + c];
          color[dst * 3 + c] = color[src * 3 + c];
        }
        for (let c = 0; c < 4; c++) mix[dst * 4 + c] = mix[src * 4 + c];
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geometry.setAttribute('aMix', new THREE.BufferAttribute(mix, 4, true));
    geometry.setIndex(new THREE.BufferAttribute(INDEX_TEMPLATE, 1));
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(0, job.minH - skirt, 0), new THREE.Vector3(node.size, job.maxH, node.size));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(node.x0, 0, node.z0);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.visible = false;
    node.mesh = mesh;
    node.water = null;
    if (job.minH < 0.3) {
      const water = buildWaterPatch(heights, PAD, GRID, cell, job.minH, job.maxH, job.murk, waterMaterial);
      if (water) {
        mesh.add(water);
        node.water = water;
      }
    }
    node.lastUsed = clock;
    built.add(node);
    group.add(mesh);
    mesh.updateMatrixWorld(true);
    job = null;
  }

  function reselect() {
    leaves.length = 0;
    for (let i = 0; i < roots.length; i++) select(roots[i]);
    // forget queued nodes that are no longer wanted leaves, then sort nearest-first
    let n = 0;
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i];
      if (node.inView && !node.wantSplit && !node.mesh) queue[n++] = node; else node.queued = false;
    }
    queue.length = n;
    queue.sort(byDistance);
  }
  function byDistance(a, b) {
    return a.dist - b.dist;
  }
  function refreshVisibility() {
    visibleCount = 0;
    for (let i = 0; i < roots.length; i++) apply(roots[i]);
  }

  let sweepTimer = 0;
  /** Stream terrain around `focus`. Spends at most `budgetMs` of generation work. */
  function update(focus, budgetMs = 2) {
    const now = performance.now();
    const dt = Math.min(0.25, (now - lastTime) / 1000);
    lastTime = now;
    clock += dt;
    let dirty = false;
    if (Math.abs(focus.x - focusX) > 3 || Math.abs(focus.z - focusZ) > 3) {
      focusX = focus.x;
      focusZ = focus.z;
      reselect();
      dirty = true;
    }
    const deadline = now + budgetMs;
    while (performance.now() < deadline) {
      if (!job) {
        if (queue.length === 0) break;
        const node = queue.shift();
        node.queued = false;
        if (node.mesh) continue;
        startJob(node);
      }
      if (stepJob()) dirty = true;
    }
    if (dirty) {
      leaves.length = 0;
      for (let i = 0; i < roots.length; i++) select(roots[i]);
      refreshVisibility();
    }
    sweepTimer += dt;
    if (sweepTimer > 1) {
      sweepTimer = 0;
      for (const node of built) if (node.mesh.visible) node.lastUsed = clock;
      for (let i = 0; i < roots.length; i++) sweep(roots[i]);
    }
  }

  /** True when every wanted terrain node touching the circle is built (use for the loading screen). */
  function readyAround(x, z, radius) {
    if (focusX === Infinity) return false;
    for (let i = 0; i < leaves.length; i++) {
      const node = leaves[i];
      if (!node.mesh && rectDistance(node, x, z) < radius) return false;
    }
    return true;
  }

  function stats() {
    return { nodes: built.size, visible: visibleCount, queued: queue.length + (job ? 1 : 0) };
  }

  function dispose() {
    for (const node of [...built]) disposeNode(node);
    scene.remove(group);
    material.dispose();
    queue.length = 0;
    leaves.length = 0;
    job = null;
  }

  return { update, readyAround, stats, material, dispose };
}
