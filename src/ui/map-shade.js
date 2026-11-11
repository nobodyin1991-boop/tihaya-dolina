// Pure pixel shader of the world map: hillshaded relief with muted biome inks on parchment.
// No DOM — runs inside map-worker.js and, as a fallback, in time slices on the main thread.
import { heightAt, regionBlend } from '../world/terrain.js';
import { WORLD } from '../data/world-map.js';
import { hash2 } from '../core/noise.js';

const PARCHMENT = [198, 180, 140];
const BIOME_INK = {
  meadow: [150, 158, 100], farmland: [180, 166, 102], forest: [102, 126, 82], darkforest: [74, 98, 74],
  highland: [152, 140, 108], mountain: [142, 132, 120], snow: [216, 214, 206], steppe: [188, 162, 108],
  coast: [200, 184, 134], swamp: [98, 110, 82], heath: [150, 120, 122], lake: [116, 132, 104],
};
const SHALLOW = [96, 128, 130];
const DEEP = [40, 66, 80];
const COARSE = 8;            // biome colour is sampled every COARSE pixels and interpolated
const CONTOUR_STEP = 30;     // metres between contour lines
const RELIEF = 2.4;          // vertical exaggeration of the hillshade
const LIGHT = (() => {
  const v = [-1, 1.25, -1];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * @param {number} size  bitmap side in pixels (the world square maps onto it exactly)
 * @returns {{size: number, renderRow: (row: number, out: Uint8ClampedArray, offset: number) => void}}
 */
export function createMapShader(size) {
  const span = WORLD.half * 2;
  const cell = span / size;
  const worldAt = index => (index + 0.5) * cell - WORLD.half;

  // —— coarse biome colour grid, filled lazily row by row ——
  const coarseCount = Math.ceil(size / COARSE) + 2;
  const coarseRows = new Map();
  function coarseRow(cj) {
    let row = coarseRows.get(cj);
    if (row) return row;
    row = new Float32Array(coarseCount * 3);
    const z = (cj * COARSE) * cell - WORLD.half;
    for (let ci = 0; ci < coarseCount; ci++) {
      const x = (ci * COARSE) * cell - WORLD.half;
      const blend = regionBlend(x, z, 3);
      let total = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (const part of blend) {
        const ink = BIOME_INK[part.region.biome] || PARCHMENT;
        r += ink[0] * part.w;
        g += ink[1] * part.w;
        b += ink[2] * part.w;
        total += part.w;
      }
      row[ci * 3] = r / total;
      row[ci * 3 + 1] = g / total;
      row[ci * 3 + 2] = b / total;
    }
    coarseRows.set(cj, row);
    if (coarseRows.size > 6) coarseRows.delete(coarseRows.keys().next().value);
    return row;
  }

  // —— height rows cache (three rows are alive at a time) ——
  const heightRows = new Map();
  function heightRow(j) {
    const clamped = Math.max(0, Math.min(size - 1, j));
    let row = heightRows.get(clamped);
    if (row) return row;
    row = new Float32Array(size);
    const z = worldAt(clamped);
    for (let i = 0; i < size; i++) row[i] = heightAt(worldAt(i), z);
    heightRows.set(clamped, row);
    if (heightRows.size > 4) heightRows.delete(heightRows.keys().next().value);
    return row;
  }

  function renderRow(j, out, offset) {
    const up = heightRow(j - 1);
    const mid = heightRow(j);
    const down = heightRow(j + 1);
    const cj = Math.floor(j / COARSE);
    const tj = (j - cj * COARSE) / COARSE;
    const rowA = coarseRow(cj);
    const rowB = coarseRow(cj + 1);
    const z = worldAt(j);

    for (let i = 0; i < size; i++) {
      const h = mid[i];
      const left = mid[i > 0 ? i - 1 : i];
      const right = mid[i < size - 1 ? i + 1 : i];
      let r;
      let g;
      let b;

      if (h < 0) {
        const depth = smooth(0, 14, -h);
        r = SHALLOW[0] + (DEEP[0] - SHALLOW[0]) * depth;
        g = SHALLOW[1] + (DEEP[1] - SHALLOW[1]) * depth;
        b = SHALLOW[2] + (DEEP[2] - SHALLOW[2]) * depth;
        // a pale line hugging the shore, like an engraved coast
        const ripple = Math.abs(((-h * 0.55) % 3) - 1.5);
        if (-h < 7 && ripple < 0.22) {
          r += 26;
          g += 26;
          b += 22;
        }
      } else {
        const ci = Math.floor(i / COARSE);
        const ti = (i - ci * COARSE) / COARSE;
        const a0 = ci * 3;
        const a1 = a0 + 3;
        const w00 = (1 - ti) * (1 - tj);
        const w10 = ti * (1 - tj);
        const w01 = (1 - ti) * tj;
        const w11 = ti * tj;
        r = rowA[a0] * w00 + rowA[a1] * w10 + rowB[a0] * w01 + rowB[a1] * w11;
        g = rowA[a0 + 1] * w00 + rowA[a1 + 1] * w10 + rowB[a0 + 1] * w01 + rowB[a1 + 1] * w11;
        b = rowA[a0 + 2] * w00 + rowA[a1 + 2] * w10 + rowB[a0 + 2] * w01 + rowB[a1 + 2] * w11;
        // wash the inks into parchment
        r += (PARCHMENT[0] - r) * 0.3;
        g += (PARCHMENT[1] - g) * 0.3;
        b += (PARCHMENT[2] - b) * 0.3;
        // bare rock and snow on the heights
        const high = smooth(120, 260, h);
        r += (226 - r) * high * 0.75;
        g += (222 - g) * high * 0.75;
        b += (212 - b) * high * 0.75;
        // sandy rim along the water
        const rim = 1 - smooth(0, 1.6, h);
        r += (214 - r) * rim * 0.5;
        g += (198 - g) * rim * 0.5;
        b += (150 - b) * rim * 0.5;

        const dx = ((right - left) / (2 * cell)) * RELIEF;
        const dz = ((down[i] - up[i]) / (2 * cell)) * RELIEF;
        const inv = 1 / Math.hypot(dx, 1, dz);
        const lambert = (-dx * LIGHT[0] + LIGHT[1] - dz * LIGHT[2]) * inv;
        let shade = lambert / LIGHT[1];
        shade = shade < 0.42 ? 0.42 : shade > 1.42 ? 1.42 : shade;
        shade = 1 + (shade - 1) * 0.9;
        r *= shade;
        g *= shade;
        b *= shade;

        const band = Math.floor(h / CONTOUR_STEP);
        if (band !== Math.floor(right / CONTOUR_STEP) || band !== Math.floor(down[i] / CONTOUR_STEP)) {
          r *= 0.88;
          g *= 0.87;
          b *= 0.85;
        }
      }

      const grain = (hash2(i, j, 77) - 0.5) * 9;
      const x = worldAt(i);
      const edge = Math.max(Math.abs(x), Math.abs(z)) / WORLD.half;
      const vignette = 1 - 0.42 * smooth(0.84, 1, edge);
      const o = offset + i * 4;
      out[o] = (r + grain) * vignette;
      out[o + 1] = (g + grain) * vignette;
      out[o + 2] = (b + grain) * vignette;
      out[o + 3] = 255;
    }
  }

  return { size, renderRow };
}
