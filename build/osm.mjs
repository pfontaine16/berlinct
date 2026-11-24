// Convert OSM extract into compact scene data: buildings, water, labels, roads, boundary
import fs from 'fs';
import sharp from 'sharp';
import { TOWN, CORE15, REG13, R, K, MX0, MY0, toWorld, tileRect, fp, exists } from './common.mjs';

const osm = JSON.parse(fs.readFileSync(fp('data/osm.json')));
const els = osm.elements;
const W = (g) => g.map(q => toWorld(q.lat, q.lon));
const r1 = (v) => Math.round(v * 10) / 10;

function area(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; }
function centroid(r) { let x = 0, z = 0; for (const q of r) { x += q[0]; z += q[1]; } return [x / r.length, z / r.length]; }
function inside(pt, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { if ((r[i][1] > pt[1]) !== (r[j][1] > pt[1]) && pt[0] < (r[j][0] - r[i][0]) * (pt[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; } return c; }
function closeRing(r) { const a = r[0], b = r[r.length - 1]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01) r = r.slice(0, -1); return r; }
function stitch(ways) { // join way fragments into closed rings
  const rings = []; const pool = ways.map(w => w.slice());
  const eq = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;
  while (pool.length) {
    let cur = pool.pop();
    let grew = true;
    while (!eq(cur[0], cur[cur.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i], end = cur[cur.length - 1];
        if (eq(w[0], end)) { cur = cur.concat(w.slice(1)); pool.splice(i, 1); grew = true; break; }
        if (eq(w[w.length - 1], end)) { cur = cur.concat(w.slice(0, -1).reverse()); pool.splice(i, 1); grew = true; break; }
      }
    }
    if (cur.length >= 4 && eq(cur[0], cur[cur.length - 1])) rings.push(closeRing(cur));
  }
  return rings;
}

// ---- town boundary
const brel = els.find(e => e.type === 'relation' && e.tags?.boundary && e.tags.name === 'Berlin');
const bparts = stitch(brel.members.filter(m => m.type === 'way' && m.geometry).map(m => W(m.geometry)));
const boundary = bparts.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0];
console.log('boundary pts', boundary?.length, 'area km2', (Math.abs(area(boundary)) / 1e6).toFixed(1));
const inTown = (pt) => inside(pt, boundary);

// ---- imagery sampler (NAIP z16, reduced to 256px)
const cache = new Map();
async function tilePix(x, y) {
  const k = x + '_' + y; if (cache.has(k)) return cache.get(k);
  const f = fp(`raw/naip/16_${k}.jpg`); let v = null;
  if (exists(f)) v = (await sharp(f).resize(256, 256).removeAlpha().raw().toBuffer());
  cache.set(k, v); if (cache.size > 400) cache.delete(cache.keys().next().value);
  return v;
}
async function sample(pt) {
  const mx = pt[0] / K + MX0, my = -pt[1] / K + MY0, s = 2 * R / 65536;
  const fx = (mx + R) / s, fy = (R - my) / s, tx = Math.floor(fx), ty = Math.floor(fy);
  const d = await tilePix(tx, ty); if (!d) return null;
  const px = Math.min(255, Math.floor((fx - tx) * 256)), py = Math.min(255, Math.floor((fy - ty) * 256)), o = (py * 256 + px) * 3;
  return [d[o], d[o + 1], d[o + 2]];
}

// ---- buildings
const hash = (n) => { let h = Math.imul(n, 2654435761) >>> 0; h ^= h >>> 15; return (h % 1000) / 1000; };
const blds = [];
const bEls = els.filter(e => e.tags?.building && e.tags.building !== 'no');
bEls.sort((a, b) => (a.bounds?.minlon ?? 0) - (b.bounds?.minlon ?? 0));
for (const e of bEls) {
  let ring;
  if (e.type === 'way' && e.geometry) ring = closeRing(W(e.geometry));
  else if (e.type === 'relation') { const o = stitch(e.members.filter(m => m.role === 'outer' && m.geometry).map(m => W(m.geometry))); ring = o.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0]; }
  if (!ring || ring.length < 3) continue;
  let a = area(ring); if (a < 0) { ring.reverse(); a = -a; }
  if (a < 12) continue;
  const t = e.tags, b = t.building, h01 = hash(e.id);
  // kind: 0 house, 1 outbuilding, 2 commercial, 3 industrial, 4 civic/school, 5 church, 6 apartments
  let kind = 0;
  if (/garage|shed|carport|roof|hut|barn|greenhouse|farm_auxiliary|stable/.test(b)) kind = 1;
  else if (/commercial|retail|office|supermarket|hotel|restaurant/.test(b) || t.shop || /restaurant|fast_food|bank|fuel|cafe|pharmacy/.test(t.amenity || '')) kind = 2;
  else if (/industrial|warehouse|manufacture|hangar|service/.test(b)) kind = 3;
  else if (/school|university|college|public|civic|government|hospital|fire_station|kindergarten/.test(b) || /school|townhall|library|fire_station|police|community_centre|hospital/.test(t.amenity || '')) kind = 4;
  else if (/church|chapel|cathedral|religious|synagogue|mosque/.test(b) || t.amenity === 'place_of_worship') kind = 5;
  else if (/apartments|dormitory/.test(b)) kind = 6;
  else if (b === 'yes') kind = a < 45 ? 1 : a > 1500 ? 3 : a > 520 ? 2 : 0;
  let h = parseFloat(t.height) || (parseFloat(t['building:levels']) ? parseFloat(t['building:levels']) * 3.3 + 0.8 : 0);
  if (!h) h = [4.6 + h01 * 2.4, 2.8, 5.5 + h01 * 2, 7.5 + h01 * 3, 8, 10, 10.5][kind];
  const c = centroid(ring);
  const step = Math.ceil(ring.length / 4);
  const pts = [c, ...ring.filter((_, i) => i % step === 0).map(q => [(q[0] + c[0] * 2) / 3, (q[1] + c[1] * 2) / 3])].filter(q => inside(q, ring));
  let col = null, n = 0; const acc = [0, 0, 0];
  for (const q of pts.length ? pts : [c]) { const s = await sample(q); if (s) { acc[0] += s[0]; acc[1] += s[1]; acc[2] += s[2]; n++; } }
  if (n) col = acc.map(v => Math.round(v / n));
  const flat = [];
  for (const q of ring) flat.push(r1(q[0] - c[0]), r1(q[1] - c[1]));
  blds.push([kind, r1(h), col ? col[0] : -1, col ? col[1] : 0, col ? col[2] : 0, r1(c[0]), r1(c[1]), Math.round(a), ...flat]);
}
console.log('buildings', blds.length);

