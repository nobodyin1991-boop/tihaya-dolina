// Pooled combat / world effects. Everything is pre-allocated: additive ribbons, quads and point sprites,
// instanced text billboards on one canvas atlas. No per-frame allocation; call update(dt) once per frame.
import * as THREE from 'three';
import { PALETTE as P, glowMat } from '../world/materials.js';
import { tube, rod, slab, fuse, actorMat } from './rig.js';

const TAIL = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';
const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

function shaderMat(vertex, fragment, uniforms, additive = true) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex, fragmentShader: fragment, uniforms,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// ————————————————————————————————————————————————— particles —————————————————————————————————————————————————
function makeParticles(capacity, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(capacity * 3);
  const col = new Float32Array(capacity * 3);
  const misc = new Float32Array(capacity * 2);   // size (m), alpha
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aMisc', new THREE.BufferAttribute(misc, 2).setUsage(THREE.DynamicDrawUsage));
  const mat = shaderMat(`
    attribute vec3 aColor; attribute vec2 aMisc; uniform float uScale; varying vec3 vColor; varying float vAlpha;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aMisc.x * uScale / max(0.1, -mv.z);
      vColor = aColor; vAlpha = aMisc.y;
    }`, `
    varying vec3 vColor; varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, ${additive ? '0.05' : '0.3'}, d) * vAlpha;
      if (a < 0.004) discard;
      gl_FragColor = vec4(vColor${additive ? ' * a' : ''}, a);${TAIL}
    }`, { uScale: { value: 600 } }, additive);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = additive ? 12 : 11;
  const vel = new Float32Array(capacity * 3);
  const life = new Float32Array(capacity);
  const maxLife = new Float32Array(capacity);
  const size0 = new Float32Array(capacity);
  const size1 = new Float32Array(capacity);
  const grav = new Float32Array(capacity);
  const drag = new Float32Array(capacity);
  const alpha0 = new Float32Array(capacity);
  let next = 0;
  let alive = 0;
  return {
    points, mat,
    emit(p, n, cfg) {
      _c.set(cfg.color);
      for (let k = 0; k < n; k++) {
        const i = next;
        next = (next + 1) % capacity;
        const sp = cfg.spread ?? 0.1;
        pos[i * 3] = p.x + rnd(-sp, sp);
        pos[i * 3 + 1] = p.y + rnd(-sp, sp) * (cfg.flat ? 0.2 : 1);
        pos[i * 3 + 2] = p.z + rnd(-sp, sp);
        const a = Math.random() * Math.PI * 2;
        const up = rnd(cfg.up ? cfg.up[0] : -1, cfg.up ? cfg.up[1] : 1);
        const s = rnd(cfg.speed[0], cfg.speed[1]);
        const h = Math.sqrt(Math.max(0, 1 - Math.min(1, up * up)));
        vel[i * 3] = Math.cos(a) * h * s + (cfg.dir ? cfg.dir.x : 0);
        vel[i * 3 + 1] = up * s + (cfg.dir ? cfg.dir.y : 0);
        vel[i * 3 + 2] = Math.sin(a) * h * s + (cfg.dir ? cfg.dir.z : 0);
        const j = rnd(0.75, 1.15);
        col[i * 3] = _c.r * j;
        col[i * 3 + 1] = _c.g * j;
        col[i * 3 + 2] = _c.b * j;
        maxLife[i] = life[i] = rnd(cfg.life[0], cfg.life[1]);
        size0[i] = cfg.size[0] * rnd(0.7, 1.2);
        size1[i] = cfg.size[1] * rnd(0.7, 1.2);
        grav[i] = cfg.gravity ?? 0;
        drag[i] = cfg.drag ?? 0;
        alpha0[i] = cfg.alpha ?? 1;
      }
      alive = capacity;
    },
    update(dt) {
      if (!alive) return;
      let any = 0;
      for (let i = 0; i < capacity; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) {
          misc[i * 2] = 0;
          misc[i * 2 + 1] = 0;
          continue;
        }
        any++;
        const d = Math.max(0, 1 - drag[i] * dt);
        vel[i * 3] *= d;
        vel[i * 3 + 1] = vel[i * 3 + 1] * d - grav[i] * dt;
        vel[i * 3 + 2] *= d;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const t = 1 - life[i] / maxLife[i];
        misc[i * 2] = size0[i] + (size1[i] - size0[i]) * t;
        misc[i * 2 + 1] = alpha0[i] * Math.min(1, t * 8) * (1 - t * t);
      }
      alive = any;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aMisc.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
    },
  };
}

