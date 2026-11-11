// Debug: render the terrain to a PNG (node tools/map-preview.mjs out.png [size]).
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import * as T from '../src/world/terrain.js';
import { CITIES, POIS, WORLD } from '../src/data/world-map.js';

const out = process.argv[2] || 'map-preview.png';
const N = +(process.argv[3] || 700);
const px = Buffer.alloc(N * (N * 3 + 1));
const BIOME = { meadow: [118, 150, 78], farmland: [150, 160, 84], forest: [70, 112, 62], darkforest: [46, 82, 54], highland: [128, 126, 98], mountain: [120, 116, 110], snow: [225, 230, 236], steppe: [172, 150, 96], coast: [190, 176, 128], swamp: [84, 98, 66], heath: [130, 104, 118], lake: [100, 120, 90] };
const t0 = performance.now();
for (let j = 0; j < N; j++) {
  px[j * (N * 3 + 1)] = 0;
  for (let i = 0; i < N; i++) {
    const x = (i / N - 0.5) * 2 * WORLD.half, z = (j / N - 0.5) * 2 * WORLD.half;
    const h = T.heightAt(x, z);
    let c = BIOME[T.regionAt(x, z).biome].slice();
    const hx = T.heightAt(x + 6, z) - h, hz = T.heightAt(x, z + 6) - h;
    const shade = Math.max(0.45, Math.min(1.35, 1 - (hx + hz) * 0.06));
    if (h > 150) c = c.map(v => v + (235 - v) * Math.min(1, (h - 150) / 80));
    c = c.map(v => v * shade);
    const w = T.waterSurfaceAt(x, z);
    if (w !== null) c = [50, 96, 140 - Math.min(60, (w - h) * 6)];
    const rd = T.roadAt(x, z, 9);
    if (rd && w === null) c = rd.road.kind === 'leg' ? [222, 196, 140] : [190, 170, 130];
    if (T.bridgeAt(x, z)) c = [250, 240, 220];
    const o = j * (N * 3 + 1) + 1 + i * 3;
    px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
  }
}
const dot = (x, z, r, col) => {
  const ci = Math.round((x / WORLD.half / 2 + 0.5) * N), cj = Math.round((z / WORLD.half / 2 + 0.5) * N);
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= N || j >= N) continue;
    const o = j * (N * 3 + 1) + 1 + i * 3; px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2];
  }
};
for (const p of POIS) dot(p.x, p.z, 2, p.faction === 'bandit' ? [200, 40, 40] : p.faction === 'beast' ? [240, 140, 30] : [255, 255, 255]);
for (const c of CITIES) dot(c.x, c.z, 5, [20, 20, 20]);
console.log('ms', Math.round(performance.now() - t0), 'per call µs', ((performance.now() - t0) / (N * N * 3) * 1000).toFixed(2));

const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(px)), chunk('IEND', Buffer.alloc(0))]));

for (const c of CITIES) console.log(c.name, 'center h', T.heightAt(c.x, c.z).toFixed(1), 'gates', c.gates.map(g => T.heightAt(g.x, g.z).toFixed(1)).join(' '));
for (let l = 0; l < 3; l++) { const L = T.legLength(l); let mn = 1e9, mx = -1e9, maxGrade = 0, prev = null; for (let s = 0; s <= L; s += 5) { const p = T.legPoint(l, s); mn = Math.min(mn, p.y); mx = Math.max(mx, p.y); if (prev !== null) maxGrade = Math.max(maxGrade, Math.abs(p.y - prev) / 5); prev = p.y; } console.log('leg', l, 'len', L.toFixed(0), 'y', mn.toFixed(1), mx.toFixed(1), 'grade', maxGrade.toFixed(2)); }
console.log('bridges', T.BRIDGES.map(b => `${b.road}@${b.x.toFixed(0)},${b.z.toFixed(0)} len ${b.length.toFixed(0)} y ${b.y.toFixed(1)}`));
console.log('pois under water', POIS.filter(p => T.waterDepthAt(p.x, p.z) > 0).map(p => p.id));
