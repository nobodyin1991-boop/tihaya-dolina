// Mesher: a fast immediate-mode writer of merged, vertex-coloured, flat-shaded geometry.
// It is the paint → place → merge pattern of geo.js without one THREE geometry per primitive:
// primitives are written straight into growing typed arrays, grouped into "buckets"
// (one bucket = one material = one draw call, optionally split per district chunk).
import * as THREE from 'three';
import { PALETTE, shared, vertexMat, vertexMatFlat, clothMat, metalMat, glowMat, nightGlowMat, foliageMat } from './materials.js';

const colorCache = new Map();

/** sRGB hex -> linear [r,g,b] (cached). */
function linearRgb(hex) {
  let c = colorCache.get(hex);
  if (!c) {
    const k = new THREE.Color(hex);
    c = [k.r, k.g, k.b];
    colorCache.set(hex, c);
  }
  return c;
}

class Bucket {
  constructor(withSway) {
    this.count = 0;
    this.cap = 3072;
    this.pos = new Float32Array(this.cap * 3);
    this.nrm = new Float32Array(this.cap * 3);
    this.col = new Float32Array(this.cap * 3);
    this.sway = withSway ? new Float32Array(this.cap) : null;
  }

  grow(need) {
    if (this.count + need <= this.cap) return;
    let cap = this.cap;
    while (cap < this.count + need) cap *= 2;
    const re = (old, size) => { const a = new Float32Array(cap * size); a.set(old); return a; };
    this.pos = re(this.pos, 3);
    this.nrm = re(this.nrm, 3);
    this.col = re(this.col, 3);
    if (this.sway) this.sway = re(this.sway, 1);
    this.cap = cap;
  }
}

const icoCache = new Map();
function icoTriangles(detail) {
  let arr = icoCache.get(detail);
  if (!arr) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    arr = Float32Array.from(g.attributes.position.array);
    g.dispose();
    icoCache.set(detail, arr);
  }
  return arr;
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _pm = new THREE.Matrix4();
const _fm = new THREE.Matrix4();
const SWAY_BUCKETS = /^(foliage|fire)/;
/** Only the big buckets are split per district chunk; small ones (cloth, lamps, foliage …) stay city-wide. */
const CHUNKED = new Set(['flat', 'win']);

export class Mesher {
  constructor(seed = 1) {
    this.buckets = new Map();
    this.stack = [new THREE.Matrix4()];
    this.depth = 0;
    this.mat = this.stack[0];
    this.chunk = '';
    this.name = 'flat';
    this.seed = (seed >>> 0) || 1;
    this.swayValue = 0;
    this.L = new Float64Array(3 * 400);
    this.W = new Float64Array(3 * 400);
    this.K = new Float32Array(400);
    this.S = new Float32Array(400);
    this.rgb = [1, 1, 1];
    this.use('flat');
  }