// ————————————————————————————————————————————————— shaders for ribbons —————————————————————————————————————————————————
const SLASH_VS = `
  attribute vec2 aArc; uniform float uRadius; uniform float uAngle; uniform float uWidth; varying vec2 vArc;
  void main() {
    float ang = (aArc.x - 0.5) * uAngle;
    float r = uRadius * (1.0 - aArc.y * uWidth);
    vArc = aArc;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(sin(ang) * r, sin(aArc.x * 3.1416) * 0.06 * uRadius, cos(ang) * r, 1.0);
  }`;
const SLASH_FS = `
  uniform vec3 uColor; uniform float uT; varying vec2 vArc;
  void main() {
    float head = uT * 1.5;
    float band = smoothstep(head - 0.95, head - 0.05, vArc.x) * (1.0 - smoothstep(head, head + 0.03, vArc.x));
    float edge = pow(1.0 - vArc.y, 1.3) * smoothstep(0.0, 0.06, vArc.y) + 0.9 * (1.0 - smoothstep(0.0, 0.1, vArc.y));
    float fade = 1.0 - smoothstep(0.55, 1.0, uT);
    float a = band * edge * fade;
    gl_FragColor = vec4(uColor * a * 1.9 + vec3(a * a * a * 0.5), a);${TAIL}
  }`;
const BEAM_VS = `
  uniform float uLength; uniform float uWidth; varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x * uWidth, position.y * uWidth, position.z * uLength, 1.0);
  }`;
const BEAM_FS = `
  uniform vec3 uColor; uniform float uT; uniform float uTaper; varying vec2 vUv;
  void main() {
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float core = pow(across, 3.0);
    float along = mix(1.0, vUv.y * (1.0 - vUv.y) * 4.0, uTaper);
    float flick = 0.8 + 0.2 * sin(vUv.y * 40.0 - uT * 30.0);
    float a = core * along * flick * (1.0 - smoothstep(0.4, 1.0, uT)) * smoothstep(0.0, 0.08, uT + 0.05);
    gl_FragColor = vec4(uColor * a * 1.5 + vec3(pow(across, 8.0) * a), a);${TAIL}
  }`;
const RING_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const RING_FS = `
  uniform vec3 uColor; uniform float uT; uniform float uMode; varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    float a;
    if (uMode < 0.5) {
      float inner = mix(0.55, 0.9, uT);
      a = smoothstep(inner - 0.12, inner, d) * (1.0 - smoothstep(0.93, 1.0, d)) * (1.0 - uT) * (1.0 - uT);
      a += (1.0 - smoothstep(0.0, 1.0, d)) * 0.12 * (1.0 - uT);
    } else {
      float ang = atan(p.y, p.x) + uT * 0.6;
      float dash = smoothstep(0.1, 0.2, abs(sin(ang * 6.0)));
      float pulse = 0.75 + 0.25 * sin(uT * 4.0);
      a = smoothstep(0.8, 0.86, d) * (1.0 - smoothstep(0.94, 1.0, d)) * mix(0.55, 1.0, dash) * pulse;
      a += smoothstep(0.55, 0.62, d) * (1.0 - smoothstep(0.62, 0.66, d)) * 0.35 * dash;
      a += (1.0 - smoothstep(0.2, 0.9, d)) * 0.1;
    }
    gl_FragColor = vec4(uColor * a * 1.4, a);${TAIL}
  }`;
