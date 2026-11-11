// Shared GLSL snippets for the world shaders (no textures anywhere: all detail is hash noise).
// Budget: this file draws nothing.

/** Hashes + 2D value noise + fbm. Cheap, stable across GPUs (no sin-hash precision problems). */
export const NOISE_GLSL = /* glsl */`
float wHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 wHash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float wNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = wHash(i);
  float b = wHash(i + vec2(1.0, 0.0));
  float c = wHash(i + vec2(0.0, 1.0));
  float d = wHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float wFbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * wNoise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return s / 0.9375;
}
float wFbm3(vec2 p) {
  float s = 0.5 * wNoise(p);
  s += 0.25 * wNoise(p * 2.03 + vec2(17.3, 9.1));
  s += 0.125 * wNoise(p * 4.12 + vec2(3.7, 41.9));
  return s / 0.875;
}
`;
