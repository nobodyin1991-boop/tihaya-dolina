// Quality presets for the world renderer. Pure data — safe to import anywhere (UI settings screen included).
// Budget: this file draws nothing. Every renderer module reads its numbers from the preset in ctx.quality.

/**
 * @typedef {object} QualityPreset
 * @property {string} name
 * @property {number} pixelRatioCap     upper bound for devicePixelRatio
 * @property {number} msaa              MSAA samples of the scene target (0 = off, FXAA is used instead)
 * @property {boolean} fxaa             FXAA pass at the end of the chain (only meaningful when msaa = 0)
 * @property {number} viewDistance      metres; terrain is streamed and fogged out by this distance
 * @property {number} terrainDetail     LOD split factor: a node splits when closer than size * terrainDetail
 * @property {number} terrainMinNode    smallest terrain node in metres (32 -> 1 m cells, 64 -> 2 m cells)
 * @property {number} terrainOctaves    fragment detail-noise octaves (procedural ground detail)
 * @property {number} shadowMapSize     0 disables shadows
 * @property {number} shadowDistance    half-size of the sun shadow box around the focus, metres
 * @property {boolean} grassShadows     grass receives the sun shadow map
 * @property {number} grassRadius       metres around the camera covered by grass (0 = no grass)
 * @property {number} grassDensity      tufts per square metre at the camera
 * @property {number} treeNear          full-detail tree meshes (and ground props) inside this distance
 * @property {number} treeMid           low-poly trees inside this distance
 * @property {number} treeDistance      far "blob" trees inside this distance; nothing beyond
 * @property {number} propDensity       0..1 multiplier for bushes, rocks, flowers, logs
 * @property {number} cloudLayers       1 or 2 procedural cloud layers in the sky shader
 * @property {boolean} ao               screen-space ambient occlusion
 * @property {boolean} bloom
 * @property {boolean} grade            filmic grade + vignette (tone mapping itself is always on)
 * @property {number} rainCount         rain streak instances
 * @property {number} particles         0..1 multiplier for ambient-life particle counts
 * @property {number} waterDetail       0 = flat cheap water, 1 = ripples + glitter, 2 = + second normal layer
 */

/** @type {Record<'low'|'medium'|'high'|'ultra', QualityPreset>} */
export const QUALITY = {
  low: {
    name: 'low', pixelRatioCap: 1, msaa: 0, fxaa: true,
    viewDistance: 1000, terrainDetail: 1.0, terrainMinNode: 64, terrainOctaves: 1,
    shadowMapSize: 1024, shadowDistance: 45, grassShadows: false,
    grassRadius: 26, grassDensity: 1.2,
    treeNear: 40, treeMid: 120, treeDistance: 450, propDensity: 0.45,
    cloudLayers: 1, ao: false, bloom: false, grade: true,
    rainCount: 2500, particles: 0.5, waterDetail: 0,
  },
  medium: {
    name: 'medium', pixelRatioCap: 1.25, msaa: 2, fxaa: false,
    viewDistance: 1700, terrainDetail: 1.1, terrainMinNode: 64, terrainOctaves: 2,
    shadowMapSize: 2048, shadowDistance: 75, grassShadows: true,
    grassRadius: 42, grassDensity: 2.2,
    treeNear: 90, treeMid: 260, treeDistance: 800, propDensity: 0.75,
    cloudLayers: 2, ao: false, bloom: true, grade: true,
    rainCount: 5000, particles: 0.8, waterDetail: 1,
  },
  high: {
    name: 'high', pixelRatioCap: 1.5, msaa: 4, fxaa: false,
    viewDistance: 2500, terrainDetail: 1.25, terrainMinNode: 64, terrainOctaves: 3,
    shadowMapSize: 4096, shadowDistance: 110, grassShadows: true,
    grassRadius: 58, grassDensity: 3.2,
    treeNear: 120, treeMid: 340, treeDistance: 1100, propDensity: 1,
    cloudLayers: 2, ao: true, bloom: true, grade: true,
    rainCount: 8000, particles: 1, waterDetail: 2,
  },
  ultra: {
    name: 'ultra', pixelRatioCap: 2, msaa: 4, fxaa: false,
    viewDistance: 3400, terrainDetail: 1.3, terrainMinNode: 32, terrainOctaves: 3,
    shadowMapSize: 4096, shadowDistance: 150, grassShadows: true,
    grassRadius: 78, grassDensity: 3.6,
    treeNear: 150, treeMid: 400, treeDistance: 1500, propDensity: 1,
    cloudLayers: 2, ao: true, bloom: true, grade: true,
    rainCount: 12000, particles: 1.2, waterDetail: 2,
  },
};

/** Preset by name with a safe fallback to `high`. */
export function qualityByName(name) {
  return QUALITY[name] || QUALITY.high;
}
