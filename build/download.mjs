import fs from 'fs';
import { R, CORE15, REG13, p, exists, get, pool } from './common.mjs';

fs.mkdirSync(p('raw/elev/'), { recursive: true });
fs.mkdirSync(p('raw/naip/'), { recursive: true });
console.log('core15', CORE15, 'reg13', REG13);

// elevation, z14 over the whole region
const elev = [];
for (let x = REG13.x0 * 2; x <= REG13.x1 * 2 + 1; x++) for (let y = REG13.y0 * 2; y <= REG13.y1 * 2 + 1; y++) elev.push([x, y]);
console.log('elev tiles', elev.length);
let fail = 0;
await pool(elev, 8, async ([x, y]) => {
  const f = p(`raw/elev/14_${x}_${y}.png`);
  if (exists(f)) return;
  const b = await get(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/14/${x}/${y}.png`);
  if (b) fs.writeFileSync(f, b); else fail++;
});
console.log('elev done, failures', fail);

// NAIP, z16 over the core at 1024px (0.6 m/px)
const naip = [];
for (let x = CORE15.x0 * 2; x <= CORE15.x1 * 2 + 1; x++) for (let y = CORE15.y0 * 2; y <= CORE15.y1 * 2 + 1; y++) naip.push([x, y]);
console.log('naip tiles', naip.length);
fail = 0;
const s = 2 * R / 65536;
await pool(naip, 6, async ([x, y]) => {
  const f = p(`raw/naip/16_${x}_${y}.jpg`);
  if (exists(f)) return;
  const bbox = [-R + x * s, R - (y + 1) * s, -R + (x + 1) * s, R - y * s].join(',');
  const b = await get(`https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage?bbox=${bbox}&bboxSR=3857&imageSR=3857&size=1024,1024&format=jpg&f=image`);
  if (b) fs.writeFileSync(f, b); else fail++;
});
console.log('naip done, failures', fail);
