// Builds the 3D model of a city from its layout: a handful of big merged meshes per material and district chunk.
// Colliders are registered immediately; geometry is generated in time slices so that streaming a city in does
// not freeze a frame (pass ctx.sync = true to build everything at once, e.g. behind a loading screen).
import * as THREE from 'three';
import { PALETTE as P } from './materials.js';
import { makeRng, seedFrom } from '../core/noise.js';
import { Mesher } from './mesher.js';
import { getCityLayout } from './city-layout.js';
import { emitBuilding } from './buildings.js';
import { emitWalls } from './walls.js';
import { emitProp } from './props.js';

const GROUND = {
  timber: { street: 0x9c8660, edge: 0x85744f, square: 0xa8926a, stone: null, yard: 0x8a7650 },
  stone: { street: 0x8a8880, edge: 0x6f6e68, square: 0x97958c, stone: [0x7d7b72, 0xa3a093, 0x8f8c82], yard: 0x7a776c },
  harbor: { street: 0xcbb98f, edge: 0xb39f76, square: 0xd9c9a0, stone: [0xc4b084, 0xe0d2ae, 0xd2c198], yard: 0xbfae86 },
};

/** Flat ribbon along a polyline, lighter in the middle and darker at the verges. */
function ribbon(m, pts, half, y, colors) {
  const n = pts.length;
  const side = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    side.push([dz / len, -dx / len]);
  }
  for (let i = 0; i + 1 < n; i++) {
    const p = pts[i], q = pts[i + 1], sp = side[i], sq = side[i + 1];
    const at = (pt, s, k) => [pt.x + s[0] * k, y, pt.z + s[1] * k];
    const inner = half * 0.62, outer = half + 0.7;
    m.quad(at(p, sp, -inner), at(q, sq, -inner), at(q, sq, inner), at(p, sp, inner), colors.street, { vj: 0.05 });
    m.quad(at(p, sp, inner), at(q, sq, inner), at(q, sq, outer), at(p, sp, outer), colors.edge, { k: [1.12, 1.12, 0.9, 0.9], vj: 0.05 });
    m.quad(at(p, sp, -outer), at(q, sq, -outer), at(q, sq, -inner), at(p, sp, -inner), colors.edge, { k: [0.9, 0.9, 1.12, 1.12], vj: 0.05 });
  }
}

function emitGround(m, layout) {
  const y = layout.city.y + 0.04;
  const colors = GROUND[layout.style];
  const rng = makeRng(seedFrom('ground:' + layout.city.key));
  m.use('ground');
  for (const s of layout.streets) {
    if (s.kind === 'square') continue;
    ribbon(m, s.pts, s.half, y, colors);
  }
  const sq = layout.square;
  m.cyl(sq.r + 0.6, sq.r + 0.6, 0.02, colors.square, sq.x, y + 0.012, sq.z, { seg: 28, vj: 0.04 });
  m.cyl(sq.r * 0.5, sq.r * 0.5, 0.02, colors.street, sq.x, y + 0.03, sq.z, { seg: 20, vj: 0.04 });
  for (const key of ['caravanYard', 'caravanArrive', 'trainer']) {
    const spot = layout.spots[key];
    m.cyl(key === 'caravanYard' ? 10.5 : 6.5, key === 'caravanYard' ? 10.5 : 6.5, 0.02, colors.yard, spot.x, y + 0.006, spot.z, { seg: 14, vj: 0.06 });
  }
  // paving stones (stone / harbour) or cart ruts (timber)
  for (const s of layout.streets) {
    for (let i = 0; i + 1 < s.pts.length; i++) {
      const a = s.pts[i], b = s.pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z), rot = Math.atan2(b.x - a.x, b.z - a.z);
      if (colors.stone) {
        const count = Math.round(len * s.half * (s.kind === 'main' || s.kind === 'quay' ? 0.3 : 0.2));
        for (let k = 0; k < count; k++) {
          const t = rng(), off = (rng() - 0.5) * 2 * (s.half - 0.3);
          const px = a.x + (b.x - a.x) * t + Math.cos(rot) * off, pz = a.z + (b.z - a.z) * t - Math.sin(rot) * off;
          m.box(0.5 + rng() * 0.6, 0.02, 0.4 + rng() * 0.5, colors.stone[k % 3], px, y + 0.03, pz, { ry: rot + (rng() - 0.5) * 0.3, j: 0.1, nb: true });
        }
      } else if (s.kind === 'main') {
        for (const off of [-0.9, 0.9]) {
          const px = (a.x + b.x) / 2 + Math.cos(rot) * off, pz = (a.z + b.z) / 2 - Math.sin(rot) * off;
          m.box(0.34, 0.02, len, 0x7d6a48, px, y + 0.02, pz, { ry: rot, nb: true, vj: 0.08 });
        }
      }
    }
  }
  if (colors.stone) {
    for (let k = 0; k < 150; k++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * sq.r;
      m.box(0.6 + rng() * 0.6, 0.02, 0.5 + rng() * 0.5, colors.stone[k % 3], sq.x + Math.cos(a) * d, y + 0.045, sq.z + Math.sin(a) * d, { ry: a, j: 0.1, nb: true });
    }
  }
  m.use('flat');
}

/**
 * Build a city. ctx = { scene, colliders, quality, sync? }.
 * Returns { group, lamps: [{x,y,z}], layout, ready: Promise, dispose() }.
 */
export function buildCity(ctx, cityKey) {
  const layout = getCityLayout(cityKey);
  const y = layout.city.y;
  const group = new THREE.Group();
  group.name = 'city:' + cityKey;
  ctx.scene.add(group);

  const handles = [];
  for (const c of layout.colliders) {
    const opts = { top: y + c.h, tag: 'city:' + c.tag };
    handles.push(c.kind === 'circle' ? ctx.colliders.addCircle(c.x, c.z, c.r, opts) : ctx.colliders.addBox(c.x, c.z, c.hw, c.hd, c.rot, opts));
  }

  const m = new Mesher(seedFrom('city:' + cityKey));
  const flush = filter => {
    for (const mesh of m.build({ filter })) group.add(mesh);
  };
  const chunks = [...new Set([...layout.buildings, ...layout.decor].map(b => b.chunk))].sort();
  const tasks = [];
  tasks.push(() => {
    emitGround(m, layout);
    flush(key => key === 'ground');
  });
  tasks.push(() => emitWalls(m, layout));
  for (const chunk of chunks) {
    tasks.push(() => {
      m.setChunk(chunk);
      for (const b of layout.buildings) {
        if (b.chunk !== chunk) continue;
        m.push(b.x, y, b.z, b.rot);
        emitBuilding(m, b, layout.style);
        m.pop();
      }
      for (const d of layout.decor) {
        if (d.chunk === chunk) emitProp(m, d.kind, d.x, y, d.z, d.rot, { seed: d.seed });
      }
      m.setChunk('');
      flush(key => key.endsWith('@' + chunk));
    });
  }
  tasks.push(() => flush(null));

  let disposed = false;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const result = {
    group, lamps: layout.lamps, layout, ready, built: false,
    dispose() {
      disposed = true;
      for (const id of handles) ctx.colliders.remove(id);
      ctx.scene.remove(group);
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      group.clear();
    },
  };
  const finish = () => {
    result.built = true;
    resolveReady(result);
  };
  if (ctx.sync || typeof setTimeout !== 'function') {
    for (const task of tasks) task();
    finish();
  } else {
    let i = 0;
    const step = () => {
      if (disposed) return;
      tasks[i++]();
      if (i < tasks.length) setTimeout(step, 0); else finish();
    };
    step();
  }
  return result;
}
