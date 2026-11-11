// Ambient life: fireflies, falling leaves, butterflies, circling birds, a passing flock and fish splashes.
// Budget: 6 draw calls, < 2k triangles. Fireflies and leaves live in the vertex shader (wrapped volume around the
// camera, zero CPU); butterflies, birds and splashes are small fixed pools updated in place — no per-frame allocation.
import * as THREE from 'three';
import { shared } from './materials.js';
import { atmo } from './sky.js';
import { heightAt, regionAt, waterDepthAt, waterSurfaceAt } from './terrain.js';

// how much each biome likes fireflies / falling leaves / butterflies (0..1)
const LIFE = {
  meadow:     { fire: 0.45, leaf: 0.15, fly: 1.0 },
  farmland:   { fire: 0.3,  leaf: 0.05, fly: 0.8 },
  forest:     { fire: 0.9,  leaf: 1.0,  fly: 0.5 },
  darkforest: { fire: 1.0,  leaf: 0.7,  fly: 0.1 },
  highland:   { fire: 0.1,  leaf: 0.1,  fly: 0.3 },
  mountain:   { fire: 0.0,  leaf: 0.0,  fly: 0.05 },
  snow:       { fire: 0.0,  leaf: 0.0,  fly: 0.0 },
  steppe:     { fire: 0.1,  leaf: 0.0,  fly: 0.25 },
  coast:      { fire: 0.1,  leaf: 0.0,  fly: 0.3 },
  swamp:      { fire: 1.0,  leaf: 0.3,  fly: 0.15 },
  heath:      { fire: 0.3,  leaf: 0.0,  fly: 0.7 },
  lake:       { fire: 0.8,  leaf: 0.5,  fly: 0.8 },
};

const WRAP_GLSL = /* glsl */`
vec3 wrapAround(vec3 p, vec3 centre, vec3 box) {
  return mod(p - centre + box * 0.5, box) - box * 0.5 + centre;
}
`;

const FIREFLY_VERT = /* glsl */`
attribute vec4 aSeed;
uniform vec3 uBox;
uniform vec3 uCentre;
uniform float uTime;
uniform float uAmount;
uniform float uScale;
varying float vGlow;
${WRAP_GLSL}
void main() {
  vec3 p = aSeed.xyz * uBox;
  float t = uTime * (0.25 + aSeed.w * 0.3);
  p += vec3(sin(t + aSeed.x * 40.0), sin(t * 1.3 + aSeed.y * 31.0) * 0.5, cos(t * 0.8 + aSeed.z * 37.0)) * 1.6;
  p = wrapAround(p, uCentre, uBox);
  float blink = smoothstep(0.2, 0.9, sin(uTime * (1.2 + aSeed.w * 2.0) + aSeed.w * 60.0) * 0.5 + 0.5);
  float on = step(fract(aSeed.w * 5.37), uAmount);
  float edge = 1.0 - smoothstep(uBox.x * 0.36, uBox.x * 0.5, length(p.xz - uCentre.xz));
  vGlow = blink * on * edge;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uScale * (0.5 + aSeed.w) * vGlow / max(-mv.z, 0.5);
}
`;
const FIREFLY_FRAG = /* glsl */`
precision highp float;
varying float vGlow;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vec3(1.9, 2.3, 0.7) * (a * a * 1.6 + smoothstep(0.35, 0.0, d) * 2.5) * vGlow, 1.0);
}
`;

