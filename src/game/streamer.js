// Loads and unloads settlements (cities, POIs) around the player.
// Cells of resources and creatures are handled by population.js; terrain/vegetation stream themselves.
import { CITIES, POIS } from '../data/world-map.js';
import { buildCity } from '../world/city-builder.js';
import { buildPoi } from '../world/poi-builder.js';
import { emit } from '../core/events.js';

const CITY_LOAD = 750, CITY_UNLOAD = 1050;
const POI_LOAD = 380, POI_UNLOAD = 540;

export function createStreamer(ctx) {
  const cities = new Map();   // key -> built
  const pois = new Map();     // id -> built
  let cooldown = 0;

  function update(dt, x, z) {
    cooldown -= dt;
    if (cooldown > 0) return;
    cooldown = 0.5;
    // at most one heavy build per tick to avoid hitches
    for (const c of CITIES) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < CITY_LOAD && !cities.has(c.key)) {
        cities.set(c.key, buildCity(ctx, c.key));
        emit('stream:city-loaded', { cityKey: c.key });
        return;
      }
      if (d > CITY_UNLOAD && cities.has(c.key)) {
        emit('stream:city-unloading', { cityKey: c.key });
        cities.get(c.key).dispose();
        cities.delete(c.key);
      }
    }
    for (const p of POIS) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < POI_LOAD && !pois.has(p.id)) {
        pois.set(p.id, buildPoi(ctx, p.id));
        emit('stream:poi-loaded', { poiId: p.id });
        return;
      }
      if (d > POI_UNLOAD && pois.has(p.id)) {
        emit('stream:poi-unloading', { poiId: p.id });
        pois.get(p.id).dispose();
        pois.delete(p.id);
      }
    }
  }

  /** Build everything needed around a point right now (used behind the loading screen). */
  function preload(x, z) {
    for (let i = 0; i < 12; i++) { cooldown = 0; update(0, x, z); }
  }

  return {
    update, preload,
    cityLoaded: key => cities.has(key),
    poiLoaded: id => pois.has(id),
    /** Lamp positions of loaded cities (for the point-light pool). */
    lamps() {
      const out = [];
      for (const c of cities.values()) if (c.lamps) for (const l of c.lamps) out.push(l);
      return out;
    },
  };
}
