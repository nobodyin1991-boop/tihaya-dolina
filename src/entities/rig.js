// Shared toolkit for procedural actors (heroes, NPCs, creatures, wagon):
//  - ONE vertex-coloured material for everything alive (colour alpha encodes "metalness"),
//  - sculpting primitives (tube / ball / slab / sheet) that are fused into one mesh per bone,
//  - LOD helpers (detail draw-range, stiff far limbs),
//  - animation maths: damping, easing, sparse poses, keyframe tracks, gait and 2-bone IK.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

// ————————————————————————————————————————————————— material —————————————————————————————————————————————————
const mats = {};

function makeActorMat(doubleSide) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      #ifdef USE_COLOR_ALPHA
        float actorMetal = 1.0 - vColor.a;
        metalnessFactor = actorMetal * 0.55;
        roughnessFactor = mix(roughnessFactor, 0.34, actorMetal);
      #endif`);
  };
  m.customProgramCacheKey = () => 'actor-metal';
  return m;
}

/** The shared actor material. Vertex colour rgb = albedo, alpha = 1 - metalness. `doubleSide` for cloaks and canvas. */
export function actorMat(doubleSide = false) {
  const key = doubleSide ? 'double' : 'single';
  if (!mats[key]) mats[key] = makeActorMat(doubleSide);
  return mats[key];
}

// ————————————————————————————————————————————————— colour —————————————————————————————————————————————————
/**
 * Write an RGBA vertex colour. `metal` 0..1 (stored as alpha), `gradient` [bottomMul, topMul] along local y,
 * `jitter` 0..0.2 per-vertex brightness noise.
 */
export function tint(geo, color, { metal = 0, gradient = null, jitter = 0 } = {}) {
  const pos = geo.attributes.position;
  const arr = new Float32Array(pos.count * 4);
  _c.set(color);
  let minY = Infinity;
  let maxY = -Infinity;
  if (gradient) {
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const span = Math.max(1e-6, maxY - minY);
  for (let i = 0; i < pos.count; i++) {
    let k = 1;
    if (gradient) k *= gradient[0] + (gradient[1] - gradient[0]) * ((pos.getY(i) - minY) / span);
    if (jitter) {
      const h = Math.sin(pos.getX(i) * 12.9898 + pos.getY(i) * 78.233 + pos.getZ(i) * 37.719) * 43758.5453;
      k *= 1 + ((h - Math.floor(h)) - 0.5) * 2 * jitter;
    }
    arr[i * 4] = _c.r * k;
    arr[i * 4 + 1] = _c.g * k;
    arr[i * 4 + 2] = _c.b * k;
    arr[i * 4 + 3] = 1 - metal;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 4));
  return geo;
}

/** Multiply a hex colour's brightness (returns hex). */
export function shade(hex, k) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
}

/** Mix two hex colours (t = 0 → a, 1 → b). */
export function mix(a, b, t) {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}

// ————————————————————————————————————————————————— primitives —————————————————————————————————————————————————
/** Bake a transform: position, XYZ euler rotation, uniform or per-axis scale. */
export function xf(geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  _p.set(pos[0], pos[1], pos[2]);
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  if (typeof scale === 'number') _s.set(scale, scale, scale);
  else _s.set(scale[0], scale[1], scale[2]);
  geo.applyMatrix4(_m.compose(_p, _q, _s));
  return geo;
}

const DEFAULT_GRAD = [0.8, 1.06];

/**
 * Swept tube with smooth normals — the workhorse for limbs, torsos, tails, horns, snouts.
 * `path`: [[x, y, z, rx, rz?], …] ring centres with radii (rz defaults to rx). For a tube along y, rx is the x radius
 * and rz the z radius; along z: rx = x radius, rz = y radius.
 * opts: segs (8), caps|capStart|capEnd 'round'|'flat'|'none', sq (<1 = boxier cross-section), flat (faceted),
 * metal, gradient (default soft bottom-dark gradient; pass false for none), jitter, colors (hex per path point).
 */
