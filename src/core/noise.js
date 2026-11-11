// Deterministic hashing, RNG and 2D gradient noise. Pure — no DOM, no three.

/** Integer hash -> [0,1). */
export function hash2(ix, iz, seed = 0) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Small fast seeded PRNG (mulberry32). Returns a function -> [0,1). */
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** String -> 32-bit seed. */
export function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const fade = t => t * t * t * (t * (t * 6 - 15) + 10);

function grad(ix, iz, seed, fx, fz) {
  const a = hash2(ix, iz, seed) * 6.283185307179586;
  return Math.cos(a) * fx + Math.sin(a) * fz;
}

/** Gradient noise in roughly [-1,1]. */
export function noise2(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fade(fx), v = fade(fz);
  const a = grad(ix, iz, seed, fx, fz);
  const b = grad(ix + 1, iz, seed, fx - 1, fz);
  const c = grad(ix, iz + 1, seed, fx, fz - 1);
  const d = grad(ix + 1, iz + 1, seed, fx - 1, fz - 1);
  return (a + (b - a) * u + (c - a + (a - b - c + d) * u) * v) * 1.5;
}

/** Fractal noise, roughly [-1,1]. */
export function fbm(x, z, octaves = 4, seed = 0) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x, z, seed + i * 17) * amp;
    norm += amp; amp *= 0.5; x *= 2.03; z *= 2.03;
  }
  return sum / norm;
}

/** Ridged fractal noise in [0,1], sharp crests. */
export function ridged(x, z, octaves = 4, seed = 0) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise2(x, z, seed + i * 31));
    sum += n * n * amp;
    norm += amp; amp *= 0.5; x *= 2.07; z *= 2.07;
  }
  return sum / norm;
}

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
/** smoothstep that also works for e0 > e1 (descending edges). */
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
