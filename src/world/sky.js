// Sky, sun/moon light and the shared atmosphere state («Янтарь и сумрак»: amber sun, teal haze, blue night).
// Budget: 1 draw call (sky dome, ~1k triangles, drawn last among opaques so hidden pixels cost nothing),
// 1 directional light with ONE shadow map that follows the focus, 1 hemisphere light. No per-frame allocations.
//
// Distance fog is NOT scene.fog: renderer.js applies height fog + aerial perspective as a post pass using the
// `atmo` uniforms and `ATMO_GLSL` below, so every material of every module is fogged consistently and the fog
// colour is, by construction, the colour of the sky behind the fogged pixel.
import * as THREE from 'three';
import { shared } from './materials.js';
import { NOISE_GLSL } from './glsl.js';

/** Atmosphere uniforms shared by the sky dome, the post fog pass, water and vegetation shaders. */
export const atmo = {
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.3).normalize() },   // towards the sun (may be below the horizon)
  uMoonDir: { value: new THREE.Vector3(-0.3, 0.6, -0.4).normalize() },
  uLightDir: { value: new THREE.Vector3(0.3, 0.8, 0.3).normalize() }, // towards the active light (sun or moon)
  uLightColor: { value: new THREE.Color(3, 2.8, 2.4) },               // active light colour * intensity
  uZenith: { value: new THREE.Color(0.09, 0.25, 0.6) },
  uHorizon: { value: new THREE.Color(0.46, 0.67, 0.8) },
  uSunGlow: { value: new THREE.Color(0.35, 0.32, 0.26) },
  uMoonGlow: { value: new THREE.Color(0, 0, 0) },
  uAmbient: { value: new THREE.Color(0.4, 0.5, 0.6) },                // hemisphere sky colour * intensity
  uFog: { value: new THREE.Vector4(0.0008, 0.004, 0.03, 0) },         // x: haze density, y: mist density, z: mist falloff, w: mist base height
  uNight: shared.uNight,
  uCloudCover: { value: 0.4 },
  uWet: { value: 0 },                                                 // 0 dry .. 1 soaked (set by weather.js)
  uFlash: { value: 0 },                                               // lightning 0..1
  uShadowFade: { value: 100 },                                        // sun shadows fade out at this view distance
};

const SHADOW_CALL = /directLight\.color \*= \( directLight\.visible && receiveShadow \) \? (getShadow\( directionalShadowMap[^;]+\)) : 1\.0;/;

/**
 * Patch a lit material's fragment shader (inside onBeforeCompile) so the sun shadow fades out towards the edge of
 * the shadow box instead of ending in a hard line. Needs the `vViewPosition` varying (standard/lambert/phong have it).
 */
export function applyShadowFade(shader) {
  shader.uniforms.uShadowFade = atmo.uShadowFade;
  const chunk = THREE.ShaderChunk.lights_fragment_begin.replace(SHADOW_CALL,
    'directLight.color *= ( directLight.visible && receiveShadow ) ? mix( 1.0, $1, 1.0 - smoothstep( uShadowFade * 0.72, uShadowFade, length( vViewPosition ) ) ) : 1.0;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uShadowFade;')
    .replace('#include <lights_fragment_begin>', chunk);
}

