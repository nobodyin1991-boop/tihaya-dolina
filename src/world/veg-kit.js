// Vegetation tool kit: a tiny indexed-mesh builder for procedural plant/rock models, a writer that bakes many
// model instances into ONE compact static geometry per streaming cell, and the shared flora material.
// Budget: draws nothing itself. Baked vertex = 20 bytes (float32 position, int8 normal+flatness, uint8 colour+sway).
import * as THREE from 'three';
import { shared } from './materials.js';
import { applyShadowFade } from './sky.js';
import { hexToLinear } from './terrain-paint.js';

/** sRGB hex -> linear [r,g,b]. */
export const lin = hexToLinear;
export const mixColor = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scaleColor = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ───────────────────────── icosphere templates ─────────────────────────

function buildIco(detail) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1];
  let faces = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  const normalize = () => {
    for (let i = 0; i < verts.length; i += 3) {
      const l = Math.hypot(verts[i], verts[i + 1], verts[i + 2]);
      verts[i] /= l; verts[i + 1] /= l; verts[i + 2] /= l;
    }
  };
  normalize();
  for (let d = 0; d < detail; d++) {
    const cache = new Map();
    const next = [];
    const mid = (a, b) => {
      const key = a < b ? a * 100000 + b : b * 100000 + a;
      let m = cache.get(key);
      if (m === undefined) {
        m = verts.length / 3;
        verts.push((verts[a * 3] + verts[b * 3]) / 2, (verts[a * 3 + 1] + verts[b * 3 + 1]) / 2, (verts[a * 3 + 2] + verts[b * 3 + 2]) / 2);
        cache.set(key, m);
      }
      return m;
    };
    for (let f = 0; f < faces.length; f += 3) {
      const a = faces[f], b = faces[f + 1], c = faces[f + 2];
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    faces = next;
    normalize();
  }
  return { verts, faces };
}
const ICO = [buildIco(0), buildIco(1)];

const hash3 = (x, y, z, s) => {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + s * 4.137) * 43758.5453;
  return h - Math.floor(h);
};

// ───────────────────────── model builder ─────────────────────────

/**
 * Accumulates an indexed model. Per vertex: position, normal, flatness (0 smooth .. 1 faceted), linear colour,
 * flex (0 rigid wood .. 1 free leaf; -1 = never sways). finish() turns flex + height into the final `sway`.
 */
