// Builds the 3D model of a point of interest from its layout: one merged mesh per material (2–6 draw calls),
// plus tiny shader-animated parts (windmill sails, the lighthouse beam). Registers the layout's colliders.
import * as THREE from 'three';
import { PALETTE as P, shared } from './materials.js';
import { makeRng, seedFrom } from '../core/noise.js';
import { heightAt } from './terrain.js';
import { Mesher, spinMat } from './mesher.js';
import { getPoiLayout } from './poi-layout.js';
import { emitStructure, ANIMATED } from './poi-structures.js';
import { emitProp } from './props.js';

const GROUND_TINT = { banditcamp: 0x6e5d44, camp: 0x77664a, farm: 0x7d6c4c, village: 0xa8946c, outpost: 0x7a6a4e, mine: 0x6f6a60 };
let beamMaterial = null;

/** Additive rotating light beam, visible only at night. */
function beamMat() {
  if (beamMaterial) return beamMaterial;
  const m = new THREE.MeshBasicMaterial({ color: P.lantern, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  m.onBeforeCompile = shader => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uNight = shared.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float a = uTime * 0.5;
          float c = cos(a), s = sin(a);
          transformed.xz = mat2(c, s, -s, c) * transformed.xz;
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a *= smoothstep(0.2, 0.8, uNight);');
  };
  m.customProgramCacheKey = () => 'lighthouse-beam';
  beamMaterial = m;
  return m;
}

/** Ground height under a structure: the lowest point of its footprint, so nothing floats on a slope. */
function groundUnder(s) {
  let y = heightAt(s.x, s.z);
  const reach = s.hw ? Math.max(s.hw, s.hd) : (s.r > 2.5 ? s.r * 0.7 : 0);
  if (reach > 1.5) {
    for (let i = 0; i < 4; i++) {
      const a = s.rot + Math.PI / 4 + i * Math.PI / 2;
      y = Math.min(y, heightAt(s.x + Math.sin(a) * reach, s.z + Math.cos(a) * reach));
    }
  }
  if (s.kind === 'boat') return Math.max(y, s.sunk ? -0.5 : -0.12);
  return y;
}

/**
 * Build a POI. ctx = { scene, colliders, quality }. Returns { group, layout, dispose() }.
 */
export function buildPoi(ctx, poiId) {
  const layout = getPoiLayout(poiId);
  const poi = layout.poi;
  const group = new THREE.Group();
  group.name = 'poi:' + poiId;
  ctx.scene.add(group);
  const handles = [];
  const m = new Mesher(seedFrom('poi:' + poiId));

  // trampled ground under camps and yards (only where the pad is really flat)
  const tint = GROUND_TINT[poi.type];
  if (tint) {
    const y0 = heightAt(poi.x, poi.z);
    let flat = true;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      if (Math.abs(heightAt(poi.x + Math.cos(a) * poi.r * 0.55, poi.z + Math.sin(a) * poi.r * 0.55) - y0) > 0.08) flat = false;
    }
    if (flat) {
      m.use('ground');
      m.cyl(poi.r * 0.56, poi.r * 0.56, 0.02, tint, poi.x, y0 + 0.03, poi.z, { seg: 18, vj: 0.07 });
      m.cyl(poi.r * 0.3, poi.r * 0.3, 0.02, tint, poi.x, y0 + 0.045, poi.z, { seg: 12, vj: 0.07, g: [1.08, 1.08] });
      m.use('flat');
    }
  }

  for (const s of layout.structures) {
    const y = groundUnder(s);
    m.push(s.x, y, s.z, s.rot);
    emitStructure(m, s, makeRng(s.seed));
    m.pop();
    const opts = { top: y + (s.h || 2), tag: 'poi:' + s.kind };
    if (s.r) handles.push(ctx.colliders.addCircle(s.x, s.z, s.r, opts));
    else if (s.hw) handles.push(ctx.colliders.addBox(s.x, s.z, s.hw, s.hd, s.rot, opts));
    const anim = ANIMATED[s.kind];
    if (anim) {
      const part = new Mesher(s.seed);
      const sin = Math.sin(s.rot), cos = Math.cos(s.rot);
      const px = s.x + anim.at[0] * cos + anim.at[2] * sin, pz = s.z - anim.at[0] * sin + anim.at[2] * cos;
      let meshes;
      if (anim.beam) {
        part.cyl(3.2, 0.3, 70, P.lantern, 0, 0, 0, { rz: -Math.PI / 2, seg: 7 });
        part.cyl(3.2, 0.3, 70, P.lantern, 0, 0, 0, { rz: Math.PI / 2, seg: 7 });
        meshes = part.build({ shadows: false, materials: { flat: beamMat() } });
      } else {
        anim.draw(part);
        const mat = spinMat(anim.axis, anim.speed);
        meshes = part.build({ shadows: false, materials: { flat: mat, cloth: mat } });
      }
      for (const mesh of meshes) {
        mesh.position.set(px, y + anim.at[1], pz);
        mesh.rotation.y = s.rot;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        group.add(mesh);
      }
    }
  }
  // bandit camps have a loot chest in the layout even when the POI has no interactive one: show it
  if (!poi.chest && layout.spots.chest) {
    const c = layout.spots.chest;
    emitProp(m, 'chest', c.x, heightAt(c.x, c.z), c.z, c.yaw, {});
    handles.push(ctx.colliders.addCircle(c.x, c.z, 0.6, { top: heightAt(c.x, c.z) + 0.9, tag: 'poi:chest' }));
  }
  for (const mesh of m.build()) group.add(mesh);

  return {
    group, layout,
    dispose() {
      for (const id of handles) ctx.colliders.remove(id);
      ctx.scene.remove(group);
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      group.clear();
    },
  };
}
