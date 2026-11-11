// Weapons, shields, tools and hats. Convention for hand-held gear: origin = grip centre (main hand),
// +y = blade / barrel direction, edge towards ±z, "top" of aimed weapons (crossbow, emitter) = -z.
// Shields face +z. Hats are returned as geometry lists in head space and are fused into the head mesh.
import * as THREE from 'three';
import { PALETTE as P, glowMat } from '../world/materials.js';
import { tube, ball, slab, rod, hoop, part, shade, tint, actorMat } from './rig.js';

const M = { metal: 1 };
const HALF_PI = Math.PI / 2;

/** Blade / plate colour by gear tier 1..6. */
export function tierMetal(tier = 1) {
  if (tier >= 6) return P.mithril;
  if (tier >= 5) return 0x8fa2b8;
  if (tier >= 3) return P.steel;
  return 0x7d838a;
}

/** Trim colour by tier (iron → bronze → gold). */
export function tierTrim(tier = 1) {
  if (tier >= 5) return P.gold;
  if (tier >= 3) return P.bronze;
  return P.iron;
}

function blade(len, width, color, y0 = 0.03, thick = 0.011) {
  const path = [
    [0, y0, 0, thick, width],
    [0, y0 + len * 0.55, 0, thick * 0.9, width * 0.86],
    [0, y0 + len * 0.9, 0, thick * 0.7, width * 0.55],
    [0, y0 + len, 0, 0.002, 0.004],
  ];
  return tube(path, color, { segs: 4, flat: true, caps: 'none', metal: 1, gradient: [0.85, 1.12] });
}

function hilt(gripLen, color, trim, guardW) {
  return [
    rod(0.017, 0.019, gripLen, color, [0, -gripLen / 2 + 0.03, 0]),
    slab(0.03, 0.028, guardW, trim, [0, 0.035, 0], [0, 0, 0], M),
    ball(0.027, trim, [0, -gripLen + 0.02, 0], 1, { metal: 1, segs: 6, rings: 4 }),
  ];
}

function shaft(from, to, color = P.wood, r = 0.018) {
  return rod(r, r * 1.08, to - from, color, [0, (from + to) / 2, 0], [0, 0, 0], { gradient: [0.8, 1.05] });
}

