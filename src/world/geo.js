// Geometry helpers for building low-draw-call procedural models:
// make primitive -> paint() it with a vertex colour -> place() it -> merge() many into one geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Give a geometry a uniform vertex colour (sRGB hex). `jitter` (0..0.2) varies brightness per vertex for a hand-made look;
 * `gradient` = [bottomMul, topMul] darkens/lightens along local y (fake ambient occlusion: e.g. [0.75, 1.05]).
 * Returns the same geometry (non-indexed is fine).
 */
export function paint(geometry, color, { jitter = 0, gradient = null } = {}) {
  const pos = geometry.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  _c.set(color);
  let minY = Infinity, maxY = -Infinity;
  if (gradient) for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
  for (let i = 0; i < pos.count; i++) {
    let k = 1;
    if (gradient) k *= gradient[0] + (gradient[1] - gradient[0]) * ((pos.getY(i) - minY) / Math.max(1e-6, maxY - minY));
    if (jitter) { const h = Math.sin(pos.getX(i) * 12.9898 + pos.getY(i) * 78.233 + pos.getZ(i) * 37.719) * 43758.5453; k *= 1 + ((h - Math.floor(h)) - 0.5) * 2 * jitter; }
    arr[i * 3] = _c.r * k; arr[i * 3 + 1] = _c.g * k; arr[i * 3 + 2] = _c.b * k;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geometry;
}

/** Add a constant per-vertex float attribute (e.g. `sway` for wind). Optional fn(x,y,z) -> value. */
export function setAttr(geometry, name, value) {
  const pos = geometry.attributes.position;
  const arr = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) arr[i] = typeof value === 'function' ? value(pos.getX(i), pos.getY(i), pos.getZ(i)) : value;
  geometry.setAttribute(name, new THREE.BufferAttribute(arr, 1));
  return geometry;
}

/** Bake a transform into a geometry: position [x,y,z], rotation [rx,ry,rz] (radians, XYZ order), scale number | [sx,sy,sz]. */
export function place(geometry, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  _p.set(pos[0], pos[1], pos[2]);
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  if (typeof scale === 'number') _s.set(scale, scale, scale); else _s.set(scale[0], scale[1], scale[2]);
  geometry.applyMatrix4(_m.compose(_p, _q, _s));
  return geometry;
}

/**
 * Merge painted geometries into one. All inputs must carry the same attribute set (position, normal, color, and
 * optionally sway) — uv is dropped, index is removed. Disposes the inputs.
 */
export function merge(geometries) {
  const list = [];
  let needSway = false;
  for (const g of geometries) if (g.attributes.sway) needSway = true;
  for (let g of geometries) {
    if (g.index) { const ni = g.toNonIndexed(); g.dispose(); g = ni; }
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'sway'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.color) paint(g, 0xffffff);
    if (needSway && !g.attributes.sway) setAttr(g, 'sway', 0);
    list.push(g);
  }
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

// —— painted primitive shortcuts (all return a NEW painted, placed geometry) ——
/** Box centred on its base centre unless `centered`. */
export function box(w, h, d, color, pos = [0, 0, 0], rot = [0, 0, 0], opts = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (!opts.centered) g.translate(0, h / 2, 0);
  return place(paint(g, color, opts), pos, rot);
}
/** Cylinder/cone standing on its base. */
export function cyl(rTop, rBottom, h, color, pos = [0, 0, 0], rot = [0, 0, 0], opts = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, opts.segments || 8, 1, !!opts.open);
  if (!opts.centered) g.translate(0, h / 2, 0);
  return place(paint(g, color, opts), pos, rot);
}
export function sphere(r, color, pos = [0, 0, 0], scale = 1, opts = {}) {
  const g = opts.ico !== undefined ? new THREE.IcosahedronGeometry(r, opts.ico) : new THREE.SphereGeometry(r, opts.segments || 10, opts.rings || 7);
  return place(paint(g, color, opts), pos, [0, 0, 0], scale);
}
/** Gable roof prism: width (x), height, depth (z); ridge runs along z. Base at y=0. */
export function gable(w, h, d, color, pos = [0, 0, 0], rot = [0, 0, 0], opts = {}) {
  const hw = w / 2, hd = d / 2;
  const v = [
    -hw, 0, hd, hw, 0, hd, 0, h, hd,            // front
    hw, 0, -hd, -hw, 0, -hd, 0, h, -hd,         // back
    -hw, 0, -hd, -hw, 0, hd, 0, h, hd, -hw, 0, -hd, 0, h, hd, 0, h, -hd,   // left slope
    hw, 0, hd, hw, 0, -hd, 0, h, -hd, hw, 0, hd, 0, h, -hd, 0, h, hd,     // right slope
    -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, -hd, hw, 0, hd, -hw, 0, hd, // bottom
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return place(paint(g, color, opts), pos, rot);
}

/** Dispose every geometry (and non-shared texture) under an object. Materials from materials.js are shared — not disposed. */
export function disposeTree(object) {
  object.traverse(o => { if (o.geometry) o.geometry.dispose(); });
}
