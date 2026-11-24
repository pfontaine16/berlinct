// Detect tree canopy in the aerial imagery and emit tree instances per z16 tile.
// Record: u16 x, u16 y (tile fraction), u8 r,g,b, u8 height(dm/2)
import fs from 'fs';
import sharp from 'sharp';
import { CORE15, fp, exists, tileRect, pool } from './common.mjs';
import { inClearing } from './clearings.mjs';

fs.mkdirSync(fp('app/data/trees/'), { recursive: true });
const B = 12, N = Math.floor(1024 / B); // 12px = ~5.4 m cells
// building mask so trees don't sprout through roofs
const blds = JSON.parse(fs.readFileSync(fp('app/data/buildings.json')));
const grid = new Map();
for (const b of blds) { const k = Math.floor(b[5] / 60) + '_' + Math.floor(b[6] / 60); (grid.get(k) || grid.set(k, []).get(k)).push(b); }
function inBuilding(x, z) {
  const gx = Math.floor(x / 60), gz = Math.floor(z / 60);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const b of grid.get((gx + i) + '_' + (gz + j)) || []) {
    const px = x - b[5], pz = z - b[6]; let c = false;
    for (let a = 8, n = b.length, p = n - 2; a < n; p = a, a += 2) { if ((b[a + 1] > pz) !== (b[p + 1] > pz) && px < (b[p] - b[a]) * (pz - b[a + 1]) / (b[p + 1] - b[a + 1]) + b[a]) c = !c; }
    if (c) return true;
  }
  return false;
}
// water mask (ponds photograph green) and road mask (no trunks in the travel lanes)
const water = JSON.parse(fs.readFileSync(fp('app/data/water.json'))).map((w) => {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < w.o.length; i += 2) { x0 = Math.min(x0, w.o[i]); x1 = Math.max(x1, w.o[i]); z0 = Math.min(z0, w.o[i + 1]); z1 = Math.max(z1, w.o[i + 1]); }
  return { o: w.o, h: w.h, x0, x1, z0, z1 };
});
const pip = (r, x, z) => { let c = false; for (let a = 0, n = r.length, p = n - 2; a < n; p = a, a += 2) { if ((r[a + 1] > z) !== (r[p + 1] > z) && x < (r[p] - r[a]) * (z - r[a + 1]) / (r[p + 1] - r[a + 1]) + r[a]) c = !c; } return c; };
const inWater = (x, z) => water.some((w) => x > w.x0 - 3 && x < w.x1 + 3 && z > w.z0 - 3 && z < w.z1 + 3 && pip(w.o, x, z) && !w.h.some((h) => pip(h, x, z)));
const rgrid = new Map(), RW = [13, 7.5, 5.5, 4.2, 5];
for (const r of JSON.parse(fs.readFileSync(fp('app/data/roads.json')))) for (let i = 2; i < r.length - 2; i += 2) {
  const seg = [r[i], r[i + 1], r[i + 2], r[i + 3], RW[r[1]]];
  const gx0 = Math.floor((Math.min(seg[0], seg[2]) - 15) / 80), gx1 = Math.floor((Math.max(seg[0], seg[2]) + 15) / 80), gz0 = Math.floor((Math.min(seg[1], seg[3]) - 15) / 80), gz1 = Math.floor((Math.max(seg[1], seg[3]) + 15) / 80);
  for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) { const k = gx + '_' + gz; (rgrid.get(k) || rgrid.set(k, []).get(k)).push(seg); }
}
const onRoad = (x, z) => { for (const s of rgrid.get(Math.floor(x / 80) + '_' + Math.floor(z / 80)) || []) { const dx = s[2] - s[0], dz = s[3] - s[1], t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / (dx * dx + dz * dz || 1))); if (Math.hypot(x - s[0] - dx * t, z - s[1] - dz * t) < s[4]) return true; } return false; };
let rnd = 1; const rand = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };
const jobs = []; let total = 0; const counts = {};
for (let x = CORE15.x0 * 2; x <= CORE15.x1 * 2 + 1; x++) for (let y = CORE15.y0 * 2; y <= CORE15.y1 * 2 + 1; y++) jobs.push([x, y]);
await pool(jobs, 4, async ([x, y]) => {
  const src = fp(`raw/naip/16_${x}_${y}.jpg`); if (!exists(src)) return;
  const d = await sharp(src).removeAlpha().raw().toBuffer();
  const [wx, wz, ws] = tileRect(16, x, y);
  const recs = [];
  for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
    let r = 0, g = 0, b = 0, s1 = 0, s2 = 0;
    for (let py = 0; py < B; py++) for (let px = 0; px < B; px++) {
      const o = ((cy * B + py) * 1024 + cx * B + px) * 3; const R_ = d[o], G_ = d[o + 1], B_ = d[o + 2];
      r += R_; g += G_; b += B_; const l = 0.3 * R_ + 0.59 * G_ + 0.11 * B_; s1 += l; s2 += l * l;
    }
    const n = B * B; r /= n; g /= n; b /= n; const lum = s1 / n, sd = Math.sqrt(Math.max(0, s2 / n - lum * lum));
    const green = g > r * 1.06 && g > b * 1.18;
    if (!(green && lum < 112 && sd > 7.5)) continue;
    // sparser where canopy is uncertain (bright / smooth)
    const conf = Math.min(1, (112 - lum) / 30) * Math.min(1, (sd - 7.5) / 6);
    if (rand() > 0.35 + conf) continue;
    const fx = (cx + 0.15 + rand() * 0.7) / N, fy = (cy + 0.15 + rand() * 0.7) / N;
    const X = wx + fx * ws, Z = wz + fy * ws;
    if (inBuilding(X, Z) || onRoad(X, Z) || inWater(X, Z) || inClearing(X, Z)) continue;
    const h = 9 + rand() * 9 + conf * 4; // metres
    recs.push(Math.round(fx * 65535), Math.round(fy * 65535), r, g, b, h);
  }
  const cnt = recs.length / 6; total += cnt; counts[x + '_' + y] = cnt;
  const buf = Buffer.alloc(cnt * 8);
  for (let i = 0; i < cnt; i++) { buf.writeUInt16LE(recs[i * 6], i * 8); buf.writeUInt16LE(recs[i * 6 + 1], i * 8 + 2); buf[i * 8 + 4] = recs[i * 6 + 2]; buf[i * 8 + 5] = recs[i * 6 + 3]; buf[i * 8 + 6] = recs[i * 6 + 4]; buf[i * 8 + 7] = Math.min(255, Math.round(recs[i * 6 + 5] * 5)); }
  fs.writeFileSync(fp(`app/data/trees/${x}_${y}.bin`), buf);
});
fs.writeFileSync(fp('app/data/trees.json'), JSON.stringify(counts));
console.log('trees total', total, 'max per tile', Math.max(...Object.values(counts)));
