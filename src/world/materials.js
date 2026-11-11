// Shared palette, materials and the global shader clock.
// Art direction «Янтарь и сумрак»: muted earthy colours, warm amber light, cool teal shadow.
// Everything opaque is drawn with ONE of the shared vertex-colour materials so meshes can be merged
// into a single draw call (see geo.js). Do not create a material per object.
import * as THREE from 'three';

/** Named colours (sRGB hex). Use these instead of ad-hoc values so the world stays coherent. */
export const PALETTE = {
  // wood
  woodDark: 0x4a3524, wood: 0x6e5034, woodLight: 0x94744c, woodPale: 0xb39a70, bark: 0x4f4032, barkDark: 0x362b22,
  // stone & earth
  stoneDark: 0x55554f, stone: 0x7d7b72, stoneLight: 0xa3a093, slate: 0x4a5560, sandstone: 0xb89f76,
  plaster: 0xd6c7a4, plasterWarm: 0xcdb389, plasterGrey: 0xb9b5a6, brick: 0x8c5a44, clay: 0xa8744e,
  dirt: 0x6b5a41, road: 0x9c8660, sand: 0xcdbb8c, mud: 0x4d4534, snow: 0xe9eef2, rock: 0x6f6c66, rockWarm: 0x8a7860,
  // roofs
  thatch: 0xb79c58, roofTile: 0x9a4f38, roofSlate: 0x44505a, roofWood: 0x5c4630, roofAmber: 0xc07a34,
  // vegetation
  grass: 0x6f9148, grassDry: 0xa39a56, grassDark: 0x47683a, leaf: 0x4f7f3a, leafDark: 0x2f5a34, leafAutumn: 0xb8792e,
  leafPale: 0x8aa85a, pine: 0x2e5140, heather: 0x8a5f86, reed: 0x8c8a4e, moss: 0x5d7040, wheat: 0xd4b14e, flax: 0x7f9fc0,
  // metal & cloth
  iron: 0x5a5f66, steel: 0x9aa3ab, bronze: 0x9a6b3a, copper: 0xb5683c, gold: 0xc8a45a, cobalt: 0x3f6aa8, mithril: 0xa8d3d6,
  clothRed: 0x8e3b32, clothBlue: 0x3d5878, clothGreen: 0x4d6b45, clothBrown: 0x6d5238, clothCream: 0xd9cba8, clothBlack: 0x2a2826,
  clothAmber: 0xc28a3a, clothPurple: 0x5d4468, leather: 0x7a5636, leatherDark: 0x4a3423, fur: 0x8a7a66, canvas: 0xc4b48e,
  // skin & hair
  skin: 0xd9a47c, skinPale: 0xe6bd9a, skinTan: 0xb9825a, skinDark: 0x8a5c3c,
  hairBlack: 0x2a221c, hairBrown: 0x5a3c26, hairBlond: 0xc9a85c, hairRed: 0x8c4426, hairGrey: 0x9a968c,
  // accents
  amber: 0xe0a030, ember: 0xff7a2a, flame: 0xffc060, lantern: 0xffd9a0, water: 0x2f6f86, waterDeep: 0x173e55,
  bone: 0xd8cfb4, blood: 0x7a1f1a, crystal: 0x7fd8e0, banditRed: 0x7a2a22, guardBlue: 0x35517a,
};

/** Global shader clock + wind. Updated once per frame by the engine (uTime in seconds). */
export const shared = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector3(1, 0, 0.35) }, // xz direction, length = strength 0..~1.5
  uNight: { value: 0 },                            // 0 = day, 1 = deep night (set by sky.js)
};

const cache = new Map();
function cached(key, make) {
  let m = cache.get(key);
  if (!m) cache.set(key, m = make());
  return m;
}

/** Opaque lit material coloured per-vertex. THE default for buildings, props, characters. */
export const vertexMat = () => cached('vertex', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0 }));
/** Same, flat-shaded — crisp facets for rocks, planks, masonry. */
export const vertexMatFlat = () => cached('vertexFlat', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0, flatShading: true }));
/** Vertex-coloured, slightly glossy metal (weapons, armour plates). */
export const metalMat = () => cached('metal', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.75 }));
/** Double-sided vertex-coloured (cloth, banners, canvas, big leaves). */
export const clothMat = () => cached('cloth', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }));

/** Unlit glowing material (flames, lantern glass, lit windows). Bloom picks these up. `intensity` > 1 blooms. */
export const glowMat = (color = PALETTE.lantern, intensity = 2) => cached('glow' + color + ':' + intensity, () => {
  const m = new THREE.MeshBasicMaterial({ color });
  m.color.multiplyScalar(intensity);
  m.toneMapped = true;
  return m;
});

/**
 * Vertex-coloured foliage that sways in the wind. Sway amount is read from the vertex attribute `sway`
 * (float, 0 = rigid trunk, 1 = free leaf tip); geometry without it does not move.
 */
export const foliageMat = (opts = {}) => cached('foliage' + JSON.stringify(opts), () => {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide, alphaTest: opts.alphaTest || 0 });
  applyWind(m);
  return m;
});

/** Patch any standard material so vertices with a `sway` attribute bend with the shared wind. Works with instancing. */
export function applyWind(material) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWind = shared.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uTime;\nuniform vec3 uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 wp = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
          #else
            vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          #endif
          float ph = wp.x * 0.11 + wp.z * 0.13;
          float gust = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 2.3) * 0.25 + sin(uTime * 0.37 + ph * 0.31) * 0.5;
          float amt = sway * (0.06 + 0.10 * length(uWind));
          transformed.x += (uWind.x * (0.5 + gust)) * amt;
          transformed.z += (uWind.z * (0.5 + gust)) * amt;
        }`);
  };
  material.customProgramCacheKey = () => 'wind';
  return material;
}

/** Plain single-colour lit material (cached). Prefer vertex colours; use this only for standalone unique objects. */
export const solidMat = (color, opts = {}) => cached('solid' + color + JSON.stringify(opts), () => new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.88, metalness: opts.metalness ?? 0, flatShading: !!opts.flat, transparent: !!opts.transparent, opacity: opts.opacity ?? 1, side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide }));

/**
 * Unlit glow that is only visible at night (lit windows, street lamps): brightness = uNight.
 * In daylight it shows `dayColor` (dark glass).
 */
export const nightGlowMat = (color = PALETTE.lantern, intensity = 2.2, dayColor = 0x1c2228) => cached('night' + color + ':' + intensity, () => {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lit = new THREE.Color(color).multiplyScalar(intensity);
  const day = new THREE.Color(dayColor);
  m.onBeforeCompile = shader => {
    shader.uniforms.uNight = shared.uNight;
    shader.uniforms.uLit = { value: lit };
    shader.uniforms.uDay = { value: day };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nuniform vec3 uLit;\nuniform vec3 uDay;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( mix(uDay, uLit, smoothstep(0.25, 0.75, uNight)), opacity );');
  };
  m.customProgramCacheKey = () => 'nightglow' + color + ':' + intensity;
  return m;
});
