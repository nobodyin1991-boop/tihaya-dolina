// A small pool of point lights that hops to the street lamps nearest to the player at night.
// Every other lamp only "glows" through its emissive material, so the light count stays fixed.
import * as THREE from 'three';
import { PALETTE } from '../world/materials.js';

const POOL = 6;
const RANGE = 70;

export function createLightPool(scene, streamer) {
  const lights = [];
  for (let i = 0; i < POOL; i++) {
    const l = new THREE.PointLight(PALETTE.lantern, 0, 22, 1.6);
    l.castShadow = false;
    l.visible = false;
    scene.add(l);
    lights.push(l);
  }
  let t = 0;
  const picked = [];

  function update(focus, night) {
    t -= 1 / 60;
    if (night < 0.15) {
      for (const l of lights) l.visible = false;
      return;
    }
    if (t <= 0) {
      t = 0.4;
      picked.length = 0;
      for (const lamp of streamer.lamps()) {
        const d = Math.hypot(lamp.x - focus.x, lamp.z - focus.z);
        if (d < RANGE) picked.push({ lamp, d });
      }
      picked.sort((a, b) => a.d - b.d);
    }
    for (let i = 0; i < POOL; i++) {
      const l = lights[i], p = picked[i];
      if (!p) { l.visible = false; continue; }
      l.visible = true;
      l.position.set(p.lamp.x, p.lamp.y, p.lamp.z);
      // gentle flicker, fading in with dusk and out with distance
      const flicker = 0.9 + 0.1 * Math.sin(performance.now() * 0.006 + i * 2.1);
      l.intensity = 38 * night * flicker * Math.max(0, 1 - p.d / RANGE);
    }
  }
  return { update };
}