const LEAF_VERT = /* glsl */`
attribute vec4 aSeed;
uniform vec3 uBox;
uniform vec3 uCentre;
uniform vec3 uWind;
uniform float uTime;
uniform float uAmount;
varying vec3 vLeafColor;
varying float vLeafAlpha;
${WRAP_GLSL}
void main() {
  float fall = 0.7 + aSeed.w * 0.7;
  vec3 p = aSeed.xyz * uBox + vec3(uWind.x * 1.6, -fall, uWind.z * 1.6) * uTime;
  float t = uTime * (1.2 + aSeed.w) + aSeed.x * 50.0;
  p.xz += vec2(sin(t), cos(t * 0.8)) * 0.6;
  p = wrapAround(p, uCentre, uBox);
  float on = step(fract(aSeed.w * 9.13), uAmount);
  float edge = 1.0 - smoothstep(uBox.x * 0.34, uBox.x * 0.5, length(p.xz - uCentre.xz));
  // tumbling quad
  float spin = t * 2.3;
  vec3 ax = normalize(vec3(cos(spin), sin(spin * 0.7), sin(spin)));
  vec3 ay = normalize(cross(ax, vec3(sin(spin * 0.5), 1.0, cos(spin * 0.5))));
  vec3 wp = p + (ax * position.x + ay * position.y) * 0.11 * on;
  float hue = fract(aSeed.w * 17.1);
  vLeafColor = hue < 0.45 ? vec3(0.62, 0.36, 0.08) : hue < 0.75 ? vec3(0.42, 0.44, 0.10) : vec3(0.55, 0.20, 0.07);
  vLeafAlpha = on * edge;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
const LEAF_FRAG = /* glsl */`
precision highp float;
uniform vec3 uLight;
varying vec3 vLeafColor;
varying float vLeafAlpha;
void main() {
  if (vLeafAlpha < 0.02) discard;
  gl_FragColor = vec4(vLeafColor * uLight, vLeafAlpha);
}
`;

// butterflies and birds share one flapping-wing shader: position.x = signed distance from the body axis
const WING_VERT = /* glsl */`
attribute vec4 aState;   // phase, flap speed, flap amplitude, brightness
uniform float uTime;
varying vec3 vWingColor;
void main() {
  vec3 p = position;
  float flap = sin(uTime * aState.y + aState.x);
  p.y += abs(p.x) * flap * aState.z;
  p.x *= 1.0 - 0.25 * abs(flap) * aState.z;
  #ifdef USE_INSTANCING_COLOR
    vWingColor = instanceColor * aState.w;
  #else
    vWingColor = vec3(aState.w);
  #endif
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
}
`;
const WING_FRAG = /* glsl */`
precision highp float;
uniform vec3 uLight;
varying vec3 vWingColor;
void main() {
  gl_FragColor = vec4(vWingColor * uLight, 1.0);
}
`;

const SPLASH_VERT = /* glsl */`
attribute vec4 aSplash;  // x, surface y, z, start time
uniform float uTime;
varying vec2 vSplashUv;
varying float vSplashAge;
void main() {
  float age = (uTime - aSplash.w) / 1.6;
  vSplashAge = age;
  vSplashUv = position.xz;
  float r = 0.3 + age * 1.9;
  vec3 wp = vec3(aSplash.x + position.x * r, aSplash.y + position.y, aSplash.z + position.z * r);
  if (age < 0.0 || age > 1.0) wp = vec3(0.0, -1000.0, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
const SPLASH_FRAG = /* glsl */`
precision highp float;
uniform vec3 uLight;
varying vec2 vSplashUv;
varying float vSplashAge;
void main() {
  float d = length(vSplashUv);
  float ring = smoothstep(0.62, 0.8, d) * smoothstep(1.0, 0.86, d) + smoothstep(0.3, 0.42, d) * smoothstep(0.56, 0.44, d) * 0.5;
  float a = ring * (1.0 - vSplashAge) * 0.75;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uLight * 0.9, a);
}
`;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

function seedAttribute(count, seed) {
  const data = new Float32Array(count * 4);
  let s = seed >>> 0;
  for (let i = 0; i < data.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    data[i] = s / 4294967296;
  }
  return data;
}

/**
 * Small living details around the player.
 * @param {{scene:THREE.Scene, camera:THREE.Camera, quality:object}} ctx
 * @returns {{update:(dt:number, focus:THREE.Vector3, night:number)=>void, dispose:()=>void}}
 */
export function createAmbientLife(ctx) {
  const { scene, camera, quality } = ctx;
  const group = new THREE.Group();
  group.name = 'ambient-life';
  scene.add(group);
  const light = { value: new THREE.Color(1, 1, 1) };
  const centre = { value: new THREE.Vector3() };
  const disposables = [];

  // ── fireflies ──
  const fireCount = Math.round(260 * quality.particles);
  const fireGeometry = new THREE.BufferGeometry();
  fireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(fireCount * 3), 3));
  fireGeometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seedAttribute(fireCount, 4242), 4));
  const fireUniforms = { uBox: { value: new THREE.Vector3(64, 5, 64) }, uCentre: centre, uTime: shared.uTime, uAmount: { value: 0 }, uScale: { value: 220 } };
  const fireMaterial = new THREE.ShaderMaterial({ uniforms: fireUniforms, vertexShader: FIREFLY_VERT, fragmentShader: FIREFLY_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  const fireflies = new THREE.Points(fireGeometry, fireMaterial);
  fireflies.frustumCulled = false;
  fireflies.renderOrder = 15;
  group.add(fireflies);
  disposables.push(fireGeometry, fireMaterial);

  // ── falling leaves ──
  const leafCount = Math.round(140 * quality.particles);
  const leafGeometry = new THREE.InstancedBufferGeometry();
  leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -0.6, 0, 1, -0.6, 0, -1, 0.6, 0, 1, 0.6, 0], 3));
  leafGeometry.setIndex([0, 1, 2, 1, 3, 2]);
  leafGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedAttribute(leafCount, 777), 4));
  leafGeometry.instanceCount = leafCount;
  const leafUniforms = { uBox: { value: new THREE.Vector3(46, 16, 46) }, uCentre: centre, uWind: shared.uWind, uTime: shared.uTime, uAmount: { value: 0 }, uLight: light };
  const leafMaterial = new THREE.ShaderMaterial({ uniforms: leafUniforms, vertexShader: LEAF_VERT, fragmentShader: LEAF_FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const leaves = new THREE.Mesh(leafGeometry, leafMaterial);
  leaves.frustumCulled = false;
  leaves.renderOrder = 14;
  group.add(leaves);
  disposables.push(leafGeometry, leafMaterial);

  // ── winged things ──
  const wingMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: shared.uTime, uLight: light }, vertexShader: WING_VERT, fragmentShader: WING_FRAG, side: THREE.DoubleSide, fog: false, toneMapped: false });
  disposables.push(wingMaterial);

  function wingedPool(count, positions, indices) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    const state = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    geometry.setAttribute('aState', state);
    const mesh = new THREE.InstancedMesh(geometry, wingMaterial, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) mesh.setColorAt(i, _c.setRGB(1, 1, 1));
    group.add(mesh);
    disposables.push(geometry);
    return { mesh, state };
  }

  // butterflies: two wings, 4 triangles
  const flyCount = Math.max(4, Math.round(18 * quality.particles));
  const flies = wingedPool(flyCount,
    [0, 0, 0.05, 0, 0, -0.05, -0.09, 0, 0.08, -0.09, 0, -0.06, 0.09, 0, 0.08, 0.09, 0, -0.06],
    [0, 1, 2, 1, 3, 2, 0, 4, 1, 1, 4, 5]);
  const flyData = [];
  const FLY_COLORS = [[0.9, 0.85, 0.6], [0.9, 0.55, 0.1], [0.5, 0.6, 0.95], [0.95, 0.95, 0.9], [0.8, 0.3, 0.2]];
  for (let i = 0; i < flyCount; i++) {
    flyData.push({ x: 0, y: 0, z: 0, ax: 0, az: 0, angle: Math.random() * 6.28, radius: 1 + Math.random() * 2.5, speed: 0.6 + Math.random() * 0.8, bob: Math.random() * 6.28, alive: false });
    const c = FLY_COLORS[i % FLY_COLORS.length];
    flies.mesh.setColorAt(i, _c.setRGB(c[0], c[1], c[2]));
    flies.state.setXYZW(i, Math.random() * 6.28, 16 + Math.random() * 8, 0.9, 1);
  }

  // birds: body + two swept wings, 4 triangles; a few circle overhead, the rest fly as a flock
  const circlers = 5;
  const flockSize = Math.max(6, Math.round(14 * quality.particles));
  const birdCount = circlers + flockSize;
  const birds = wingedPool(birdCount,
    [0, 0, 0.35, 0, 0, -0.3, -1.0, 0, -0.1, -0.45, 0, 0.12, 1.0, 0, -0.1, 0.45, 0, 0.12, 0, 0.05, -0.05],
    [0, 3, 6, 3, 2, 6, 6, 2, 1, 0, 6, 5, 5, 6, 4, 6, 1, 4]);
  const birdData = [];
  for (let i = 0; i < birdCount; i++) {
    birdData.push({ cx: 0, cz: 0, radius: 30 + Math.random() * 50, height: 45 + Math.random() * 50, angle: Math.random() * 6.28, speed: (0.12 + Math.random() * 0.1) * (Math.random() < 0.5 ? 1 : -1), ox: 0, oz: 0, oy: 0 });
    birds.mesh.setColorAt(i, _c.setRGB(0.07, 0.08, 0.1));
    birds.state.setXYZW(i, Math.random() * 6.28, i < circlers ? 2.2 + Math.random() : 5.5 + Math.random() * 1.5, i < circlers ? 0.25 : 0.55, 1);
  }
  const flock = { x: 0, z: 0, y: 120, dx: 1, dz: 0, active: false, timer: 4 };
  for (let i = 0; i < flockSize; i++) {
    const row = Math.ceil(i / 2);
    const sideSign = i % 2 === 0 ? 1 : -1;
    const d = birdData[circlers + i];
    d.ox = sideSign * row * 2.6 + (Math.random() - 0.5);
    d.oz = -row * 2.4 + (Math.random() - 0.5);
    d.oy = (Math.random() - 0.5) * 1.5;
  }

  // ── fish splashes ──
  const SPLASHES = 4;
  const splashGeometry = new THREE.InstancedBufferGeometry();
  splashGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0.03, -1, 1, 0.03, -1, -1, 0.03, 1, 1, 0.03, 1], 3));
  splashGeometry.setIndex([0, 2, 1, 1, 2, 3]);
  const splashAttr = new THREE.InstancedBufferAttribute(new Float32Array(SPLASHES * 4).fill(-100), 4);
  splashAttr.setUsage(THREE.DynamicDrawUsage);
  splashGeometry.setAttribute('aSplash', splashAttr);
  splashGeometry.instanceCount = SPLASHES;
  const splashMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: shared.uTime, uLight: light }, vertexShader: SPLASH_VERT, fragmentShader: SPLASH_FRAG, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const splashes = new THREE.Mesh(splashGeometry, splashMaterial);
  splashes.frustumCulled = false;
  splashes.renderOrder = 6;
  group.add(splashes);
  disposables.push(splashGeometry, splashMaterial);
  // the fish itself: a tiny diamond following an arc
  const fishGeometry = new THREE.OctahedronGeometry(1, 0);
  fishGeometry.scale(0.07, 0.09, 0.28);
  const fishMaterial = new THREE.MeshLambertMaterial({ color: 0x8c9aa0 });
  const fish = new THREE.InstancedMesh(fishGeometry, fishMaterial, SPLASHES);
  fish.frustumCulled = false;
  fish.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(fish);
  disposables.push(fishGeometry, fishMaterial);
  const fishData = [];
  for (let i = 0; i < SPLASHES; i++) fishData.push({ x: 0, z: 0, y: 0, yaw: 0, t: 9 });
  let splashTimer = 3;
  let splashNext = 0;

  let biomeTimer = 0;
  let life = LIFE.meadow;
  let fireAmount = 0;
  let leafAmount = 0;
  let flyAmount = 0;

  function respawnButterfly(d, focus) {
    const ang = Math.random() * 6.283;
    const dist = 5 + Math.random() * 22;
    d.ax = focus.x + Math.cos(ang) * dist;
    d.az = focus.z + Math.sin(ang) * dist;
    d.y = heightAt(d.ax, d.az);
    d.alive = d.y > 0.4;
  }

  function update(dt, focus, night) {
    const time = shared.uTime.value;
    biomeTimer -= dt;
    if (biomeTimer <= 0) {
      biomeTimer = 0.8;
      life = LIFE[regionAt(focus.x, focus.z).biome] || LIFE.meadow;
    }
    const dry = 1 - atmo.uWet.value;
    const day = 1 - night;
    const k = Math.min(1, dt * 0.6);
    fireAmount += (life.fire * THREE.MathUtils.smoothstep(night, 0.45, 0.9) * dry - fireAmount) * k;
    leafAmount += (life.leaf * (0.35 + 0.45 * shared.uWind.value.length()) - leafAmount) * k;
    flyAmount += (life.fly * THREE.MathUtils.smoothstep(day, 0.6, 0.95) * dry - flyAmount) * k;
    const amb = atmo.uAmbient.value;
    const sun = atmo.uLightColor.value;
    light.value.setRGB(amb.r * 0.6 + sun.r * 0.22, amb.g * 0.6 + sun.g * 0.22, amb.b * 0.6 + sun.b * 0.22);
    centre.value.set(camera.position.x, focus.y + 2.2, camera.position.z);
    fireUniforms.uAmount.value = fireAmount;
    fireUniforms.uScale.value = 230 * (ctx.renderer ? ctx.renderer.getPixelRatio() : 1);
    fireflies.visible = fireAmount > 0.01;
    leafUniforms.uCentre.value = centre.value;
    leafUniforms.uAmount.value = Math.min(1, leafAmount);
    leaves.visible = leafAmount > 0.01;

    // butterflies wander around anchors on dry ground near the player
    const flyVisible = Math.round(flyAmount * flyCount);
    flies.mesh.count = flyVisible;
    for (let i = 0; i < flyVisible; i++) {
      const d = flyData[i];
      if (!d.alive || Math.hypot(d.ax - focus.x, d.az - focus.z) > 34) respawnButterfly(d, focus);
      d.angle += d.speed * dt * (1 + 0.5 * Math.sin(time * 0.7 + d.bob));
      d.x = d.ax + Math.cos(d.angle) * d.radius + Math.sin(time * 0.9 + d.bob) * 0.8;
      d.z = d.az + Math.sin(d.angle * 1.3) * d.radius;
      const y = d.y + 0.7 + 0.5 * Math.sin(time * 2.1 + d.bob) + 0.3 * Math.sin(time * 5.3 + d.bob * 2);
      _e.set(0.5, -d.angle, 0);
      _m.compose(_p.set(d.x, y, d.z), _q.setFromEuler(_e), _s.set(1.7, 1.7, 1.7));
      flies.mesh.setMatrixAt(i, _m);
    }
    if (flyVisible > 0) flies.mesh.instanceMatrix.needsUpdate = true;

    // birds: circlers drift with the player, the flock crosses the sky now and then
    const birdsOn = day > 0.35 && atmo.uWet.value < 0.6;
    birds.mesh.visible = birdsOn;
    if (birdsOn) {
      for (let i = 0; i < circlers; i++) {
        const d = birdData[i];
        if (Math.hypot(d.cx - focus.x, d.cz - focus.z) > 260) {
          d.cx = focus.x + (Math.random() - 0.5) * 300;
          d.cz = focus.z + (Math.random() - 0.5) * 300;
        }
        d.angle += d.speed * dt;
        const x = d.cx + Math.cos(d.angle) * d.radius;
        const z = d.cz + Math.sin(d.angle) * d.radius;
        const yaw = -d.angle + (d.speed > 0 ? -Math.PI / 2 : Math.PI / 2) + Math.PI / 2;
        _e.set(0, yaw, d.speed > 0 ? 0.35 : -0.35);
        _m.compose(_p.set(x, focus.y + d.height, z), _q.setFromEuler(_e), _s.set(1.1, 1.1, 1.1));
        birds.mesh.setMatrixAt(i, _m);
      }
      flock.timer -= dt;
      if (!flock.active && flock.timer <= 0) {
        const ang = Math.random() * 6.283;
        flock.dx = Math.cos(ang);
        flock.dz = Math.sin(ang);
        flock.x = focus.x - flock.dx * 700 + flock.dz * (Math.random() - 0.5) * 500;
        flock.z = focus.z - flock.dz * 700 - flock.dx * (Math.random() - 0.5) * 500;
        flock.y = focus.y + 90 + Math.random() * 80;
        flock.active = true;
      }
      if (flock.active) {
        flock.x += flock.dx * 15 * dt;
        flock.z += flock.dz * 15 * dt;
        if (Math.hypot(flock.x - focus.x, flock.z - focus.z) > 900) {
          flock.active = false;
          flock.timer = 25 + Math.random() * 50;
        }
      }
      const yaw = Math.atan2(flock.dx, flock.dz);
      _e.set(0, yaw, 0);
      _q.setFromEuler(_e);
      for (let i = 0; i < flockSize; i++) {
        const d = birdData[circlers + i];
        const x = flock.x + flock.dz * d.ox + flock.dx * d.oz;
        const z = flock.z - flock.dx * d.ox + flock.dz * d.oz;
        const y = flock.active ? flock.y + d.oy + Math.sin(time * 0.8 + i) * 0.6 : -1000;
        _m.compose(_p.set(x, y, z), _q, _s.set(0.8, 0.8, 0.8));
        birds.mesh.setMatrixAt(circlers + i, _m);
      }
      birds.mesh.instanceMatrix.needsUpdate = true;
    }

    // fish: try a few random spots, splash where the water is deep enough
    splashTimer -= dt;
    if (splashTimer <= 0) {
      splashTimer = 2.5 + Math.random() * 5;
      for (let attempt = 0; attempt < 5; attempt++) {
        const ang = Math.random() * 6.283;
        const dist = 12 + Math.random() * 55;
        const x = focus.x + Math.cos(ang) * dist;
        const z = focus.z + Math.sin(ang) * dist;
        if (waterDepthAt(x, z) < 0.8) continue;
        const surface = waterSurfaceAt(x, z);
        const i = splashNext++ % SPLASHES;
        splashAttr.setXYZW(i, x, surface, z, time + 0.45);
        splashAttr.needsUpdate = true;
        const f = fishData[i];
        f.x = x; f.z = z; f.y = surface; f.yaw = Math.random() * 6.283; f.t = 0;
        break;
      }
    }
    for (let i = 0; i < SPLASHES; i++) {
      const f = fishData[i];
      f.t += dt;
      const u = f.t / 0.6;
      if (u < 1) {
        const hop = Math.sin(u * Math.PI);
        _e.set((0.5 - u) * 2.2, f.yaw, 0, 'YXZ');
        _m.compose(_p.set(f.x + Math.sin(f.yaw) * (u - 0.5) * 0.9, f.y + hop * 0.55 - 0.1, f.z + Math.cos(f.yaw) * (u - 0.5) * 0.9), _q.setFromEuler(_e), _s.set(1, 1, 1));
      } else {
        _m.makeTranslation(0, -1000, 0);
      }
      fish.setMatrixAt(i, _m);
    }
    fish.instanceMatrix.needsUpdate = true;
  }

  return {
    update,
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
}