/** GLSL: atmosphere uniforms + skyBase(dir) — the sky gradient without sun disc, stars and clouds. */
export const ATMO_GLSL = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunGlow;
uniform vec3 uMoonGlow;
vec3 skyBase(vec3 d) {
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.42));
  float sd = max(dot(d, uSunDir), 0.0);
  float low = 1.0 - 0.7 * smoothstep(0.0, 0.6, h);
  col += uSunGlow * (pow(sd, 4.0) * 0.55 * low + pow(sd, 48.0) * 0.6);
  float md = max(dot(d, uMoonDir), 0.0);
  col += uMoonGlow * (pow(md, 6.0) * 0.4 + pow(md, 90.0));
  return col;
}
`;

// Keyframes over sun elevation e = sunDir.y. Colours are linear scene-referred values.
const KEYS = [
  { e: -0.30, zen: [0.006, 0.013, 0.038], hor: [0.020, 0.040, 0.078], glow: [0, 0, 0],          sun: [1.0, 0.45, 0.16], sunI: 0.0, sky: [0.16, 0.25, 0.50], gnd: [0.05, 0.065, 0.10], hemiI: 2.0 },
  { e: -0.10, zen: [0.020, 0.040, 0.115], hor: [0.130, 0.105, 0.150], glow: [0.55, 0.20, 0.07], sun: [1.0, 0.40, 0.14], sunI: 0.0, sky: [0.26, 0.28, 0.48], gnd: [0.10, 0.085, 0.10], hemiI: 2.0 },
  { e: 0.00,  zen: [0.065, 0.125, 0.320], hor: [0.600, 0.350, 0.215], glow: [1.70, 0.66, 0.17], sun: [1.0, 0.44, 0.15], sunI: 2.4, sky: [0.36, 0.36, 0.54], gnd: [0.23, 0.15, 0.11],   hemiI: 2.0 },
  { e: 0.15,  zen: [0.095, 0.235, 0.520], hor: [0.720, 0.590, 0.440], glow: [1.25, 0.72, 0.30], sun: [1.0, 0.70, 0.40], sunI: 3.1, sky: [0.42, 0.50, 0.68], gnd: [0.27, 0.20, 0.14],   hemiI: 1.9 },
  { e: 0.40,  zen: [0.095, 0.265, 0.600], hor: [0.500, 0.680, 0.780], glow: [0.50, 0.42, 0.30], sun: [1.0, 0.90, 0.74], sunI: 3.3, sky: [0.45, 0.60, 0.82], gnd: [0.27, 0.24, 0.17],   hemiI: 2.3 },
  { e: 0.90,  zen: [0.085, 0.245, 0.600], hor: [0.450, 0.660, 0.800], glow: [0.36, 0.33, 0.27], sun: [1.0, 0.94, 0.82], sunI: 3.4, sky: [0.45, 0.60, 0.84], gnd: [0.28, 0.25, 0.18],   hemiI: 2.4 },
];

// Weather targets: cloud cover, overcast (grey-out), sky flattening, light dimming, visibility in metres (0 = view distance).
const WEATHER = {
  clear:  { cover: 0.36, overcast: 0.0,  flat: 0.0,  dim: 1.0,  vis: 0,   mist: 1.0, dark: 0.0 },
  cloudy: { cover: 0.72, overcast: 0.55, flat: 0.3,  dim: 0.6,  vis: 0,   mist: 1.2, dark: 0.1 },
  rain:   { cover: 0.95, overcast: 0.88, flat: 0.6,  dim: 0.32, vis: 750, mist: 1.8, dark: 0.3 },
  fog:    { cover: 0.60, overcast: 0.70, flat: 0.92, dim: 0.42, vis: 230, mist: 5.0, dark: 0.05 },
  storm:  { cover: 1.00, overcast: 1.0,  flat: 0.7,  dim: 0.16, vis: 520, mist: 2.2, dark: 0.55 },
};

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
${ATMO_GLSL}
${NOISE_GLSL}
uniform vec3 uSunDisc;
uniform vec3 uCloudLit;
uniform vec3 uCloudDark;
uniform float uCloudCover;
uniform float uNight;
uniform float uFlash;
uniform float uSkyTime;
uniform vec2 uCloudWind;

float starField(vec3 d) {
  vec2 uv = d.xz / (1.0 + abs(d.y)) * 170.0;
  vec2 cell = floor(uv);
  vec2 rnd = wHash2(cell);
  if (rnd.x < 0.93) return 0.0;
  vec2 p = fract(uv) - 0.5 - (wHash2(cell + 7.7) - 0.5) * 0.7;
  float size = 0.03 + 0.07 * rnd.y;
  float tw = 0.75 + 0.25 * sin(uSkyTime * (1.5 + rnd.y * 3.0) + rnd.y * 40.0);
  return smoothstep(size, 0.0, length(p)) * tw * (0.4 + 1.6 * rnd.y * rnd.y);
}

// returns vec2(alpha, shade): shade 0 = sun-lit rim, 1 = thick dark core
vec2 cloudLayer(vec3 d, float scale, vec2 offset, float cover) {
  vec2 uv = d.xz / (d.y + 0.11) * scale + offset;
  float n = wFbm(uv);
  float edge = mix(0.80, 0.22, cover);
  float alpha = smoothstep(edge, edge + 0.26, n);
  // density a little further towards the sun: thick there = this spot is in shade
  float n2 = wFbm3(uv + uSunDir.xz * 0.35);
  float shade = clamp(smoothstep(edge, edge + 0.55, n) * 0.75 + (n2 - n) * 1.6 + 0.12, 0.0, 1.0);
  return vec2(alpha, shade);
}

void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyBase(d);
  float above = smoothstep(-0.015, 0.02, d.y);

  // stars and moon (hidden by daylight and clouds)
  float cloudHide = 0.0;
  vec3 extra = vec3(0.0);
  if (uNight > 0.02) {
    extra += vec3(0.75, 0.85, 1.0) * starField(d) * uNight * smoothstep(0.0, 0.25, d.y) * 1.3;
  }
  float md = dot(d, uMoonDir);
  if (md > 0.9985) {
    vec3 mx = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 my = cross(mx, uMoonDir);
    vec2 mp = vec2(dot(d, mx), dot(d, my)) / 0.035;
    float r2 = dot(mp, mp);
    if (r2 < 1.0) {
      vec3 n = vec3(mp, sqrt(1.0 - r2));
      float lit = smoothstep(-0.25, 0.35, dot(n, normalize(vec3(0.55, 0.3, 0.6))));
      float mare = 0.82 + 0.18 * wNoise(mp * 2.6 + 3.0);
      float rim = smoothstep(1.0, 0.82, r2);
      extra = mix(extra, vec3(0.95, 0.97, 1.0) * (0.10 + 1.5 * lit) * mare, rim) * mix(0.25, 1.0, uNight);
    }
  }

  // sun disc with a hot core (bloom picks it up)
  float sd = dot(d, uSunDir);
  float disc = smoothstep(0.99950, 0.99972, sd);
  extra += uSunDisc * (disc + pow(max(sd, 0.0), 900.0) * 0.5);

  // clouds
  vec3 cloudCol = vec3(0.0);
  float cloudA = 0.0;
  if (d.y > 0.0) {
    float fade = smoothstep(0.0, 0.16, d.y);
    vec2 c1 = cloudLayer(d, 0.55, uCloudWind * uSkyTime * 0.006, uCloudCover);
    #ifdef CLOUD_LAYERS_2
      vec2 c2 = cloudLayer(d, 1.35, uCloudWind * uSkyTime * 0.011 + 31.7, uCloudCover * 0.85);
      float a2 = c2.x * 0.7;
      c1 = vec2(c1.x + a2 * (1.0 - c1.x), mix(c2.y, c1.y, c1.x / max(c1.x + a2, 1e-3)));
    #endif
    float sunSide = pow(max(sd, 0.0), 6.0);
    vec3 lit = uCloudLit + uSunGlow * sunSide * 1.4;
    cloudCol = mix(lit, uCloudDark, c1.y);
    cloudCol += uSunGlow * sunSide * (1.0 - c1.y) * (1.0 - c1.x) * 2.0;   // glowing thin edges near the sun
    cloudCol = mix(skyBase(vec3(d.x, 0.0, d.z)), cloudCol, fade);         // sink into the haze at the horizon
    cloudA = c1.x * fade;
    cloudHide = cloudA;
  }

  col += extra * (1.0 - cloudHide) * above;
  col = mix(col, cloudCol, cloudA);
  col += vec3(0.55, 0.62, 0.8) * uFlash * (0.35 + 0.65 * cloudA);
  gl_FragColor = vec4(col, 1.0);
}
`;

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _snapped = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function lerpKey(e, field, out) {
  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = THREE.MathUtils.clamp((e - a.e) / (b.e - a.e), 0, 1);
  const va = a[field];
  const vb = b[field];
  if (typeof va === 'number') return va + (vb - va) * t;
  out.setRGB(va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t, va[2] + (vb[2] - va[2]) * t);
  return out;
}

