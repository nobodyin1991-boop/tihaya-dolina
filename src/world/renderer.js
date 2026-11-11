// WebGL renderer + post chain of the world.
// Budget per frame on top of the scene: 1 fullscreen atmosphere pass (fog + AO composite), optional half-res AO pass,
// UnrealBloom (5 half-res mips), 1 final pass (ACES + grade + vignette + sRGB + dither), optional FXAA.
// Chain (EffectComposer): WorldPass [scene -> MSAA HDR target with depth -> (AO) -> height fog / aerial perspective]
//   -> UnrealBloomPass -> FinalPass -> (FXAA when MSAA is off).
// The scene is rendered once; AO and fog read the resolved depth texture, so they work with every material.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { QUALITY, qualityByName } from './quality.js';
import { atmo, ATMO_GLSL } from './sky.js';
import { shared } from './materials.js';
import { NOISE_GLSL } from './glsl.js';

const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const VIEWPOS_GLSL = /* glsl */`
uniform sampler2D tDepth;
uniform mat4 uInvProj;
vec3 viewPosAt(vec2 uv) {
  float depth = textureLod(tDepth, uv, 0.0).x;
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 view = uInvProj * clip;
  return view.xyz / view.w;
}
`;

// Alchemy-style ambient occlusion from depth only (normals are rebuilt from the depth buffer).
const AO_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform vec2 uTexel;       // 1 / depth texture size
// depth is point-sampled, so rebuild positions at exact depth-texel centres (otherwise flat ground seen at a
// grazing angle occludes itself in stripes)
vec3 viewPosAt(vec2 uv) {
  uv = (floor(uv / uTexel) + 0.5) * uTexel;
  float depth = textureLod(tDepth, uv, 0.0).x;
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 view = uInvProj * clip;
  return view.xyz / view.w;
}
uniform float uProjScale;  // projection[1][1]
uniform float uAspect;
#ifndef AO_SAMPLES
  #define AO_SAMPLES 10
