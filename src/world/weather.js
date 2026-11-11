// Weather effects near the camera: wind (shared.uWind), ground wetness (atmo.uWet) and precipitation.
// Budget: 1 draw call — instanced streaks (quality.rainCount instances, 2 triangles each) that live entirely in the
// vertex shader (wrapped box around the camera), so there is no per-frame CPU work and no allocation.
// Rain turns into snow in the snow biome / at high altitude; Ледяные пики get light flurries even in fair weather.
// Clouds, fog density, light dimming and lightning are driven by sky.js from the same weather name.
import * as THREE from 'three';
import { shared } from './materials.js';
import { atmo } from './sky.js';
import { regionAt } from './terrain.js';

// wind strength, rain intensity, how fast the ground gets wet
const WEATHER = {
  clear:  { wind: 0.45, rain: 0.0 },
  cloudy: { wind: 0.75, rain: 0.0 },
  rain:   { wind: 1.0,  rain: 0.75 },
  fog:    { wind: 0.15, rain: 0.0 },
  storm:  { wind: 1.55, rain: 1.0 },
};

const RAIN_VERT = /* glsl */`
attribute vec4 aSeed;
uniform vec3 uBox;
uniform vec3 uVelocity;
uniform float uTime;
uniform float uIntensity;
uniform vec2 uShape;     // streak length, half width
varying float vAlpha;
varying float vAlong;
void main() {
  vec3 vel = uVelocity * vec3(1.0, 0.8 + 0.4 * aSeed.w, 1.0);
  vec3 p = aSeed.xyz * uBox + vel * uTime;
  p = mod(p - cameraPosition + uBox * 0.5, uBox) - uBox * 0.5 + cameraPosition;
  vec3 dir = normalize(vel);
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  vec3 side = normalize(cross(dir, toCam));
  float on = step(fract(aSeed.w * 7.31), uIntensity);
  vec3 wp = p + dir * position.y * uShape.x * on + side * position.x * uShape.y * on;
  vAlong = position.y;
  vAlpha = on * smoothstep(uBox.x * 0.5, uBox.x * 0.32, dist) * smoothstep(0.6, 2.5, dist);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const RAIN_FRAG = /* glsl */`
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying float vAlong;
void main() {
  float a = vAlpha * uOpacity * (1.0 - abs(vAlong * 2.0 - 1.0));
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

/**
 * Wind, wetness and precipitation.
 * @param {{scene:THREE.Scene, camera:THREE.Camera, quality:object}} ctx
 * @returns {{update:(dt:number, weather:string, focus:THREE.Vector3, night:number)=>void, wind:THREE.Vector3,
 *   rain:number, snow:number, dispose:()=>void}}
 */
export function createWeather(ctx) {
  const { scene, quality } = ctx;
  const count = quality.rainCount;
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  const seeds = new Float32Array(count * 4);
  let s = 987654321;
  for (let i = 0; i < seeds.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    seeds[i] = s / 4294967296;
  }
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = count;

  const uniforms = {
    uBox: { value: new THREE.Vector3(44, 30, 44) },
    uVelocity: { value: new THREE.Vector3(0, -24, 0) },
    uTime: shared.uTime,
    uIntensity: { value: 0 },
    uShape: { value: new THREE.Vector2(0.9, 0.012) },
    uColor: { value: new THREE.Color(0.6, 0.68, 0.8) },
    uOpacity: { value: 0.5 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'precipitation';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 20;
  mesh.visible = false;
  scene.add(mesh);

  const wind = shared.uWind.value;
  let windAngle = Math.atan2(wind.z, wind.x);
  let windStrength = wind.length();
  let rain = 0;
  let snowiness = 0;
  let biomeTimer = 0;
  let snowBiome = false;
  let clock = 0;

  const api = {
    update,
    wind,
    /** Current precipitation 0..1 (audio can follow it). */
    rain: 0,
    /** 0 = rain, 1 = snow. */
    snow: 0,
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };

  function update(dt, weather, focus) {
    const target = WEATHER[weather] || WEATHER.clear;
    clock += dt;
    biomeTimer -= dt;
    if (biomeTimer <= 0) {
      biomeTimer = 0.7;
      snowBiome = regionAt(focus.x, focus.z).biome === 'snow';
    }
    // wind: slowly veering direction, breathing strength
    windAngle += dt * 0.02 * Math.sin(clock * 0.05);
    const gust = 1 + 0.22 * Math.sin(clock * 0.31) + 0.12 * Math.sin(clock * 0.83 + 1.7);
    windStrength += (target.wind * gust - windStrength) * Math.min(1, dt * 0.5);
    wind.set(Math.cos(windAngle) * windStrength, 0, Math.sin(windAngle) * windStrength);

    // precipitation: rain by weather, flurries in the snow biome
    const high = snowBiome || focus.y > 185;
    const wantRain = Math.max(target.rain, snowBiome ? 0.3 : 0);
    rain += (wantRain - rain) * Math.min(1, dt * 0.4);
    snowiness += ((high ? 1 : 0) - snowiness) * Math.min(1, dt * 0.8);
    api.rain = rain;
    api.snow = snowiness;
    mesh.visible = rain > 0.01;
    uniforms.uIntensity.value = rain;
    const fall = 24 + (1.7 - 24) * snowiness;
    const drift = 5 + (2.2 - 5) * snowiness;
    uniforms.uVelocity.value.set(wind.x * drift, -fall, wind.z * drift);
    uniforms.uShape.value.set(0.95 + (0.07 - 0.95) * snowiness, 0.011 + (0.035 - 0.011) * snowiness);
    uniforms.uOpacity.value = 0.42 + 0.45 * snowiness;
    // streaks pick up the ambient light so they do not glow at night
    const amb = atmo.uAmbient.value;
    const k = 0.75 + 0.6 * snowiness;
    uniforms.uColor.value.setRGB((amb.r + 0.06) * k, (amb.g + 0.07) * k, (amb.b + 0.09) * k);

    // the ground soaks in ~15 s of rain and dries in about a minute (snow does not wet it)
    const wetTarget = target.rain > 0 && !high ? 1 : 0;
    const rate = wetTarget > atmo.uWet.value ? 0.07 : 0.018;
    atmo.uWet.value += Math.sign(wetTarget - atmo.uWet.value) * Math.min(Math.abs(wetTarget - atmo.uWet.value), rate * dt);
  }

  return api;
}