const BUILDERS = {
  sword(o) {
    const metal = tierMetal(o.tier);
    return { geos: [blade(0.78, 0.036, metal), hilt(0.15, P.leatherDark, tierTrim(o.tier), 0.19)], length: 0.85 };
  },
  greatsword(o) {
    const metal = tierMetal(o.tier);
    const trim = tierTrim(o.tier);
    const geos = [
      blade(1.22, 0.052, metal, 0.04, 0.014),
      tube([[0, 0.05, 0, 0.006, 0.014], [0, 0.8, 0, 0.005, 0.01]], shade(metal, 0.7), { segs: 4, flat: true, caps: 'none', metal: 1, gradient: false }),
      hilt(0.36, P.leatherDark, trim, 0.3),
      slab(0.034, 0.05, 0.07, trim, [0, 0.06, 0], [0, 0, 0], M),
    ];
    return { geos, gripL: [0, -0.2, 0], length: 1.3 };
  },
  blade(o) {
    const metal = tierMetal(o.tier);
    const curve = [
      [0, 0.03, 0, 0.009, 0.03],
      [0, 0.3, 0.012, 0.008, 0.029],
      [0, 0.52, 0.034, 0.006, 0.02],
      [0, 0.62, 0.055, 0.002, 0.004],
    ];
    return {
      geos: [
        tube(curve, metal, { segs: 4, flat: true, caps: 'none', metal: 1, gradient: [0.85, 1.12] }),
        hilt(0.13, o.color || P.clothRed, tierTrim(o.tier), 0.1),
      ],
      length: 0.66,
    };
  },
  dagger(o) {
    return { geos: [blade(0.3, 0.026, tierMetal(o.tier)), hilt(0.11, P.leatherDark, P.iron, 0.09)], length: 0.34 };
  },
  axe(o) {
    const metal = tierMetal(o.tier);
    const head = tube([[0, 0.5, 0.02, 0.018, 0.03], [0, 0.5, 0.1, 0.012, 0.075], [0, 0.5, 0.17, 0.003, 0.115]], metal, { segs: 4, flat: true, caps: 'none', metal: 1, gradient: false });
    return { geos: [shaft(-0.16, 0.6), head, slab(0.045, 0.07, 0.05, P.iron, [0, 0.5, 0], [0, 0, 0], M)], length: 0.62 };
  },
  club() {
    const body = tube([[0, -0.14, 0, 0.018], [0, 0.2, 0, 0.024], [0, 0.5, 0, 0.05], [0, 0.62, 0, 0.045]], P.woodDark, { segs: 6 });
    const studs = [];
    for (let i = 0; i < 6; i++) {
      const a = i * 2.1;
      studs.push(ball(0.014, P.iron, [Math.cos(a) * 0.047, 0.44 + (i % 3) * 0.06, Math.sin(a) * 0.047], 1, { metal: 1, segs: 5, rings: 3 }));
    }
    return { geos: [body, studs], length: 0.66 };
  },
  maul(o) {
    const metal = shade(tierMetal(o.tier), 0.8);
    const head = [
      slab(0.15, 0.17, 0.3, metal, [0, 0.98, 0], [0, 0, 0], { metal: 1, gradient: [0.75, 1.1] }),
      slab(0.17, 0.05, 0.05, P.iron, [0, 0.98, 0.12], [0, 0, 0], M),
      slab(0.17, 0.05, 0.05, P.iron, [0, 0.98, -0.12], [0, 0, 0], M),
    ];
    return { geos: [shaft(-0.42, 1.0, P.woodDark, 0.024), head, hoop(0.028, 0.008, P.iron, [0, 0.5, 0], [HALF_PI, 0, 0], M)], gripL: [0, -0.3, 0], length: 1.1 };
  },
  spear(o) {
    return { geos: [shaft(-1.1, 1.05, P.wood, 0.016), blade(0.26, 0.032, tierMetal(o.tier), 1.04)], gripL: [0, 0.5, 0], length: 1.3 };
  },
  halberd(o) {
    const metal = tierMetal(o.tier);
    const axe = tube([[0, 1.0, 0.02, 0.012, 0.05], [0, 1.0, 0.1, 0.009, 0.1], [0, 1.0, 0.17, 0.003, 0.15]], metal, { segs: 4, flat: true, caps: 'none', metal: 1, gradient: false });
    const hook = tube([[0, 1.0, -0.02, 0.01, 0.03], [0, 0.97, -0.13, 0.003, 0.008]], metal, { segs: 4, flat: true, caps: 'none', metal: 1, gradient: false });
    return { geos: [shaft(-1.1, 1.08, P.woodDark, 0.018), blade(0.3, 0.028, metal, 1.07), axe, hook], gripL: [0, 0.5, 0], length: 1.4 };
  },
  glaive(o) {
    const metal = shade(tierMetal(o.tier), 0.82);
    const curve = [
      [0, 1.0, 0, 0.012, 0.04],
      [0, 1.3, 0.03, 0.011, 0.062],
      [0, 1.55, 0.085, 0.008, 0.045],
      [0, 1.72, 0.16, 0.002, 0.005],
    ];
    const feathers = [
      slab(0.012, 0.2, 0.06, P.clothBlack, [0, 0.9, -0.05], [0.35, 0, 0]),
      slab(0.012, 0.17, 0.05, 0x1c1c24, [0.02, 0.88, -0.04], [0.6, 0.4, 0]),
    ];
    return {
      geos: [shaft(-1.0, 1.02, P.clothBlack, 0.019), tube(curve, metal, { segs: 4, flat: true, caps: 'none', metal: 1, gradient: [0.8, 1.15] }), feathers, hoop(0.026, 0.008, P.bone, [0, 0.98, 0], [HALF_PI, 0, 0])],
      gripL: [0, 0.5, 0],
      length: 1.75,
    };
  },
  crossbow(o) {
    const metal = tierMetal(o.tier);
    const big = o.heavy ? 1.15 : 1;
    const geos = [
      tube([[0, -0.2, 0.03, 0.03, 0.04], [0, 0, 0, 0.026, 0.032], [0, 0.42 * big, 0, 0.024, 0.028]], P.wood, { segs: 6, sq: 0.7 }),
      slab(0.56 * big, 0.035, 0.03, metal, [0, 0.4 * big, -0.015], [0, 0, 0], M),
      slab(0.2, 0.03, 0.03, metal, [-0.33 * big, 0.36 * big, -0.015], [0, 0, 0.5], M),
      slab(0.2, 0.03, 0.03, metal, [0.33 * big, 0.36 * big, -0.015], [0, 0, -0.5], M),
      rod(0.004, 0.004, 0.42 * big, P.bone, [-0.2 * big, 0.2 * big, -0.02], [0, 0, 0.82]),
      rod(0.004, 0.004, 0.42 * big, P.bone, [0.2 * big, 0.2 * big, -0.02], [0, 0, -0.82]),
      rod(0.007, 0.007, 0.34, P.woodPale, [0, 0.27, -0.038]),
      slab(0.012, 0.05, 0.012, P.steel, [0, 0.45, -0.038], [0, 0, 0], M),
      slab(0.018, 0.07, 0.04, P.iron, [0, -0.02, 0.05], [0.3, 0, 0], M),
    ];
    if (o.heavy) {
      geos.push(rod(0.045, 0.045, 0.05, P.bronze, [0.035, 0.1, 0], [0, 0, HALF_PI], { metal: 1, segs: 8 }));
      geos.push(rod(0.014, 0.014, 0.09, P.copper, [0.07, 0.1, 0], [0, 0, HALF_PI], M));
      geos.push(slab(0.05, 0.16, 0.05, P.woodDark, [0, 0.2, 0.05]));
    }
    return { geos, gripL: [0, 0.26, 0.03], length: 0.5 };
  },
  emitter() {
    const geos = [
      rod(0.036, 0.042, 0.3, P.bronze, [0, 0.16, 0], [0, 0, 0], { metal: 1, segs: 8, gradient: [0.8, 1.1] }),
      rod(0.052, 0.04, 0.07, P.gold, [0, 0.34, 0], [0, 0, 0], { metal: 1, segs: 8 }),
      rod(0.022, 0.026, 0.16, P.leatherDark, [0, -0.04, 0.02], [0.35, 0, 0]),
      slab(0.03, 0.1, 0.05, P.woodDark, [0, 0.09, -0.055]),
      rod(0.012, 0.012, 0.09, P.crystal, [0, 0.12, -0.085], [0, 0, 0], { segs: 5 }),
    ];
    for (let i = 0; i < 4; i++) geos.push(hoop(0.045, 0.008, P.copper, [0, 0.08 + i * 0.055, 0], [HALF_PI, 0, 0], { metal: 1, segs: 10, tubeSegs: 4 }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), glowMat(P.amber, 2.2));
    glow.position.set(0, 0.375, 0);
    glow.scale.set(1, 0.5, 1);
    glow.userData.shadow = false;
    glow.castShadow = false;
    return { geos, length: 0.4, glow };
  },
  dart() {
    return {
      geos: [
        rod(0.006, 0.008, 0.2, P.woodPale, [0, 0.06, 0]),
        tube([[0, 0.16, 0, 0.009], [0, 0.23, 0, 0.001]], P.steel, { segs: 4, caps: 'none', metal: 1, gradient: false }),
        slab(0.002, 0.07, 0.04, P.clothAmber, [0, -0.03, 0]),
        slab(0.04, 0.07, 0.002, P.clothAmber, [0, -0.03, 0]),
      ],
      length: 0.24,
    };
  },
  hammer() {
    return { geos: [shaft(-0.1, 0.3, P.wood, 0.015), slab(0.06, 0.07, 0.13, P.iron, [0, 0.3, 0], [0, 0, 0], { metal: 1, gradient: [0.8, 1.1] })], length: 0.34 };
  },
  pick() {
    const head = tube([[0, 0.55, -0.24, 0.006], [0, 0.6, -0.1, 0.022], [0, 0.61, 0, 0.026], [0, 0.6, 0.1, 0.022], [0, 0.55, 0.24, 0.006]], P.iron, { segs: 4, flat: true, metal: 1, gradient: false });
    return { geos: [shaft(-0.2, 0.62, P.wood, 0.017), head], gripL: [0, -0.14, 0], length: 0.64 };
  },
  hoe() {
    return {
      geos: [shaft(-0.5, 0.95, P.woodLight, 0.015), slab(0.14, 0.02, 0.12, P.iron, [0, 0.94, 0.06], [0.5, 0, 0], M)],
      gripL: [0, 0.45, 0],
      length: 1.0,
    };
  },
  pitchfork() {
    const tines = [];
    for (const x of [-0.06, 0, 0.06]) tines.push(rod(0.005, 0.007, 0.26, P.iron, [x, 1.1, 0], [0, 0, 0], M));
    return { geos: [shaft(-0.5, 0.98, P.woodLight, 0.015), slab(0.14, 0.02, 0.02, P.iron, [0, 0.98, 0], [0, 0, 0], M), tines], gripL: [0, 0.45, 0], length: 1.25 };
  },
  rod() {
    const pole = tube([[0, -0.15, 0, 0.012], [0, 0.9, 0.05, 0.008], [0, 1.7, 0.3, 0.003]], P.woodPale, { segs: 5 });
    return { geos: [pole, rod(0.0025, 0.0025, 0.9, P.bone, [0, 1.26, 0.31]), ball(0.02, P.clothRed, [0, 0.82, 0.31], 1, { segs: 5, rings: 4 })], length: 1.7 };
  },
  staff() {
    return { geos: [tube([[0, -0.75, 0, 0.016], [0, 0.4, 0, 0.018], [0, 0.62, 0.02, 0.024], [0, 0.68, 0.05, 0.02]], P.woodDark, { segs: 6 })], length: 0.7 };
  },
  mug() {
    return {
      geos: [
        rod(0.045, 0.04, 0.1, P.woodLight, [0, 0.06, 0.05], [0, 0, 0], { segs: 8, gradient: [0.8, 1.05] }),
        hoop(0.044, 0.006, P.iron, [0, 0.09, 0.05], [HALF_PI, 0, 0], M),
        rod(0.039, 0.039, 0.01, P.clothCream, [0, 0.112, 0.05], [0, 0, 0], { segs: 8 }),
      ],
      length: 0.12,
    };
  },
  ledger() {
    return {
      geos: [
        slab(0.05, 0.24, 0.18, P.leatherDark, [0, 0.06, 0.06]),
        slab(0.04, 0.22, 0.165, P.clothCream, [0.006, 0.06, 0.066]),
        slab(0.052, 0.03, 0.03, P.gold, [0, 0.06, 0.15], [0, 0, 0], M),
      ],
      length: 0.24,
    };
  },
  knife(o) {
    return { geos: [blade(0.2, 0.02, tierMetal(o.tier)), rod(0.014, 0.016, 0.1, P.wood, [0, -0.02, 0])], length: 0.22 };
  },
  torch() {
    return { geos: [shaft(-0.12, 0.34, P.woodDark, 0.016), ball(0.045, P.clothBlack, [0, 0.36, 0], [1, 1.2, 1], { segs: 6, rings: 4 })], length: 0.4 };
  },
};

