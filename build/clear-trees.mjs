// Remove trees inside the hand-drawn clearings (clearings.mjs) from the existing tree tiles,
// without re-running the full detection.
import fs from 'fs';
import { fp, tileRect } from './common.mjs';
import { inClearing } from './clearings.mjs';
const counts = JSON.parse(fs.readFileSync(fp('app/data/trees.json')));
let removed = 0;
for (const key of Object.keys(counts)) {
  const f = fp(`app/data/trees/${key}.bin`); if (!fs.existsSync(f)) continue;
  const [tx, ty] = key.split('_').map(Number), [wx, wz, ws] = tileRect(16, tx, ty), d = fs.readFileSync(f);
  const keep = [];
  for (let i = 0; i < d.length; i += 8) if (!inClearing(wx + d.readUInt16LE(i) / 65535 * ws, wz + d.readUInt16LE(i + 2) / 65535 * ws)) keep.push(d.subarray(i, i + 8));
  if (keep.length * 8 === d.length) continue;
  removed += d.length / 8 - keep.length; counts[key] = keep.length;
  fs.writeFileSync(f, Buffer.concat(keep)); console.log(key, 'now', keep.length);
}
fs.writeFileSync(fp('app/data/trees.json'), JSON.stringify(counts));
console.log('removed', removed);