const AURA_FS = `
  uniform vec3 uColor; uniform float uT; uniform float uLife; varying vec2 vUv;
  void main() {
    float rise = fract(vUv.y * 1.5 - uT * 0.9);
    float streak = smoothstep(0.6, 1.0, sin(vUv.x * 50.0 + floor(vUv.y * 1.5 - uT * 0.9) * 2.0) * 0.5 + 0.5);
    float a = (pow(1.0 - vUv.y, 1.5) * 0.55 + streak * rise * 0.5 * (1.0 - vUv.y)) * smoothstep(0.0, 0.15, uLife) * (1.0 - smoothstep(0.6, 1.0, uLife));
    gl_FragColor = vec4(uColor * a * 1.5, a);${TAIL}
  }`;
const TEXT_VS = `
  attribute vec3 iPos; attribute vec4 iUv; attribute vec4 iParams; varying vec2 vUv; varying float vAlpha;
  void main() {
    vec4 mv = viewMatrix * vec4(iPos, 1.0);
    float s = iParams.x * max(1.0, -mv.z * 0.07);
    mv.xy += position.xy * vec2(s * iParams.z, s);
    gl_Position = projectionMatrix * mv;
    vUv = iUv.xy + uv * iUv.zw;
    vAlpha = iParams.y;
  }`;
const TEXT_FS = `
  uniform sampler2D uMap; varying vec2 vUv; varying float vAlpha;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(t.rgb, a);${TAIL}
  }`;

function projectileGeos() {
  const z = [Math.PI / 2, 0, 0];
  return {
    arrow: fuse([rod(0.008, 0.008, 0.7, P.woodPale, [0, 0, 0], z), tube([[0, 0, 0.33, 0.02], [0, 0, 0.43, 0.001]], P.steel, { segs: 4, metal: 1, caps: 'none', gradient: false }), slab(0.004, 0.06, 0.14, P.clothCream, [0, 0, -0.3]), slab(0.06, 0.004, 0.14, P.clothRed, [0, 0, -0.3])]),
    bolt: fuse([rod(0.012, 0.012, 0.36, P.woodDark, [0, 0, 0], z), tube([[0, 0, 0.16, 0.024], [0, 0, 0.27, 0.001]], P.steel, { segs: 4, metal: 1, caps: 'none', gradient: false }), slab(0.004, 0.05, 0.08, P.leather, [0, 0, -0.15]), slab(0.05, 0.004, 0.08, P.leather, [0, 0, -0.15])]),
    dart: fuse([rod(0.006, 0.008, 0.2, P.woodPale, [0, 0, 0], z), tube([[0, 0, 0.09, 0.012], [0, 0, 0.17, 0.001]], P.steel, { segs: 4, metal: 1, caps: 'none', gradient: false }), slab(0.003, 0.05, 0.06, P.clothAmber, [0, 0, -0.09]), slab(0.05, 0.003, 0.06, P.clothAmber, [0, 0, -0.09])]),
    capsule: fuse([tube([[0, 0, -0.07, 0.04], [0, 0, 0.07, 0.04]], 0x9fd0c0, { segs: 6, metal: 0.6 }), rod(0.02, 0.02, 0.04, P.bronze, [0, 0, 0.11], z, { metal: 1 })]),
    shard: new THREE.OctahedronGeometry(0.07, 0).scale(0.6, 0.6, 2.6),
    arc: new THREE.OctahedronGeometry(0.09, 1).scale(0.7, 0.7, 1.8),
  };
}

/**
 * Create the effect system. ctx: { scene, camera, renderer? }.
 * All positions are THREE.Vector3-like world coordinates and are copied (never retained).
 */