// ---- water
const water = [];
for (const e of els) {
  const t = e.tags || {}; if (t.natural !== 'water') continue;
  let outers = [], holes = [];
  if (e.type === 'way' && e.geometry) { const r = W(e.geometry); const a = r[0], b = r[r.length - 1]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.05) continue; outers = [closeRing(r)]; }
  else if (e.type === 'relation') {
    outers = stitch(e.members.filter(m => m.role !== 'inner' && m.geometry).map(m => W(m.geometry)));
    holes = stitch(e.members.filter(m => m.role === 'inner' && m.geometry).map(m => W(m.geometry)));
  }
  for (const o of outers) {
    const a = Math.abs(area(o)); if (a < 250) continue;
    const hs = holes.filter(h => inside(h[0], o));
    water.push({ n: t.name || '', a: Math.round(a), o: o.flat().map(r1), h: hs.map(h => h.flat().map(r1)) });
  }
}
console.log('water polys', water.length);

// ---- labels
const labels = []; const seen = new Set();
const add = (n, k, pt, extra = {}) => { if (!n || /^Town Of Berlin \(|Well Site|Parcel|Pond #|UPS Store|Open Space$/.test(n)) return; const key = n + '|' + k; if (seen.has(key)) return; seen.add(key); labels.push({ n, k, x: Math.round(pt[0]), z: Math.round(pt[1]), ...extra }); };
const tl = toWorld(TOWN.maxlat, TOWN.minlon), br = toWorld(TOWN.minlat, TOWN.maxlon);
const near = (pt, m) => pt[0] > tl[0] - m && pt[0] < br[0] + m && pt[1] > tl[1] - m && pt[1] < br[1] + m;
for (const e of els) {
  const t = e.tags || {}; if (!t.name) continue;
  let pt;
  if (e.type === 'node') pt = toWorld(e.lat, e.lon);
  else if (e.geometry) pt = centroid(W(e.geometry));
  else if (e.bounds) pt = toWorld((e.bounds.minlat + e.bounds.maxlat) / 2, (e.bounds.minlon + e.bounds.maxlon) / 2);
  else continue;
  const it = inTown(pt);
  if (e.type === 'node' && t.place) {
    if (/state|county/.test(t.place)) continue;
    if (/city|town/.test(t.place)) add(t.name, 'town', pt);
    else if (/village|hamlet|suburb/.test(t.place) && (it || near(pt, 1500))) add(t.name, 'village', pt);
    else if (/neighbourhood|locality/.test(t.place) && it) add(t.name, 'hood', pt);
  }
  else if (t.natural === 'peak') add(t.name, 'peak', pt);
  else if (t.natural === 'water' && e.type !== 'node') { const g = e.geometry ? Math.abs(area(W(e.geometry))) : 1e5; if (g > 6000 && near(pt, 3000)) add(t.name, 'water', pt); }
  else if (t.leisure === 'golf_course' && near(pt, 800)) add(t.name, 'park', pt);
  else if (/park|nature_reserve/.test(t.leisure || '') && it) add(t.name, 'park', pt);
  else if (t.amenity === 'school' && it) add(t.name, 'school', pt);
  else if (t.amenity === 'place_of_worship' && it) add(t.name, 'church', pt);
  else if (/townhall|library|fire_station|police|post_office|community_centre/.test(t.amenity || '') && it) add(t.name, 'civic', pt);
  else if (t.railway === 'station') add(t.name + ' Station', 'civic', pt);
  else if ((t.historic || /museum|attraction|viewpoint/.test(t.tourism || '')) && it) add(t.name, 'historic', pt);
}
console.log('labels', labels.length, JSON.stringify(labels.reduce((m, l) => (m[l.k] = (m[l.k] || 0) + 1, m), {})));
console.log(labels.filter(l => inTown([l.x, l.z])).map(l => l.n + '[' + l.k + ']').join('; '));

// ---- roads (for "now over" readout and minimap)
const roads = [];
const cls = { motorway: 0, trunk: 0, primary: 1, secondary: 1, tertiary: 2, unclassified: 3, residential: 3, motorway_link: 4, trunk_link: 4, primary_link: 4 };
for (const e of els) {
  const t = e.tags || {}; if (!t.highway || !(t.highway in cls) || !e.geometry) continue;
  const c = cls[t.highway]; const nm = t.name || (t.ref ? t.ref.split(';')[0] : ''); if (!nm && c > 1) continue;
  roads.push([nm, c, ...W(e.geometry).flat().map(Math.round)]);
}
console.log('roads', roads.length);

fs.mkdirSync(fp('app/data/'), { recursive: true });
const out = { buildings: blds, water, labels, roads, boundary: boundary.flat().map(Math.round) };
for (const [k, v] of Object.entries(out)) { fs.writeFileSync(fp(`app/data/${k}.json`), JSON.stringify(v)); console.log(k, (fs.statSync(fp(`app/data/${k}.json`)).size / 1e6).toFixed(2) + ' MB'); }
fs.writeFileSync(fp('app/data/meta.json'), JSON.stringify({ CORE15, REG13, K, MX0, MY0, R, town: TOWN, heightW: (REG13.x1 - REG13.x0 + 1) * 512, heightOrigin: tileRect(13, REG13.x0, REG13.y0) }));
