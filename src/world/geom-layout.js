// 2D geometry helpers for settlement layouts. Pure — no three, no DOM.
// A "box" is {x, z, w, d, rot}: w along local x, d along local z, rot = yaw (local +z points to (sin rot, cos rot)).
// The convention matches collision.js addBox(x, z, w/2, d/2, rot) and a THREE object with rotation.y = rot.

export const DEG = Math.PI / 180;

/** Point at azimuth (degrees, 0 = +z south, 90 = +x east) and distance r from the origin: [x, z]. */
export const polar = (azDeg, r) => [Math.sin(azDeg * DEG) * r, Math.cos(azDeg * DEG) * r];

/** World point -> box-local [lx, lz]. */
export function toLocal(b, x, z) {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const dx = x - b.x, dz = z - b.z;
  return [dx * c - dz * s, dx * s + dz * c];
}

/** Box-local point -> world [x, z]. */
export function toWorld(b, lx, lz) {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  return [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
}

export function pointInBox(b, x, z, grow = 0) {
  const [lx, lz] = toLocal(b, x, z);
  return Math.abs(lx) <= b.w / 2 + grow && Math.abs(lz) <= b.d / 2 + grow;
}

/** Corners of a box grown by `grow`: [[x,z] × 4]. */
export function boxCorners(b, grow = 0) {
  const hw = b.w / 2 + grow, hd = b.d / 2 + grow;
  return [toWorld(b, -hw, -hd), toWorld(b, hw, -hd), toWorld(b, hw, hd), toWorld(b, -hw, hd)];
}

/** Distance from a point to a box (0 inside). */
export function pointBoxDist(b, x, z) {
  const [lx, lz] = toLocal(b, x, z);
  const ex = Math.max(0, Math.abs(lx) - b.w / 2), ez = Math.max(0, Math.abs(lz) - b.d / 2);
  return Math.hypot(ex, ez);
}

/** Separating-axis overlap test of two boxes with an extra margin between them. */
export function boxesOverlap(a, b, margin = 0) {
  const reach = Math.hypot(a.w, a.d) / 2 + Math.hypot(b.w, b.d) / 2 + margin;
  if (Math.abs(a.x - b.x) > reach || Math.abs(a.z - b.z) > reach) return false;
  const ca = boxCorners(a, margin / 2), cb = boxCorners(b, margin / 2);
  for (const box of [a, b]) {
    const c = Math.cos(box.rot), s = Math.sin(box.rot);
    for (const [ax, az] of [[c, -s], [s, c]]) {
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const p of ca) { const v = p[0] * ax + p[1] * az; if (v < a0) a0 = v; if (v > a1) a1 = v; }
      for (const p of cb) { const v = p[0] * ax + p[1] * az; if (v < b0) b0 = v; if (v > b1) b1 = v; }
      if (a1 < b0 || b1 < a0) return false;
    }
  }
  return true;
}

export function pointSegDist(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - x0) * dx + (pz - z0) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - x0 - dx * t, pz - z0 - dz * t);
}

function cross(ax, az, bx, bz) {
  return ax * bz - az * bx;
}

function segmentsCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1 = cross(bx - ax, bz - az, cx - ax, cz - az);
  const d2 = cross(bx - ax, bz - az, dx - ax, dz - az);
  const d3 = cross(dx - cx, dz - cz, ax - cx, az - cz);
  const d4 = cross(dx - cx, dz - cz, bx - cx, bz - cz);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

export function segSegDist(ax, az, bx, bz, cx, cz, dx, dz) {
  if (segmentsCross(ax, az, bx, bz, cx, cz, dx, dz)) return 0;
  return Math.min(
    pointSegDist(ax, az, cx, cz, dx, dz), pointSegDist(bx, bz, cx, cz, dx, dz),
    pointSegDist(cx, cz, ax, az, bx, bz), pointSegDist(dx, dz, ax, az, bx, bz),
  );
}

/** Distance between a segment and a box (0 when they touch or the segment is inside). */
export function segBoxDist(x0, z0, x1, z1, b) {
  const reach = Math.hypot(b.w, b.d) / 2;
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, half = Math.hypot(x1 - x0, z1 - z0) / 2;
  const far = Math.hypot(mx - b.x, mz - b.z) - half - reach;
  if (far > 30) return far;
  if (pointInBox(b, x0, z0) || pointInBox(b, x1, z1)) return 0;
  const c = boxCorners(b);
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const p = c[i], q = c[(i + 1) % 4];
    const d = segSegDist(x0, z0, x1, z1, p[0], p[1], q[0], q[1]);
    if (d < best) best = d;
  }
  return best;
}

/** Length of a polyline [[x,z]...]. */
export function polyLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return len;
}

/** Resample a polyline into points at most `step` apart (keeps the vertices). */
export function subdivide(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}

/** Distance from a point to a polyline. */
export function pointPolyDist(px, pz, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const d = pointSegDist(px, pz, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    if (d < best) best = d;
  }
  return best;
}
