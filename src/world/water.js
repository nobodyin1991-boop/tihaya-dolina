// Water: sea / lake / swamp surface at y = 0 and the river ribbon.
// Budget: sea patches ride on terrain nodes (1 draw call per visible node that touches water, <= ~2k triangles each,
// 2 triangles for open-sea nodes), + 1 call for the river ribbon (~11k triangles) + 1 for the far ocean frame.
// Depth-based colour and shore foam come from per-vertex depth baked from the SAME heights as the terrain node,
// so the shoreline always matches the visible ground at every LOD. No render targets, no textures.
import * as THREE from 'three';
import { RIVER } from '../data/world-map.js';
import { RIVER_SAMPLES, heightAt } from './terrain.js';
import { shared } from './materials.js';
import { atmo, ATMO_GLSL } from './sky.js';
import { NOISE_GLSL } from './glsl.js';

const WATER_VERT = /* glsl */`
attribute float aDepth;
attribute float aMurk;
varying float vDepth;
varying float vMurk;
varying vec3 vWorld;
#ifdef RIVER
  attribute vec4 aRiver;   // across (m), along (m), flow dir x, flow dir z
  attribute float aRapid;
  varying vec4 vRiver;
  varying float vRapid;
#endif
void main() {
  vDepth = aDepth;
  vMurk = aMurk;
  #ifdef RIVER
    vRiver = aRiver;
    vRapid = aRapid;
  #endif
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WATER_FRAG = /* glsl */`
precision highp float;
varying float vDepth;
varying float vMurk;
varying vec3 vWorld;
#ifdef RIVER
  varying vec4 vRiver;
  varying float vRapid;
#endif
${ATMO_GLSL}
${NOISE_GLSL}
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform float uTime;
uniform float uWet;

