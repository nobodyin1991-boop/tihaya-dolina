// World map bitmap: rendered once per session into an offscreen canvas (in a module Worker, or in
// time slices on the main thread when workers are unavailable) and cached. Vector layers (roads, river,
// bridges) are exposed as Path2D in world coordinates so the map screen can stroke them crisply at any zoom.
import { ROADS, BRIDGES, RIVER_SAMPLES } from '../world/terrain.js';
import { WORLD, RIVER } from '../data/world-map.js';

export const MAP_SIZE = 1024;
const SLICE_MS = 7;

let shared = null;

/**
 * The shared map bitmap.
 * @returns {{canvas: HTMLCanvasElement, size: number, progress: number, done: boolean,
 *            start: () => void, onProgress: (fn: (progress: number, done: boolean) => void) => () => void}}
 */
export function getMapBitmap() {
  if (shared) return shared;
  const canvas = document.createElement('canvas');
  canvas.width = MAP_SIZE;
  canvas.height = MAP_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#15120e';
  ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
  const listeners = new Set();
  let started = false;

  const api = {
    canvas,
    size: MAP_SIZE,
    progress: 0,
    done: false,
    start,
    onProgress(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  function notify() {
    for (const fn of listeners) fn(api.progress, api.done);
  }

  function putRows(row, count, pixels) {
    ctx.putImageData(new ImageData(pixels, MAP_SIZE, count), 0, row);
    api.progress = Math.min(1, (row + count) / MAP_SIZE);
    notify();
  }

  function finish() {
    api.progress = 1;
    api.done = true;
    notify();
  }

  async function renderOnMainThread() {
    const { createMapShader } = await import('./map-shade.js');
    const shader = createMapShader(MAP_SIZE);
    let row = 0;
    const slice = () => {
      const until = performance.now() + SLICE_MS;
      while (row < MAP_SIZE && performance.now() < until) {
        const pixels = new Uint8ClampedArray(MAP_SIZE * 4);
        shader.renderRow(row, pixels, 0);
        putRows(row, 1, pixels);
        row++;
      }
      if (row < MAP_SIZE) setTimeout(slice, 0);
      else finish();
    };
    slice();
  }

  /** Begin rendering (idempotent). */
  function start() {
    if (started) return;
    started = true;
    let worker = null;
    try {
      worker = new Worker(new URL('./map-worker.js', import.meta.url), { type: 'module' });
    } catch {
      worker = null;
    }
    if (!worker) {
      renderOnMainThread();
      return;
    }
    let gotRows = false;
    worker.onmessage = event => {
      const data = event.data;
      if (data.done) {
        worker.terminate();
        finish();
        return;
      }
      gotRows = true;
      putRows(data.row, data.count, new Uint8ClampedArray(data.pixels));
    };
    worker.onerror = event => {
      event.preventDefault();
      worker.terminate();
      if (!gotRows) renderOnMainThread();
    };
    worker.postMessage({ size: MAP_SIZE });
  }

  shared = api;
  return api;
}

function pathOf(samples) {
  const path = new Path2D();
  for (let i = 0; i < samples.length; i++) {
    if (i === 0) path.moveTo(samples[i].x, samples[i].z);
    else path.lineTo(samples[i].x, samples[i].z);
  }
  return path;
}

let vectors = null;

/**
 * Vector layers in world coordinates (x → east, z → south):
 * {legs: Path2D, sides: Path2D, river: Path2D, riverWidth, bridges: [{x, z, yaw, length, halfWidth}], half}
 */
export function getMapVectors() {
  if (vectors) return vectors;
  const legs = new Path2D();
  const sides = new Path2D();
  for (const road of ROADS) {
    const target = road.kind === 'leg' ? legs : sides;
    target.addPath(pathOf(road.path.samples));
  }
  // the river ends where it meets the sea
  const riverSamples = RIVER_SAMPLES.filter(s => Math.abs(s.x) < WORLD.half && Math.abs(s.z) < WORLD.half);
  vectors = {
    legs,
    sides,
    river: pathOf(riverSamples),
    riverWidth: RIVER.width,
    bridges: BRIDGES.map(b => ({ x: b.x, z: b.z, yaw: b.yaw, length: b.length, halfWidth: b.halfWidth })),
    half: WORLD.half,
  };
  return vectors;
}