export function tube(path, color, opts = {}) {
  const segs = opts.segs || 8;
  const sq = opts.sq || 1;
  const capA = opts.capStart ?? opts.caps ?? 'round';
  const capB = opts.capEnd ?? opts.caps ?? 'round';
  const n = path.length;
  const rings = [];
  const tan = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    tan.push(t);
  }
  const u = new THREE.Vector3(1, 0, 0);
  if (Math.abs(tan[0].x) > 0.9) u.set(0, 0, 1);
  const v = new THREE.Vector3();
  const addRing = (cx, cy, cz, rx, rz, t, src) => {
    u.addScaledVector(t, -u.dot(t)).normalize();
    v.crossVectors(t, u);
    rings.push({ c: [cx, cy, cz], u: u.clone(), v: v.clone(), rx, rz, src });
  };
  let poleA = null;
  let poleB = null;
  for (let i = 0; i < n; i++) {
    const p = path[i];
    const rx = p[3];
    const rz = p[4] ?? p[3];
    const t = tan[i];
    const rc = Math.min(rx, rz);
    if (i === 0 && capA !== 'none') {
      if (capA === 'round') {
        addRing(p[0] - t.x * rc * 0.5, p[1] - t.y * rc * 0.5, p[2] - t.z * rc * 0.5, rx * 0.72, rz * 0.72, t, 0);
        poleA = [p[0] - t.x * rc * 0.82, p[1] - t.y * rc * 0.82, p[2] - t.z * rc * 0.82];
      } else {
        poleA = [p[0], p[1], p[2]];
      }
    }
    addRing(p[0], p[1], p[2], rx, rz, t, i);
    if (i === n - 1 && capB !== 'none') {
      if (capB === 'round') {
        addRing(p[0] + t.x * rc * 0.5, p[1] + t.y * rc * 0.5, p[2] + t.z * rc * 0.5, rx * 0.72, rz * 0.72, t, i);
        poleB = [p[0] + t.x * rc * 0.82, p[1] + t.y * rc * 0.82, p[2] + t.z * rc * 0.82];
      } else {
        poleB = [p[0], p[1], p[2]];
      }
    }
  }
  const verts = [];
  const srcOf = [];
  for (const ring of rings) {
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      let ca = Math.cos(a);
      let sa = Math.sin(a);
      if (sq !== 1) {
        ca = Math.sign(ca) * Math.pow(Math.abs(ca), sq);
        sa = Math.sign(sa) * Math.pow(Math.abs(sa), sq);
      }
      verts.push(
        ring.c[0] + ring.u.x * ca * ring.rx + ring.v.x * sa * ring.rz,
        ring.c[1] + ring.u.y * ca * ring.rx + ring.v.y * sa * ring.rz,
        ring.c[2] + ring.u.z * ca * ring.rx + ring.v.z * sa * ring.rz,
      );
      srcOf.push(ring.src);
    }
  }
  const index = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * segs + j;
      const b = i * segs + (j + 1) % segs;
      const c = a + segs;
      const d = b + segs;
      index.push(a, b, c, b, d, c);
    }
  }
  if (poleA) {
    const pi = verts.length / 3;
    verts.push(poleA[0], poleA[1], poleA[2]);
    srcOf.push(0);
    for (let j = 0; j < segs; j++) index.push(pi, (j + 1) % segs, j);
  }
  if (poleB) {
    const pi = verts.length / 3;
    verts.push(poleB[0], poleB[1], poleB[2]);
    srcOf.push(n - 1);
    const base = (rings.length - 1) * segs;
    for (let j = 0; j < segs; j++) index.push(pi, base + j, base + (j + 1) % segs);
  }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(index);
  const gradient = opts.gradient === undefined ? DEFAULT_GRAD : (opts.gradient || null);
  tint(geo, color, { metal: opts.metal, gradient, jitter: opts.jitter });
  if (opts.colors) {
    const col = geo.attributes.color;
    for (let i = 0; i < srcOf.length; i++) {
      _c.set(opts.colors[srcOf[i]]);
      col.setXYZ(i, _c.r, _c.g, _c.b);
    }
  }
  if (opts.flat) {
    const ni = geo.toNonIndexed();
    geo.dispose();
    geo = ni;
  }
  geo.computeVertexNormals();
  return geo;
}

/** Sphere / ellipsoid. `scale` number | [sx,sy,sz]; opts: segs, rings, rot, metal, gradient, jitter. */
export function ball(r, color, pos = [0, 0, 0], scale = 1, opts = {}) {
  const geo = new THREE.SphereGeometry(r, opts.segs || 9, opts.rings || 6);
  xf(geo, pos, opts.rot || [0, 0, 0], scale);
  const gradient = opts.gradient === undefined ? DEFAULT_GRAD : (opts.gradient || null);
  return tint(geo, color, { metal: opts.metal, gradient, jitter: opts.jitter });
}