export function createFx(ctx) {
  const root = new THREE.Group();
  root.name = 'fx';
  ctx.scene.add(root);
  const add = makeParticles(420, true);
  const soft = makeParticles(320, false);
  root.add(add.points, soft.points);

  // ——— slash ribbons
  const slashGeo = new THREE.BufferGeometry();
  {
    const n = 24;
    const arc = [];
    const pos = [];
    const index = [];
    for (let i = 0; i <= n; i++) {
      arc.push(i / n, 0, i / n, 1);
      pos.push(0, 0, 0, 0, 0, 0);
      if (i < n) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    slashGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    slashGeo.setAttribute('aArc', new THREE.Float32BufferAttribute(arc, 2));
    slashGeo.setIndex(index);
  }
  const pool = (count, make) => {
    const items = [];
    for (let i = 0; i < count; i++) {
      const it = make();
      it.mesh.visible = false;
      it.mesh.frustumCulled = false;
      it.mesh.renderOrder = 10;
      it.t = 0;
      it.dur = 1;
      it.active = false;
      root.add(it.mesh);
      items.push(it);
    }
    let cursor = 0;
    return {
      items,
      take() {
        for (let k = 0; k < count; k++) {
          const it = items[(cursor + k) % count];
          if (!it.active) {
            cursor = (cursor + k + 1) % count;
            return it;
          }
        }
        const it = items[cursor];
        cursor = (cursor + 1) % count;
        return it;
      },
    };
  };
  const slashes = pool(6, () => {
    const mat = shaderMat(SLASH_VS, SLASH_FS, { uColor: { value: new THREE.Color() }, uT: { value: 0 }, uRadius: { value: 1 }, uAngle: { value: 2 }, uWidth: { value: 0.55 } });
    return { mesh: new THREE.Mesh(slashGeo, mat), mat };
  });
  const beamGeo = new THREE.BufferGeometry();
  {
    const p = [-0.5, 0, 0, 0.5, 0, 0, -0.5, 0, 1, 0.5, 0, 1, 0, -0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1];
    const uv = [0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1];
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    beamGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    beamGeo.setIndex([0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6]);
  }
  const beams = pool(8, () => {
    const mat = shaderMat(BEAM_VS, BEAM_FS, { uColor: { value: new THREE.Color() }, uT: { value: 0 }, uLength: { value: 1 }, uWidth: { value: 0.2 }, uTaper: { value: 0 } });
    return { mesh: new THREE.Mesh(beamGeo, mat), mat };
  });
  const ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const makeRing = () => {
    const mat = shaderMat(RING_VS, RING_FS, { uColor: { value: new THREE.Color() }, uT: { value: 0 }, uMode: { value: 0 } });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    return { mesh: new THREE.Mesh(ringGeo, mat), mat, radius: 1 };
  };
  const rings = pool(8, makeRing);
  const markers = pool(6, makeRing);
  const auraGeo = new THREE.CylinderGeometry(1, 0.9, 1, 16, 1, true).translate(0, 0.5, 0);
  const auras = pool(4, () => {
    const mat = shaderMat(RING_VS, AURA_FS, { uColor: { value: new THREE.Color() }, uT: { value: 0 }, uLife: { value: 0 } });
    return { mesh: new THREE.Mesh(auraGeo, mat), mat, target: null };
  });

  // ——— projectiles
  const pGeos = projectileGeos();
  const pGlow = { shard: glowMat(P.crystal, 1.6), arc: glowMat(0xbfe6ff, 2.4) };
  const shots = pool(14, () => ({ mesh: new THREE.Mesh(pGeos.arrow, actorMat()), from: new THREE.Vector3(), to: new THREE.Vector3(), color: new THREE.Color(), kind: 'arrow', arcH: 0, onHit: null }));

  // ——— floating text atlas
  const COLS = 4;
  const ROWS = 8;
  const CELLS = COLS * ROWS;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const g2d = canvas.getContext('2d');
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.minFilter = THREE.LinearFilter;
  atlas.generateMipmaps = false;
  const textGeo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  textGeo.index = quad.index;
  textGeo.setAttribute('position', quad.attributes.position);
  textGeo.setAttribute('uv', quad.attributes.uv);
  const tPos = new Float32Array(CELLS * 3);
  const tUv = new Float32Array(CELLS * 4);
  const tPar = new Float32Array(CELLS * 4);
  textGeo.setAttribute('iPos', new THREE.InstancedBufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage));
  textGeo.setAttribute('iUv', new THREE.InstancedBufferAttribute(tUv, 4));
  textGeo.setAttribute('iParams', new THREE.InstancedBufferAttribute(tPar, 4).setUsage(THREE.DynamicDrawUsage));
  textGeo.instanceCount = CELLS;
  const textMat = shaderMat(TEXT_VS, TEXT_FS, { uMap: { value: atlas } }, false);
  textMat.depthTest = false;
  const textMesh = new THREE.Mesh(textGeo, textMat);
  textMesh.frustumCulled = false;
  textMesh.renderOrder = 999;
  root.add(textMesh);
  const tLife = new Float32Array(CELLS);
  const tMax = new Float32Array(CELLS);
  const tSize = new Float32Array(CELLS);
  const tDrift = new Float32Array(CELLS);
  const tCrit = new Uint8Array(CELLS);
  let tNext = 0;
  let atlasDirty = false;
  let textAlive = 0;
  for (let i = 0; i < CELLS; i++) {
    const cx = i % COLS;
    const cy = Math.floor(i / COLS);
    tUv.set([cx / COLS, 1 - (cy + 1) / ROWS, 1 / COLS, 1 / ROWS], i * 4);
  }

  const P_DUST = { color: 0xb8a67c, speed: [0.3, 1.2], up: [0.1, 0.8], life: [0.5, 1.0], size: [0.18, 0.6], gravity: -0.3, drag: 2.2, spread: 0.2, flat: true, alpha: 0.55 };
  const P_BLOOD = { color: 0x8a1a16, speed: [1.2, 3.2], up: [0.0, 0.9], life: [0.35, 0.7], size: [0.1, 0.04], gravity: 9, drag: 0.8, spread: 0.05, alpha: 0.95 };
  const P_SPARK = { color: 0xffc060, speed: [2, 6], up: [-0.2, 1], life: [0.2, 0.5], size: [0.09, 0.02], gravity: 9, drag: 1.2, spread: 0.04 };
  const P_HEAL = { color: 0x8fe89a, speed: [0.1, 0.5], up: [0.6, 1], life: [0.8, 1.4], size: [0.1, 0.03], gravity: -1.2, drag: 0.6, spread: 0.45, flat: true };
  const P_SMOKE = { color: 0x55524c, speed: [0.2, 0.7], up: [0.5, 1], life: [1.2, 2.2], size: [0.3, 1.1], gravity: -0.5, drag: 1.0, spread: 0.15, alpha: 0.5 };
  const P_SPLASH = { color: 0xbfe0ea, speed: [1.5, 3.6], up: [0.5, 1], life: [0.4, 0.8], size: [0.1, 0.05], gravity: 9, drag: 0.4, spread: 0.15, flat: true, alpha: 0.8 };
  const P_FLASH = { color: 0xffffff, speed: [0, 0], life: [0.12, 0.16], size: [0.4, 1.6], spread: 0 };
  const P_TRAIL = { color: 0xffffff, speed: [0, 0.2], life: [0.2, 0.35], size: [0.16, 0.02], spread: 0.02 };
  const flashCfg = { ...P_FLASH };
  const sparkCfg = { ...P_SPARK };
  const trailCfg = { ...P_TRAIL };

  function start(it, dur) {
    it.active = true;
    it.t = 0;
    it.dur = dur;
    it.mesh.visible = true;
  }

  const fx = {
    root,
    /** Sweeping arc ribbon in front of `pos`, facing `yaw`. opts: color, radius, angle (rad), duration, tilt. */
    slash(pos, yaw, opts = {}) {
      const it = slashes.take();
      it.mesh.position.copy(pos);
      it.mesh.rotation.set(0, yaw, opts.tilt ?? rnd(-0.35, 0.35));
      it.mat.uniforms.uColor.value.set(opts.color ?? 0xffe2a8);
      it.mat.uniforms.uRadius.value = opts.radius ?? 1.4;
      it.mat.uniforms.uAngle.value = opts.angle ?? 2.2;
      start(it, opts.duration ?? 0.28);
    },
    /** Short forward streak (lunge / stab). opts: color, length. */
    thrust(pos, yaw, opts = {}) {
      const len = opts.length ?? 1.8;
      _v.set(pos.x + Math.sin(yaw) * len, pos.y, pos.z + Math.cos(yaw) * len);
      fx.beam(pos, _v, { color: opts.color ?? 0xffe2a8, duration: 0.2, width: 0.3, taper: 1 });
    },
    /** Hit flash + sparks. opts: color, size. */
    impact(pos, opts = {}) {
      const size = opts.size ?? 1;
      flashCfg.color = opts.color ?? 0xffd9a0;
      flashCfg.size[0] = 0.4 * size;
      flashCfg.size[1] = 1.7 * size;
      add.emit(pos, 1, flashCfg);
      sparkCfg.color = opts.color ?? 0xffc060;
      add.emit(pos, Math.round(7 * size), sparkCfg);
    },
    /**
     * Flying projectile. kind: arrow|bolt|dart|capsule|arc|shard. opts: color, speed (m/s), onHit(pos).
     * Arrows, darts and capsules fly a shallow ballistic arc; the rest go straight.
     */
    projectile(from, to, opts = {}) {
      const it = shots.take();
      const kind = pGeos[opts.kind] ? opts.kind : 'arrow';
      it.kind = kind;
      it.mesh.geometry = pGeos[kind];
      it.mesh.material = pGlow[kind] || actorMat();
      it.from.copy(from);
      it.to.copy(to);
      it.color.set(opts.color ?? 0xffe2a8);
      it.onHit = opts.onHit || null;
      const dist = Math.max(0.01, it.from.distanceTo(it.to));
      it.arcH = (kind === 'capsule' ? 0.14 : kind === 'arrow' || kind === 'dart' ? 0.035 : 0) * dist;
      it.mesh.position.copy(from);
      start(it, dist / (opts.speed ?? 22));
    },
    /** Expanding ground shockwave. opts: color, radius, duration. */
    ring(pos, opts = {}) {
      const it = rings.take();
      it.mesh.position.set(pos.x, pos.y + 0.06, pos.z);
      it.radius = opts.radius ?? 2;
      it.mat.uniforms.uColor.value.set(opts.color ?? 0xffd9a0);
      it.mat.uniforms.uMode.value = 0;
      start(it, opts.duration ?? 0.6);
    },
    /** Rising column that follows an object (buff, treatment, stun…). opts: color, duration, radius, height. */
    aura(object3D, opts = {}) {
      const it = auras.take();
      it.target = object3D;
      it.mat.uniforms.uColor.value.set(opts.color ?? 0x9fe8a0);
      it.mesh.scale.set(opts.radius ?? 0.65, opts.height ?? 2, opts.radius ?? 0.65);
      start(it, opts.duration ?? 1.5);
    },
    /** Straight glowing line between two points (emitter discharge, tracer). opts: color, duration, width. */
    beam(from, to, opts = {}) {
      const it = beams.take();
      it.mesh.position.copy(from);
      it.mesh.lookAt(to.x, to.y, to.z);
      _v2.set(to.x - from.x, to.y - from.y, to.z - from.z);
      it.mat.uniforms.uLength.value = _v2.length();
      it.mat.uniforms.uWidth.value = opts.width ?? 0.16;
      it.mat.uniforms.uTaper.value = opts.taper ?? 0;
      it.mat.uniforms.uColor.value.set(opts.color ?? 0xbfe6ff);
      start(it, opts.duration ?? 0.25);
    },
    dust(pos) { soft.emit(pos, 7, P_DUST); },
    blood(pos) { soft.emit(pos, 9, P_BLOOD); },
    sparks(pos) { add.emit(pos, 12, P_SPARK); },
    heal(pos) { add.emit(pos, 14, P_HEAL); },
    smoke(pos) { soft.emit(pos, 5, P_SMOKE); },
    splash(pos) {
      soft.emit(pos, 12, P_SPLASH);
      fx.ring(pos, { color: 0xbfe0ea, radius: 0.9, duration: 0.5 });
    },
    /** Damage numbers / loot text. opts: color (hex), size (world metres, default 0.42), crit (bigger, amber). */
    floatText(pos, text, opts = {}) {
      const i = tNext;
      tNext = (tNext + 1) % CELLS;
      const cw = canvas.width / COLS;
      const chh = canvas.height / ROWS;
      const x0 = (i % COLS) * cw;
      const y0 = Math.floor(i / COLS) * chh;
      const crit = !!opts.crit;
      const str = String(text);
      g2d.clearRect(x0, y0, cw, chh);
      let px = crit ? 50 : 44;
      g2d.font = `800 ${px}px "Trebuchet MS", "Segoe UI", Arial, sans-serif`;
      const w = g2d.measureText(str).width;
      if (w > cw - 16) {
        px = Math.max(18, Math.floor(px * (cw - 16) / w));
        g2d.font = `800 ${px}px "Trebuchet MS", "Segoe UI", Arial, sans-serif`;
      }
      g2d.textAlign = 'center';
      g2d.textBaseline = 'middle';
      g2d.lineJoin = 'round';
      g2d.lineWidth = Math.max(4, px * 0.2);
      g2d.strokeStyle = 'rgba(20,14,8,0.92)';
      g2d.strokeText(str, x0 + cw / 2, y0 + chh / 2 + 2);
      _c.set(crit ? (opts.color ?? 0xffb030) : (opts.color ?? 0xf4ead2));
      g2d.fillStyle = '#' + _c.getHexString();
      g2d.fillText(str, x0 + cw / 2, y0 + chh / 2 + 2);
      atlasDirty = true;
      tPos[i * 3] = pos.x + rnd(-0.15, 0.15);
      tPos[i * 3 + 1] = pos.y;
      tPos[i * 3 + 2] = pos.z + rnd(-0.15, 0.15);
      tSize[i] = (opts.size ?? 0.42) * (crit ? 1.45 : 1);
      tMax[i] = tLife[i] = crit ? 1.5 : 1.2;
      tDrift[i] = rnd(-0.25, 0.25);
      tCrit[i] = crit ? 1 : 0;
      tPar[i * 4 + 2] = cw / chh;
      textAlive = CELLS;
    },
    /**
     * Persistent pulsing ground ring (target selection, quest spot, ambush telegraph).
     * @returns {{set(pos):void, remove():void}}
     */
    marker(pos, opts = {}) {
      const it = markers.take();
      it.radius = opts.radius ?? 1;
      it.mat.uniforms.uColor.value.set(opts.color ?? 0xffc060);
      it.mat.uniforms.uMode.value = 1;
      it.mesh.position.set(pos.x, pos.y + 0.08, pos.z);
      it.mesh.scale.setScalar(it.radius);
      it.active = true;
      it.t = 0;
      it.mesh.visible = true;
      const token = (it.token = (it.token || 0) + 1);
      return {
        set(p) { if (it.token === token) it.mesh.position.set(p.x, p.y + 0.08, p.z); },
        remove() {
          if (it.token !== token) return;
          it.active = false;
          it.mesh.visible = false;
        },
      };
    },
    /** Advance all effects. Call once per frame. */
    update(dt) {
      const h = ctx.renderer ? ctx.renderer.domElement.height : window.innerHeight * (window.devicePixelRatio || 1);
      const scale = h / (2 * Math.tan((ctx.camera.fov * Math.PI) / 360));
      add.mat.uniforms.uScale.value = scale;
      soft.mat.uniforms.uScale.value = scale;
      add.update(dt);
      soft.update(dt);
      for (const it of slashes.items) {
        if (!it.active) continue;
        it.t += dt / it.dur;
        it.mat.uniforms.uT.value = it.t;
        if (it.t >= 1) { it.active = false; it.mesh.visible = false; }
      }
      for (const it of beams.items) {
        if (!it.active) continue;
        it.t += dt / it.dur;
        it.mat.uniforms.uT.value = it.t;
        if (it.t >= 1) { it.active = false; it.mesh.visible = false; }
      }
      for (const it of rings.items) {
        if (!it.active) continue;
        it.t += dt / it.dur;
        const e = 1 - Math.pow(1 - Math.min(1, it.t), 3);
        it.mesh.scale.setScalar(it.radius * (0.15 + 0.85 * e));
        it.mat.uniforms.uT.value = it.t;
        if (it.t >= 1) { it.active = false; it.mesh.visible = false; }
      }
      for (const it of markers.items) {
        if (!it.active) continue;
        it.t += dt;
        it.mat.uniforms.uT.value = it.t;
      }
      for (const it of auras.items) {
        if (!it.active) continue;
        it.t += dt;
        const life = it.t / it.dur;
        it.mat.uniforms.uT.value = it.t;
        it.mat.uniforms.uLife.value = life;
        if (it.target) it.target.getWorldPosition(it.mesh.position);
        if (life >= 1) { it.active = false; it.mesh.visible = false; it.target = null; }
      }
      for (const it of shots.items) {
        if (!it.active) continue;
        it.t += dt / it.dur;
        const t = Math.min(1, it.t);
        _v.copy(it.mesh.position);
        it.mesh.position.lerpVectors(it.from, it.to, t);
        it.mesh.position.y += it.arcH * 4 * t * (1 - t);
        _v2.copy(it.mesh.position).sub(_v);
        if (_v2.lengthSq() > 1e-8) it.mesh.lookAt(_v2.add(it.mesh.position));
        if (it.kind === 'arc' || it.kind === 'capsule' || it.kind === 'shard') {
          trailCfg.color = it.color.getHex();
          add.emit(it.mesh.position, it.kind === 'arc' ? 2 : 1, trailCfg);
        }
        if (it.t >= 1) {
          it.active = false;
          it.mesh.visible = false;
          const cb = it.onHit;
          it.onHit = null;
          if (cb) cb(it.to);
        }
      }
      if (textAlive) {
        let any = 0;
        for (let i = 0; i < CELLS; i++) {
          if (tLife[i] <= 0) continue;
          tLife[i] -= dt;
          const t = 1 - Math.max(0, tLife[i]) / tMax[i];
          if (tLife[i] <= 0) {
            tPar[i * 4] = 0;
            tPar[i * 4 + 1] = 0;
            continue;
          }
          any++;
          tPos[i * 3 + 1] += dt * (1.5 - t * 1.1);
          tPos[i * 3] += dt * tDrift[i] * (1 - t);
          const pop = t < 0.12 ? 0.6 + (t / 0.12) * (tCrit[i] ? 0.75 : 0.5) : (tCrit[i] ? 1.35 - Math.min(1, (t - 0.12) / 0.15) * 0.35 : 1.1 - Math.min(1, (t - 0.12) / 0.15) * 0.1);
          tPar[i * 4] = tSize[i] * pop;
          tPar[i * 4 + 1] = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
        }
        textAlive = any;
        textGeo.attributes.iPos.needsUpdate = true;
        textGeo.attributes.iParams.needsUpdate = true;
      }
      if (atlasDirty) {
        atlas.needsUpdate = true;
        atlasDirty = false;
      }
    },
    dispose() {
      ctx.scene.remove(root);
      root.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material.isShaderMaterial) o.material.dispose();
      });
      atlas.dispose();
    },
  };
  return fx;
}
