// Module worker: renders the world map bitmap off the main thread, a few rows per message.
// Protocol: in  {size}
//           out {row, count, pixels: ArrayBuffer (RGBA rows)} … then {done: true}
import { createMapShader } from './map-shade.js';

const ROWS_PER_MESSAGE = 16;

self.onmessage = event => {
  const size = event.data.size;
  const shader = createMapShader(size);
  for (let row = 0; row < size; row += ROWS_PER_MESSAGE) {
    const count = Math.min(ROWS_PER_MESSAGE, size - row);
    const pixels = new Uint8ClampedArray(count * size * 4);
    for (let k = 0; k < count; k++) shader.renderRow(row + k, pixels, k * size * 4);
    self.postMessage({ row, count, pixels: pixels.buffer }, [pixels.buffer]);
  }
  self.postMessage({ done: true });
};