/** Hard-edged box centred at `pos`. */
export function slab(w, h, d, color, pos = [0, 0, 0], rot = [0, 0, 0], opts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  xf(geo, pos, rot);
  return tint(geo, color, { metal: opts.metal, gradient: opts.gradient || null, jitter: opts.jitter });
}

/** Cylinder / cone centred at `pos`, axis along local y before `rot`. */
export function rod(rTop, rBottom, h, color, pos = [0, 0, 0], rot = [0, 0, 0], opts = {}) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, opts.segs || 7, 1, !!opts.open);
  xf(geo, pos, rot);
  return tint(geo, color, { metal: opts.metal, gradient: opts.gradient || null, jitter: opts.jitter });
}

/** Torus (rings, wheel rims). Lies in the xy plane before `rot`. */
export function hoop(radius, thickness, color, pos = [0, 0, 0], rot = [0, 0, 0], opts = {}) {
  const geo = new THREE.TorusGeometry(radius, thickness, opts.tubeSegs || 5, opts.segs || 14, opts.arc || Math.PI * 2);
  xf(geo, pos, rot);
  return tint(geo, color, { metal: opts.metal, gradient: opts.gradient || null, jitter: opts.jitter });
}

/**
 * Parametric sheet (cloaks, banners, canvas): fn(u, v) -> [x, y, z] with u in [-1,1] across, v in [0,1] along.
 * Render it with actorMat(true).
 */
export function sheet(cols, rows, fn, color, opts = {}) {
  const verts = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const p = fn((c / cols) * 2 - 1, r / rows);
      verts.push(p[0], p[1], p[2]);
    }
  }
  const index = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const d = a + cols + 1;
      const e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const gradient = opts.gradient === undefined ? [0.72, 1.05] : (opts.gradient || null);
  return tint(geo, color, { metal: opts.metal, gradient, jitter: opts.jitter });
}

/** Mirror a geometry across the yz plane (x → -x), fixing the winding. Returns a new non-indexed geometry. */
export function mirrorX(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of ['position', 'normal']) {
    const a = g.attributes[name];
    if (!a) continue;
    for (let i = 0; i < a.count; i++) a.setX(i, -a.getX(i));
  }
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name];
    const size = a.itemSize;
    const arr = a.array;
    for (let t = 0; t < a.count; t += 3) {
      for (let k = 0; k < size; k++) {
        const i1 = (t + 1) * size + k;
        const i2 = (t + 2) * size + k;
        const tmp = arr[i1];
        arr[i1] = arr[i2];
        arr[i2] = tmp;
      }
    }
  }
  return g;
}

function normalise(geo) {
  let g = geo;
  if (g.index) {
    g = g.toNonIndexed();
    geo.dispose();
  }
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color || g.attributes.color.itemSize !== 4) tint(g, 0xffffff);
  return g;
}

/** Merge painted geometries (nested arrays and nulls allowed) into one non-indexed geometry. Disposes the inputs. */
export function fuse(geos) {
  const list = geos.flat(Infinity).filter(Boolean).map(normalise);
  if (!list.length) return new THREE.BufferGeometry();
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Build one mesh for a bone. `detail` geometries are appended after the core ones and are dropped (draw range)
 * at LOD ≥ 1. opts: double (two-sided), name, shadow (default true), material.
 */
export function part(core, detail = null, opts = {}) {
  const coreGeo = fuse(core);
  let geo = coreGeo;
  let coreCount = coreGeo.attributes.position ? coreGeo.attributes.position.count : 0;
  if (detail && detail.flat(Infinity).filter(Boolean).length) {
    geo = fuse([coreGeo, detail]);
  } else {
    coreCount = -1;
  }
  const mesh = new THREE.Mesh(geo, opts.material || actorMat(!!opts.double));
  mesh.castShadow = opts.shadow !== false;
  mesh.receiveShadow = false;
  mesh.userData.coreCount = coreCount;
  mesh.userData.shadow = opts.shadow !== false;
  if (opts.name) mesh.name = opts.name;
  return mesh;
}

/** Create a joint (THREE.Group) under `parent`. */
export function joint(parent, x = 0, y = 0, z = 0, name = '') {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.name = name;
  if (parent) parent.add(g);
  return g;
}

// ————————————————————————————————————————————————— LOD —————————————————————————————————————————————————
/**
 * Far-LOD limb: fuse every mesh under `upper` (in the current rest pose) into one rigid mesh attached to `upper`.
 * Originals get lodMax = 1, the stiff copy lodMin = 2 → a two/three-joint limb costs one draw call far away.
 */
export function stiffLimb(upper) {
  upper.updateMatrixWorld(true);
  _m2.copy(upper.matrixWorld).invert();
  const geos = [];
  upper.traverse(o => {
    if (!o.isMesh || o.userData.noStiff) return;
    const count = o.userData.coreCount > 0 ? o.userData.coreCount : o.geometry.attributes.position.count;
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) {
      const a = o.geometry.attributes[name];
      g.setAttribute(name, new THREE.BufferAttribute(a.array.slice(0, count * a.itemSize), a.itemSize));
    }
    g.applyMatrix4(_m.multiplyMatrices(_m2, o.matrixWorld));
    geos.push(g);
    o.userData.lodMax = 1;
  });
  if (!geos.length) return null;
  const mesh = part(geos);
  mesh.userData.lodMin = 2;
  mesh.userData.shadow = false;
  mesh.castShadow = false;
  mesh.visible = false;
  upper.add(mesh);
  return mesh;
}

