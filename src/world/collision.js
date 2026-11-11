// Static 2.5D colliders (circles and rotated boxes) in a spatial hash. Pure — no three.
// World builders register obstacles; movement code calls resolve().

const CELL = 16;
const keyOf = (cx, cz) => (cx + 4096) * 8192 + cz + 4096;

export function createColliders() {
  const grid = new Map();
  let nextId = 1;
  const all = new Map();

  function cellsFor(c, fn) {
    const r = c.bound;
    const x0 = Math.floor((c.x - r) / CELL), x1 = Math.floor((c.x + r) / CELL);
    const z0 = Math.floor((c.z - r) / CELL), z1 = Math.floor((c.z + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) fn(keyOf(cx, cz));
  }
  function insert(c) {
    c.id = nextId++;
    all.set(c.id, c);
    cellsFor(c, k => { let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(c); });
    return c.id;
  }

  /** Circle obstacle. opts: {top: absolute y of its top (default Infinity), tag}. Returns a handle for remove(). */
  function addCircle(x, z, r, opts = {}) {
    return insert({ kind: 0, x, z, r, bound: r, top: opts.top ?? Infinity, tag: opts.tag || '' });
  }
  /** Rotated box obstacle: half-width hw (local x), half-depth hd (local z), rotation `rot` around y (radians). */
  function addBox(x, z, hw, hd, rot = 0, opts = {}) {
    return insert({ kind: 1, x, z, hw, hd, cos: Math.cos(rot), sin: Math.sin(rot), bound: Math.hypot(hw, hd), top: opts.top ?? Infinity, tag: opts.tag || '' });
  }
  function remove(id) {
    const c = all.get(id);
    if (!c) return;
    all.delete(id);
    cellsFor(c, k => { const a = grid.get(k); if (a) { const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); } });
  }

  function pushOut(c, p, radius) {
    if (c.kind === 0) {
      const dx = p.x - c.x, dz = p.z - c.z, min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) return false;
      const d = Math.sqrt(d2) || 0.0001;
      p.x = c.x + dx / d * min; p.z = c.z + dz / d * min;
      return true;
    }
    // box: work in local space
    const dx = p.x - c.x, dz = p.z - c.z;
    const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
    const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz));
    let ex = lx - qx, ez = lz - qz;
    const d2 = ex * ex + ez * ez;
    if (d2 >= radius * radius) return false;
    let nx, nz;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2); nx = qx + ex / d * radius; nz = qz + ez / d * radius;
    } else {
      // centre is inside the box: exit through the nearest face
      const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
      if (px < pz) { nx = (lx < 0 ? -1 : 1) * (c.hw + radius); nz = lz; } else { nx = lx; nz = (lz < 0 ? -1 : 1) * (c.hd + radius); }
    }
    p.x = c.x + nx * c.cos + nz * c.sin; p.z = c.z - nx * c.sin + nz * c.cos;
    return true;
  }

  /**
   * Push a circle of `radius` at (x,z) out of all obstacles. `feetY` lets tall obstacles be ignored when standing above them.
   * Returns {x, z, hit}.
   */
  function resolve(x, z, radius, feetY = -Infinity, minBound = 0) {
    const p = { x, z };
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const x0 = Math.floor((p.x - radius) / CELL), x1 = Math.floor((p.x + radius) / CELL);
      const z0 = Math.floor((p.z - radius) / CELL), z1 = Math.floor((p.z + radius) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const a = grid.get(keyOf(cx, cz));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          if (feetY >= a[i].top - 0.05 || a[i].bound < minBound) continue;
          if (pushOut(a[i], p, radius)) moved = hit = true;
        }
      }
      if (!moved) break;
    }
    return { x: p.x, z: p.z, hit };
  }

  /** True if the point (with radius) overlaps any obstacle. */
  function blocked(x, z, radius = 0.3, feetY = -Infinity, minBound = 0) {
    return resolve(x, z, radius, feetY, minBound).hit;
  }

  /** True if the straight segment is obstructed (sampled). Used for line of sight and NPC steering. */
  function segmentBlocked(x0, z0, x1, z1, radius = 0.25, step = 1.2) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (blocked(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, radius)) return true;
    }
    return false;
  }

  /** `minBound` skips small obstacles (tree trunks, posts) so the camera does not jump in for them. */
  /** First obstruction distance along a 3D-ish ray for the camera (2D obstacles, uses `top`). Returns distance or maxDist. */
  function rayDistance(x, y, z, dx, dy, dz, maxDist, radius = 0.3, step = 0.5, minBound = 0) {
    for (let d = step; d < maxDist; d += step) {
      if (blocked(x + dx * d, z + dz * d, radius, y + dy * d, minBound)) return d;
    }
    return maxDist;
  }

  return { addCircle, addBox, remove, resolve, blocked, segmentBlocked, rayDistance, get count() { return all.size; } };
}
