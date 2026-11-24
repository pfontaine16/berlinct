// Build the imagery tile pyramid (z16 NAIP core -> z15 -> z14 -> z13, filled with USGS cached tiles outside the core)
import fs from 'fs';
import sharp from 'sharp';
import { CORE15, REG13, fp, exists, get, pool } from './common.mjs';

const out = (z, x, y) => fp(`app/data/img/${z}/${x}_${y}.jpg`);
for (const z of [13, 14, 15, 16]) fs.mkdirSync(fp(`app/data/img/${z}/`), { recursive: true });
fs.mkdirSync(fp('raw/usgs/'), { recursive: true });
const have = { 13: [], 14: [], 15: [], 16: [] };

// z16: copy NAIP
for (let x = CORE15.x0 * 2; x <= CORE15.x1 * 2 + 1; x++) for (let y = CORE15.y0 * 2; y <= CORE15.y1 * 2 + 1; y++) {
  const src = fp(`raw/naip/16_${x}_${y}.jpg`);
  if (!exists(src)) { console.log('missing naip', x, y); continue; }
  if (!exists(out(16, x, y))) fs.copyFileSync(src, out(16, x, y));
  have[16].push(x + '_' + y);
}

async function usgs(z, x, y) {
  const f = fp(`raw/usgs/${z}_${x}_${y}.jpg`);
  if (!exists(f)) { const b = await get(`https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${z}/${y}/${x}`); if (!b) return null; fs.writeFileSync(f, b); }
  return f;
}
async function build(z, x, y, size) {
  const parts = [];
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const cx = x * 2 + dx, cy = y * 2 + dy;
    let src = exists(out(z + 1, cx, cy)) ? out(z + 1, cx, cy) : await usgs(z + 1, cx, cy);
    if (!src) continue;
    parts.push({ input: await sharp(src).resize(size / 2, size / 2, { kernel: 'lanczos3' }).toBuffer(), left: dx * size / 2, top: dy * size / 2 });
  }
  await sharp({ create: { width: size, height: size, channels: 3, background: { r: 60, g: 80, b: 50 } } }).composite(parts).jpeg({ quality: 84 }).toFile(out(z, x, y));
}
// z15 core
let jobs = [];
for (let x = CORE15.x0; x <= CORE15.x1; x++) for (let y = CORE15.y0; y <= CORE15.y1; y++) jobs.push([15, x, y, 1024]);
await pool(jobs, 6, async ([z, x, y, s]) => { if (!exists(out(z, x, y))) await build(z, x, y, s); have[15].push(x + '_' + y); });
// z15 siblings just outside the core, so every z14 parent has four children
jobs = [];
for (let x = (CORE15.x0 >> 1) * 2; x <= (CORE15.x1 >> 1) * 2 + 1; x++) for (let y = (CORE15.y0 >> 1) * 2; y <= (CORE15.y1 >> 1) * 2 + 1; y++)
  if (x < CORE15.x0 || x > CORE15.x1 || y < CORE15.y0 || y > CORE15.y1) jobs.push([15, x, y, 512]);
await pool(jobs, 6, async ([z, x, y, s]) => { if (!exists(out(z, x, y))) await build(z, x, y, s); have[15].push(x + '_' + y); });
// z14 touching the core
jobs = [];
for (let x = CORE15.x0 >> 1; x <= CORE15.x1 >> 1; x++) for (let y = CORE15.y0 >> 1; y <= CORE15.y1 >> 1; y++) jobs.push([14, x, y, 1024]);
await pool(jobs, 6, async ([z, x, y, s]) => { if (!exists(out(z, x, y))) await build(z, x, y, s); have[14].push(x + '_' + y); });
// z13 whole region (1024 where core-backed, 512 otherwise)
jobs = [];
for (let x = REG13.x0; x <= REG13.x1; x++) for (let y = REG13.y0; y <= REG13.y1; y++) {
  const core = x >= CORE15.x0 >> 2 && x <= CORE15.x1 >> 2 && y >= CORE15.y0 >> 2 && y <= CORE15.y1 >> 2;
  jobs.push([13, x, y, core ? 1024 : 512]);
}
await pool(jobs, 6, async ([z, x, y, s]) => { if (!exists(out(z, x, y))) await build(z, x, y, s); have[13].push(x + '_' + y); });
fs.writeFileSync(fp('app/data/tiles.json'), JSON.stringify(have));
console.log('tiles', Object.entries(have).map(([k, v]) => k + ':' + v.length).join(' '));
