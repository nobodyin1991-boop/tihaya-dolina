// Grass and meadow flowers: two instanced layers of tufts that wrap around the camera (a dense inner disc and a
// sparse outer one), placed entirely in the vertex shader from a small "clipmap" of terrain data around the camera
// (height, density, blade height, flowers, ground colour — 1 m texels, refreshed incrementally as the camera moves).
// Budget: 2 draw calls, ~125k triangles on high (≈30k low, ≈230k ultra), 2 small textures, <= ~1 ms/frame of texel
// refresh while moving and zero when standing still. Grass colour is the terrain colour under it, so the far edge
// of the grass disc melts into the ground. Thins out on roads, pads, rock, snow and under water.
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { sampleGround, makeGroundSample } from './terrain-paint.js';
import { shared } from './materials.js';
import { applyShadowFade } from './sky.js';
import { NOISE_GLSL } from './glsl.js';

const GRASS_VERT_PARS = /* glsl */`
attribute vec4 aSeed;
uniform sampler2D uGrassA;
uniform sampler2D uGrassB;
uniform float uTexSize;
uniform vec2 uCenter;
uniform float uWrap;
uniform float uRadius;
uniform float uTuft;
uniform float uTime;
uniform vec3 uWind;
varying vec3 vGrassColor;
${NOISE_GLSL}
`;

const GRASS_VERT = /* glsl */`
  vec2 gBase = aSeed.xy;
  vec2 gPos = gBase + floor((uCenter - gBase) / uWrap + 0.5) * uWrap;
  vec2 gUv = gPos / uTexSize;
  vec4 gA = texture2D(uGrassA, gUv);
  vec4 gB = texture2D(uGrassB, gUv);
  float gDist = length(gPos - uCenter);
  float gFade = 1.0 - smoothstep(uRadius * 0.66, uRadius, gDist);
  float gHx = texture2D(uGrassA, gUv + vec2(1.0 / uTexSize, 0.0)).x - gA.x;
  float gHz = texture2D(uGrassA, gUv + vec2(0.0, 1.0 / uTexSize)).x - gA.x;
  float gSteep = 1.0 - smoothstep(0.38, 0.72, length(vec2(gHx, gHz)));
  float gSnow = 1.0 - 0.75 * smoothstep(105.0, 185.0, gA.x) - 0.25 * smoothstep(165.0, 200.0, gA.x);
  float gKeep = step(aSeed.z, gA.y) * gFade * gSteep * gSnow * gB.a;
  float gSize = gKeep * gA.z * uTuft * (0.6 + 0.8 * aSeed.w);
  float gBlade = position.z;
  float gT = position.y;
  float gAng = aSeed.z * 43.0 + gBlade * 2.1 + aSeed.w * 9.0;
  vec2 gDir = vec2(cos(gAng), sin(gAng));
  vec2 gSide = vec2(-gDir.y, gDir.x);
  float gH = 0.62 * gSize * (0.75 + 0.5 * fract(aSeed.w * 7.0 + gBlade * 0.37));
  float gFlower = step(1.0 - gA.w * 0.11, fract(aSeed.w * 13.7 + aSeed.z * 3.1));
  float gW = 0.085 * (1.0 - gT * 0.82) * (1.0 + gFlower * step(0.55, gT) * 1.6);
  vec3 transformed = vec3(gPos.x, gA.x - 0.04, gPos.y);
  transformed.xz += gSide * position.x * gW * gSize + gDir * (0.05 + gT * gT * 0.32 * gH + gBlade * 0.05);
  transformed.y += gT * gH;
  float gPh = gPos.x * 0.21 + gPos.y * 0.17;
  float gGust = sin(uTime * 1.7 + gPh) * 0.6 + sin(uTime * 3.1 + gPh * 1.9) * 0.3;
  transformed.xz += uWind.xz * (0.22 + 0.5 * gGust) * gT * gT * gH * 0.9;
  // colour: the ground colour under the tuft (same macro variation as the terrain shader), dark root -> light tip
  float gLow = wFbm3(gPos * 0.0125);
  float gDry = smoothstep(0.52, 0.82, wNoise(gPos * 0.031 + 40.0));
  vec3 gGround = gB.rgb * gB.rgb * (0.84 + 0.32 * gLow);
  gGround *= mix(vec3(0.90, 1.03, 0.92), vec3(1.13, 1.03, 0.80), smoothstep(0.25, 0.75, wNoise(gPos * 0.0041 + 7.0)));
  gGround = mix(gGround, gGround * vec3(1.17, 1.07, 0.80), gDry * 0.42);
  vec3 gCol = mix(gGround * 0.62, gGround * (1.25 + 0.3 * aSeed.w), gT);
  float gHue = fract(aSeed.w * 31.3);
  vec3 gPetal = gHue < 0.4 ? vec3(0.85, 0.82, 0.70) : gHue < 0.68 ? vec3(0.86, 0.62, 0.10) : gHue < 0.86 ? vec3(0.42, 0.22, 0.62) : vec3(0.70, 0.13, 0.12);
  gCol = mix(gCol, gPetal, gFlower * step(0.55, gT));
  vGrassColor = gCol;
`;