/** Collect meshes once; returns setLod(level) that toggles visibility, detail draw ranges and shadows. */
export function makeLod(root) {
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  let current = -1;
  return function setLod(level) {
    if (level === current) return;
    current = level;
    for (const mesh of meshes) {
      const ud = mesh.userData;
      const inRange = level >= (ud.lodMin || 0) && level <= (ud.lodMax ?? 2);
      mesh.visible = inRange && !ud.hidden;
      mesh.castShadow = ud.shadow !== false && level < 2;
      if (ud.coreCount > 0 && !ud.sharedGeo) mesh.geometry.setDrawRange(0, level >= 1 ? ud.coreCount : Infinity);
    }
  };
}

/** Dispose all geometries under an object that are not flagged as shared/cached. */
export function disposeActor(group) {
  if (group.parent) group.parent.remove(group);
  group.traverse(o => {
    if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose();
  });
}

/** Count draw calls / triangles of the currently visible meshes (for the preview read-out). */
export function countStats(root) {
  let calls = 0;
  let tris = 0;
  root.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    let p = o.parent;
    while (p) {
      if (!p.visible) return;
      p = p.parent;
    }
    const pos = o.geometry.attributes.position;
    if (!pos) return;
    const inst = o.isInstancedMesh ? o.count : 1;
    const total = o.geometry.index ? o.geometry.index.count : pos.count;
    const range = Math.min(total, o.geometry.drawRange.count);
    calls += 1;
    tris += (range / 3) * inst;
  });
  return { calls, tris: Math.round(tris) };
}

// ————————————————————————————————————————————————— animation maths —————————————————————————————————————————————————
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);
export function smoothstep(e0, e1, x) {
  return smooth(clamp((x - e0) / (e1 - e0), 0, 1));
}
/** Frame-rate independent exponential approach. */
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export const EASE = {
  lin: t => t,
  io: smooth,
  in: t => t * t * t,
  out: t => 1 - (1 - t) * (1 - t) * (1 - t),
  snap: t => 1 - Math.pow(1 - t, 5),
  back: t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
};

/** Dense pose (3 floats per joint name) from a sparse `{ joint: [x,y,z] }` dictionary. */
export function compilePose(names, pose) {
  const out = new Float32Array(names.length * 3);
  for (const key of Object.keys(pose)) {
    const i = names.indexOf(key);
    if (i < 0) continue;
    out[i * 3] = pose[key][0];
    out[i * 3 + 1] = pose[key][1];
    out[i * 3 + 2] = pose[key][2];
  }
  return out;
}

/**
 * Compile a keyframe track: def = { dur, strike?, fin?, fout?, keys: [[t, ease, pose], …] }.
 * A joint missing from a key holds its previous key's value; only joints used by the track are driven.
 */
export function compileTrack(names, def) {
  const used = new Uint8Array(names.length);
  for (const key of def.keys) {
    for (const name of Object.keys(key[2])) {
      const i = names.indexOf(name);
      if (i >= 0) used[i] = 1;
    }
  }
  const keys = [];
  let prev = new Float32Array(names.length * 3);
  let first = true;
  for (const key of def.keys) {
    const vals = prev.slice();
    for (const name of Object.keys(key[2])) {
      const i = names.indexOf(name);
      if (i < 0) continue;
      vals[i * 3] = key[2][name][0];
      vals[i * 3 + 1] = key[2][name][1];
      vals[i * 3 + 2] = key[2][name][2];
    }
    keys.push({ t: key[0], ease: EASE[key[1]] || EASE.io, vals });
    prev = vals;
    first = false;
  }
  if (first) keys.push({ t: 0, ease: EASE.io, vals: prev });
  const joints = [];
  for (let i = 0; i < used.length; i++) if (used[i]) joints.push(i);
  return { dur: def.dur || 0.6, strike: def.strike ?? 0.5, fin: def.fin ?? 0.12, fout: def.fout ?? 0.28, keys, joints };
}