export class ModelBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.idx = [];
  }

  vertex(x, y, z, nx, ny, nz, flat, color, flex) {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz, flat);
    this.col.push(color[0], color[1], color[2], flex);
    return i;
  }

  /** Lumpy ellipsoid (canopy puff, bush, boulder). */
  blob({ x = 0, y = 0, z = 0, rx = 1, ry = rx, rz = rx, detail = 1, bottom, top, lump = 0.15, seed = 1, flat = 0.5, flex = 1, jitter = 0.1, squashBottom = 0 }) {
    const ico = ICO[detail];
    const base = this.pos.length / 3;
    for (let i = 0; i < ico.verts.length; i += 3) {
      const dx = ico.verts[i], dy = ico.verts[i + 1], dz = ico.verts[i + 2];
      const n = Math.sin(dx * 3.1 + seed) * Math.sin(dy * 2.7 + seed * 1.3) * Math.sin(dz * 3.4 + seed * 0.7)
        + 0.5 * Math.sin(dx * 6.3 + seed * 2.1) * Math.sin(dz * 5.9 + seed * 1.7);
      const r = 1 + lump * n;
      let py = dy * ry * r;
      if (squashBottom > 0 && dy < 0) py *= 1 - squashBottom;
      const t = Math.min(1, Math.max(0, dy * 0.5 + 0.5));
      const k = 1 + (hash3(dx, dy, dz, seed) - 0.5) * 2 * jitter;
      const c = [(bottom[0] + (top[0] - bottom[0]) * t) * k, (bottom[1] + (top[1] - bottom[1]) * t) * k, (bottom[2] + (top[2] - bottom[2]) * t) * k];
      const nx = dx / rx, ny = dy / ry, nz = dz / rz;
      const nl = Math.hypot(nx, ny, nz) || 1;
      this.vertex(x + dx * rx * r, y + py, z + dz * rz * r, nx / nl, ny / nl, nz / nl, flat, c, flex);
    }
    for (let f = 0; f < ico.faces.length; f++) this.idx.push(base + ico.faces[f]);
  }

  /** Tube through points [{x,y,z,r,color?}] (trunk, bough, log). Colour runs from colorA to colorB unless a point has its own. */
  tube(points, sides, colorA, colorB, { flat = 0.15, flex = 0, capTop = true, capBottom = false } = {}) {
    const base = this.pos.length / 3;
    const n = points.length;
    for (let p = 0; p < n; p++) {
      const a = points[Math.max(0, p - 1)];
      const b = points[Math.min(n - 1, p + 1)];
      let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z;
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      // basis perpendicular to the tangent
      let ux = ty, uy = -tx, uz = 0;
      if (Math.abs(ty) > 0.9) { ux = 1; uy = 0; uz = 0; }
      const d = ux * tx + uy * ty + uz * tz;
      ux -= tx * d; uy -= ty * d; uz -= tz * d;
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul; uy /= ul; uz /= ul;
      const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
      const pt = points[p];
      const color = pt.color || mixColor(colorA, colorB, n > 1 ? p / (n - 1) : 0);
      for (let s = 0; s < sides; s++) {
        const ang = s / sides * Math.PI * 2;
        const cx = Math.cos(ang), sx = Math.sin(ang);
        const ox = ux * cx + vx * sx, oy = uy * cx + vy * sx, oz = uz * cx + vz * sx;
        this.vertex(pt.x + ox * pt.r, pt.y + oy * pt.r, pt.z + oz * pt.r, ox, oy, oz, flat, color, flex);
      }
    }
    for (let p = 0; p < n - 1; p++) {
      for (let s = 0; s < sides; s++) {
        const a = base + p * sides + s;
        const b = base + p * sides + (s + 1) % sides;
        const c = a + sides;
        const d = b + sides;
        this.idx.push(a, b, c, b, d, c);
      }
    }
    if (capTop) {
      const last = points[n - 1];
      const tip = this.vertex(last.x, last.y, last.z, 0, 1, 0, flat, last.color || colorB, flex);
      const ring = base + (n - 1) * sides;
      for (let s = 0; s < sides; s++) this.idx.push(ring + s, ring + (s + 1) % sides, tip);
    }
    if (capBottom) {
      const first = points[0];
      const tip = this.vertex(first.x, first.y, first.z, 0, -1, 0, flat, first.color || colorA, flex);
      for (let s = 0; s < sides; s++) this.idx.push(base + (s + 1) % sides, base + s, tip);
    }
  }

  /** Conifer tier: a ragged cone with a light rim, dark apex and a dark underside. */
  cone({ x = 0, y = 0, z = 0, radius = 1, height = 1, sides = 7, rim, apex, under, droop = 0.2, ragged = 0.18, seed = 1, flat = 0.55, flex = 1, underside = true }) {
    const base = this.pos.length / 3;
    for (let s = 0; s < sides; s++) {
      const ang = (s + (seed % 7) * 0.13) / sides * Math.PI * 2;
      const r = radius * (1 + (hash3(s, seed, 1.7, seed) - 0.5) * 2 * ragged);
      const dx = Math.cos(ang), dz = Math.sin(ang);
      const nl = Math.hypot(height, r);
      this.vertex(x + dx * r, y - droop * radius * (0.6 + 0.8 * hash3(s, 3.1, seed, 2)), z + dz * r, dx * height / nl, r / nl, dz * height / nl, flat, rim, flex);
    }
    const tip = this.vertex(x, y + height, z, 0, 1, 0, flat, apex, flex);
    for (let s = 0; s < sides; s++) this.idx.push(base + s, tip, base + (s + 1) % sides);
    if (underside) {
      const start = this.pos.length / 3;
      for (let s = 0; s < sides; s++) {
        const o = (base + s) * 3;
        this.vertex(this.pos[o], this.pos[o + 1], this.pos[o + 2], 0, -1, 0, flat, under, flex);
      }
      const centre = this.vertex(x, y + height * 0.12, z, 0, -1, 0, flat, under, flex);
      for (let s = 0; s < sides; s++) this.idx.push(start + (s + 1) % sides, centre, start + s);
    }
  }

  /** Double-sided flat quad strip from p0 to p1 with widths w0/w1 (leaf, frond, reed blade). `up` biases the normal upwards. */
  blade(p0, p1, w0, w1, sideDir, colorA, colorB, flex = 1) {
    const sx = sideDir[0], sy = sideDir[1], sz = sideDir[2];
    const ex = p1[0] - p0[0], ey = p1[1] - p0[1], ez = p1[2] - p0[2];
    let nx = sy * ez - sz * ey, ny = sz * ex - sx * ez, nz = sx * ey - sy * ex;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    // lighting should not flip on the back face: use an up-biased normal on both sides
    const bx = nx * 0.5, by = ny * 0.5 + 0.6, bz = nz * 0.5;
    const bl = Math.hypot(bx, by, bz);
    const a = this.vertex(p0[0] - sx * w0, p0[1] - sy * w0, p0[2] - sz * w0, bx / bl, by / bl, bz / bl, 0, colorA, flex);
    const b = this.vertex(p0[0] + sx * w0, p0[1] + sy * w0, p0[2] + sz * w0, bx / bl, by / bl, bz / bl, 0, colorA, flex);
    const c = this.vertex(p1[0] - sx * w1, p1[1] - sy * w1, p1[2] - sz * w1, bx / bl, by / bl, bz / bl, 0, colorB, flex);
    const d = this.vertex(p1[0] + sx * w1, p1[1] + sy * w1, p1[2] + sz * w1, bx / bl, by / bl, bz / bl, 0, colorB, flex);
    this.idx.push(a, b, c, b, d, c, a, c, b, b, c, d);
  }

  /**
   * Freeze into typed arrays. `swayHeight` = model height used to grow sway from 0 at the ground to 1 at the top;
   * pass 0 for rigid models. Returns {position, normal(x,y,z,flat), color(r,g,b,sway), index, vertexCount, triangleCount}.
   */
  finish(swayHeight = 0, swayMax = 1) {
    const count = this.pos.length / 3;
    const color = new Float32Array(this.col);
    for (let i = 0; i < count; i++) {
      const flex = color[i * 4 + 3];
      let sway = 0;
      if (swayHeight > 0 && flex >= 0) {
        const t = Math.min(1, Math.max(0, this.pos[i * 3 + 1] / swayHeight));
        sway = Math.pow(t, 1.5) * (0.55 + 0.45 * flex) * swayMax;
      }
      color[i * 4 + 3] = sway;
    }
    return {
      position: new Float32Array(this.pos),
      normal: new Float32Array(this.nrm),
      color,
      index: new Uint32Array(this.idx),
      vertexCount: count,
      triangleCount: this.idx.length / 3,
    };
  }
}