function shieldGeos(kind, o) {
  const color = o.color || P.guardBlue;
  const trim = o.trim || tierTrim(o.tier);
  if (kind === 'roundShield') {
    return [
      xfDisc(0.3, 0.03, o.color || P.wood),
      hoop(0.3, 0.018, trim, [0, 0, 0.012], [0, 0, 0], { metal: 1, segs: 16, tubeSegs: 4 }),
      ball(0.075, P.iron, [0, 0, 0.03], [1, 1, 0.6], { metal: 1, segs: 8, rings: 5 }),
      slab(0.56, 0.035, 0.012, shade(color, 0.7), [0, 0, 0.022]),
    ];
  }
  const tall = kind === 'towerShield';
  const h = tall ? 1.02 : 0.74;
  const w = tall ? 0.56 : 0.5;
  const rows = tall
    ? [[-h / 2, 0.86], [-h * 0.25, 1], [h * 0.3, 1], [h / 2, 0.92]]
    : [[-h / 2, 0.08], [-h * 0.22, 0.62], [h * 0.12, 0.98], [h * 0.42, 1], [h / 2, 0.86]];
  const body = shieldPlate(rows, w, 0.05, color, 0);
  const rim = shieldPlate(rows, w + 0.035, 0.03, trim, 1);
  const geos = [rim, body, ball(0.06, trim, [0, h * 0.1, 0.07], [1, 1, 0.55], { metal: 1, segs: 8, rings: 5 })];
  if (o.emblem !== false) {
    geos.push(slab(0.05, h * 0.62, 0.012, o.emblemColor || P.gold, [0, 0, 0.066]));
    if (!tall) geos.push(slab(w * 0.55, 0.05, 0.012, o.emblemColor || P.gold, [0, h * 0.14, 0.064]));
  }
  if (tall) {
    for (const y of [-0.34, 0.36]) geos.push(slab(w * 0.9, 0.04, 0.02, trim, [0, y, 0.058], [0, 0, 0], M));
  }
  return geos;
}

