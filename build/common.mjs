import fs from 'fs';
import { fileURLToPath } from 'url';
export const R = 20037508.342789244;
export const lon2x = (lon, z) => (lon + 180) / 360 * 2 ** z;
export const lat2y = (lat, z) => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z;
export const x2lon = (x, z) => x / 2 ** z * 360 - 180;
export const y2lat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) * 180 / Math.PI;

// Town bounds from the OSM administrative boundary
export const TOWN = { minlat: 41.5537205, minlon: -72.8397657, maxlat: 41.6527197, maxlon: -72.7110151 };
const M = 0.004;
// core: high-res imagery, snapped to z15 tiles
export const CORE15 = {
  x0: Math.floor(lon2x(TOWN.minlon - M, 15)), x1: Math.floor(lon2x(TOWN.maxlon + M, 15)),
  y0: Math.floor(lat2y(TOWN.maxlat + M, 15)), y1: Math.floor(lat2y(TOWN.minlat - M, 15)),
};
// region: z13 tiles, core +-2
export const REG13 = {
  x0: (CORE15.x0 >> 2) - 2, x1: (CORE15.x1 >> 2) + 2,
  y0: (CORE15.y0 >> 2) - 2, y1: (CORE15.y1 >> 2) + 2,
};
export const ROOT = new URL('..', import.meta.url);
export const fp = (s) => fileURLToPath(new URL(s, ROOT));
// local world frame: meters east (x) / south (z) of the town centre
export const LAT0 = (TOWN.minlat + TOWN.maxlat) / 2, LON0 = (TOWN.minlon + TOWN.maxlon) / 2;
export const K = Math.cos(LAT0 * Math.PI / 180);
export const mercX = (lon) => lon * R / 180;
export const mercY = (lat) => 6378137 * Math.asinh(Math.tan(lat * Math.PI / 180));
export const MX0 = mercX(LON0), MY0 = mercY(LAT0);
export const toWorld = (lat, lon) => [(mercX(lon) - MX0) * K, -(mercY(lat) - MY0) * K];
// world rect of a tile: [x0, z0, size]
export const tileRect = (z, x, y) => { const s = 2 * R / 2 ** z; return [(-R + x * s - MX0) * K, -(R - y * s - MY0) * K, s * K]; };
export const p = (s) => new URL(s, ROOT);
export const exists = (u) => fs.existsSync(u);

export async function get(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'town-flyover-builder/1.0' }, signal: AbortSignal.timeout(90000) });
      if (r.ok) {
        const b = Buffer.from(await r.arrayBuffer());
        const ct = r.headers.get('content-type') || '';
        if (ct.startsWith('image') && b.length > 300) return b;
      }
    } catch (e) { }
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  return null;
}
export async function pool(items, n, fn) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const it = items[i++]; await fn(it); if (++done % 50 === 0) console.log(done + '/' + items.length); }
  }));
}