function createGrassMaterial(uniforms, receiveShadows) {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + GRASS_VERT_PARS)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', GRASS_VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrassColor;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vGrassColor, opacity );')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
    if (receiveShadows) applyShadowFade(shader);
  };
  material.customProgramCacheKey = () => 'grass' + (receiveShadows ? 1 : 0);
  return material;
}

function buildTuftGeometry(blades, spacing, wrap) {
  // one blade = 5 vertices / 3 triangles; position = (side -1..1, height 0..1, blade index)
  const position = [];
  const index = [];
  for (let b = 0; b < blades; b++) {
    const base = position.length / 3;
    position.push(-1, 0, b, 1, 0, b, -1, 0.5, b, 1, 0.5, b, 0, 1, b);
    index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index);
  const side = Math.max(1, Math.round(wrap / spacing));
  const step = wrap / side;
  const seeds = new Float32Array(side * side * 4);
  let s = 12345;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const o = (j * side + i) * 4;
      seeds[o] = (i + rnd()) * step;
      seeds[o + 1] = (j + rnd()) * step;
      seeds[o + 2] = rnd();
      seeds[o + 3] = rnd();
    }
  }
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = side * side;
  return geometry;
}

/**
 * Grass around the camera.
 * @param {{scene:THREE.Scene, camera:THREE.Camera, quality:object}} ctx
 * @returns {{update:(dt:number, focus:THREE.Vector3, budgetMs?:number)=>void, pending:()=>number, dispose:()=>void}}
 */