float waterH(vec2 p, float t, float fine) {
  float h = wNoise(p * 0.22 + vec2(t * 0.20, t * 0.13));
  #if WATER_DETAIL >= 1
    h += wNoise(p * 0.63 + vec2(-t * 0.27, t * 0.31)) * 0.45 * fine;
  #endif
  #if WATER_DETAIL >= 2
    h += wNoise(p * 1.9 + vec2(t * 0.5, -t * 0.42)) * 0.2 * fine;
  #endif
  return h;
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float fine = 1.0 - smoothstep(60.0, 420.0, dist);
  float t = uTime;
  #ifdef RIVER
    vec2 p = vec2(vRiver.x, vRiver.y - t * 2.4);
    float tt = t * 0.4;
  #else
    vec2 p = vWorld.xz;
    float tt = t;
  #endif
  float e = 0.4;
  float h0 = waterH(p, tt, fine);
  float hx = waterH(p + vec2(e, 0.0), tt, fine);
  float hz = waterH(p + vec2(0.0, e), tt, fine);
  float strength = mix(0.10, 0.42, fine) * (1.0 + 0.6 * uWet);
  vec2 slope = vec2(h0 - hx, h0 - hz) / e * strength;
  #ifdef RIVER
    vec2 fwd = normalize(vRiver.zw);
    vec2 right = vec2(fwd.y, -fwd.x);
    slope = right * slope.x + fwd * slope.y;
  #endif
  // rain pocks
  slope += (vec2(wNoise(vWorld.xz * 9.0 + t * 3.1), wNoise(vWorld.zx * 9.0 - t * 2.7)) - 0.5) * 0.35 * uWet * fine;
  vec3 n = normalize(vec3(slope.x, 1.0, slope.y));

  float depth = max(vDepth, 0.0);
  float ndv = max(dot(n, V), 0.0);
  float fresnel = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, n);
  R.y = abs(R.y);
  vec3 refl = skyBase(normalize(R));

  vec3 shallow = mix(vec3(0.075, 0.30, 0.27), vec3(0.13, 0.14, 0.05), vMurk);
  vec3 mid = mix(vec3(0.026, 0.150, 0.215), vec3(0.06, 0.08, 0.03), vMurk);
  vec3 deep = mix(vec3(0.008, 0.045, 0.085), vec3(0.025, 0.035, 0.018), vMurk);
  vec3 body = mix(shallow, mid, 1.0 - exp(-depth * 0.75));
  body = mix(body, deep, 1.0 - exp(-depth * 0.16));
  vec3 light = uAmbient * 0.5 + uLightColor * (0.16 * max(uLightDir.y, 0.0));
  body *= light;

  vec3 col = mix(body, refl, fresnel);
  float alpha = 1.0 - exp(-depth * mix(1.5, 3.2, vMurk)) * 0.86;
  alpha = max(alpha, fresnel);

  // sun / moon glitter
  #if WATER_DETAIL >= 1
    vec3 H = normalize(uLightDir + V);
    float nh = max(dot(n, H), 0.0);
    float spec = pow(nh, 260.0) * 2.6 + pow(nh, 36.0) * 0.10;
    col += uLightColor * spec * (1.0 - vMurk * 0.6);
  #endif

  // foam: breaking band along the shore
  float lap = sin(depth * 8.0 - t * 1.5 + wNoise(p * 0.21) * 6.283) * 0.5 + 0.5;
  float band = smoothstep(0.55, 0.04, depth);
  float foam = band * smoothstep(0.42, 0.78, wNoise(p * 2.3 + vec2(t * 0.25, -t * 0.2)) * 0.75 + lap * 0.3 + band * 0.25);
  foam *= 1.0 - vMurk * 0.85;
  #ifdef RIVER
    float streak = wNoise(vec2(vRiver.x * 0.85, (vRiver.y - t * 3.4) * 0.22)) * 0.7 + wNoise(vec2(vRiver.x * 2.4, (vRiver.y - t * 4.2) * 0.6)) * 0.3;
    foam = max(foam * 0.6, vRapid * smoothstep(0.52, 0.8, streak) * 0.9);
  #endif
  foam *= fine * 0.75 + 0.25;
  col = mix(col, light * 1.5, foam);
  alpha = max(alpha, foam * 0.9);

  alpha *= smoothstep(0.0, 0.07, vDepth);
  gl_FragColor = vec4(col, alpha);
}
`;

let materials = null;

/** Shared water materials (created once; `quality.waterDetail` of the first caller decides the shader variant). */
export function waterMaterials(quality) {
  if (materials) return materials;
  const detail = quality ? quality.waterDetail : 2;
  const uniforms = {
    uSunDir: atmo.uSunDir,
    uMoonDir: atmo.uMoonDir,
    uZenith: atmo.uZenith,
    uHorizon: atmo.uHorizon,
    uSunGlow: atmo.uSunGlow,
    uMoonGlow: atmo.uMoonGlow,
    uLightDir: atmo.uLightDir,
    uLightColor: atmo.uLightColor,
    uAmbient: atmo.uAmbient,
    uWet: atmo.uWet,
    uTime: shared.uTime,
  };
  const make = defines => new THREE.ShaderMaterial({
    uniforms,
    defines: { WATER_DETAIL: detail, ...defines },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
    fog: false,
    toneMapped: false,
  });
  materials = { sea: make({}), river: make({ RIVER: 1 }) };
  return materials;
}

/**
 * Sea-level water for one terrain node, in the node's local frame. `heights` is the node's padded height grid
 * (`pad` samples per row, one-cell border), `grid` cells per side of `cell` metres. Returns a Mesh or null.
 * @param {Float32Array} heights @param {number} pad @param {number} grid @param {number} cell
 * @param {number} minH @param {number} maxH @param {Uint8Array} murk per-vertex murkiness 0..255 ((grid+1)^2)
 * @param {THREE.Material} material
 */
export function buildWaterPatch(heights, pad, grid, cell, minH, maxH, murk, material) {
  const verts = grid + 1;
  const size = grid * cell;
  const geometry = new THREE.BufferGeometry();
  if (maxH < -5) {
    // open water: one quad is enough, depth saturates the colour ramp anyway
    const corner = (i, j) => -heights[(j + 1) * pad + i + 1];
    const m = (murk[0] + murk[grid] + murk[grid * verts] + murk[verts * verts - 1]) / (4 * 255);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, size, 0, 0, 0, 0, size, size, 0, size], 3));
    geometry.setAttribute('aDepth', new THREE.Float32BufferAttribute([corner(0, 0), corner(grid, 0), corner(0, grid), corner(grid, grid)], 1));
    geometry.setAttribute('aMurk', new THREE.Float32BufferAttribute([m, m, m, m], 1));
    geometry.setIndex([0, 2, 1, 1, 2, 3]);
  } else {
    const remap = new Int32Array(verts * verts).fill(-1);
    const position = [];
    const depth = [];
    const murkOut = [];
    const index = [];
    const use = (i, j) => {
      const v = j * verts + i;
      if (remap[v] < 0) {
        remap[v] = position.length / 3;
        position.push(i * cell, 0, j * cell);
        depth.push(Math.min(40, -heights[(j + 1) * pad + i + 1]));
        murkOut.push(murk[v] / 255);
      }
      return remap[v];
    };
    for (let j = 0; j < grid; j++) {
      for (let i = 0; i < grid; i++) {
        const h00 = heights[(j + 1) * pad + i + 1];
        const h10 = heights[(j + 1) * pad + i + 2];
        const h01 = heights[(j + 2) * pad + i + 1];
        const h11 = heights[(j + 2) * pad + i + 2];
        if (Math.min(h00, h10, h01, h11) > 0.25) continue;
        const a = use(i, j);
        const b = use(i + 1, j);
        const c = use(i, j + 1);
        const d = use(i + 1, j + 1);
        index.push(a, c, b, b, c, d);
      }
    }
    if (index.length === 0) {
      geometry.dispose();
      return null;
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    geometry.setAttribute('aMurk', new THREE.Float32BufferAttribute(murkOut, 1));
    geometry.setIndex(index);
  }
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(size, 0.1, size));
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'water-patch';
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 2;
  return mesh;
}

function buildRiverGeometry() {
  const half = RIVER.width / 2 + 5.5;
  const across = [-1, -0.78, -0.45, 0, 0.45, 0.78, 1];
  const S = RIVER_SAMPLES;
  const position = [];
  const depth = [];
  const river = [];
  const rapid = [];
  const murk = [];
  const index = [];
  const cols = across.length;
  for (let i = 0; i < S.length; i++) {
    const a = S[Math.max(0, i - 1)];
    const b = S[Math.min(S.length - 1, i + 1)];
    let fx = b.x - a.x;
    let fz = b.z - a.z;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len;
    fz /= len;
    const grade = Math.abs(a.v - b.v) / len;
    const rapidAmount = THREE.MathUtils.clamp((grade - 0.012) / 0.03, 0.12, 1);
    const p = S[i];
    for (let k = 0; k < cols; k++) {
      const off = across[k] * half;
      const x = p.x + fz * off;
      const z = p.z - fx * off;
      position.push(x, p.v, z);
      // the ribbon dives under the sea surface where the river reaches sea level
      depth.push(Math.min(p.v - heightAt(x, z), p.v < 0.45 ? (p.v - 0.1) * 0.4 : 40));
      river.push(off, p.s, fx, fz);
      rapid.push(rapidAmount);
      murk.push(0.12);
    }
    if (i > 0) {
      const r0 = (i - 1) * cols;
      const r1 = i * cols;
      for (let k = 0; k < cols - 1; k++) index.push(r0 + k, r1 + k, r0 + k + 1, r0 + k + 1, r1 + k, r1 + k + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
  geometry.setAttribute('aRiver', new THREE.Float32BufferAttribute(river, 4));
  geometry.setAttribute('aRapid', new THREE.Float32BufferAttribute(rapid, 1));
  geometry.setAttribute('aMurk', new THREE.Float32BufferAttribute(murk, 1));
  geometry.setIndex(index);
  return geometry;
}

function buildOceanFrame() {
  // four big quads around the terrain coverage [-4096, 4096] so the sea runs to the horizon
  const inner = 4096;
  const outer = 40000;
  const rects = [
    [-outer, -outer, outer, -inner], [-outer, inner, outer, outer],
    [-outer, -inner, -inner, inner], [inner, -inner, outer, inner],
  ];
  const position = [];
  const index = [];
  for (const [x0, z0, x1, z1] of rects) {
    const base = position.length / 3;
    position.push(x0, 0, z0, x1, 0, z0, x0, 0, z1, x1, 0, z1);
    index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  const count = position.length / 3;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('aDepth', new THREE.Float32BufferAttribute(new Array(count).fill(30), 1));
  geometry.setAttribute('aMurk', new THREE.Float32BufferAttribute(new Array(count).fill(0), 1));
  geometry.setIndex(index);
  return geometry;
}

/**
 * River ribbon + far ocean. Sea/lake/swamp patches are attached to terrain nodes by terrain-mesh.js.
 * @param {{scene:THREE.Scene, quality:object}} ctx
 * @returns {{update:(dt:number, focus:THREE.Vector3)=>void, dispose:()=>void}}
 */
export function createWater(ctx) {
  const { scene, quality } = ctx;
  const mats = waterMaterials(quality);
  const group = new THREE.Group();
  group.name = 'water';

  const river = new THREE.Mesh(buildRiverGeometry(), mats.river);
  river.name = 'river';
  river.renderOrder = 3;
  river.matrixAutoUpdate = false;
  group.add(river);

  const ocean = new THREE.Mesh(buildOceanFrame(), mats.sea);
  ocean.name = 'ocean-frame';
  ocean.renderOrder = 2;
  ocean.frustumCulled = false;
  ocean.matrixAutoUpdate = false;
  group.add(ocean);
  scene.add(group);

  return {
    /** Water animates from shared.uTime; nothing to do per frame (kept for the engine's uniform update loop). */
    update() {},
    dispose() {
      scene.remove(group);
      river.geometry.dispose();
      ocean.geometry.dispose();
    },
  };
}