/** Blend the track value at normalised time `u` into `out` with `weight` (only the track's joints). */
export function sampleTrack(track, u, out, weight) {
  const keys = track.keys;
  let k = 0;
  while (k < keys.length - 2 && u > keys[k + 1].t) k++;
  const a = keys[k];
  const b = keys[Math.min(k + 1, keys.length - 1)];
  let f = b.t > a.t ? clamp((u - a.t) / (b.t - a.t), 0, 1) : 1;
  f = b.ease(f);
  if (u <= a.t) f = 0;
  for (const j of track.joints) {
    for (let c = 0; c < 3; c++) {
      const i = j * 3 + c;
      const val = a.vals[i] + (b.vals[i] - a.vals[i]) * f;
      out[i] += (val - out[i]) * weight;
    }
  }
}

/** Fade-in/out envelope of a one-shot track at normalised time u. */
export function trackWeight(track, u) {
  const wi = track.fin > 0 ? clamp(u / track.fin, 0, 1) : 1;
  const wo = track.fout > 0 ? clamp((1 - u) / track.fout, 0, 1) : 1;
  return smooth(Math.min(wi, wo));
}

/**
 * Cyclic foot path. p in [0,1): first `duty` of the cycle is stance (foot travels +0.5 → -0.5 at constant speed —
 * no sliding), the rest is swing. Writes out.z (× stride) and out.lift (0..1).
 */
export function gaitFoot(p, duty, out) {
  p -= Math.floor(p);
  if (p < duty) {
    out.z = 0.5 - p / duty;
    out.lift = 0;
    out.swing = 0;
  } else {
    const u = (p - duty) / (1 - duty);
    out.z = -0.5 + smooth(u);
    out.lift = Math.sin(Math.PI * Math.pow(u, 0.8));
    out.swing = u;
  }
  return out;
}

/**
 * Planar 2-bone leg IK in the sagittal plane. Target (z forward, y up) relative to the hip, limb rests along -y.
 * bend = +1: knee points forward (human knee, animal fore leg); -1: hock points backward (animal hind leg).
 * Writes out.a (upper x-rotation) and out.b (lower x-rotation); negative x = swing forward.
 */
export function legIK(z, y, l1, l2, bend, out) {
  let d = Math.hypot(z, y);
  const max = (l1 + l2) * 0.999;
  const min = Math.abs(l1 - l2) + 0.001;
  d = clamp(d, min, max);
  const theta = Math.atan2(z, -y);
  const alpha = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const beta = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  out.a = -(theta + bend * alpha);
  out.b = bend * (Math.PI - beta);
  return out;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const _d = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fore = new THREE.Vector3();
const _qi = new THREE.Quaternion();

/**
 * 3D 2-bone IK. `target` is in the space of upper's parent; limbs rest along -y. `pole` = direction the
 * elbow/knee should point. Sets upper.quaternion and lower.quaternion. Returns the clamped reach (0..1).
 */
export function ik2(upper, lower, l1, l2, target, pole) {
  _d.copy(target).sub(upper.position);
  const raw = _d.length();
  const dist = clamp(raw, Math.abs(l1 - l2) + 0.001, (l1 + l2) * 0.999);
  _d.multiplyScalar(1 / Math.max(raw, 1e-5));
  _bend.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_bend.lengthSq() < 1e-6) _bend.set(0, 0, -1).addScaledVector(_d, _d.z);
  _bend.normalize();
  const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _up.copy(_d).multiplyScalar(cosA).addScaledVector(_bend, sinA);
  _fore.copy(_d).multiplyScalar(dist).addScaledVector(_up, -l1).normalize();
  upper.quaternion.setFromUnitVectors(DOWN, _up);
  _qi.copy(upper.quaternion).invert();
  _fore.applyQuaternion(_qi);
  lower.quaternion.setFromUnitVectors(DOWN, _fore);
  return dist / (l1 + l2);
}