export function createGroundCover(ctx) {
  const { scene, camera, quality } = ctx;
  const radius = quality.grassRadius;
  let size = 64;
  while (size < radius * 2 + 24) size *= 2;
  const mask = size - 1;

  // clipmap storage: A = height, density, blade height, flowers; B = ground colour (sqrt-encoded), valid flag
  const dataA = new Float32Array(size * size * 4);
  const dataB = new Uint8Array(size * size * 4);
  const stampX = new Int32Array(size * size).fill(0x7fffffff);
  const stampZ = new Int32Array(size * size).fill(0x7fffffff);
  const dirty = new Uint8Array(size * size);
  const texA = new THREE.DataTexture(dataA, size, size, THREE.RGBAFormat, THREE.FloatType);
  texA.wrapS = THREE.RepeatWrapping;
  texA.wrapT = THREE.RepeatWrapping;
  texA.magFilter = THREE.LinearFilter;
  texA.minFilter = THREE.LinearFilter;
  texA.needsUpdate = true;
  const texB = new THREE.DataTexture(dataB, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texB.wrapS = THREE.RepeatWrapping;
  texB.wrapT = THREE.RepeatWrapping;
  texB.magFilter = THREE.LinearFilter;
  texB.minFilter = THREE.LinearFilter;
  texB.needsUpdate = true;

  // window texel offsets sorted nearest-first, so the refresh fills from the centre outwards
  const half = size / 2;
  const scanOrder = new Int16Array(size * size * 2);
  {
    const list = [];
    for (let j = -half; j < half; j++) for (let i = -half; i < half; i++) list.push([i, j, i * i + j * j]);
    list.sort((a, b) => a[2] - b[2]);
    for (let k = 0; k < list.length; k++) {
      scanOrder[k * 2] = list[k][0];
      scanOrder[k * 2 + 1] = list[k][1];
    }
  }

  const center = new THREE.Vector2();
  const innerRadius = Math.min(radius, 20);
  const innerCenter = new THREE.Vector2();
  const common = { uGrassA: { value: texA }, uGrassB: { value: texB }, uTexSize: { value: size }, uTime: shared.uTime, uWind: shared.uWind };
  const outerUniforms = { ...common, uCenter: { value: center }, uWrap: { value: radius * 2 }, uRadius: { value: radius }, uTuft: { value: 1.45 } };
  const innerUniforms = { ...common, uCenter: { value: innerCenter }, uWrap: { value: innerRadius * 2 }, uRadius: { value: innerRadius }, uTuft: { value: 1.0 } };

  const spacing = 1 / Math.sqrt(quality.grassDensity);
  const meshes = [];
  const addLayer = (uniforms, blades, layerSpacing, wrap) => {
    const mesh = new THREE.Mesh(buildTuftGeometry(blades, layerSpacing, wrap), createGrassMaterial(uniforms, quality.grassShadows));
    mesh.name = 'grass';
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = quality.grassShadows;
    scene.add(mesh);
    meshes.push(mesh);
  };
  addLayer(outerUniforms, 2, spacing * 1.85, radius * 2);
  if (radius > innerRadius) addLayer(innerUniforms, 3, spacing, innerRadius * 2);

  const sample = makeGroundSample();
  const forward = new THREE.Vector3();
  let windowX = 0x7fffffff;
  let windowZ = 0x7fffffff;
  let scanPos = scanOrder.length;
  let pendingCount = 0;

  function shiftWindow(cx, cz) {
    windowX = cx;
    windowZ = cz;
    for (let j = -half; j < half; j++) {
      const wz = cz + j;
      const row = (wz & mask) * size;
      for (let i = -half; i < half; i++) {
        const wx = cx + i;
        const slot = row + (wx & mask);
        if (stampX[slot] === wx && stampZ[slot] === wz) continue;
        stampX[slot] = wx;
        stampZ[slot] = wz;
        if (!dirty[slot]) {
          dirty[slot] = 1;
          pendingCount++;
        }
        dataA[slot * 4 + 1] = 0;
        dataB[slot * 4 + 3] = 0;
      }
    }
    scanPos = 0;
    texA.needsUpdate = true;
    texB.needsUpdate = true;
  }

  function fillTexel(slot, wx, wz) {
    const x = wx + 0.5;
    const z = wz + 0.5;
    const h = heightAt(x, z);
    sampleGround(x, z, h, 1, sample);
    const o = slot * 4;
    dataA[o] = h;
    dataA[o + 1] = h < 0.15 ? 0 : sample.grass;
    dataA[o + 2] = sample.grassH;
    dataA[o + 3] = sample.flowers;
    // blend the turf colour towards the biome's grass-tip hue (heather goes purple, steppe straw-yellow)
    dataB[o] = Math.min(255, Math.sqrt(sample.r * 0.6 + sample.tr * 0.32) * 255);
    dataB[o + 1] = Math.min(255, Math.sqrt(sample.g * 0.6 + sample.tg * 0.32) * 255);
    dataB[o + 2] = Math.min(255, Math.sqrt(sample.b * 0.6 + sample.tb * 0.32) * 255);
    dataB[o + 3] = 255;
  }

  function update(dt, focus, budgetMs = 1) {
    camera.getWorldDirection(forward);
    const fl = Math.hypot(forward.x, forward.z) || 1;
    const fx = forward.x / fl;
    const fz = forward.z / fl;
    const px = camera.position.x;
    const pz = camera.position.z;
    // the disc sits ahead of the camera so most of it is in view
    center.set(px + fx * radius * 0.42, pz + fz * radius * 0.42);
    innerCenter.set(px + fx * innerRadius * 0.55, pz + fz * innerRadius * 0.55);
    const cx = Math.round(center.x / 4) * 4;
    const cz = Math.round(center.y / 4) * 4;
    if (cx !== windowX || cz !== windowZ) shiftWindow(cx, cz);

    if (pendingCount > 0) {
      const deadline = performance.now() + budgetMs;
      let touched = false;
      let checks = 0;
      while (scanPos < scanOrder.length / 2) {
        const wx = windowX + scanOrder[scanPos * 2];
        const wz = windowZ + scanOrder[scanPos * 2 + 1];
        scanPos++;
        const slot = (wz & mask) * size + (wx & mask);
        if (!dirty[slot]) continue;
        dirty[slot] = 0;
        pendingCount--;
        fillTexel(slot, wx, wz);
        touched = true;
        if ((++checks & 15) === 0 && performance.now() >= deadline) break;
      }
      if (scanPos >= scanOrder.length / 2) pendingCount = 0;
      if (touched) {
        texA.needsUpdate = true;
        texB.needsUpdate = true;
      }
    }
  }

  return {
    update,
    pending: () => (pendingCount > 0 ? 1 : 0),
    dispose() {
      for (const mesh of meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      texA.dispose();
      texB.dispose();
    },
  };
}