#endif
const float RADIUS = 1.5;
void main() {
  // this half-res pixel sits on a corner of four depth texels: pick one of them robustly
  vec2 c = (floor(vUv / uTexel - 0.5) + 0.5) * uTexel;
  vec3 p = viewPosAt(c);
  float dist = -p.z;
  if (dist > 220.0 || textureLod(tDepth, c, 0.0).x >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  // geometric normal from the nearer pair of neighbours on each axis (keeps silhouettes clean)
  vec3 pl = viewPosAt(c - vec2(uTexel.x, 0.0));
  vec3 pr = viewPosAt(c + vec2(uTexel.x, 0.0));
  vec3 pd = viewPosAt(c - vec2(0.0, uTexel.y));
  vec3 pu = viewPosAt(c + vec2(0.0, uTexel.y));
  vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
  vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
  vec3 nRaw = cross(dx, dy);
  float nLen = length(nRaw);
  if (nLen < 1e-12) { gl_FragColor = vec4(1.0); return; }
  vec3 n = nRaw / nLen;
  float screenR = min(RADIUS * uProjScale * 0.5 / dist, 0.11);
  float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float sum = 0.0;
  for (int i = 0; i < AO_SAMPLES; i++) {
    float fi = float(i);
    float ang = (fi + noise) * 2.399963;
    float r = sqrt((fi + 0.5) / float(AO_SAMPLES)) * screenR;
    vec2 uv = c + vec2(cos(ang) / uAspect, sin(ang)) * r;
    vec3 v = viewPosAt(uv) - p;
    float d2 = dot(v, v);
    float range = clamp(1.0 - d2 / (RADIUS * RADIUS * 4.0), 0.0, 1.0);
    sum += max(dot(v, n) - 0.012 * dist - 0.02, 0.0) / (d2 + 0.02) * range;
  }
  float ao = clamp(1.0 - sum * 2.2 / float(AO_SAMPLES), 0.0, 1.0);
  ao = mix(ao, 1.0, smoothstep(120.0, 220.0, dist));
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}
`;

// Height fog + aerial perspective + AO composite. The fog colour is the sky colour behind the pixel.
const ATMO_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
${VIEWPOS_GLSL}
${ATMO_GLSL}
${NOISE_GLSL}
uniform sampler2D tColor;
uniform sampler2D tAO;
uniform vec2 uAOTexel;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform vec4 uFog;
uniform float uTime;
uniform float uFlash;
void main() {
  vec4 src = texture2D(tColor, vUv);
  float depth = texture2D(tDepth, vUv).x;
  if (depth >= 0.99999) { gl_FragColor = src; return; }
  vec3 col = src.rgb;
  col = min(max(col, vec3(0.0)), vec3(64.0));   // a single NaN/inf pixel would smear through the whole bloom chain
  #ifdef USE_AO
    float ao = texture2D(tAO, vUv + uAOTexel * vec2(-0.5, -0.5)).r + texture2D(tAO, vUv + uAOTexel * vec2(0.5, -0.5)).r
             + texture2D(tAO, vUv + uAOTexel * vec2(-0.5, 0.5)).r + texture2D(tAO, vUv + uAOTexel * vec2(0.5, 0.5)).r;
    ao *= 0.25;
    col *= mix(vec3(0.20, 0.24, 0.32), vec3(1.0), ao);     // occlusion goes cool, not black
  #endif
  vec3 vp = viewPosAt(vUv);
  vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
  vec3 ray = wp - uCamPos;
  float dist = length(ray);
  vec3 rd = ray / max(dist, 1e-4);
  // aerial haze, thinner around high peaks so snow caps keep their silhouette
  float hAtt = exp(-max(wp.y - 60.0, 0.0) * 0.0032);
  float hz = dist * uFog.x * mix(0.5, 1.0, hAtt);
  float haze = 1.0 - exp(-hz * hz);
  // low mist: analytic exponential height fog with slow drifting banks
  float b = uFog.z;
  float dy = abs(rd.y) < 1e-4 ? 1e-4 : rd.y;
  float camH = clamp((uCamPos.y - uFog.w) * b, -4.0, 40.0);
  float mistInt = uFog.y * exp(-camH) * (1.0 - exp(-dist * dy * b)) / (dy * b);
  float bank = 0.55 + 0.9 * wNoise(wp.xz * 0.0045 + vec2(uTime * 0.012, uTime * 0.007));
  float mist = 1.0 - exp(-max(mistInt, 0.0) * bank);
  float fog = 1.0 - (1.0 - haze) * (1.0 - mist);
  vec3 fd = normalize(vec3(rd.x, max(rd.y, 0.0), rd.z));
  vec3 fogCol = skyBase(fd) + vec3(0.55, 0.62, 0.8) * uFlash * 0.35;
  col = mix(col, fogCol, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, src.a);
}
`;

// ACES (same fit as three.js) + gentle filmic grade + vignette + sRGB + dither, in one pass.
const FINAL_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uExposure;
uniform float uGrade;
uniform float uNight;
vec3 wAcesFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 acesFilmic(vec3 color) {
  const mat3 W_ACES_IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 W_ACES_OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= uExposure / 0.6;
  color = W_ACES_IN * color;
  color = wAcesFit(color);
  color = W_ACES_OUT * color;
  return clamp(color, 0.0, 1.0);
}
void main() {
  vec3 c = acesFilmic(max(texture2D(tDiffuse, vUv).rgb, 0.0));
  if (uGrade > 0.0) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 g = c;
    // slightly desaturated greens: pull pure greens towards an olive grey
    float greenish = clamp((g.g - max(g.r, g.b)) * 4.0, 0.0, 1.0);
    g = mix(g, vec3(l) * vec3(1.03, 1.0, 0.90), greenish * 0.22);
    g = mix(vec3(l), g, mix(1.04, 0.78, uNight));   // moonlight is nearly colourless
    // split toning: teal shadows, warm highlights (cooler at night)
    vec3 shadowTint = mix(vec3(0.90, 1.0, 1.07), vec3(0.86, 0.96, 1.12), uNight);
    vec3 highTint = mix(vec3(1.06, 1.005, 0.92), vec3(1.0, 1.0, 1.0), uNight);
    g *= mix(shadowTint, highTint, smoothstep(0.04, 0.62, l));
    // soft S-curve
    g = mix(g, g * g * (3.0 - 2.0 * g), 0.22);
    // vignette
    vec2 q = vUv - 0.5;
    g *= 1.0 - smoothstep(0.18, 0.95, dot(q, q) * 1.9) * 0.42;
    c = mix(c, g, uGrade);
  }
  c = clamp(c, 0.0, 1.0);
  vec3 srgb = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  gl_FragColor = vec4(srgb + dither / 255.0, 1.0);
}
`;

/** Scene render into an MSAA HDR target with a depth texture, then AO + atmosphere into the composer chain. */
class WorldPass extends Pass {
  constructor(scene, camera, preset) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = true;
    this.sceneCalls = 0;
    this.sceneTriangles = 0;
    this.sceneTarget = null;
    this.aoTarget = null;
    this.width = 1;
    this.height = 1;
    this.aoMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        uInvProj: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2() },
        uProjScale: { value: 1 },
        uAspect: { value: 1 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: AO_FRAG,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    });
    this.atmoMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        tAO: { value: null },
        uAOTexel: { value: new THREE.Vector2() },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uTime: shared.uTime,
        uSunDir: atmo.uSunDir,
        uMoonDir: atmo.uMoonDir,
        uZenith: atmo.uZenith,
        uHorizon: atmo.uHorizon,
        uSunGlow: atmo.uSunGlow,
        uMoonGlow: atmo.uMoonGlow,
        uFog: atmo.uFog,
        uFlash: atmo.uFlash,
      },
      vertexShader: QUAD_VERT,
      fragmentShader: ATMO_FRAG,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.atmoMaterial);
    this.applyPreset(preset);
  }

  applyPreset(preset) {
    this.preset = preset;
    this.aoMaterial.defines = { AO_SAMPLES: preset.name === 'ultra' ? 14 : 10 };
    this.aoMaterial.needsUpdate = true;
    this.atmoMaterial.defines = preset.ao ? { USE_AO: 1 } : {};
    this.atmoMaterial.needsUpdate = true;
    this.rebuildTargets();
  }

  rebuildTargets() {
    if (this.sceneTarget) {
      this.sceneTarget.depthTexture.dispose();
      this.sceneTarget.dispose();
    }
    if (this.aoTarget) {
      this.aoTarget.dispose();
      this.aoTarget = null;
    }
    const depthTexture = new THREE.DepthTexture(this.width, this.height);
    depthTexture.type = THREE.UnsignedIntType;
    depthTexture.minFilter = THREE.NearestFilter;
    depthTexture.magFilter = THREE.NearestFilter;
    this.sceneTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.HalfFloatType,
      samples: this.preset.msaa,
      depthTexture,
      depthBuffer: true,
      stencilBuffer: false,
    });
    if (this.preset.ao) {
      const w = Math.max(1, Math.ceil(this.width / 2));
      const h = Math.max(1, Math.ceil(this.height / 2));
      this.aoTarget = new THREE.WebGLRenderTarget(w, h, { format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: false });
      this.atmoMaterial.uniforms.uAOTexel.value.set(1 / w, 1 / h);
    }
    this.aoMaterial.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
  }

  setSize(width, height) {
    if (width === this.width && height === this.height) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.rebuildTargets();
  }

  render(renderer, writeBuffer) {
    const camera = this.camera;
    renderer.setRenderTarget(this.sceneTarget);
    renderer.clear();
    renderer.render(this.scene, camera);
    this.sceneCalls = renderer.info.render.calls;
    this.sceneTriangles = renderer.info.render.triangles;

    const depth = this.sceneTarget.depthTexture;
    if (this.preset.ao) {
      const ao = this.aoMaterial.uniforms;
      ao.tDepth.value = depth;
      ao.uInvProj.value.copy(camera.projectionMatrixInverse);
      ao.uProjScale.value = camera.projectionMatrix.elements[5];
      ao.uAspect.value = this.width / this.height;
      this.quad.material = this.aoMaterial;
      renderer.setRenderTarget(this.aoTarget);
      this.quad.render(renderer);
    }
    const u = this.atmoMaterial.uniforms;
    u.tColor.value = this.sceneTarget.texture;
    u.tDepth.value = depth;
    u.tAO.value = this.aoTarget ? this.aoTarget.texture : null;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    this.quad.material = this.atmoMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.sceneTarget.depthTexture.dispose();
    this.sceneTarget.dispose();
    if (this.aoTarget) this.aoTarget.dispose();
    this.aoMaterial.dispose();
    this.atmoMaterial.dispose();
    this.quad.dispose();
  }
}

function readGpuName(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    return String(gl.getParameter(gl.RENDERER));
  } catch {
    return 'unknown';
  }
}

/**
 * Create the renderer, scene, camera and post chain.
 * @param {{canvas:HTMLCanvasElement, quality:('low'|'medium'|'high'|'ultra'|object)}} options
 * @returns {{renderer:THREE.WebGLRenderer, scene:THREE.Scene, camera:THREE.PerspectiveCamera, composer:EffectComposer,
 *   quality:object, render:(dt:number)=>void, resize:()=>void, setQuality:(name:string)=>object, gpuName:string,
 *   info:()=>{calls:number, triangles:number, fps:number, frameMs:number, geometries:number, textures:number}, dispose:()=>void}}
 */
export function createRenderer({ canvas, quality = 'high' }) {
  let preset = typeof quality === 'string' ? qualityByName(quality) : (quality || QUALITY.high);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,                 // MSAA lives on the HDR scene target instead
    powerPreference: 'high-performance',
    alpha: false,
    stencil: false,
    depth: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; // applied by FinalPass (ACES fit identical to three's)
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  const gpuName = readGpuName(renderer.getContext());

  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.3, preset.viewDistance * 1.12 + 150);
  camera.position.set(0, 30, 60);

  const composer = new EffectComposer(renderer);
  const worldPass = new WorldPass(scene, camera, preset);
  composer.addPass(worldPass);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.34, 0.6, 1.4);
  composer.addPass(bloomPass);
  const finalPass = new ShaderPass(new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uExposure: { value: 1 }, uGrade: { value: 1 }, uNight: shared.uNight },
    vertexShader: QUAD_VERT,
    fragmentShader: FINAL_FRAG,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  }));
  composer.addPass(finalPass);
  const fxaaPass = new ShaderPass(FXAAShader);
  composer.addPass(fxaaPass);

  let fpsSmoothed = 60;
  let frameMs = 16;

  function applyPreset() {
    bloomPass.enabled = !!preset.bloom;
    fxaaPass.enabled = !!preset.fxaa && preset.msaa === 0;
    finalPass.uniforms.uGrade.value = preset.grade ? 1 : 0;
    renderer.shadowMap.enabled = preset.shadowMapSize > 0;
    camera.far = preset.viewDistance * 1.12 + 150;
    camera.updateProjectionMatrix();
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth || canvas.width);
    const height = Math.max(1, canvas.clientHeight || canvas.height);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    fxaaPass.material.uniforms.resolution.value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  /** Render one frame. `dt` (seconds) only feeds the fps estimate; the engine advances shared.uTime itself. */
  function render(dt) {
    renderer.info.reset();
    finalPass.uniforms.uExposure.value = renderer.toneMappingExposure * (1 + 0.55 * shared.uNight.value);   // eyes adapt at night
    composer.render(dt);
    if (dt > 0) {
      frameMs += (dt * 1000 - frameMs) * 0.08;
      fpsSmoothed = 1000 / Math.max(frameMs, 0.01);
    }
  }

  /**
   * Switch the renderer-side settings (resolution, MSAA, AO, bloom, far plane). World systems read their numbers
   * from the preset at creation, so the engine should recreate them (or reload the world) after changing quality.
   */
  function setQuality(name) {
    preset = qualityByName(name);
    api.quality = preset;
    worldPass.applyPreset(preset);
    applyPreset();
    resize();
    return preset;
  }

  function info() {
    return {
      calls: worldPass.sceneCalls,
      triangles: worldPass.sceneTriangles,
      fps: Math.round(fpsSmoothed),
      frameMs,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    };
  }

  function dispose() {
    worldPass.dispose();
    bloomPass.dispose();
    finalPass.material.dispose();
    fxaaPass.material.dispose();
    composer.dispose();
    renderer.dispose();
  }

  const api = { renderer, scene, camera, composer, quality: preset, render, resize, setQuality, gpuName, info, dispose };
  applyPreset();
  resize();
  return api;
}
