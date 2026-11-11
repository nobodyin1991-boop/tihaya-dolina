// Ground colouring rules: what the land looks like at a point (biome blend, shore, pads, roads, snow, fields).
// Pure — no DOM, no three — shared by the terrain mesh (vertex colours), the grass (tint + density) and vegetation.
// Budget: draws nothing; sampleGround costs ~2-4 µs and never allocates.
import { REGIONS, CITIES, POIS, RIVER } from '../data/world-map.js';
import { regionWeightsInto, roadAt, riverAt } from './terrain.js';
import { noise2, clamp, smoothstep } from '../core/noise.js';

const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** sRGB hex -> linear [r,g,b]. */
export function hexToLinear(hex) {
  return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
}

/**
 * Per-biome ground look. ground = base soil/turf colour, grass = density 0..1 of grass tufts, grassH = blade height
 * multiplier, tip = colour of grass tips, snow = how far the snow line is pulled down (0..1), flowers = 0..1.
 */
export const BIOMES = {
  meadow:     { ground: 0x6f8a45, tip: 0x9db35a, grass: 1.0,  grassH: 1.0,  snow: 0,   flowers: 1.0 },
  farmland:   { ground: 0x85904c, tip: 0xb9b560, grass: 0.85, grassH: 1.1,  snow: 0,   flowers: 0.4 },
  forest:     { ground: 0x50693a, tip: 0x7c9a4c, grass: 0.55, grassH: 0.9,  snow: 0,   flowers: 0.35 },
  darkforest: { ground: 0x374e36, tip: 0x56784a, grass: 0.32, grassH: 0.85, snow: 0,   flowers: 0.1 },
  highland:   { ground: 0x7b8253, tip: 0xa3a462, grass: 0.6,  grassH: 0.7,  snow: 0.1, flowers: 0.3 },
  mountain:   { ground: 0x74756a, tip: 0x93956a, grass: 0.16, grassH: 0.55, snow: 0.25, flowers: 0.05 },
  snow:       { ground: 0xaab4b8, tip: 0xc5ced0, grass: 0.0,  grassH: 0.4,  snow: 1.0, flowers: 0 },
  steppe:     { ground: 0xa1925a, tip: 0xc9b76c, grass: 0.5,  grassH: 1.25, snow: 0,   flowers: 0.1 },
  coast:      { ground: 0xb2a574, tip: 0xc4c07a, grass: 0.3,  grassH: 1.0,  snow: 0,   flowers: 0.15 },
  swamp:      { ground: 0x4c5435, tip: 0x7d8444, grass: 0.6,  grassH: 1.45, snow: 0,   flowers: 0.05 },
  heath:      { ground: 0x6f6952, tip: 0x8d6a84, grass: 0.75, grassH: 0.65, snow: 0,   flowers: 0.6 },
  lake:       { ground: 0x66804c, tip: 0x93ab5c, grass: 0.8,  grassH: 1.1,  snow: 0,   flowers: 0.5 },
};
export const BIOME_KEYS = Object.keys(BIOMES);
/** Index of a biome key in BIOME_KEYS. */
export const biomeIndex = key => BIOME_KEYS.indexOf(key);

for (const key of BIOME_KEYS) {
  BIOMES[key].groundLin = hexToLinear(BIOMES[key].ground);
  BIOMES[key].tipLin = hexToLinear(BIOMES[key].tip);
}
const REGION_BIOME = REGIONS.map(r => BIOMES[r.biome] || BIOMES.meadow);
const REGION_BIOME_INDEX = REGIONS.map(r => Math.max(0, biomeIndex(r.biome)));