// ───────────────────────── baking instances into one geometry ─────────────────────────

/** Reusable scratch writer: append(model, transform…) many times, then build() an exact-size BufferGeometry. */
export class BakeWriter {
  constructor() {
    this.capV = 16384;
    this.capI = 65536;
    this.position = new Float32Array(this.capV * 3);
    this.normal = new Int8Array(this.capV * 4);
    this.color = new Uint8Array(this.capV * 4);
    this.index = new Uint32Array(this.capI);
    this.reset();
  }

  reset() {
    this.v = 0;
    this.i = 0;
    this.minY = Infinity;
    this.maxY = -Infinity;
    this.minX = Infinity;
    this.maxX = -Infinity;
    this.minZ = Infinity;
    this.maxZ = -Infinity;
  }

  ensure(verts, indices) {
    if (this.v + verts > this.capV) {
      while (this.v + verts > this.capV) this.capV *= 2;
      const p = new Float32Array(this.capV * 3); p.set(this.position.subarray(0, this.v * 3)); this.position = p;
      const n = new Int8Array(this.capV * 4); n.set(this.normal.subarray(0, this.v * 4)); this.normal = n;
      const c = new Uint8Array(this.capV * 4); c.set(this.color.subarray(0, this.v * 4)); this.color = c;
    }
    if (this.i + indices > this.capI) {
      while (this.i + indices > this.capI) this.capI *= 2;
      const x = new Uint32Array(this.capI); x.set(this.index.subarray(0, this.i)); this.index = x;
    }
  }

