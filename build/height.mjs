// Stitch terrarium z14 tiles into one Uint16 heightmap (decimeters, +100 m offset)
import fs from 'fs';
import sharp from 'sharp';
import { REG13, p } from './common.mjs';

const tx0 = REG13.x0 * 2, ty0 = REG13.y0 * 2;
const nx = (REG13.x1 - REG13.x0 + 1) * 2, ny = (REG13.y1 - REG13.y0 + 1) * 2;
const W = nx * 256, H = ny * 256;
const out = new Uint16Array(W * H);
let mn = 1e9, mx = -1e9;
for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
  const { data, info } = await sharp(p(`raw/elev/14_${tx0 + i}_${ty0 + j}.png`).pathname.slice(1).replace(/%20/g, ' ')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 256 || info.channels !== 3) throw new Error('unexpected tile ' + JSON.stringify(info));
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const o = (y * 256 + x) * 3;
    const e = data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768;
    if (e < mn) mn = e; if (e > mx) mx = e;
    out[(j * 256 + y) * W + i * 256 + x] = Math.max(0, Math.min(65535, Math.round((e + 100) * 10)));
  }
}
fs.mkdirSync(p('app/data/'), { recursive: true });
fs.writeFileSync(p('app/data/height.bin'), Buffer.from(out.buffer));
console.log('heightmap', W, H, 'elev range', mn.toFixed(1), mx.toFixed(1));