  /** Select the material bucket for following primitives: flat | smooth | cloth | metal | win | lamp | ember | fire | foliage. */
  use(name) {
    this.name = name;
    const key = this.chunk && CHUNKED.has(name) ? name + '@' + this.chunk : name;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, b = new Bucket(SWAY_BUCKETS.test(name)));
    this.cur = b;
    return this;
  }

  /** Split following geometry into a separate set of meshes (district chunk) so frustum culling can drop it. */
  setChunk(chunk) {
    this.chunk = chunk || '';
    return this.use(this.name);
  }

  /** Deterministic random in [0,1). */
  rand() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Enter a local frame: translate, then yaw (ry), pitch (rx), roll (rz) in that order, then scale. */
  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) {
    _pos.set(x, y, z);
    _quat.setFromEuler(_euler.set(rx, ry, rz, 'YXZ'));
    if (typeof s === 'number') _scale.set(s, s, s); else _scale.set(s[0], s[1], s[2]);
    _pm.compose(_pos, _quat, _scale);
    const prev = this.stack[this.depth];
    this.depth++;
    if (!this.stack[this.depth]) this.stack[this.depth] = new THREE.Matrix4();
    this.mat = this.stack[this.depth].multiplyMatrices(prev, _pm);
    return this;
  }

  pop() {
    this.depth--;
    this.mat = this.stack[this.depth];
    return this;
  }

  _begin(color, x, y, z, o) {
    const c = linearRgb(color);
    const j = o.j ? 1 + (this.rand() - 0.5) * 2 * o.j : 1;
    this.rgb[0] = c[0] * j;
    this.rgb[1] = c[1] * j;
    this.rgb[2] = c[2] * j;
    _pos.set(x, y, z);
    _quat.setFromEuler(_euler.set(o.rx || 0, o.ry || 0, o.rz || 0, 'XYZ'));
    _scale.set(1, 1, 1);
    _pm.compose(_pos, _quat, _scale);
    _fm.multiplyMatrices(this.mat, _pm);
    this.useS = o.sway !== undefined;
  }

  /** Transform `n` local scratch points into world scratch, computing brightness from the y gradient. */
  _xform(n, o, y0, y1) {
    const e = _fm.elements, L = this.L, W = this.W, K = this.K, S = this.S;
    const g = o.g, vj = o.vj || 0, sway = o.sway || 0;
    const span = Math.max(1e-6, y1 - y0);
    for (let i = 0; i < n; i++) {
      const x = L[i * 3], y = L[i * 3 + 1], z = L[i * 3 + 2];
      W[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      W[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      W[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      let k = 1;
      if (g) k = g[0] + (g[1] - g[0]) * ((y - y0) / span);
      if (vj) {
        const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
        k *= 1 + ((h - Math.floor(h)) - 0.5) * 2 * vj;
      }
      K[i] = o.k ? k * o.k[i] : k;
      S[i] = sway * (y - y0) / span;
    }
  }

  _tri(a, b, c) {
    const B = this.cur;
    B.grow(3);
    const W = this.W, K = this.K, rgb = this.rgb;
    const ax = W[a * 3], ay = W[a * 3 + 1], az = W[a * 3 + 2];
    const bx = W[b * 3], by = W[b * 3 + 1], bz = W[b * 3 + 2];
    const cx = W[c * 3], cy = W[c * 3 + 1], cz = W[c * 3 + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    let o = B.count * 3;
    const P = B.pos, N = B.nrm, C = B.col;
    P[o] = ax; P[o + 1] = ay; P[o + 2] = az;
    P[o + 3] = bx; P[o + 4] = by; P[o + 5] = bz;
    P[o + 6] = cx; P[o + 7] = cy; P[o + 8] = cz;
    for (let i = 0; i < 3; i++) {
      N[o + i * 3] = nx; N[o + i * 3 + 1] = ny; N[o + i * 3 + 2] = nz;
    }
    const ka = K[a], kb = K[b], kc = K[c];
    C[o] = rgb[0] * ka; C[o + 1] = rgb[1] * ka; C[o + 2] = rgb[2] * ka;
    C[o + 3] = rgb[0] * kb; C[o + 4] = rgb[1] * kb; C[o + 5] = rgb[2] * kb;
    C[o + 6] = rgb[0] * kc; C[o + 7] = rgb[1] * kc; C[o + 8] = rgb[2] * kc;
    if (B.sway) {
      const S = this.S, sv = this.swayValue, us = this.useS;
      B.sway[B.count] = us ? S[a] : sv;
      B.sway[B.count + 1] = us ? S[b] : sv;
      B.sway[B.count + 2] = us ? S[c] : sv;
    }
    B.count += 3;
  }

  _quad(a, b, c, d) {
    this._tri(a, b, c);
    this._tri(a, c, d);
  }

  /**
   * Box standing on its base centre at (x,y,z). Options: ry/rx/rz rotation, g:[bottomMul,topMul] gradient,
   * j: per-primitive brightness jitter, vj: per-vertex jitter, top:[sx,sz] scale of the top face (taper),
   * lean:[dx,dz] shift of the top face, c: centred on y, nb: no bottom face.
   */
  box(w, h, d, color, x = 0, y = 0, z = 0, o = {}) {
    this._begin(color, x, y, z, o);
    const hw = w / 2, hd = d / 2;
    const y0 = o.c ? -h / 2 : 0, y1 = y0 + h;
    const tx = o.top ? o.top[0] : 1, tz = o.top ? o.top[1] : 1;
    const lx = o.lean ? o.lean[0] : 0, lz = o.lean ? o.lean[1] : 0;
    const L = this.L;
    for (let i = 0; i < 8; i++) {
      const sx = i & 1 ? 1 : -1, up = i & 2, sz = i & 4 ? 1 : -1;
      L[i * 3] = up ? sx * hw * tx + lx : sx * hw;
      L[i * 3 + 1] = up ? y1 : y0;
      L[i * 3 + 2] = up ? sz * hd * tz + lz : sz * hd;
    }
    this._xform(8, o, y0, y1);
    this._quad(4, 5, 7, 6);
    this._quad(1, 0, 2, 3);
    this._quad(5, 1, 3, 7);
    this._quad(0, 4, 6, 2);
    this._quad(6, 7, 3, 2);
    if (!o.nb) this._quad(0, 1, 5, 4);
    return this;
  }

  /** Cylinder / cone (rTop = 0) standing on its base. Options as box plus seg (default 6), bottom: add bottom cap, lean. */
  cyl(rTop, rBottom, h, color, x = 0, y = 0, z = 0, o = {}) {
    this._begin(color, x, y, z, o);
    const n = o.seg || 6;
    const y0 = o.c ? -h / 2 : 0, y1 = y0 + h;
    const lx = o.lean ? o.lean[0] : 0, lz = o.lean ? o.lean[1] : 0;
    const L = this.L;
    const a0 = o.a0 || 0;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      L[i * 3] = ca * rBottom; L[i * 3 + 1] = y0; L[i * 3 + 2] = sa * rBottom;
      const t = n + i;
      L[t * 3] = ca * rTop + lx; L[t * 3 + 1] = y1; L[t * 3 + 2] = sa * rTop + lz;
    }
    const cb = 2 * n, ct = 2 * n + 1;
    L[cb * 3] = 0; L[cb * 3 + 1] = y0; L[cb * 3 + 2] = 0;
    L[ct * 3] = lx; L[ct * 3 + 1] = y1; L[ct * 3 + 2] = lz;
    this._xform(2 * n + 2, o, y0, y1);
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      if (rTop > 0) {
        this._quad(k, i, n + i, n + k);
        this._tri(ct, n + k, n + i);
      } else {
        this._tri(k, i, ct);
      }
      if (o.bottom) this._tri(cb, i, k);
    }
    return this;
  }

  /** Triangular prism (gable): triangle across x (width w, height h), extruded along z (depth d). Base at y. */
  gable(w, h, d, color, x = 0, y = 0, z = 0, o = {}) {
    this._begin(color, x, y, z, o);
    const hw = w / 2, hd = d / 2, L = this.L;
    const ox = o.apex || 0;
    const pts = [-hw, 0, hd, hw, 0, hd, ox, h, hd, hw, 0, -hd, -hw, 0, -hd, ox, h, -hd];
    for (let i = 0; i < 18; i++) L[i] = pts[i];
    this._xform(6, o, 0, h);
    this._tri(0, 1, 2);
    this._tri(3, 4, 5);
    this._quad(4, 0, 2, 5);
    this._quad(1, 3, 5, 2);
    if (!o.nb) this._quad(4, 3, 1, 0);
    return this;
  }

  /** Free quad from four local points [x,y,z] (counter-clockwise seen from the front). `k` = brightness per corner. */
  quad(p0, p1, p2, p3, color, o = {}) {
    this._begin(color, 0, 0, 0, o);
    const L = this.L, pts = [p0, p1, p2, p3];
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 4; i++) {
      L[i * 3] = pts[i][0]; L[i * 3 + 1] = pts[i][1]; L[i * 3 + 2] = pts[i][2];
      y0 = Math.min(y0, pts[i][1]); y1 = Math.max(y1, pts[i][1]);
    }
    this._xform(4, o, y0, y1);
    this._quad(0, 1, 2, 3);
    if (o.both) this._quad(3, 2, 1, 0);
    return this;
  }

  /** Free triangle from three local points. */
  tri(p0, p1, p2, color, o = {}) {
    this._begin(color, 0, 0, 0, o);
    const L = this.L, pts = [p0, p1, p2];
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 3; i++) {
      L[i * 3] = pts[i][0]; L[i * 3 + 1] = pts[i][1]; L[i * 3 + 2] = pts[i][2];
      y0 = Math.min(y0, pts[i][1]); y1 = Math.max(y1, pts[i][1]);
    }
    this._xform(3, o, y0, y1);
    this._tri(0, 1, 2);
    if (o.both) this._tri(2, 1, 0);
    return this;
  }

  /**
   * Lumpy icosphere centred at (x,y,z). Options: s:[sx,sy,sz] scale, detail 0|1, noise: radial displacement 0..0.5,
   * g gradient, j, sway: wind amount for foliage buckets (scaled by height).
   */
  ico(r, color, x = 0, y = 0, z = 0, o = {}) {
    this._begin(color, x, y, z, o);
    const src = icoTriangles(o.detail || 0);
    const s = o.s || [1, 1, 1];
    const noise = o.noise || 0;
    const salt = this.rand() * 100;
    const L = this.L;
    const tris = src.length / 9;
    for (let t = 0; t < tris; t++) {
      for (let v = 0; v < 3; v++) {
        const ux = src[t * 9 + v * 3], uy = src[t * 9 + v * 3 + 1], uz = src[t * 9 + v * 3 + 2];
        let k = r;
        if (noise) {
          const h = Math.sin(ux * 91.7 + uy * 47.3 + uz * 63.1 + salt) * 43758.5453;
          k *= 1 + ((h - Math.floor(h)) - 0.5) * 2 * noise;
        }
        L[v * 3] = ux * k * s[0]; L[v * 3 + 1] = uy * k * s[1]; L[v * 3 + 2] = uz * k * s[2];
      }
      this._xform(3, o, -r * s[1], r * s[1]);
      this._tri(0, 1, 2);
    }
    return this;
  }

  /** Bake any THREE geometry (re-coloured with `color`, flat normals). */
  geo(geometry, color, x = 0, y = 0, z = 0, o = {}) {
    this._begin(color, x, y, z, o);
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = g.attributes.position;
    g.computeBoundingBox();
    const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y;
    const L = this.L;
    for (let i = 0; i < p.count; i += 3) {
      for (let v = 0; v < 3; v++) {
        L[v * 3] = p.getX(i + v); L[v * 3 + 1] = p.getY(i + v); L[v * 3 + 2] = p.getZ(i + v);
      }
      this._xform(3, o, y0, y1);
      this._tri(0, 1, 2);
    }
    if (g !== geometry) g.dispose();
    return this;
  }

  /** Total triangles written so far. */
  get triangles() {
    let n = 0;
    for (const b of this.buckets.values()) n += b.count / 3;
    return n;
  }

  /**
   * Turn buckets into meshes (and forget them). opts: { shadows: bool (default true), materials: {bucketName: Material}
   * overrides, filter: key => bool to flush only some buckets (key = 'name' or 'name@chunk') }.
   * Returns THREE.Mesh[]; mesh.userData.bucket = bucket name, userData.chunk = chunk id.
   */
  build(opts = {}) {
    const meshes = [];
    for (const [key, b] of this.buckets) {
      if (opts.filter && !opts.filter(key)) continue;
      this.buckets.delete(key);
      if (!b.count) continue;
      const [name, chunk = ''] = key.split('@');
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(b.pos.slice(0, b.count * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(b.nrm.slice(0, b.count * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(b.col.slice(0, b.count * 3), 3));
      if (b.sway) g.setAttribute('sway', new THREE.BufferAttribute(b.sway.slice(0, b.count), 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const material = (opts.materials && opts.materials[name]) || materialFor(name);
      const mesh = new THREE.Mesh(g, material);
      const lit = !UNLIT.has(name);
      mesh.castShadow = lit && opts.shadows !== false && name !== 'ground';
      mesh.receiveShadow = lit;
      mesh.userData.bucket = name;
      mesh.userData.chunk = chunk;
      mesh.name = key;
      meshes.push(mesh);
    }
    this.use(this.name);
    return meshes;
  }

  /** Build and wrap everything in a Group. */
  toGroup(opts = {}) {
    const group = new THREE.Group();
    for (const mesh of this.build(opts)) group.add(mesh);
    return group;
  }
}

const UNLIT = new Set(['win', 'lamp', 'ember', 'fire', 'furnace', 'moon']);
const own = new Map();

/** Animated flame: vertex colours = flame gradient, attribute `sway` = 0 at the base .. 1 at the tip. */
export function flameMat() {
  let m = own.get('flame');
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.color.setScalar(2.4);
  m.onBeforeCompile = shader => {
    shader.uniforms.uTime = shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          float ph = wp.x * 3.7 + wp.z * 2.9;
          float f = sin(uTime * 9.0 + ph) * 0.5 + sin(uTime * 15.7 + ph * 1.7) * 0.3 + sin(uTime * 4.3 + ph * 0.6) * 0.4;
          transformed.y += sway * (0.10 + 0.16 * f);
          transformed.x += sway * 0.07 * sin(uTime * 7.1 + ph + position.y * 5.0);
          transformed.z += sway * 0.07 * cos(uTime * 6.3 + ph * 1.3 + position.y * 4.0);
        }`);
  };
  m.customProgramCacheKey = () => 'flame';
  own.set('flame', m);
  return m;
}

/**
 * Flat vertex-colour material whose geometry spins around the mesh's local axis ('y' or 'z') — windmill sails,
 * water wheels. Driven by shared.uTime, so no per-frame JS. Meshes using it should not cast shadows.
 */
export function spinMat(axis = 'z', speed = 0.5) {
  const key = 'spin' + axis + speed;
  let m = own.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  const swizzle = axis === 'y' ? 'xz' : 'xy';
  m.onBeforeCompile = shader => {
    shader.uniforms.uTime = shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float a = uTime * ${speed.toFixed(4)};
          float c = cos(a), s = sin(a);
          transformed.${swizzle} = mat2(c, s, -s, c) * transformed.${swizzle};
        }`);
  };
  m.customProgramCacheKey = () => key;
  own.set(key, m);
  return m;
}

/** Shared material of a bucket name. */
export function materialFor(name) {
  switch (name) {
    case 'flat': return vertexMatFlat();
    case 'ground': return groundMat();
    case 'smooth': return vertexMat();
    case 'cloth': return clothMat();
    case 'metal': return metalMat();
    case 'win': return nightGlowMat(0xffc878, 1.7, 0x1a2026);
    case 'lamp': return nightGlowMat(PALETTE.lantern, 3.2, 0x6d6450);
    case 'furnace': return nightGlowMat(PALETTE.ember, 3.0, 0x5a2a16);
    case 'moon': return nightGlowMat(0xa8eef4, 2.4, 0x9fc8cc);
    case 'ember': return glowMat(PALETTE.ember, 2.6);
    case 'fire': return flameMat();
    case 'foliage': return foliageMat();
    default: return vertexMatFlat();
  }
}

/** Street paving / decals lying on the terrain: flat vertex colours pulled towards the camera to avoid z-fighting. */
export function groundMat() {
  let m = own.get('ground');
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  own.set('ground', m);
  return m;
}