  /** Append a model at local (x,y,z) rotated by `yaw`, scaled, with a colour tint (multiplies linear colour). */
  append(model, x, y, z, yaw, scale, tr = 1, tg = 1, tb = 1, scaleY = scale) {
    const count = model.vertexCount;
    this.ensure(count, model.index.length);
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const mp = model.position, mn = model.normal, mc = model.color;
    const P = this.position, N = this.normal, C = this.color;
    const base = this.v;
    for (let k = 0; k < count; k++) {
      const px = mp[k * 3] * scale, py = mp[k * 3 + 1] * scaleY, pz = mp[k * 3 + 2] * scale;
      const o = (base + k) * 3;
      const wx = x + px * cos + pz * sin;
      const wy = y + py;
      const wz = z - px * sin + pz * cos;
      P[o] = wx; P[o + 1] = wy; P[o + 2] = wz;
      if (wy < this.minY) this.minY = wy;
      if (wy > this.maxY) this.maxY = wy;
      if (wx < this.minX) this.minX = wx;
      if (wx > this.maxX) this.maxX = wx;
      if (wz < this.minZ) this.minZ = wz;
      if (wz > this.maxZ) this.maxZ = wz;
      const q = (base + k) * 4;
      const nx = mn[k * 4], ny = mn[k * 4 + 1], nz = mn[k * 4 + 2];
      N[q] = (nx * cos + nz * sin) * 127;
      N[q + 1] = ny * 127;
      N[q + 2] = (-nx * sin + nz * cos) * 127;
      N[q + 3] = mn[k * 4 + 3] * 127;
      // colour is stored sqrt-encoded so dark greens keep their precision in 8 bits
      C[q] = Math.min(255, Math.sqrt(mc[k * 4] * tr) * 255);
      C[q + 1] = Math.min(255, Math.sqrt(mc[k * 4 + 1] * tg) * 255);
      C[q + 2] = Math.min(255, Math.sqrt(mc[k * 4 + 2] * tb) * 255);
      C[q + 3] = mc[k * 4 + 3] * 255;
    }
    const mi = model.index;
    const I = this.index;
    for (let k = 0; k < mi.length; k++) I[this.i + k] = base + mi[k];
    this.v += count;
    this.i += mi.length;
  }

  /** Exact-size geometry of everything appended since reset(), or null when empty. */
  build() {
    if (this.v === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position.slice(0, this.v * 3), 3));
    geometry.setAttribute('aNormal', new THREE.BufferAttribute(this.normal.slice(0, this.v * 4), 4, true));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.color.slice(0, this.v * 4), 4, true));
    const index = this.v > 65535 ? this.index.slice(0, this.i) : new Uint16Array(this.index.subarray(0, this.i));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(this.minX, this.minY, this.minZ), new THREE.Vector3(this.maxX, this.maxY, this.maxZ));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    return geometry;
  }
}

// ───────────────────────── shared flora material ─────────────────────────

let floraMat = null;

/**
 * THE material of trees, bushes, rocks and ground props: lit, vertex-coloured (aColor), wind sway from aColor.a,
 * per-vertex faceting from aNormal.w, soft back-lighting on leaves. One instance for the whole world.
 */
export function floraMaterial() {
  if (floraMat) return floraMat;
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  material.onBeforeCompile = shader => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWind = shared.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aNormal;
        attribute vec4 aColor;
        uniform float uTime;
        uniform vec3 uWind;
        varying vec3 vTint;
        varying float vFlat;
        varying float vSway;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(aNormal.xyz);')
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        vTint = aColor.rgb * aColor.rgb;
        vFlat = aNormal.w;
        vSway = aColor.a;
        if (aColor.a > 0.0) {
          vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          float ph = wp.x * 0.07 + wp.z * 0.09;
          float gust = sin(uTime * 1.1 + ph) * 0.6 + sin(uTime * 2.3 + ph * 2.1) * 0.25 + sin(uTime * 0.33 + ph * 0.3) * 0.5;
          float w = length(uWind.xz);
          vec2 dir = uWind.xz / max(w, 0.001);
          transformed.xz += dir * (0.35 * w + gust * 0.5) * aColor.a * (0.10 + 0.45 * w);
          transformed.xz += vec2(sin(uTime * 4.3 + wp.x * 2.1 + wp.y * 1.7), cos(uTime * 3.7 + wp.z * 2.3 + wp.y * 1.3)) * 0.03 * aColor.a * (0.4 + w);
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTint;
        varying float vFlat;
        varying float vSway;`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `vec4 diffuseColor = vec4( diffuse * vTint, opacity );
        // dissolve foliage that would block the third-person camera
        float camDist = length(vViewPosition);
        if (camDist < 5.5) {
          float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (dither > smoothstep(1.5, 5.5, camDist)) discard;
        }`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        {
          vec3 faceN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
          normal = normalize(mix(normal, faceN, vFlat));
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        {
          float through = pow(max(dot(-geometryViewDir, directionalLights[0].direction), 0.0), 3.0) * vSway;
          reflectedLight.directDiffuse += directionalLights[0].color * diffuseColor.rgb * through * 0.22;
        }
        #endif`);
    applyShadowFade(shader);
  };
  material.customProgramCacheKey = () => 'flora';
  floraMat = material;
  return material;
}