const SAND = hexToLinear(0xc9b98a);
const SHORE_MUD = hexToLinear(0x4a4332);
const PEBBLE = hexToLinear(0x8d8870);
const SEABED = hexToLinear(0x4e5a4c);
const RIVERBED = hexToLinear(0x6c6a5c);
const POI_DIRT = hexToLinear(0x7c6848);
const CITY_PAD = {
  timber: hexToLinear(0x8a7450),   // trodden earth
  stone: hexToLinear(0x7c7a72),    // grey cobble
  harbor: hexToLinear(0xb6a27a),   // pale sandstone paving
};
/** Packed-dirt road colour (linear), also used by the terrain shader. */
export const ROAD_COLOR = hexToLinear(0x9a8560);

const weights = new Float64Array(REGIONS.length);
const RIVER_HALF = RIVER.width / 2;

/**
 * @typedef {object} GroundSample
 * @property {number} r @property {number} g @property {number} b   linear ground colour
 * @property {number} tr @property {number} tg @property {number} tb grass tip colour (linear)
 * @property {number} road   0..1 road mask: 0.25 at the road edge, grows towards the centre line (see terrain shader)
 * @property {number} pad    0..1 trodden city/POI ground
 * @property {number} snow   0..1 how "snowy" the biome is (pulls the snow line down)
 * @property {number} farm   0..1 farmland weight (field patches are drawn by the shader)
 * @property {number} grass  0..1 grass density
 * @property {number} grassH grass height multiplier
 * @property {number} flowers 0..1
 * @property {number} swamp  0..1 swamp weight (murky water)
 * @property {number} biome  index into BIOME_KEYS of the dominant biome
 * @property {number} biome2 index of the runner-up biome
 * @property {number} w2     weight of the runner-up relative to the dominant one (0..1)
 */

/** @returns {GroundSample} a reusable output object for sampleGround */
export function makeGroundSample() {
  return { r: 0, g: 0, b: 0, tr: 0, tg: 0, tb: 0, road: 0, pad: 0, snow: 0, farm: 0, grass: 0, grassH: 1, flowers: 0, swamp: 0, biome: 0, biome2: 0, w2: 0 };
}

/**
 * Describe the ground at (x, z) where the terrain height is `h`. `cell` is the mesh cell size in metres — masks are
 * widened a little on coarse LODs so roads and the river stay visible from afar. Fills and returns `out`.
 */