function xfDisc(r, thick, color) {
  return rod(r, r, thick, color, [0, 0, 0], [HALF_PI, 0, 0], { segs: 14, gradient: [0.8, 1.08] });
}

/** Curved shield plate: rows = [[y, widthFactor], …]; bulges towards +z. */
function shieldPlate(rows, w, bulge, color, metal) {
  const cols = 4;
  const verts = [];
  for (const side of [1, -1]) {
    for (const row of rows) {
      for (let c = 0; c <= cols; c++) {
        const u = (c / cols) * 2 - 1;
        const x = u * w * 0.5 * row[1];
        const z = bulge * (1 - u * u) + (side > 0 ? 0 : -0.022);
        verts.push([x, row[0], z, side]);
      }
    }
  }
  const pos = [];
  const per = cols + 1;
  for (let s = 0; s < 2; s++) {
    const off = s * rows.length * per;
    for (let r = 0; r < rows.length - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const a = verts[off + r * per + c];
        const b = verts[off + r * per + c + 1];
        const d = verts[off + (r + 1) * per + c];
        const e = verts[off + (r + 1) * per + c + 1];
        const quad = s === 0 ? [a, b, d, b, e, d] : [a, d, b, b, d, e];
        for (const v of quad) pos.push(v[0], v[1], v[2]);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return tint(geo, color, { metal, gradient: [0.78, 1.1] });
}

/** Raw painted geometry list for a gear kind (for fusing into other meshes). Returns { geos, gripL?, length, glow? }. */
export function gearGeos(kind, opts = {}) {
  if (kind === 'roundShield' || kind === 'kiteShield' || kind === 'towerShield') return { geos: shieldGeos(kind, opts), length: 0.7 };
  const build = BUILDERS[kind] || BUILDERS.sword;
  return build(opts);
}

/**
 * One-mesh gear model. kind: sword|greatsword|blade|dagger|axe|club|maul|spear|halberd|glaive|crossbow|emitter|dart|
 * hammer|pick|hoe|pitchfork|rod|staff|mug|ledger|knife|torch|roundShield|kiteShield|towerShield|bow.
 * userData: { kind, gripL: Vector3|null (off-hand grip, weapon space), length, setDraw?(t), setGlow?(k) }.
 */
export function makeGear(kind, opts = {}) {
  if (kind === 'bow') return makeBow(opts);
  const def = gearGeos(kind, opts);
  const mesh = part(def.geos, null, { name: 'gear:' + kind });
  mesh.userData.kind = kind;
  mesh.userData.gripL = def.gripL ? new THREE.Vector3(def.gripL[0], def.gripL[1], def.gripL[2]) : null;
  mesh.userData.length = def.length;
  if (def.glow) {
    mesh.add(def.glow);
    mesh.userData.setGlow = k => {
      const s = 0.8 + k * 1.6;
      def.glow.scale.set(s, 0.5 + k * 0.9, s);
    };
  }
  return mesh;
}

/** Longbow held in the off hand: belly towards +z, string towards -z. userData.setDraw(0..1) bends it. */
function makeBow(opts) {
  const len = opts.long === false ? 0.62 : 0.78;
  const color = opts.color || P.woodLight;
  const limb = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * 2 - 1;
    const r = 0.017 - Math.abs(t) * 0.009;
    limb.push([0, t * len, 0.1 * (1 - t * t) - 0.02, r, r * 1.3]);
  }
  const body = tube(limb, color, { segs: 5, gradient: [0.85, 1.05] });
  const wrap = rod(0.021, 0.021, 0.13, P.leatherDark, [0, 0, 0.08]);
  const bow = part([body, wrap], null, { name: 'gear:bow' });
  const stringGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(6 * 3 * 2);
  stringGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  tint(stringGeo, P.bone);
  const string = new THREE.Mesh(stringGeo, actorMat(true));
  string.frustumCulled = false;
  string.castShadow = false;
  string.userData.shadow = false;
  string.userData.lodMax = 1;
  string.userData.noStiff = true;
  bow.add(string);
  const w = 0.004;
  function setString(tipZ, nockZ) {
    const pts = [[len, tipZ], [0, nockZ], [-len, tipZ]];
    let k = 0;
    for (let s = 0; s < 2; s++) {
      const a = pts[s];
      const b = pts[s + 1];
      const quad = [[-w, a[0], a[1]], [w, a[0], a[1]], [-w, b[0], b[1]], [w, a[0], a[1]], [w, b[0], b[1]], [-w, b[0], b[1]]];
      for (const v of quad) {
        sp[k++] = v[0];
        sp[k++] = v[1];
        sp[k++] = v[2];
      }
    }
    stringGeo.attributes.position.needsUpdate = true;
    stringGeo.computeVertexNormals();
  }
  let last = -1;
  bow.userData.kind = 'bow';
  bow.userData.gripL = null;
  bow.userData.length = len * 2;
  bow.userData.setDraw = t => {
    if (Math.abs(t - last) < 0.004) return;
    last = t;
    const k = 1 + t * 0.9;
    bow.scale.z = k;
    bow.scale.y = 1 - t * 0.07;
    setString(-0.02, (-0.02 - t * 0.6) / k);
    bow.userData.nock.set(0, 0, (-0.02 - t * 0.6) / k);
  };
  bow.userData.nock = new THREE.Vector3(0, 0, -0.02);
  bow.userData.setDraw(0);
  return bow;
}

/** Quiver with arrows, in chest space (worn on the back, tilted). */
export function quiverGeos(color = P.leather) {
  const geos = [tube([[0.05, -0.12, -0.15, 0.045], [-0.08, 0.26, -0.16, 0.052]], color, { segs: 6, capEnd: 'flat' })];
  for (let i = 0; i < 4; i++) {
    const dx = (i - 1.5) * 0.02;
    geos.push(rod(0.005, 0.005, 0.16, P.woodPale, [-0.105 + dx, 0.33, -0.16 + (i % 2) * 0.02], [0, 0, 0.33]));
    geos.push(slab(0.006, 0.07, 0.03, i % 2 ? P.clothCream : P.clothRed, [-0.125 + dx, 0.385, -0.16 + (i % 2) * 0.02], [0, 0, 0.33]));
  }
  return geos;
}

/**
 * Hat geometry in head space (skull centre ≈ [0, 0.13, 0], radius ≈ 0.115).
 * kind: straw|cap|coif|kettle|nasal|fullhelm|hood|bandana|circlet|widebrim|scarf|goggles|chef|fur.
 */
export function hatGeos(kind, c = {}) {
  const color = c.color ?? P.clothBrown;
  const trim = c.trim ?? P.leatherDark;
  const metal = c.metal ?? P.steel;
  switch (kind) {
    case 'straw':
      return [
        rod(0.3, 0.3, 0.014, P.thatch, [0, 0.205, 0], [0.06, 0, 0], { segs: 12, jitter: 0.08 }),
        tube([[0, 0.2, 0, 0.125], [0, 0.275, 0, 0.1]], P.thatch, { segs: 9, jitter: 0.06 }),
        hoop(0.118, 0.012, c.color ?? P.clothRed, [0, 0.218, 0], [HALF_PI, 0, 0], { segs: 10, tubeSegs: 4 }),
      ];
    case 'cap':
      return [
        ball(0.125, color, [0, 0.19, -0.012], [1.02, 0.6, 1.1]),
        slab(0.15, 0.012, 0.07, shade(color, 0.75), [0, 0.185, 0.125], [0.2, 0, 0]),
      ];
    case 'coif':
      return [ball(0.127, color, [0, 0.135, -0.022], [1, 1.06, 1.02]), tube([[0, 0.03, -0.01, 0.105], [0, -0.04, 0, 0.12]], color, { segs: 8, caps: 'none' })];
    case 'kettle':
      return [
        ball(0.128, metal, [0, 0.185, 0], [1, 0.72, 1.05], { metal: 1 }),
        rod(0.2, 0.215, 0.018, shade(metal, 0.85), [0, 0.168, 0], [0.05, 0, 0], { metal: 1, segs: 12 }),
      ];
    case 'nasal':
      return [
        ball(0.127, metal, [0, 0.175, -0.005], [1, 0.9, 1.06], { metal: 1 }),
        slab(0.026, 0.1, 0.014, shade(metal, 0.85), [0, 0.13, 0.125], [0, 0, 0], M),
        hoop(0.124, 0.012, c.trim ?? P.bronze, [0, 0.165, -0.004], [HALF_PI, 0, 0], { metal: 1, segs: 12, tubeSegs: 4 }),
      ];
    case 'fullhelm':
      return [
        ball(0.132, metal, [0, 0.165, -0.004], [1, 1, 1.06], { metal: 1 }),
        slab(0.026, 0.12, 0.014, shade(metal, 0.8), [0, 0.12, 0.13], [0, 0, 0], M),
        slab(0.016, 0.13, 0.11, metal, [0.112, 0.085, 0.03], [0, 0, 0.1], M),
        slab(0.016, 0.13, 0.11, metal, [-0.112, 0.085, 0.03], [0, 0, -0.1], M),
        tube([[0, 0.27, -0.09, 0.012, 0.03], [0, 0.31, 0, 0.014, 0.045], [0, 0.27, 0.09, 0.012, 0.03]], c.crest ?? P.banditRed, { segs: 4, flat: true }),
      ];
    case 'hood':
      return [
        ball(0.142, color, [0, 0.15, -0.052], [1, 1.06, 0.98]),
        tube([[0, 0.02, -0.03, 0.13, 0.1], [0, 0.12, -0.04, 0.142, 0.12]], color, { segs: 8, caps: 'none' }),
        tube([[0, 0.25, -0.1, 0.05], [0, 0.2, -0.19, 0.012]], color, { segs: 5 }),
        tube([[0, 0.02, -0.01, 0.115, 0.11], [0, -0.07, 0, 0.17, 0.13]], shade(color, 0.92), { segs: 8, caps: 'none' }),
      ];
    case 'bandana':
      return [
        ball(0.121, color, [0, 0.165, -0.012], [1, 0.75, 1.03]),
        ball(0.03, shade(color, 0.85), [0.04, 0.13, -0.125], [1, 1, 0.7], { segs: 5, rings: 4 }),
        slab(0.03, 0.09, 0.008, shade(color, 0.85), [0.05, 0.07, -0.13], [0.15, 0, 0.25]),
      ];
    case 'circlet':
      return [hoop(0.113, 0.009, c.color ?? P.gold, [0, 0.185, 0], [HALF_PI + 0.12, 0, 0], { metal: 1, segs: 12, tubeSegs: 4 })];
    case 'widebrim':
      return [
        rod(0.25, 0.26, 0.014, color, [0, 0.2, 0], [0.08, 0, -0.1], { segs: 12 }),
        tube([[0, 0.19, 0, 0.122], [0, 0.29, 0, 0.1]], color, { segs: 9 }),
        hoop(0.118, 0.011, trim, [0, 0.215, 0], [HALF_PI, 0, 0], { segs: 10, tubeSegs: 4 }),
        tube([[-0.11, 0.22, -0.02, 0.012, 0.03], [-0.15, 0.36, -0.1, 0.004, 0.02]], c.feather ?? P.clothRed, { segs: 4, flat: true }),
      ];
    case 'scarf':
      return [
        ball(0.124, color, [0, 0.15, -0.018], [1, 0.95, 1.05]),
        ball(0.04, shade(color, 0.9), [0, 0.09, -0.12], [1, 1.3, 0.7], { segs: 5, rings: 4 }),
      ];
    case 'goggles':
      return [
        hoop(0.117, 0.008, P.leatherDark, [0, 0.19, 0], [HALF_PI + 0.2, 0, 0], { segs: 12, tubeSegs: 4 }),
        rod(0.03, 0.03, 0.03, P.bronze, [0.04, 0.2, 0.1], [HALF_PI + 0.2, 0, 0], { metal: 1, segs: 8 }),
        rod(0.03, 0.03, 0.03, P.bronze, [-0.04, 0.2, 0.1], [HALF_PI + 0.2, 0, 0], { metal: 1, segs: 8 }),
        rod(0.021, 0.021, 0.034, 0x9fd0d6, [0.04, 0.2, 0.101], [HALF_PI + 0.2, 0, 0], { metal: 1, segs: 8 }),
        rod(0.021, 0.021, 0.034, 0x9fd0d6, [-0.04, 0.2, 0.101], [HALF_PI + 0.2, 0, 0], { metal: 1, segs: 8 }),
      ];
    case 'chef':
      return [ball(0.118, P.clothCream, [0, 0.21, -0.01], [1.05, 0.6, 1.05]), tube([[0, 0.17, 0, 0.115], [0, 0.2, 0, 0.118]], P.clothCream, { segs: 9, caps: 'none' })];
    case 'fur':
      return [ball(0.13, c.color ?? P.fur, [0, 0.185, -0.01], [1.05, 0.7, 1.08], { jitter: 0.12 })];
    default:
      return [];
  }
}