function luminance(c) {
  return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
}

/**
 * Sky dome, sun/moon light with a focus-following shadow map, hemisphere fill and the atmosphere uniforms.
 * @param {{scene:THREE.Scene, camera:THREE.Camera, renderer:THREE.WebGLRenderer, quality:object}} ctx
 * @returns {{update:(dt:number, hour:number, weather:string, focus:THREE.Vector3)=>void, sunDir:THREE.Vector3, night:number,
 *   sunLight:THREE.DirectionalLight, hemiLight:THREE.HemisphereLight, flash:number, dispose:()=>void}}
 */
export function createSky(ctx) {
  const { scene, camera, quality } = ctx;

  const uniforms = {
    ...atmo,
    uSunDisc: { value: new THREE.Color(10, 8, 5) },
    uCloudLit: { value: new THREE.Color(1, 1, 1) },
    uCloudDark: { value: new THREE.Color(0.4, 0.45, 0.55) },
    uSkyTime: { value: 0 },
    uCloudWind: { value: new THREE.Vector2(1, 0.35) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    defines: quality.cloudLayers >= 2 ? { CLOUD_LAYERS_2: 1 } : {},
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), material);
  dome.name = 'sky-dome';
  dome.frustumCulled = false;
  dome.renderOrder = 1000;          // last among opaques: only pixels nothing else covered run the cloud shader
  dome.matrixAutoUpdate = false;
  scene.add(dome);

  const sunLight = new THREE.DirectionalLight(0xffffff, 3);
  sunLight.name = 'sun';
  const shadowsOn = quality.shadowMapSize > 0;
  sunLight.castShadow = shadowsOn;
  if (shadowsOn) {
    const d = quality.shadowDistance;
    sunLight.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 900;
    sunLight.shadow.camera.updateProjectionMatrix();
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = (2 * d / quality.shadowMapSize) * 1.6;
  }
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  hemiLight.name = 'sky-fill';
  scene.add(hemiLight);

  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();
  // smoothed weather state
  const w = { cover: 0.36, overcast: 0, flat: 0, dim: 1, vis: 0, mist: 1, dark: 0 };
  let weatherInit = false;
  let flashTimer = 6;
  let flash = 0;
  let flashPulse = 0;

  const api = {
    update,
    sunDir,
    night: 0,
    flash: 0,
    sunLight,
    hemiLight,
    /** Shadow fade distance used by terrain/grass shaders (metres from the focus). */
    shadowDistance: shadowsOn ? quality.shadowDistance : 0,
    dispose() {
      scene.remove(dome, sunLight, sunLight.target, hemiLight);
      dome.geometry.dispose();
      material.dispose();
      if (sunLight.shadow.map) sunLight.shadow.map.dispose();
    },
  };

  function update(dt, hour, weather, focus) {
    const target = WEATHER[weather] || WEATHER.clear;
    const k = weatherInit ? 1 - Math.exp(-dt * 0.35) : 1;
    weatherInit = true;
    w.cover += (target.cover - w.cover) * k;
    w.overcast += (target.overcast - w.overcast) * k;
    w.flat += (target.flat - w.flat) * k;
    w.dim += (target.dim - w.dim) * k;
    w.mist += (target.mist - w.mist) * k;
    w.dark += (target.dark - w.dark) * k;
    const visTarget = target.vis > 0 ? Math.min(target.vis, quality.viewDistance) : quality.viewDistance;
    w.vis = w.vis === 0 ? visTarget : w.vis + (visTarget - w.vis) * k;

    // sun and moon paths: sunrise in the east (+x) at 6h, culminates in the south (+z), sets in the west at 18h
    const a = (hour - 6) / 24 * Math.PI * 2;
    sunDir.set(Math.cos(a), Math.sin(a) + 0.1, 0.38).normalize();   // +0.1: the day is a little longer than the night
    moonDir.set(-Math.cos(a) * 0.9, -Math.sin(a) * 0.85 + 0.12, -0.42).normalize();
    const e = sunDir.y;
    const night = THREE.MathUtils.smoothstep(-e, -0.08, 0.2);
    api.night = night;
    shared.uNight.value = night;
    atmo.uSunDir.value.copy(sunDir);
    atmo.uMoonDir.value.copy(moonDir);

    // lightning
    if (weather === 'storm') {
      flashTimer -= dt;
      if (flashTimer <= 0) {
        flashTimer = 3.5 + Math.random() * 11;
        flashPulse = 0.0001;
      }
    }
    if (flashPulse > 0) {
      flashPulse += dt;
      const p = flashPulse;
      flash = Math.max(Math.exp(-p * 9), p > 0.16 ? 0.8 * Math.exp(-(p - 0.16) * 7) : 0);
      if (p > 1.2) { flashPulse = 0; flash = 0; }
    }
    api.flash = flash;
    atmo.uFlash.value = flash;

    // palette
    const zen = atmo.uZenith.value;
    const hor = atmo.uHorizon.value;
    lerpKey(e, 'zen', zen);
    lerpKey(e, 'hor', hor);
    lerpKey(e, 'glow', atmo.uSunGlow.value);
    const greyK = (1 - 0.5 * w.dark);
    const grey = luminance(hor) * 0.95 * greyK;
    _c1.setRGB(grey * 0.86, grey * 0.93, grey * 1.02);
    hor.lerp(_c1, w.overcast * 0.9);
    const greyZ = luminance(zen) * 1.5 * greyK;
    _c1.setRGB(greyZ * 0.84, greyZ * 0.92, greyZ * 1.04);
    zen.lerp(_c1, w.overcast * 0.9);
    zen.lerp(hor, w.flat);
    atmo.uSunGlow.value.multiplyScalar((1 - w.overcast) * (1 - w.overcast));
    atmo.uCloudCover.value = w.cover;

    // lights: sun by day, moon by night, a shadowless twilight in between
    const sunF = THREE.MathUtils.smoothstep(e, -0.035, 0.09) * w.dim;
    const moonUp = THREE.MathUtils.smoothstep(moonDir.y, 0.0, 0.2);
    const moonF = THREE.MathUtils.smoothstep(-e, 0.05, 0.2) * moonUp * (0.35 + 0.65 * w.dim);
    const useSun = e > -0.04;
    const lightDir = useSun ? sunDir : moonDir;
    if (useSun) {
      lerpKey(e, 'sun', sunLight.color);
      sunLight.intensity = lerpKey(Math.max(e, 0), 'sunI') * sunF;
    } else {
      sunLight.color.setRGB(0.42, 0.58, 1.0);
      sunLight.intensity = 1.3 * moonF;
    }
    atmo.uLightDir.value.copy(lightDir);
    atmo.uLightColor.value.copy(sunLight.color).multiplyScalar(sunLight.intensity);
    atmo.uMoonGlow.value.setRGB(0.10, 0.15, 0.26).multiplyScalar(night * moonUp * (1 - w.overcast));

    lerpKey(e, 'sky', hemiLight.color);
    lerpKey(e, 'gnd', hemiLight.groundColor);
    const hemiGrey = luminance(hemiLight.color);
    _c1.setRGB(hemiGrey * 0.9, hemiGrey * 0.97, hemiGrey * 1.06);
    hemiLight.color.lerp(_c1, w.overcast * 0.7);
    hemiLight.intensity = lerpKey(e, 'hemiI') * (1 - 0.22 * w.overcast) * (1 - 0.45 * w.dark) + flash * 2.2;
    atmo.uAmbient.value.copy(hemiLight.color).multiplyScalar(hemiLight.intensity);

    // sun disc and cloud colours
    lerpKey(Math.max(e, 0), 'sun', _c1);
    uniforms.uSunDisc.value.copy(_c1).multiplyScalar(14 * THREE.MathUtils.smoothstep(e, -0.06, 0.02) * (1 - w.overcast) * (1 - w.overcast));
    const litI = 0.30 + 0.95 * sunF + 0.10 * moonF;
    _c2.copy(useSun ? _c1 : sunLight.color).lerp(_c1.setRGB(1, 1, 1), 0.35);
    uniforms.uCloudLit.value.copy(_c2).multiplyScalar(litI * (useSun ? 1 : 0.35)).lerp(hor, 0.25);
    uniforms.uCloudDark.value.copy(zen).lerp(hor, 0.6).multiplyScalar(0.62 * (1 - 0.5 * w.dark) + 0.1);
    uniforms.uSkyTime.value += dt;
    const wind = shared.uWind.value;
    uniforms.uCloudWind.value.set(wind.x, wind.z);

    // fog: haze density from visibility; morning/evening mist pools in the lowlands
    const dawnMist = 1 + 1.6 * THREE.MathUtils.smoothstep(0.32 - Math.abs(e - 0.02), 0, 0.3);
    atmo.uFog.value.set(1.9 / w.vis, 0.0016 * w.mist * dawnMist, 0.028, 0);

    // sky dome rides with the camera
    const r = camera.far * 0.92;
    dome.matrix.makeScale(r, r, r).setPosition(camera.position);
    dome.matrixWorld.copy(dome.matrix);

    // shadow box follows the focus, snapped to whole shadow texels so the edges do not shimmer when walking
    if (shadowsOn) {
      const texel = 2 * quality.shadowDistance / quality.shadowMapSize;
      _right.crossVectors(WORLD_UP, lightDir).normalize();
      _up.crossVectors(lightDir, _right).normalize();
      const fx = focus.dot(_right);
      const fy = focus.dot(_up);
      _snapped.copy(focus)
        .addScaledVector(_right, Math.round(fx / texel) * texel - fx)
        .addScaledVector(_up, Math.round(fy / texel) * texel - fy);
      sunLight.target.position.copy(_snapped);
      sunLight.position.copy(_snapped).addScaledVector(lightDir, 420);
      sunLight.castShadow = sunLight.intensity > 0.02;
    } else {
      sunLight.target.position.copy(focus);
      sunLight.position.copy(focus).addScaledVector(lightDir, 420);
    }
    sunLight.target.updateMatrixWorld();
  }

  return api;
}