export function sampleGround(x, z, h, cell, out) {
  regionWeightsInto(x, z, weights);
  let r = 0, g = 0, b = 0, tr = 0, tg = 0, tb = 0, grass = 0, grassH = 0, snow = 0, farm = 0, flowers = 0, swamp = 0;
  let best = 0, second = 0, bestW = -1, secondW = -1;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    if (w < 0.004) continue;
    const B = REGION_BIOME[i];
    r += w * B.groundLin[0]; g += w * B.groundLin[1]; b += w * B.groundLin[2];
    tr += w * B.tipLin[0]; tg += w * B.tipLin[1]; tb += w * B.tipLin[2];
    grass += w * B.grass; grassH += w * B.grassH; snow += w * B.snow; flowers += w * B.flowers;
    if (REGIONS[i].biome === 'farmland') farm += w;
    if (REGIONS[i].biome === 'swamp') swamp += w;
    if (w > bestW) { second = best; secondW = bestW; best = i; bestW = w; } else if (w > secondW) { second = i; secondW = w; }
  }
  out.biome = REGION_BIOME_INDEX[best];
  out.biome2 = REGION_BIOME_INDEX[second];
  out.w2 = bestW > 0 ? clamp(secondW / bestW, 0, 1) : 0;
  const dominant = REGIONS[best].biome;

  // shoreline: sand / mud band just above the water, darker bed below it
  if (h < 2.6) {
    const shore = dominant === 'swamp' ? SHORE_MUD : (dominant === 'lake' || dominant === 'forest' || dominant === 'darkforest') ? PEBBLE : SAND;
    const wobble = 0.5 * noise2(x / 9, z / 9, 77);
    const t = smoothstep(2.4 + wobble, 0.7 + wobble * 0.5, h) * (dominant === 'swamp' ? 0.75 : 1);
    r += (shore[0] - r) * t; g += (shore[1] - g) * t; b += (shore[2] - b) * t;
    grass *= 1 - t;
    if (h < 0.2) {
      const d = smoothstep(0.2, -5, h);
      r += (SEABED[0] - r) * d; g += (SEABED[1] - g) * d; b += (SEABED[2] - b) * d;
      grass = 0;
    }
  }

  // river bed and banks (coarse LODs paint the channel so the river reads from far away)
  const river = riverAt(x, z, RIVER_HALF + 10 + cell);
  if (river) {
    const t = smoothstep(RIVER_HALF + 5 + cell * 0.5, RIVER_HALF - 1, river.dist);
    r += (RIVERBED[0] - r) * t; g += (RIVERBED[1] - g) * t; b += (RIVERBED[2] - b) * t;
    grass *= 1 - t;
  }

  // city and POI pads
  let pad = 0;
  for (let i = 0; i < CITIES.length; i++) {
    const c = CITIES[i];
    const dx = x - c.x, dz = z - c.z, lim = c.radius + 14;
    if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
    const t = smoothstep(lim, c.radius - 6, Math.hypot(dx, dz) + 5 * noise2(x / 14, z / 14, 31));
    if (t > 0) {
      const col = CITY_PAD[c.style] || CITY_PAD.timber;
      r += (col[0] - r) * t * 0.9; g += (col[1] - g) * t * 0.9; b += (col[2] - b) * t * 0.9;
      pad = Math.max(pad, t);
    }
  }
  for (let i = 0; i < POIS.length; i++) {
    const p = POIS[i];
    const dx = x - p.x, dz = z - p.z, lim = p.r + 4;
    if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
    const t = smoothstep(lim, p.r * 0.45, Math.hypot(dx, dz) + 4 * noise2(x / 9, z / 9, 37)) * (p.type === 'landmark' || p.type === 'lair' ? 0.45 : 0.8);
    if (t > 0) {
      r += (POI_DIRT[0] - r) * t; g += (POI_DIRT[1] - g) * t; b += (POI_DIRT[2] - b) * t;
      pad = Math.max(pad, t);
    }
  }

  // roads: mask = (halfWidth + 2 - dist) / 8, so the edge sits at 0.25 for every road width
  let road = 0;
  const rd = roadAt(x, z, 14 + cell);
  if (rd) road = clamp((rd.road.halfWidth + 2 + cell * 0.35 - rd.dist) / 8, 0, 1);
  const roadCover = smoothstep(0.12, 0.3, road);

  out.r = r; out.g = g; out.b = b;
  out.tr = tr; out.tg = tg; out.tb = tb;
  out.road = road;
  out.pad = pad;
  out.snow = snow;
  out.farm = farm * (1 - pad);
  // ploughed fields are painted by the terrain shader: keep them mostly free of wild grass
  out.grass = grass * (1 - roadCover) * (1 - Math.min(1, pad * 1.08)) * (1 - 0.8 * smoothstep(0.34, 0.6, farm));
  out.grassH = grassH;
  out.flowers = flowers;
  out.swamp = swamp;
  return out;
}

/**
 * Cheap biome lookup for scattering: fills out.biome / out.biome2 (indices into BIOME_KEYS), out.w2 (runner-up weight
 * relative to the dominant region, 0..1) and out.region (index into REGIONS of the dominant region). No allocation.
 */
export function sampleBiome(x, z, out) {
  regionWeightsInto(x, z, weights);
  let best = 0, second = 0, bestW = -1, secondW = -1;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    if (w > bestW) { second = best; secondW = bestW; best = i; bestW = w; } else if (w > secondW) { second = i; secondW = w; }
  }
  out.biome = REGION_BIOME_INDEX[best];
  out.biome2 = REGION_BIOME_INDEX[second];
  out.w2 = bestW > 0 ? clamp(secondW / bestW, 0, 1) : 0;
  out.region = best;
  return out;
}
