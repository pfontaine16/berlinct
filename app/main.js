import * as THREE from 'three';
import { Sky } from './vendor/Sky.js';

const $ = (id) => document.getElementById(id);
const J = (u) => fetch('data/' + u).then((r) => r.json());
const V3 = THREE.Vector3;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const progress = (f, msg) => { $('lbar').style.width = Math.round(f * 100) + '%'; if (msg) $('lmsg').textContent = msg; };

// ───────────────────────── data
progress(0.05, 'Loading map data…');
const [meta, tileList, treeCounts, labelData, waterData, roadData, boundary, buildingData] = await Promise.all(
  ['meta.json', 'tiles.json', 'trees.json', 'labels.json', 'water.json', 'roads.json', 'boundary.json', 'buildings.json'].map(J));
labelData.push({ n: 'Home · 2 Misty Mountain Road', k: 'home', x: 75, z: -2222 });
progress(0.2, 'Loading elevation…');
const heights = new Uint16Array(await (await fetch('data/height.bin')).arrayBuffer());
const { R, K, MX0, MY0 } = meta;
const HW = meta.heightW, [HX0, HZ0, T13] = meta.heightOrigin, HS = T13 * (meta.REG13.x1 - meta.REG13.x0 + 1);
const tileSet = {}; for (const z in tileList) tileSet[z] = new Set(tileList[z]);

function H(x, z) { // terrain height (m) at world x,z
  const u = clamp((x - HX0) / HS * HW - 0.5, 0, HW - 1.001), v = clamp((z - HZ0) / HS * HW - 0.5, 0, HW - 1.001);
  const i = u | 0, j = v | 0, fu = u - i, fv = v - j, o = j * HW + i;
  return ((heights[o] * (1 - fu) + heights[o + 1] * fu) * (1 - fv) + (heights[o + HW] * (1 - fu) + heights[o + HW + 1] * fu) * fv) / 10 - 100;
}
// Regrade the lot at 2 Misty Mountain Road. The elevation model tilts it sideways; really the front lawn is
// level with the house and the ground falls away behind it (walk-out basement).
{
  const C = [76.2, -2223], O = [66.3, -2230.6], V = [-0.333, 0.943], L = 47.8, R0 = 15, R1 = 36, cs = HS / HW;
  const i0 = Math.floor((C[0] - R1 - HX0) / cs), j0 = Math.floor((C[1] - R1 - HZ0) / cs), nn = Math.ceil(2 * R1 / cs) + 1;
  for (let j = j0; j <= j0 + nn; j++) for (let i = i0; i <= i0 + nn; i++) {
    const x = HX0 + (i + 0.5) * cs, z = HZ0 + (j + 0.5) * cs, d = Math.hypot(x - C[0], z - C[1]); if (d >= R1) continue;
    const t = clamp((R1 - d) / (R1 - R0), 0, 1), w = t * t * (3 - 2 * t), v = (x - O[0]) * V[0] + (z - O[1]) * V[1]; // v: metres in front of the back wall
    const target = L - clamp((5 - v) * 0.3, 0, 2.6), o = j * HW + i;
    heights[o] = Math.round(heights[o] * (1 - w) + (target + 100) * 10 * w);
  }
}
const tileRect = (z, x, y) => { const s = 2 * R / 2 ** z; return [(-R + x * s - MX0) * K, -(R - y * s - MY0) * K, s * K]; };
const WORLD = { x0: HX0 + 400, z0: HZ0 + 400, x1: HX0 + HS - 400, z1: HZ0 + HS - 400 };

// ───────────────────────── renderer / scene
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const MAXANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 2, 90000);
camera.rotation.order = 'YXZ';
scene.fog = new THREE.Fog(0xc8d6e2, 1200, 19000);

const sky = new Sky(); sky.scale.setScalar(60000); scene.add(sky);
const sun = new THREE.DirectionalLight(0xffffff, 2); scene.add(sun);
const hemi = new THREE.HemisphereLight(0xffffff, 0x556644, 1.5); scene.add(hemi);
const sunDir = new V3();

const TIMES = [
  { name: '☀ Afternoon', el: 38, az: 235, sun: [0xfff3e0, 2.3], hemi: [0xdfeaff, 0x7c8468, 1.02], fog: 0xbfd0df, turb: 4, ray: 1.3, mie: 0.004, exp: 0.42, cloud: 0.42 },
  { name: '🌅 Golden hour', el: 10, az: 282, sun: [0xffc98a, 2.6], hemi: [0xf3dccb, 0x6f6a58, 0.9], fog: 0xdcc0a2, turb: 7, ray: 2.2, mie: 0.008, exp: 0.4, cloud: 0.5 },
  { name: '☼ Midday', el: 64, az: 180, sun: [0xffffff, 2.2], hemi: [0xe2edff, 0x80886c, 1.03], fog: 0xc3d5e6, turb: 2.5, ray: 1.0, mie: 0.003, exp: 0.42, cloud: 0.32 },
  { name: '🌄 Morning', el: 14, az: 92, sun: [0xffdcb0, 2.5], hemi: [0xe9e2e2, 0x6c705e, 0.92], fog: 0xd7cdc2, turb: 6, ray: 1.8, mie: 0.007, exp: 0.4, cloud: 0.55 },
  { name: '🌆 Dusk', el: 1.5, az: 296, sun: [0xff9460, 1.4], hemi: [0xa9aed0, 0x4d4c58, 0.62], fog: 0x84727c, turb: 9, ray: 3, mie: 0.01, exp: 0.34, cloud: 0.5 },
];
let timeIdx = 0;
const waterU = { uTime: { value: 0 }, uSun: { value: sunDir }, uSunCol: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 2 } };
function setTime(i) {
  timeIdx = (i + TIMES.length) % TIMES.length; const t = TIMES[timeIdx];
  const el = t.el * Math.PI / 180, az = t.az * Math.PI / 180;
  sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  const u = sky.material.uniforms;
  u.sunPosition.value.copy(sunDir); u.turbidity.value = t.turb; u.rayleigh.value = t.ray; u.mieCoefficient.value = t.mie; u.mieDirectionalG.value = 0.8;
  if (u.cloudCoverage) { u.cloudCoverage.value = t.cloud; u.cloudDensity.value = 0.45; u.cloudElevation.value = 0.55; u.cloudScale.value = 0.00022; }
  renderer.toneMappingExposure = t.exp;
  sun.color.set(t.sun[0]); sun.intensity = t.sun[1]; sun.position.copy(sunDir);
  hemi.color.set(t.hemi[0]); hemi.groundColor.set(t.hemi[1]); hemi.intensity = Math.max(0.6, Math.PI * t.hemi[2] - t.sun[1] * Math.sin(el));
  scene.fog.color.set(t.fog);
  waterU.uSunCol.value.set(t.sun[0]); waterU.uHorizon.value.set(t.fog); waterU.uSky.value.set(t.hemi[0]).multiplyScalar(0.55).lerp(new THREE.Color(0x3f6fb5), 0.5);
  $('b-time').textContent = t.name;
}

// ───────────────────────── terrain quadtree
const SEG = 48, NV = SEG + 3;
const tileIndex = (() => { const a = []; for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NV - 1; i++) { const p = j * NV + i; a.push(p, p + NV, p + 1, p + NV, p + NV + 1, p + 1); } return new THREE.BufferAttribute(new Uint16Array(a), 1); })();
const terrain = new THREE.Group(); scene.add(terrain);
let LODF = 1.3, frame = 0, pendingLoads = 0;

// Autumn tint for the aerial photo: dark green (tree canopy) turns to fall colour, lawns go a little straw-yellow.
const seasonRef = { value: 0 };
function autumnGround(sh) {
  sh.uniforms.uAutumn = seasonRef;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGw;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGw = (modelMatrix * vec4(position, 1.0)).xz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vGw; uniform float uAutumn;').replace('#include <map_fragment>', `#include <map_fragment>
if (uAutumn > 0.0) {
  vec3 gc = diffuseColor.rgb; float gl = dot(gc, vec3(0.3, 0.59, 0.11));
  float green = smoothstep(0.02, 0.2, (gc.g - max(gc.r, gc.b)) / max(gl, 0.01));
  float canopy = green * (1.0 - smoothstep(0.075, 0.15, gl));
  float gn = 0.5 + 0.5 * sin(vGw.x * 0.13 + sin(vGw.y * 0.09) * 2.0) * sin(vGw.y * 0.11 + sin(vGw.x * 0.07) * 2.0);
  vec3 fall = mix(vec3(0.52, 0.11, 0.03), vec3(0.72, 0.42, 0.06), gn);
  gc = mix(gc, fall * (0.3 + 6.0 * gl), uAutumn * canopy * 0.92);
  gc = mix(gc, gc * vec3(1.18, 1.0, 0.72), uAutumn * green * (1.0 - canopy) * 0.7);
  diffuseColor.rgb = gc;
}`);
}
class Tile {
  constructor(z, x, y) {
    this.z = z; this.x = x; this.y = y; this.key = x + '_' + y;
    [this.x0, this.z0, this.size] = tileRect(z, x, y);
    let mn = 1e9, mx = -1e9;
    for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) { const h = H(this.x0 + i / 4 * this.size, this.z0 + j / 4 * this.size); mn = Math.min(mn, h); mx = Math.max(mx, h); }
    this.minY = mn; this.maxY = mx; this.state = 0; this.mesh = null; this.children = null; this.used = 0;
    this.canSplit = z < 16 && [0, 1, 2, 3].every((k) => tileSet[z + 1]?.has((x * 2 + (k & 1)) + '_' + (y * 2 + (k >> 1))));
  }
  dist(p) {
    const dx = Math.max(this.x0 - p.x, 0, p.x - this.x0 - this.size), dz = Math.max(this.z0 - p.z, 0, p.z - this.z0 - this.size), dy = Math.max(this.minY - p.y, 0, p.y - this.maxY);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  load() {
    this.state = 1; pendingLoads++;
    const n = NV * NV, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const step = this.size / SEG, skirt = this.size * 0.035, e = Math.max(step, 9);
    for (let j = 0, k = 0; j < NV; j++) for (let i = 0; i < NV; i++, k++) {
      const ci = clamp(i - 1, 0, SEG), cj = clamp(j - 1, 0, SEG), wx = this.x0 + ci * step, wz = this.z0 + cj * step;
      const edge = i === 0 || j === 0 || i === NV - 1 || j === NV - 1, y = H(wx, wz);
      pos[k * 3] = ci * step; pos[k * 3 + 1] = edge ? y - skirt : y; pos[k * 3 + 2] = cj * step;
      const nx = H(wx - e, wz) - H(wx + e, wz), nz = H(wx, wz - e) - H(wx, wz + e), ny = 2 * e * 1.6, l = Math.hypot(nx, ny, nz);
      nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
      uv[k * 2] = ci / SEG; uv[k * 2 + 1] = cj / SEG;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(tileIndex);
    const c = new V3(this.size / 2, (this.minY + this.maxY) / 2, this.size / 2);
    g.boundingSphere = new THREE.Sphere(c, Math.hypot(this.size * 0.71, (this.maxY - this.minY) / 2 + skirt));
    fetch(`data/img/${this.z}/${this.key}.jpg`).then((r) => r.blob()).then((b) => createImageBitmap(b)).then((bmp) => {
      pendingLoads--;
      if (this.state !== 1) { bmp.close(); g.dispose(); return; }
      const tex = new THREE.Texture(bmp); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = MAXANISO;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
      const mt = new THREE.MeshLambertMaterial({ map: tex, toneMapped: false }); mt.onBeforeCompile = autumnGround; mt.customProgramCacheKey = () => 'ground';
      const m = new THREE.Mesh(g, mt);
      m.position.set(this.x0, 0, this.z0); m.visible = false; m.matrixAutoUpdate = false; m.updateMatrix();
      terrain.add(m); this.mesh = m; this.state = 2;
    }).catch(() => { pendingLoads--; this.state = 0; });
  }
  dispose() {
    if (this.children) { for (const c of this.children) c.dispose(); this.children = null; }
    if (this.mesh) { terrain.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.map.source.data?.close?.(); this.mesh.material.map.dispose(); this.mesh.material.dispose(); this.mesh = null; }
    this.state = 0;
  }
  hide() { if (this.mesh) this.mesh.visible = false; if (this.children) for (const c of this.children) c.hide(); }
  update(p) {
    this.used = frame;
    if (this.canSplit && this.dist(p) < this.size * LODF) {
      if (!this.children) this.children = [0, 1, 2, 3].map((k) => new Tile(this.z + 1, this.x * 2 + (k & 1), this.y * 2 + (k >> 1)));
      let ready = true;
      for (const c of this.children) { c.used = frame; if (c.state === 0 && pendingLoads < 10) c.load(); if (c.state !== 2) ready = false; }
      if (ready) { if (this.mesh) this.mesh.visible = false; for (const c of this.children) c.update(p); return; }
    }
    if (this.mesh) this.mesh.visible = true;
    if (this.children) for (const c of this.children) c.hide();
  }
  prune() { // free tiles that have not been needed for a while
    if (!this.children) return;
    if (this.children.every((c) => frame - c.used > 240)) { for (const c of this.children) c.dispose(); this.children = null; }
    else for (const c of this.children) c.prune();
  }
}
const roots = [];
for (let x = meta.REG13.x0; x <= meta.REG13.x1; x++) for (let y = meta.REG13.y0; y <= meta.REG13.y1; y++) roots.push(new Tile(13, x, y));

// ───────────────────────── buildings
// ── Hand-modelled schools: real outline with courtyards and taller gym / auditorium blocks.
// Walls come from the normal building code; the roofs (aerial photo) are added in the landmarks block.
// at: OSM footprint centre, h: wall height (m), holes: courtyards, tall: raised blocks [ring, extra height]
const CAMPUSES = [
  { name: 'Berlin High School', at: [1874.8, -2076.4], h: 8.6, brick: [0.33, 0.14, 0.095],
    holes: [
      [[1851.4, -2007.7], [1852.9, -1996.3], [1821.8, -1992], [1818.4, -2016.8], [1847.3, -2020.5], [1848.8, -2007.3]],
      [[1816.3, -2084.9], [1819, -2065.6], [1821.4, -2066], [1822.9, -2055.4], [1820.5, -2055.1], [1823.9, -2030.1], [1844.5, -2032.7], [1837.6, -2087.9]],
    ],
    tall: [
      [[[1947.8, -1982.7], [1968, -1985.3], [1960.6, -2044.1], [1942.9, -2041.6]], 3.6], // gym (east wing)
      [[[1847.6, -2073.6], [1875.3, -2069.7], [1870, -2032.1], [1842.3, -2036]], 3], // auditorium (centre)
    ] },
  { name: 'McGee Middle School', at: [989.1, -1437], h: 7.4, brick: [0.36, 0.17, 0.11],
    holes: [[[1010, -1397.2], [1005.9, -1396.7], [1003.4, -1415], [1010.7, -1416], [1010.1, -1419.8], [1022.7, -1421.5], [1027, -1388.5], [1023.3, -1388.1], [1022.8, -1392.8], [1010.8, -1391.3]]],
    tall: [[[[951.6, -1497.3], [991.1, -1502.5], [994.9, -1473.4], [955.3, -1468.2]], 3.2]] }, // gym (north end)
];
for (const c of CAMPUSES) {
  const b = c.b = buildingData.find((b) => b[7] > 5000 && Math.hypot(b[5] - c.at[0], b[6] - c.at[1]) < 2); if (!b) continue;
  let hi = -1e9; for (let i = 8; i < b.length; i += 2) hi = Math.max(hi, H(b[5] + b[i], b[6] + b[i + 1]));
  c.y = hi + c.h;
  const part = (ring, y) => { // extra wall ring: [kind, height, roof rgb, cx, cz, area, ...relative points]
    let cx = 0, cz = 0; for (const p of ring) { cx += p[0] / ring.length; cz += p[1] / ring.length; }
    const e = [4, 8, 200, 200, 200, cx, cz, 400]; for (const p of ring) e.push(p[0] - cx, p[1] - cz);
    e.top = y + 0.45; e.noRoof = true; e.wall = c.brick; buildingData.push(e);
  };
  b.top = c.y + 0.45; b.noRoof = true; b.wall = c.brick; // 0.45 m parapet
  for (const h of c.holes) part(h, c.y);
  for (const [ring, dy] of c.tall) part(ring, c.y + dy);
}
const CH = 600, bChunks = new Map();
for (const b of buildingData) { const k = Math.floor(b[5] / CH) + '_' + Math.floor(b[6] / CH); let c = bChunks.get(k); if (!c) bChunks.set(k, c = { cx: (Math.floor(b[5] / CH) + 0.5) * CH, cz: (Math.floor(b[6] / CH) + 0.5) * CH, list: [], mesh: null }); c.list.push(b); }
const bMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
bMat.onBeforeCompile = (sh) => { // procedural windows + shingle grain
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 wuv; varying vec4 vWuv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWuv = wuv;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vWuv;').replace('#include <color_fragment>', [
    '#include <color_fragment>',
    'if (vWuv.w > 0.5) {',
    '  float cells = max(1.0, floor(vWuv.z / 3.3)), cell = vWuv.z / cells;',
    '  float wx = abs(fract(vWuv.x / cell) - 0.5) * cell, fl = floor(vWuv.y / 2.9), ty = vWuv.y - fl * 2.9;',
    '  float ok = step(0.0, vWuv.y) * step(fl * 2.9 + 2.5, vWuv.w) * step(3.0, vWuv.z);',
    '  float win = ok * step(wx, 0.5) * step(0.95, ty) * step(ty, 2.1);',
    '  float trim = ok * step(wx, 0.62) * step(0.83, ty) * step(ty, 2.22) - win;',
    '  float fade = 1.0 - smoothstep(0.12, 0.55, fwidth(vWuv.x) + fwidth(vWuv.y));',
    '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.10, 0.14), win * 0.82 * fade);',
    '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92), trim * 0.55 * fade);',
    '} else if (vWuv.w < -0.5) {',
    '  float g = sin(vWuv.y * 14.0) * 0.5 + 0.5; float fade = 1.0 - smoothstep(0.05, 0.3, fwidth(vWuv.y));',
    '  diffuseColor.rgb *= 1.0 - 0.14 * g * fade;',
    '}'].join('\n'));
};
const buildings = new THREE.Group(); scene.add(buildings);
const hx = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const WALLS = [
  ['#ece7dc', '#e2dccd', '#d6d0c0', '#c3c9cc', '#e6dcbf', '#b9b4a8', '#cdbfa9', '#9aa5aa', '#bfae97', '#f3f0e9', '#a8b2a0', '#d9c9b0', '#8b3a2e', '#6f7f8c'].map(hx), // houses
  ['#d8d2c4', '#c9c2b2', '#b8b0a2', '#8b3a2e', '#e4dfd4'].map(hx), // outbuildings
  ['#d4cec2', '#bdb5a7', '#aaa094', '#ddd7cc', '#9a6a55', '#c6c0b4'].map(hx), // commercial
  ['#c6c8ca', '#b2b7ba', '#d3d0c9', '#a9aeb0', '#bcb6aa'].map(hx), // industrial
  ['#a06a54', '#96614d', '#b98a70', '#c9c2b5'].map(hx), // civic / schools (brick)
  ['#f1eee6', '#ece8de', '#a56f58'].map(hx), // churches
  ['#b98a70', '#cfc8ba', '#a9735c'].map(hx), // apartments
];
const hash = (a, b) => { let h = Math.imul(a * 73856093 ^ b * 19349663, 2654435761) >>> 0; h ^= h >>> 15; return ((h >>> 0) % 4096) / 4096; };
const lin = (v) => { v /= 255; return v < 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };

// Hand-modelled landmark churches: sanctuary gable + tall white steeple.
// b: OSM footprint centre (to match the building), x/z: steeple, w: tower half-width, s: height scale,
// nave: [centre x, centre z, half length, half width], ax: nave axis
const STEEPLES = [
  { b: [2375.5, -1802.7], x: 2399.3, z: -1804.5, w: 2.7, s: 1, nave: [2386, -1805.5, 11, 7.5], ax: [1, 0] }, // Berlin Congregational
  { b: [-667, -2171.5], x: -655.5, z: -2170.5, w: 2.5, s: 0.88, nave: [-647.5, -2178, 13.5, 8], ax: [0.7071, -0.7071] }, // Kensington Congregational
];
const WHITE = hx('#f6f4ee'), SLATE = hx('#4a4c50'), LOUVRE = hx('#2e3033');
function buildChunk(ch) {
  const P = [], N = [], C = [], Wv = [];
  let wL = 0, wH = 0; // current wall length / height (0 = plain surface, <0 = roof)
  const tri = (a, b, c, ca, cb, cc, ua = 0, va = 0, ub = 0, vb = 0, uc = 0, vc = 0) => {
    Wv.push(ua, va, wL, wH, ub, vb, wL, wH, uc, vc, wL, wH);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); N.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    C.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
  };
  const mul = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
  for (const b of ch.list) {
    if (b.skip) continue; // replaced by a hand-built model
    const kind = b[0], cx = b[5] - ch.cx, cz = b[6] - ch.cz, area = b[7], n = (b.length - 8) / 2, r0 = hash(b[5] * 10 | 0, b[6] * 10 | 0), r1 = hash(b[6] * 10 | 0, b[5] * 7 | 0);
    let pts = []; for (let i = 0; i < n; i++) pts.push([b[8 + i * 2], b[9 + i * 2]]);
    let A = 0; for (let i = 0, j = n - 1; i < n; j = i++) A += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    if (A < 0) pts.reverse();
    let base = 1e9, hi = -1e9; for (const p of pts) { const h = H(b[5] + p[0], b[6] + p[1]); base = Math.min(base, h); hi = Math.max(hi, h); }
    const hip = (kind === 0 || kind === 1 || kind === 5) && n <= 14 && area < 700;
    const total = b[1] * (kind === 0 ? 1.25 : 1) + (hi - base);
    const st = kind === 5 && STEEPLES.find((q) => Math.hypot(q.b[0] - b[5], q.b[1] - b[6]) < 3);
    const wall = st ? WHITE : b.wall || WALLS[kind][Math.floor(r0 * WALLS[kind].length)];
    let roof = b[2] >= 0 ? [lin(b[2]), lin(b[3]), lin(b[4])] : mul([0.35, 0.34, 0.33], 0.7 + r1 * 0.6);
    const rl = roof[0] * 0.3 + roof[1] * 0.59 + roof[2] * 0.11; // pull tree-shaded (green) roofs back toward neutral
    if (roof[1] > roof[0] * 1.12 && roof[1] > roof[2] * 1.12) roof = [rl * 1.05, rl, rl * 0.95];
    roof = mul(roof, 1.12);
    // roof frame (oriented bounding box)
    let u = [1, 0], best = 1e18, cU = 0, cV = 0, a = 1, bb = 1;
    if (hip) for (let i = 0, j = n - 1; i < n; j = i++) {
      let dx = pts[i][0] - pts[j][0], dz = pts[i][1] - pts[j][1]; const l = Math.hypot(dx, dz); if (l < 0.5) continue; dx /= l; dz /= l;
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (const p of pts) { const pu = p[0] * dx + p[1] * dz, pv = -p[0] * dz + p[1] * dx; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv); }
      const ar = (u1 - u0) * (v1 - v0);
      if (ar < best) { best = ar; if (u1 - u0 >= v1 - v0) { u = [dx, dz]; a = (u1 - u0) / 2; bb = (v1 - v0) / 2; cU = (u0 + u1) / 2; cV = (v0 + v1) / 2; } else { u = [-dz, dx]; a = (v1 - v0) / 2; bb = (u1 - u0) / 2; cU = (v0 + v1) / 2; cV = -(u0 + u1) / 2; } }
    }
    const rise = hip ? Math.min(bb * (kind === 5 ? 1.05 : 0.62), kind === 5 ? 8 : 4.4) : 0;
    const top = b.top ?? hi + Math.max(2.6, b[1] * (kind === 0 ? 1.25 : 1) - rise * 0.75);
    const wlo = mul(wall, 0.66), whi = wall;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const p = pts[j], q = pts[i], gb = hi - base, th = top - hi;
      wL = Math.hypot(q[0] - p[0], q[1] - p[1]); wH = (kind === 1 || kind === 3) ? 0 : th;
      tri([cx + p[0], base - 1.5, cz + p[1]], [cx + p[0], top, cz + p[1]], [cx + q[0], top, cz + q[1]], wlo, whi, whi, 0, -gb - 1.5, 0, th, wL, th);
      tri([cx + p[0], base - 1.5, cz + p[1]], [cx + q[0], top, cz + q[1]], [cx + q[0], base - 1.5, cz + q[1]], wlo, whi, wlo, 0, -gb - 1.5, wL, th, wL, -gb - 1.5);
    }
    wL = 0; wH = 0;
    if (hip) {
      const L = Math.max(0, a - bb * (kind === 5 ? 0.15 : 0.85)), ox = u[0] * cU - u[1] * cV, oz = u[1] * cU + u[0] * cV;
      const rp = (p) => { const t = clamp((p[0] - ox) * u[0] + (p[1] - oz) * u[1], -L, L); return [cx + ox + u[0] * t, top + rise, cz + oz + u[1] * t]; };
      const rhi = mul(roof, 1.06), rlo = mul(roof, 0.94);
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const p = pts[j], q = pts[i], rpp = rp(p), rq = rp(q), pa = [cx + p[0], top, cz + p[1]], qa = [cx + q[0], top, cz + q[1]];
        const sl = Math.hypot(rpp[0] - pa[0], rise, rpp[2] - pa[2]);
        wH = -1; tri(pa, rpp, qa, rlo, rhi, rlo, 0, 0, 0, sl, 0, 0);
        if (Math.hypot(rpp[0] - rq[0], rpp[2] - rq[2]) > 0.05) tri(qa, rpp, rq, rlo, rhi, rhi, 0, 0, 0, sl, 0, sl);
        wH = 0;
      }
      if (kind === 5 && a > 6) { // steeple at one end of the nave
        const sx = cx + ox + u[0] * (a - 2.2), sz = cz + oz + u[1] * (a - 2.2), w = 1.9, t0 = top + rise + 4.5, t1 = t0 + 8;
        const cs = [[-w, -w], [w, -w], [w, w], [-w, w]].map(([i, k]) => [sx + i * u[0] - k * u[1], sz + i * u[1] + k * u[0]]);
        for (let i = 0; i < 4; i++) { const p = cs[i], q = cs[(i + 1) % 4];
          tri([p[0], base, p[1]], [p[0], t0, p[1]], [q[0], t0, q[1]], wlo, whi, whi); tri([p[0], base, p[1]], [q[0], t0, q[1]], [q[0], base, q[1]], wlo, whi, wlo);
          tri([p[0], t0, p[1]], [sx, t1, sz], [q[0], t0, q[1]], rlo, rhi, rlo); }
      }
    } else if (!b.noRoof) {
      const faces = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []);
      for (const f of faces) tri([cx + pts[f[0]][0], top, cz + pts[f[0]][1]], [cx + pts[f[1]][0], top, cz + pts[f[1]][1]], [cx + pts[f[2]][0], top, cz + pts[f[2]][1]], roof, roof, roof);
      if (area > 150) { // parapet lip
        const lip = mul(wall, 0.9), t2 = top + 0.5;
        for (let i = 0, j = n - 1; i < n; j = i++) { const p = pts[j], q = pts[i]; tri([cx + p[0], top, cz + p[1]], [cx + p[0], t2, cz + p[1]], [cx + q[0], t2, cz + q[1]], lip, lip, lip); tri([cx + p[0], top, cz + p[1]], [cx + q[0], t2, cz + q[1]], [cx + q[0], top, cz + q[1]], lip, lip, lip); }
      }
    }
    if (st) {
      wL = 0; wH = 0;
      const [ux, uz] = st.ax, [ncx, ncz, nl, nw] = st.nave, ox = ncx - ch.cx, oz = ncz - ch.cz, rg = nw * 0.8, lo = mul(WHITE, 0.8);
      const at = (a, c, y) => [ox + ux * a - uz * c, y, oz + uz * a + ux * c];
      const quad = (a, b2, c, d, c0, c1) => { tri(a, b2, c, c0, c0, c1); tri(a, c, d, c0, c1, c1); };
      for (const sd of [-1, 1]) { // gable roof over the sanctuary
        quad(at(-nl - 0.4, sd * (nw + 0.4), top - 0.3), at(nl + 0.4, sd * (nw + 0.4), top - 0.3), at(nl + 0.4, 0, top + rg), at(-nl - 0.4, 0, top + rg), mul(SLATE, 0.9), mul(SLATE, 1.1));
        tri(at(sd * nl, -nw, top), at(sd * nl, nw, top), at(sd * nl, 0, top + rg), WHITE, WHITE, WHITE);
      }
      const sx = st.x - ch.cx, sz = st.z - ch.cz, k = st.s;
      const ring = (w, y, m = 4) => Array.from({ length: m }, (_, i) => { const t = (i + 0.5) / m * Math.PI * 2, r = w / Math.cos(Math.PI / m), a = Math.cos(t) * r, c = Math.sin(t) * r; return [sx + ux * a - uz * c, y, sz + uz * a + ux * c]; });
      const stage = (w, y0, y1, c0 = lo, c1 = WHITE) => { const A = ring(w, y0), B = ring(w, y1); for (let i = 0; i < 4; i++) quad(A[i], A[(i + 1) % 4], B[(i + 1) % 4], B[i], c0, c1); quad(B[0], B[1], B[2], B[3], WHITE, WHITE); };
      let y = top + rg + 2.5 * k;
      stage(st.w, base - 1.5, y, mul(WHITE, 0.72));
      stage(st.w + 0.35, y, y + 0.5, lo, lo); y += 0.5;
      const bw = st.w * 0.8, bh = 5.5 * k;
      stage(bw, y, y + bh);
      { const A = ring(bw + 0.06, y + bh * 0.2), B = ring(bw + 0.06, y + bh * 0.82); // belfry louvres
        for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, mx = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1], p[2] + (q[2] - p[2]) * t]; quad(mx(A[i], A[j], 0.28), mx(A[i], A[j], 0.72), mx(B[i], B[j], 0.72), mx(B[i], B[j], 0.28), LOUVRE, LOUVRE); } }
      y += bh; stage(bw + 0.35, y, y + 0.45, lo, lo); y += 0.45;
      const lw = st.w * 0.58; stage(lw, y, y + 3.2 * k); y += 3.2 * k; stage(lw + 0.3, y, y + 0.35, lo, lo); y += 0.35;
      { const A = ring(lw * 0.95, y, 8), ap = [sx, y + 15 * k, sz]; for (let i = 0; i < 8; i++) tri(A[i], A[(i + 1) % 8], ap, i % 2 ? WHITE : mul(WHITE, 0.9), i % 2 ? WHITE : mul(WHITE, 0.9), WHITE); } // spire
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('wuv', new THREE.Float32BufferAttribute(Wv, 4));
  g.computeBoundingSphere();
  ch.mesh = new THREE.Mesh(g, bMat); ch.mesh.position.set(ch.cx, 0, ch.cz); ch.mesh.matrixAutoUpdate = false; ch.mesh.updateMatrix(); buildings.add(ch.mesh);
}
// Hand-modelled grandstands at the Sage Park football field (positions read off the aerial photo).
{
  const P = [], C = [], O = [2459, -510], ax = [0.465, -0.886], px = [0.886, 0.465]; // field centre, long axis, cross axis
  const ALU = hx('#b9bec3'), DARK = hx('#5b6066'), RED = hx('#8e1b1f'), GLASS = hx('#27303a');
  const g0 = H(O[0], O[1]);
  // box in the field frame: a along the sideline, c away from the field centre
  const box = (a0, a1, c0, c1, y0, y1, col) => {
    const v = (a, c, y) => [O[0] + ax[0] * a + px[0] * c, y, O[1] + ax[1] * a + px[1] * c];
    const q = [v(a0, c0, y0), v(a1, c0, y0), v(a1, c1, y0), v(a0, c1, y0), v(a0, c0, y1), v(a1, c0, y1), v(a1, c1, y1), v(a0, c1, y1)];
    for (const [i, j, k, l] of [[4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) for (const m of [i, j, k, i, k, l]) { P.push(...q[m]); C.push(...col); }
  };
  const stand = (c, half, rows, pressBox) => { // c: signed distance of the front row from the field centre
    const sg = Math.sign(c), tread = 0.83, riser = 0.42, y0 = g0 - 1;
    for (let i = 0; i < rows; i++) { const sh = i % 2 ? 1 : 0.9; box(-half, half, c + sg * i * tread, c + sg * (i + 1) * tread, y0, g0 + 0.9 + i * riser, [ALU[0] * sh, ALU[1] * sh, ALU[2] * sh]); }
    const back = c + sg * rows * tread, top = g0 + 0.9 + rows * riser;
    box(-half, half, back, back + sg * 0.25, y0, top + 0.7, DARK); // back wall
    box(-half, half, c - sg * 0.2, c, y0, g0 + 1.6, DARK); // front rail
    for (const e of [-half, half]) box(e - 0.12, e + 0.12, c, back, y0, top + 0.3, DARK); // end walls
    for (let a = -half + half / 2; a < half; a += half / 2) box(a - 0.6, a + 0.6, c, back, y0, g0 + 0.95 + rows * riser * 0.02, DARK); // aisles
    if (pressBox) { box(-7, 7, back - sg * 2.6, back + sg * 0.4, top - 0.2, top + 3.1, RED); box(-6.6, 6.6, back - sg * 2.75, back - sg * 2.6, top + 1.1, top + 2.5, GLASS); box(-7.3, 7.3, back - sg * 2.9, back + sg * 0.7, top + 3.1, top + 3.35, DARK); }
  };
  stand(45.5, 23, 12, true); // home side (east)
  stand(-43.5, 10.5, 8, false); // visitors (west)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false })));
}
// ───────────────────────── hand-modelled landmarks: school campuses
// Flat picture laid on the ground (follows the terrain). draw(ctx) works in world metres: x east, y = z south.
function decal(x0, z0, x1, z1, ppm, draw) {
  const w = x1 - x0, h = z1 - z0, cv = document.createElement('canvas'); cv.width = Math.round(w * ppm); cv.height = Math.round(h * ppm);
  const ctx = cv.getContext('2d'); ctx.setTransform(ppm, 0, 0, ppm, -x0 * ppm, -z0 * ppm); draw(ctx);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const nx = Math.ceil(w / 6), nz = Math.ceil(h / 6), P = [], U = [], I = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = x0 + w * i / nx, z = z0 + h * j / nz; P.push(x, H(x, z) + 0.22, z); U.push(i / nx, 1 - j / nz); }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; I.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }));
  m.renderOrder = 1; scene.add(m); return m;
}
const poly = (ctx, ring) => { ctx.beginPath(); ring.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); };
// coloured boxes / quads for small 3-D props
function propMesh(build, opts = {}) {
  const P = [], C = [];
  const quad = (a, b, c, d, col) => { for (const v of [a, b, c, a, c, d]) { P.push(v[0], v[1], v[2]); C.push(col[0], col[1], col[2]); } };
  const wallTo = (p, q, y0, y1, col, t = 0.06) => { // thin vertical slab from p to q (world [x,z])
    const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * t, nz = dx / l * t;
    const c = [[p[0] - nx, p[1] - nz], [q[0] - nx, q[1] - nz], [q[0] + nx, q[1] + nz], [p[0] + nx, p[1] + nz]];
    for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], col); }
    quad(...c.map((v) => [v[0], y1, v[1]]), col);
  };
  build({ quad, wallTo });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false, ...opts })); scene.add(m); return m;
}
// roof: the aerial photo itself, so the real roof layout (units, solar panels, seams) shows
function photoRoof(c) {
  const b = c.b, outer = []; for (let i = 8; i < b.length; i += 2) outer.push([b[5] + b[i], b[6] + b[i + 1]]);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of outer) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  x0 -= 2; z0 -= 2; x1 += 2; z1 += 2;
  const ppm = 4, cv = document.createElement('canvas'); cv.width = Math.round((x1 - x0) * ppm); cv.height = Math.round((z1 - z0) * ppm);
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#c9cccd'; ctx.fillRect(0, 0, cv.width, cv.height);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const [rx, rz, ts] = tileRect(16, 19519, 24420), tx0 = Math.floor((x0 - rx) / ts), tx1 = Math.floor((x1 - rx) / ts), tz0 = Math.floor((z0 - rz) / ts), tz1 = Math.floor((z1 - rz) / ts);
  for (let i = tx0; i <= tx1; i++) for (let j = tz0; j <= tz1; j++) {
    const img = new Image(); img.onload = () => { ctx.drawImage(img, (rx + i * ts - x0) * ppm, (rz + j * ts - z0) * ppm, ts * ppm, ts * ppm); tex.needsUpdate = true; };
    img.src = `data/img/16/${19519 + i}_${24420 + j}.jpg`;
  }
  const P = [], U = [];
  const put = (x, y, z) => { P.push(x, y, z); U.push((x - x0) / (x1 - x0), 1 - (z - z0) / (z1 - z0)); };
  const flat = (ring, holes, y) => {
    const v2 = (r) => r.map((p) => new THREE.Vector2(p[0], p[1])), all = [ring, ...holes].flat();
    for (const f of THREE.ShapeUtils.triangulateShape(v2(ring), holes.map(v2))) for (const k of [f[0], f[2], f[1]]) put(all[k][0], y, all[k][1]); // wound to face up
  };
  const ccw = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a > 0 ? r : r.slice().reverse(); };
  flat(ccw(outer), c.holes.map((h) => ccw(h).reverse()), c.y);
  for (const [ring, dy] of c.tall) flat(ccw(ring), [], c.y + dy);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(P.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false })));
}
for (const c of CAMPUSES) if (c.b) photoRoof(c);
// tennis courts: crisp painted courts, nets and a chain-link fence. PAD: fenced corners, NETS: court centres,
// e / n: unit vectors across / along the courts
function tennisCourts(PAD, NETS, e, n, padCol, apronCol, courtCol) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of PAD) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  decal(x0 - 2, z0 - 2, x1 + 2, z1 + 2, 14, (c) => {
    poly(c, PAD); c.fillStyle = padCol; c.fill();
    for (const [cx, cz] of NETS) {
      c.save(); c.transform(e[0], e[1], n[0], n[1], cx, cz); // court frame: x across, y along
      c.fillStyle = apronCol; c.fillRect(-6.6, -13.3, 13.2, 26.6);
      c.fillStyle = courtCol; c.fillRect(-5.485, -11.885, 10.97, 23.77);
      c.strokeStyle = '#f4f4f0'; c.lineWidth = 0.09; c.strokeRect(-5.485, -11.885, 10.97, 23.77);
      c.beginPath(); for (const s of [-4.115, 4.115]) { c.moveTo(s, -11.885); c.lineTo(s, 11.885); }
      for (const s of [-6.4, 6.4]) { c.moveTo(-4.115, s); c.lineTo(4.115, s); } c.moveTo(0, -6.4); c.lineTo(0, 6.4); c.stroke();
      c.restore();
    }
  });
  const at = (o, a, c2) => [o[0] + e[0] * a + n[0] * c2, o[1] + e[1] * a + n[1] * c2], N = PAD.length;
  propMesh(({ wallTo }) => {
    for (const o of NETS) { const g0 = H(o[0], o[1]) + 0.2, p = at(o, -6.4, 0), q = at(o, 6.4, 0);
      wallTo(p, q, g0, g0 + 0.92, [0.05, 0.05, 0.055], 0.02); wallTo(p, q, g0 + 0.92, g0 + 1.0, [0.9, 0.9, 0.88], 0.03);
      for (const s of [p, q]) wallTo(at(s, -0.05, 0), at(s, 0.05, 0), g0, g0 + 1.07, [0.1, 0.12, 0.1], 0.05); }
    for (let i = 0; i < N; i++) { const p = PAD[i], q = PAD[(i + 1) % N], l = Math.hypot(q[0] - p[0], q[1] - p[1]), k = Math.round(l / 3);
      for (let j = 0; j <= k; j++) { const x = p[0] + (q[0] - p[0]) * j / k, z = p[1] + (q[1] - p[1]) * j / k, g0 = H(x, z); wallTo([x - 0.04, z], [x + 0.04, z], g0, g0 + 3.05, [0.2, 0.22, 0.22], 0.04); }
      const ya = H(p[0], p[1]) + 3, yb = H(q[0], q[1]) + 3; wallTo(p, q, Math.min(ya, yb), Math.min(ya, yb) + 0.06, [0.2, 0.22, 0.22], 0.03); }
  });
  propMesh(({ quad }) => { // fence mesh panels
    for (let i = 0; i < N; i++) { const p = PAD[i], q = PAD[(i + 1) % N], ya = H(p[0], p[1]), yb = H(q[0], q[1]); quad([p[0], ya, p[1]], [q[0], yb, q[1]], [q[0], yb + 3, q[1]], [p[0], ya + 3, p[1]], [0.16, 0.18, 0.18]); }
  }, { transparent: true, opacity: 0.3, depthWrite: false });
}
if (CAMPUSES[0].b) { // Berlin High School: six blue courts on a red pad
  tennisCourts([[1931.7, -1964.1], [2028.9, -1976.9], [2033.6, -1941], [1935.9, -1928.1]],
    [[1942.6, -1947.4], [1957, -1949], [1974.7, -1951.7], [1989.7, -1953.2], [2008.1, -1955.9], [2022.6, -1957.9]], [0.9944, -0.1056], [0.1056, 0.9944], '#a9604b', '#4f7ea6', '#3f6f99');
  // back field: the photo caught it stripped to dirt, so lay down the track and a grass infield
  const A = [1949.4, -1802.8], B = [1937.2, -1873.2], L = Math.hypot(B[0] - A[0], B[1] - A[1]), d = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], q = [-d[1], d[0]], rIn = 40.9;
  const oval = (c, r) => { c.beginPath(); for (let i = 0; i <= 40; i++) { const t = Math.PI * i / 40, cs = Math.cos(t) * r, sn = Math.sin(t) * r; c.lineTo(B[0] + q[0] * cs + d[0] * sn, B[1] + q[1] * cs + d[1] * sn); }
    for (let i = 0; i <= 40; i++) { const t = Math.PI * i / 40, cs = Math.cos(t) * r, sn = Math.sin(t) * r; c.lineTo(A[0] - q[0] * cs - d[0] * sn, A[1] - q[1] * cs - d[1] * sn); } c.closePath(); };
  decal(1884, -1926, 2003, -1750, 7, (c) => {
    oval(c, rIn + 6 * 1.22 + 0.5); c.fillStyle = '#a4513c'; c.fill();
    c.strokeStyle = 'rgba(245,242,235,0.85)'; c.lineWidth = 0.1; for (let k = 0; k <= 6; k++) { oval(c, rIn + k * 1.22); c.stroke(); }
    c.save(); oval(c, rIn - 0.05); c.clip(); c.fillStyle = '#5c7d45'; c.fillRect(1880, -1930, 130, 190);
    c.transform(q[0], q[1], d[0], d[1], (A[0] + B[0]) / 2, (A[1] + B[1]) / 2); // field frame: x across, y along
    c.fillStyle = 'rgba(120,160,90,0.35)'; for (let s = -80; s < 80; s += 11) c.fillRect(-45, s, 90, 5.5); // mowing stripes
    c.strokeStyle = 'rgba(245,245,240,0.8)'; c.lineWidth = 0.14; c.strokeRect(-30, -50, 60, 100); // multi-use field lines
    c.beginPath(); c.moveTo(-30, 0); c.lineTo(30, 0); c.moveTo(9.15, 0); c.arc(0, 0, 9.15, 0, Math.PI * 2);
    for (const s of [-1, 1]) { c.rect(-20.15, s * 50 - (s > 0 ? 16.5 : 0), 40.3, 16.5); c.rect(-9.15, s * 50 - (s > 0 ? 5.5 : 0), 18.3, 5.5); } c.stroke();
    c.restore();
  });
  propMesh(({ wallTo }) => { // goals at each end of the field
    const O = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], w = [0.93, 0.93, 0.9];
    for (const s of [-1, 1]) { const a = [O[0] + d[0] * s * 50 - q[0] * 3.66, O[1] + d[1] * s * 50 - q[1] * 3.66], b2 = [O[0] + d[0] * s * 50 + q[0] * 3.66, O[1] + d[1] * s * 50 + q[1] * 3.66], g0 = H(a[0], a[1]) + 0.2;
      wallTo(a, b2, g0 + 2.38, g0 + 2.5, w, 0.06); for (const p of [a, b2]) wallTo([p[0] - 0.06, p[1]], [p[0] + 0.06, p[1]], g0, g0 + 2.5, w, 0.06); }
  });
}
if (CAMPUSES[1].b) { // McGee Middle School: two green courts north of the gym
  const e = [0.9903, -0.139], n = [0.139, 0.9903], O = [967.2, -1527.8], at = (a, c2) => [O[0] + e[0] * a + n[0] * c2, O[1] + e[1] * a + n[1] * c2];
  tennisCourts([at(-16, -18.5), at(16, -18.5), at(16, 18.5), at(-16, 18.5)], [at(-7.65, 0), at(7.65, 0)], e, n, '#5d7f6c', '#6c9079', '#557a66');
}
// ───────────────────────── hand-modelled house: 2 Misty Mountain Road
// Gambrel (Dutch colonial) house with a full shed dormer across the back, a breezeway, a one-car garage and a
// rear deck, modelled from photographs. Frame: O = back (north-west) corner of the footprint, u along the
// house (west → east), v from the back toward the road.
{
  const fp = buildingData.find((b) => Math.hypot(b[5] - 73.4, b[6] + 2222.6) < 2);
  if (fp) {
    fp.skip = true;
    const O = [66.3, -2230.6], U = [0.943, 0.333], V = [-0.333, 0.943];
    const at = (u, v, y) => [O[0] + U[0] * u + V[0] * v, y, O[1] + U[1] * u + V[1] * v];
    const gh = (u, v) => { const p = at(u, v, 0); return H(p[0], p[2]); };
    const SIDING = hx('#cfc9ae'), TRIM = hx('#f4f2ec'), GLASS = hx('#27313c'), ROOF = hx('#94735a'), ROOF2 = hx('#86664e'), BLUE = hx('#2a7bbd'),
      BRICK = hx('#8e5440'), CONC = hx('#a5a198'), WOOD = hx('#ab8759'), DOORW = hx('#eeeeea');
    const U0 = 10, U1 = 21, V0 = 1, V1 = 8.7, VR = (V0 + V1) / 2; // main block
    const G0 = 0.6, G1 = 5.6, GV0 = 0.6, GV1 = 6.9, GR = (G0 + G1) / 2; // garage
    const F = Math.max(gh(U0, V1), gh(15.5, V1), gh(U1, V1)) + 0.4; // main floor
    const Fg = Math.min(F - 0.25, Math.max(gh(G0, GV1), gh(G1, GV1)) + 0.1), Tg = Fg + 2.45; // garage floor / eave
    let base = 1e9; for (let u = -1; u <= 22; u += 2.5) for (let v = -5; v <= 11; v += 2) base = Math.min(base, gh(u, v)); base -= 1;
    propMesh(({ quad }) => {
      const sh = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
      const face = (p, q, y0, y1, col) => quad(at(p[0], p[1], y0), at(q[0], q[1], y0), at(q[0], q[1], y1), at(p[0], p[1], y1), col);
      const box = (u0, u1, v0, v1, y0, y1, col, top = col) => {
        face([u0, v0], [u1, v0], y0, y1, col); face([u1, v0], [u1, v1], y0, y1, col); face([u1, v1], [u0, v1], y0, y1, col); face([u0, v1], [u0, v0], y0, y1, col);
        quad(at(u0, v0, y1), at(u1, v0, y1), at(u1, v1, y1), at(u0, v1, y1), top);
      };
      // flat panel standing `off` proud of a wall: c = centre [u,v], d = along the wall, n = outward
      const panel = (c, d, n, off, w, y0, y1, col) => face([c[0] - d[0] * w / 2 + n[0] * off, c[1] - d[1] * w / 2 + n[1] * off], [c[0] + d[0] * w / 2 + n[0] * off, c[1] + d[1] * w / 2 + n[1] * off], y0, y1, col);
      const win = (c, d, n, y0, w, h) => { panel(c, d, n, 0.04, w + 0.26, y0 - 0.13, y0 + h + 0.13, TRIM); panel(c, d, n, 0.07, w, y0, y0 + h, GLASS); panel(c, d, n, 0.09, w, y0 + h / 2 - 0.03, y0 + h / 2 + 0.03, TRIM); };
      const door = (c, d, n, y0, w, h, col) => { panel(c, d, n, 0.04, w + 0.28, y0, y0 + h + 0.14, TRIM); panel(c, d, n, 0.07, w, y0, y0 + h, col); };
      const FR = [1, 0], N_F = [0, 1], N_B = [0, -1], SD = [0, 1], N_W = [-1, 0], N_E = [1, 0];

      // ── main block: walls
      const yk = F + 4.95, yr = F + 6.05, yb = F + 5.1; // gambrel knee, ridge, back wall top
      face([U0, V1], [U1, V1], base, F - 0.2, CONC); face([U0, V1], [U1, V1], F - 0.2, F + 2.4, SIDING); // front
      face([U0, V0], [U1, V0], base, F - 2.45, CONC); face([U0, V0], [U1, V0], F - 2.45, yb, sh(SIDING, 0.97)); // back (two full storeys over a walk-out basement)
      for (const u of [U0, U1]) { // gable ends
        face([u, V0], [u, V1], base, F - 0.2, CONC);
        quad(at(u, V0, F - 0.2), at(u, V1, F - 0.2), at(u, V1, F + 2.9), at(u, V1 - 1, yk), SIDING);
        quad(at(u, V0, F - 0.2), at(u, V1 - 1, yk), at(u, VR, yr), at(u, V0, yb), SIDING);
      }
      // roof: steep lower front slope, shallow upper slope, shed dormer roof to the back
      const o = 0.3;
      quad(at(U0 - o, V1 + 0.25, F + 2.4), at(U1 + o, V1 + 0.25, F + 2.4), at(U1 + o, V1 - 1, yk), at(U0 - o, V1 - 1, yk), ROOF2);
      quad(at(U0 - o, V1 - 1, yk), at(U1 + o, V1 - 1, yk), at(U1 + o, VR, yr), at(U0 - o, VR, yr), ROOF);
      quad(at(U0 - o, VR, yr), at(U1 + o, VR, yr), at(U1 + o, V0 - 0.3, yb - 0.07), at(U0 - o, V0 - 0.3, yb - 0.07), sh(ROOF, 0.94));
      quad(at(U0 - o, V1, F + 2.4), at(U1 + o, V1, F + 2.4), at(U1 + o, V1 + 0.25, F + 2.4), at(U0 - o, V1 + 0.25, F + 2.4), TRIM); // front soffit
      face([U0 - o, V1 + 0.26], [U1 + o, V1 + 0.26], F + 2.28, F + 2.44, TRIM); // fascia
      face([U0 - o, V0 - 0.31], [U1 + o, V0 - 0.31], yb - 0.2, yb - 0.04, TRIM);
      // front: two windows, blue door, two windows
      for (const u of [11.3, 12.85, 18, 19.6]) win([u, V1], FR, N_F, F + 0.85, 0.82, 1.35);
      door([15.5, V1], FR, N_F, F, 0.92, 2.05, BLUE); panel([15.5, V1], FR, N_F, 0.09, 0.6, F + 1.62, F + 1.88, sh(TRIM, 0.85)); // fanlight
      box(14.5, 16.5, V1, V1 + 1.2, base, F - 0.06, CONC); box(14.6, 16.4, V1 + 1.2, V1 + 1.55, base, F - 0.24, CONC); box(14.6, 16.4, V1 + 1.55, V1 + 1.9, base, F - 0.42, CONC); // stoop + steps
      // back: four windows upstairs, three on the main floor, basement door + window
      for (const u of [U1 - 2.1, U1 - 5.9, U1 - 8.2, U1 - 10.2]) win([u, V0], FR, N_B, F + 3.15, 0.8, 1.25);
      win([U1 - 2.2, V0], FR, N_B, F + 0.85, 1.7, 1.3); win([U1 - 5.9, V0], FR, N_B, F + 1.15, 0.75, 0.95); win([U1 - 9, V0], FR, N_B, F + 0.85, 0.95, 1.25);
      if (gh(U1 - 2, V0 - 0.5) < F - 2.2) door([U1 - 2, V0], FR, N_B, F - 2.4, 0.9, 2, hx('#5b463c'));
      if (gh(U1 - 5.2, V0 - 0.5) < F - 1.8) win([U1 - 5.2, V0], FR, N_B, F - 1.65, 0.8, 0.75);
      // gable ends: bedroom + attic windows on the west, a window either side of the chimney on the east
      win([U0, 6.2], SD, N_W, F + 3.0, 0.8, 1.2); win([U0, VR], SD, N_W, F + 4.85, 0.5, 0.6); door([U0, 6.3], SD, N_W, F, 0.86, 2.02, DOORW);
      win([U1, 6.3], SD, N_E, F + 3.0, 0.8, 1.2); win([U1, 6.3], SD, N_E, F + 0.85, 0.82, 1.35);
      box(U1, U1 + 0.55, 2.7, 4.0, base, F + 7.05, BRICK, sh(BRICK, 0.5)); box(U1 - 0.06, U1 + 0.61, 2.64, 4.06, F + 6.9, F + 7.0, sh(BRICK, 0.8)); // chimney

      // ── garage (gable faces the road)
      for (const [p, q] of [[[G0, GV1], [G1, GV1]], [[G1, GV1], [G1, GV0]], [[G1, GV0], [G0, GV0]], [[G0, GV0], [G0, GV1]]]) { face(p, q, base, Fg, CONC); face(p, q, Fg, Tg, SIDING); }
      for (const v of [GV0, GV1]) quad(at(G0, v, Tg), at(G1, v, Tg), at(GR, v, Tg + 1.3), at(GR, v, Tg + 1.3), SIDING);
      const gs = 1.3 / (GR - G0);
      for (const s of [-1, 1]) quad(at(GR + s * (GR - G0 + 0.28), GV0 - 0.3, Tg - 0.28 * gs), at(GR + s * (GR - G0 + 0.28), GV1 + 0.35, Tg - 0.28 * gs), at(GR, GV1 + 0.35, Tg + 1.3), at(GR, GV0 - 0.3, Tg + 1.3), s < 0 ? ROOF2 : ROOF);
      door([GR, GV1], FR, N_F, Fg, 2.75, 2.1, DOORW);
      for (const y of [0.55, 1.07, 1.6]) panel([GR, GV1], FR, N_F, 0.09, 2.75, Fg + y - 0.012, Fg + y + 0.012, sh(DOORW, 0.72));
      win([G0, 3.6], SD, N_W, Fg + 1.0, 0.8, 1.1);

      // ── breezeway: slab and a low roof between the garage and the house
      const BV0 = 2.4, BV1 = 6.9, BM = (BV0 + BV1) / 2, yB = Tg + 0.05;
      box(G1, U0, BV0, BV1, base, Fg + 0.05, CONC);
      quad(at(G1, BV1 + 0.3, yB - 0.1), at(U0, BV1 + 0.3, yB - 0.1), at(U0, BM, yB + 0.8), at(G1, BM, yB + 0.8), ROOF2);
      quad(at(G1, BV0 - 0.3, yB - 0.1), at(U0, BV0 - 0.3, yB - 0.1), at(U0, BM, yB + 0.8), at(G1, BM, yB + 0.8), ROOF);
      box(U0 - 0.2, U0 - 0.06, BV1 + 0.1, BV1 + 0.24, Fg, yB - 0.1, TRIM); // post at the front corner

      // ── rear deck on its concrete base
      const D = Fg + 0.05, DU0 = 3.4, DV0 = -3.4;
      box(DU0, U0, DV0, GV0, base, D - 0.1, CONC, WOOD); box(G1, U0, GV0, BV0, base, D - 0.1, CONC, WOOD);
      const rail = (p, q) => {
        const l = Math.hypot(q[0] - p[0], q[1] - p[1]), d = [(q[0] - p[0]) / l, (q[1] - p[1]) / l], n = [-d[1], d[0]];
        const slab = (a, b, t, y0, y1, col) => { const c = [[a[0] - n[0] * t, a[1] - n[1] * t], [b[0] - n[0] * t, b[1] - n[1] * t], [b[0] + n[0] * t, b[1] + n[1] * t], [a[0] + n[0] * t, a[1] + n[1] * t]]; for (let i = 0; i < 4; i++) face(c[i], c[(i + 1) % 4], y0, y1, col); quad(...c.map((x) => at(x[0], x[1], y1)), col); };
        const pt = (s) => [p[0] + d[0] * s, p[1] + d[1] * s];
        slab(p, q, 0.045, D + 0.93, D + 1.0, WOOD); slab(p, q, 0.03, D - 0.02, D + 0.07, WOOD);
        for (let i = 0, k = Math.round(l / 1.3); i <= k; i++) slab(pt(l * i / k - 0.05), pt(l * i / k + 0.05), 0.05, D - 0.1, D + 1.0, sh(WOOD, 0.9));
        for (let s = 0.14; s < l; s += 0.14) face(pt(s - 0.02), pt(s + 0.02), D + 0.07, D + 0.93, sh(WOOD, 0.95));
      };
      rail([DU0, GV0], [DU0, DV0]); rail([DU0, DV0], [U0, DV0]); rail([U0, DV0], [U0, V0 - 1.2]);
      for (let i = 0; i < 9; i++) box(U0 + i * 0.3, U0 + (i + 1) * 0.3, V0 - 1.2, V0, base, D - 0.1 - (i + 1) * 0.19, CONC); // concrete steps down along the back wall
    });
  }
}
function updateBuildings(p) {
  let todo = null, best = 1e18;
  for (const ch of bChunks.values()) {
    const d = Math.hypot(ch.cx - p.x, ch.cz - p.z);
    if (!ch.mesh && d < 3600 && d < best) { best = d; todo = ch; }
    else if (ch.mesh && d > 4400) { buildings.remove(ch.mesh); ch.mesh.geometry.dispose(); ch.mesh = null; }
  }
  if (todo) buildChunk(todo);
  return !!todo;
}

// ───────────────────────── trees
function treeGeometry(detail, trunk) {
  const ico = new THREE.IcosahedronGeometry(1, detail), ip = ico.getAttribute('position');
  const P = [], N = [], C = [];
  for (let i = 0; i < ip.count; i++) {
    let x = ip.getX(i), y = ip.getY(i), z = ip.getZ(i);
    const w = 1 + 0.2 * Math.sin(x * 3.1 + y * 2.3 + 0.6) * Math.cos(z * 2.9 - y * 1.7) + 0.13 * Math.sin(z * 6.3 + x * 5.1 + 1.0) * Math.sin(y * 5.7 + 0.4) + (detail > 1 ? 0.06 * Math.sin(x * 13.0 + z * 11.0) * Math.sin(y * 12.0) : 0);
    const squash = y < 0 ? 0.72 : 1; // flatter underside
    P.push(x * w * 0.33, 0.61 + y * w * 0.41 * squash, z * w * 0.33); N.push(x * w, y * 0.75 * w + 0.3, z * w);
    const s = 0.46 + 0.6 * (y * 0.5 + 0.5) + 0.9 * (w - 1); C.push(s, s, s * 0.96);
  }
  if (trunk) {
    const cy = new THREE.CylinderGeometry(0.028, 0.045, 0.34, 5, 1, true).toNonIndexed(); cy.translate(0, 0.17, 0);
    const cp = cy.getAttribute('position'), cn = cy.getAttribute('normal');
    for (let i = 0; i < cp.count; i++) { P.push(cp.getX(i), cp.getY(i), cp.getZ(i)); N.push(cn.getX(i), cn.getY(i), cn.getZ(i)); C.push(0.42, 0.3, 0.24); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}
const TREE_LOD = [[treeGeometry(2, true), 330], [treeGeometry(1, true), 720], [treeGeometry(0, false), 1e9]];
const season = seasonRef; // 0 summer … 1 autumn (shared shader uniform)
const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, toneMapped: false });
treeMat.onBeforeCompile = (sh) => { // leafy mottling
  sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vLeaf; varying vec2 vFall;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vLeaf = position * 26.0 + vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z) * 0.37;
vFall = vec2(step(abs(color.r - color.g), 0.01), fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453)); // x: crown (not trunk), y: per-tree random`);
  sh.uniforms.uAutumn = season;
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLeaf; varying vec2 vFall; uniform float uAutumn;`).replace('#include <color_fragment>', `#include <color_fragment>
float lf = sin(vLeaf.x) * sin(vLeaf.y * 1.3) * sin(vLeaf.z) + 0.5 * sin(vLeaf.x * 2.7 + vLeaf.y * 2.1) * sin(vLeaf.z * 2.3 - vLeaf.y);
diffuseColor.rgb *= 0.86 + 0.24 * lf;
if (uAutumn > 0.0 && vFall.y < 0.9) { // one tree in ten stays evergreen
  vec3 pal = vFall.y < 0.28 ? vec3(0.50, 0.075, 0.03) : vFall.y < 0.58 ? vec3(0.66, 0.23, 0.035) : vFall.y < 0.8 ? vec3(0.74, 0.47, 0.06) : vec3(0.36, 0.2, 0.06);
  float fl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  diffuseColor.rgb = mix(diffuseColor.rgb, pal * (0.28 + 5.6 * fl), uAutumn * vFall.x);
}`);
};
const trees = new THREE.Group(); scene.add(trees);
const treeTiles = new Map(); let TREE_R = 1400, treeLoads = 0;
const S16 = 2 * R / 65536;
function loadTrees(key, tx, ty) {
  const t = { state: 1, mk: null, lod: null, cx: 0, cz: 0 }; treeTiles.set(key, t); treeLoads++;
  fetch(`data/trees/${key}.bin?v=3`).then((r) => r.arrayBuffer()).then((buf) => {
    treeLoads--; if (t.state !== 1) return;
    const dv = new DataView(buf), n = buf.byteLength / 8, [x0, z0, size] = tileRect(16, tx, ty);
    t.cx = x0 + size / 2; t.cz = z0 + size / 2;
    const mat = new Float32Array(n * 16), col = new Float32Array(n * 3);
    let yMin = 1e9, yMax = -1e9;
    for (let i = 0; i < n; i++) {
      const fx = dv.getUint16(i * 8, true) / 65535, fy = dv.getUint16(i * 8 + 2, true) / 65535;
      const x = x0 + fx * size, z = z0 + fy * size, y = H(x, z) - 0.3, h = dv.getUint8(i * 8 + 7) / 5, rr = hash(i, tx * 31 + ty);
      const a = rr * 6.283, w = h * (0.72 + hash(i * 7 + 3, ty) * 0.42), c = Math.cos(a) * w, s = Math.sin(a) * w, o = i * 16;
      mat[o] = c; mat[o + 2] = -s; mat[o + 5] = h; mat[o + 8] = s; mat[o + 10] = c; mat[o + 12] = x - t.cx; mat[o + 13] = y; mat[o + 14] = z - t.cz; mat[o + 15] = 1;
      const v = 0.98 + rr * 0.3;
      col[i * 3] = lin(Math.min(255, dv.getUint8(i * 8 + 4) * v)); col[i * 3 + 1] = lin(Math.min(255, dv.getUint8(i * 8 + 5) * v)); col[i * 3 + 2] = lin(Math.min(255, dv.getUint8(i * 8 + 6) * v * 0.9));
      yMin = Math.min(yMin, y); yMax = Math.max(yMax, y + h);
    }
    const mk = (geo) => {
      const m = new THREE.InstancedMesh(geo, treeMat, n);
      m.instanceMatrix = new THREE.InstancedBufferAttribute(mat, 16); m.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
      m.position.set(t.cx, 0, t.cz); m.matrixAutoUpdate = false; m.updateMatrix();
      m.boundingSphere = new THREE.Sphere(new V3(0, (yMin + yMax) / 2, 0), Math.hypot(size * 0.72, (yMax - yMin) / 2));
      m.visible = false; trees.add(m); return m;
    };
    if (n) { t.mk = mk; t.lod = []; }
    t.state = 2;
  }).catch(() => { treeLoads--; treeTiles.delete(key); });
}
function updateTrees(p) {
  const fx = (p.x / K + MX0 + R) / S16, fy = (R - (-p.z / K + MY0)) / S16, span = Math.ceil(TREE_R / (S16 * K)) + 1;
  const agl = p.y - H(p.x, p.z);
  for (let ty = Math.floor(fy) - span; ty <= Math.floor(fy) + span; ty++) for (let tx = Math.floor(fx) - span; tx <= Math.floor(fx) + span; tx++) {
    const key = tx + '_' + ty; if (!treeCounts[key] || treeTiles.has(key)) continue;
    const [x0, z0, size] = tileRect(16, tx, ty);
    if (Math.hypot(x0 + size / 2 - p.x, z0 + size / 2 - p.z, agl * 0.8) < TREE_R && treeLoads < 4) loadTrees(key, tx, ty);
  }
  for (const [key, t] of treeTiles) {
    if (t.state !== 2) continue;
    const d = Math.hypot(t.cx - p.x, t.cz - p.z, agl * 0.8);
    if (d > TREE_R + 350) { for (const m of t.lod || []) if (m) { trees.remove(m); m.dispose(); } t.state = 0; treeTiles.delete(key); continue; }
    if (t.mk) { const want = TREE_LOD.findIndex((l) => d < l[1]); for (let i = 0; i < 3; i++) { if (i === want && !t.lod[i]) t.lod[i] = t.mk(TREE_LOD[i][0]); if (t.lod[i]) t.lod[i].visible = i === want; } }
  }
}

// ───────────────────────── water
{
  const P = [], I = []; let base = 0;
  for (const w of waterData) {
    const ring = (a) => { const o = []; for (let i = 0; i < a.length; i += 2) o.push(new THREE.Vector2(a[i], a[i + 1])); return o; };
    const outer = ring(w.o), holes = w.h.map(ring);
    if (THREE.ShapeUtils.isClockWise(outer)) outer.reverse();
    for (const h of holes) if (!THREE.ShapeUtils.isClockWise(h)) h.reverse();
    let faces; try { faces = THREE.ShapeUtils.triangulateShape(outer, holes); } catch { continue; }
    const all = outer.concat(...holes);
    const hs = outer.map((q) => H(q.x, q.y)).sort((a, b) => a - b), lvl = hs[Math.floor(hs.length * 0.3)];
    for (const q of all) P.push(q.x, Math.min(H(q.x, q.y), lvl + 1.5) + 0.35, q.y);
    for (const f of faces) I.push(base + f[0], base + f[1], base + f[2]);
    base += all.length;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
  const mat = new THREE.ShaderMaterial({
    uniforms: waterU, transparent: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, depthWrite: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime, fogNear, fogFar; uniform vec3 uSun, uSunCol, uSky, uHorizon, fogColor; varying vec3 vW;
      vec2 wave(vec2 p, vec2 d, float f, float s){ float ph = dot(p,d)*f + uTime*s; return d * cos(ph) * f; }
      void main(){
        vec2 p = vW.xz; vec3 v = cameraPosition - vW; float dist = length(v); v /= dist;
        vec2 g = wave(p, vec2(.8,.6), .55, 1.1)*.05 + wave(p, vec2(-.5,.86), .9, 1.5)*.035 + wave(p, vec2(.2,-.98), 1.7, 2.1)*.02 + wave(p, vec2(-.9,-.3), 3.1, 2.8)*.012;
        g *= 1.6 / (1.0 + dist * 0.0025);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        float ndv = max(dot(n, v), 0.0), fres = 0.03 + 0.72 * pow(1.0 - ndv, 4.0);
        vec3 r = reflect(-v, n); r.y = abs(r.y);
        vec3 skyc = mix(uHorizon * 0.8, uSky, smoothstep(0.0, 0.3, r.y));
        float spec = pow(max(dot(r, uSun), 0.0), 380.0) * 2.2 + pow(max(dot(r, uSun), 0.0), 40.0) * 0.12;
        vec3 deep = vec3(0.035, 0.085, 0.09);
        vec3 col = mix(deep, skyc, fres) + uSunCol * spec;
        float fogF = smoothstep(fogNear, fogFar, dist);
        col = mix(col, fogColor, fogF);
        gl_FragColor = vec4(col, mix(0.72, 1.0, fres));
        #include <colorspace_fragment>
      }` });
  const m = new THREE.Mesh(g, mat); m.renderOrder = 2; m.frustumCulled = false; scene.add(m);
}

// ───────────────────────── town line (soft curtain along the boundary)
let townLine;
{
  const P = [], U = [], I = []; let k = 0;
  const n = boundary.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = boundary[i * 2], az = boundary[i * 2 + 1], bx = boundary[((i + 1) % n) * 2], bz = boundary[((i + 1) % n) * 2 + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 40));
    for (let s = 0; s < steps; s++) {
      const x0 = ax + (bx - ax) * s / steps, z0 = az + (bz - az) * s / steps, x1 = ax + (bx - ax) * (s + 1) / steps, z1 = az + (bz - az) * (s + 1) / steps;
      const y0 = H(x0, z0), y1 = H(x1, z1);
      P.push(x0, y0 - 2, z0, x1, y1 - 2, z1, x1, y1 + 38, z1, x0, y0 + 38, z0); U.push(0, 0, 1, 1); I.push(k, k + 1, k + 2, k, k + 2, k + 3); k += 4;
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('a', new THREE.Float32BufferAttribute(U, 1)); g.setIndex(I);
  townLine = new THREE.Mesh(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `attribute float a; varying float vA; varying float vD; void main(){ vA = a; vec4 mv = modelViewMatrix * vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; varying float vD; void main(){ float f = pow(1.0 - vA, 2.5); gl_FragColor = vec4(1.0, 0.93, 0.78, f * 0.5 * smoothstep(60.0, 400.0, vD) * (1.0 - smoothstep(9000.0, 16000.0, vD))); }` }));
  townLine.renderOrder = 3; scene.add(townLine);
}

// ───────────────────────── labels
const RANGE = { town: 40000, village: 14000, hood: 5000, peak: 11000, water: 5500, park: 3800, school: 3000, civic: 2400, church: 2400, historic: 2400, home: 2400 };
const PRIO = { town: 0, village: 1, peak: 2, hood: 3, water: 4, park: 5, school: 6, civic: 7, historic: 7, church: 8, home: 5 };
const labelLayer = $('labels'); let labelsOn = true;
const labels = labelData.map((l) => {
  const el = document.createElement('div'); el.className = 'lb ' + l.k; el.textContent = l.n; el.appendChild(document.createElement('i')); el.style.opacity = 0; labelLayer.appendChild(el);
  const y = H(l.x, l.z) + (l.k === 'town' ? 140 : l.k === 'village' ? 90 : l.k === 'peak' ? 28 : 34);
  return { ...l, el, pos: new V3(l.x, y, l.z), w: l.n.length * (l.k === 'town' ? 11 : l.k === 'village' ? 9 : 7.2) + 10, h: l.k === 'town' ? 26 : 20, shown: false, o: 0 };
}).sort((a, b) => PRIO[a.k] - PRIO[b.k]);
const tmp = new V3();
function updateLabels(w, h) {
  const boxes = [];
  for (const l of labels) {
    let o = 0, sx = 0, sy = 0;
    const d = labelsOn ? l.pos.distanceTo(camera.position) : 1e9, range = RANGE[l.k];
    if (d < range) {
      tmp.copy(l.pos).project(camera);
      if (tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05) {
        sx = (tmp.x * 0.5 + 0.5) * w; sy = (-tmp.y * 0.5 + 0.5) * h - 24;
        const bx = sx - l.w / 2, by = sy - l.h;
        if (!boxes.some((b) => bx < b[0] + b[2] && bx + l.w > b[0] && by < b[1] + b[3] && by + l.h > b[1])) { boxes.push([bx, by, l.w, l.h]); o = clamp((range - d) / (range * 0.25), 0, 1) * clamp(d / 120, 0, 1); }
      }
    }
    l.o += (o - l.o) * 0.15;
    if (l.o < 0.02) { if (l.shown) { l.el.style.opacity = 0; l.shown = false; } continue; }
    l.shown = true; l.el.style.opacity = l.o.toFixed(2);
    if (o > 0) l.el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-100%)`;
  }
}

// ───────────────────────── "now over" street lookup
const RG = 150, roadGrid = new Map();
for (const r of roadData) { if (!r[0]) continue; for (let i = 2; i < r.length - 2; i += 2) { const k = Math.floor((r[i] + r[i + 2]) / 2 / RG) + '_' + Math.floor((r[i + 1] + r[i + 3]) / 2 / RG); let a = roadGrid.get(k); if (!a) roadGrid.set(k, a = []); a.push([r[0], r[i], r[i + 1], r[i + 2], r[i + 3]]); } }
const villages = labelData.filter((l) => l.k === 'town' || ['Kensington', 'East Berlin'].includes(l.n));
function inTown(x, z) { let c = false; const n = boundary.length / 2; for (let i = 0, j = n - 1; i < n; j = i++) { const xi = boundary[i * 2], zi = boundary[i * 2 + 1], xj = boundary[j * 2], zj = boundary[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
function nowOver(x, z) {
  let best = 140, name = '';
  const gx = Math.floor(x / RG), gz = Math.floor(z / RG);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of roadGrid.get((gx + i) + '_' + (gz + j)) || []) {
    const dx = s[3] - s[1], dz = s[4] - s[2], t = clamp(((x - s[1]) * dx + (z - s[2]) * dz) / (dx * dx + dz * dz || 1), 0, 1), d = Math.hypot(x - s[1] - dx * t, z - s[2] - dz * t);
    if (d < best) { best = d; name = s[0]; }
  }
  let place = '', pd = 1e9;
  for (const v of villages) { const d = Math.hypot(v.x - x, v.z - z) * (v.k === 'town' ? 1.6 : 1); if (d < pd) { pd = d; place = v.n; } }
  const it = inTown(x, z); if (it && (pd > 2200 || !['Kensington', 'East Berlin'].includes(place))) place = 'Berlin'; if (!it && (place === 'Berlin' || place === 'Kensington' || place === 'East Berlin' || pd > 9000)) place = '';
  $('over').innerHTML = name ? `<b>${name}</b>${place ? ' · ' + place : ''}` : (place || '&nbsp;');
}

// ───────────────────────── minimap
const mm = $('map'), mctx = mm.getContext('2d'), mBase = document.createElement('canvas'); mBase.width = mBase.height = 380;
let mb = { x0: 1e9, z0: 1e9, x1: -1e9, z1: -1e9 };
for (let i = 0; i < boundary.length; i += 2) { mb.x0 = Math.min(mb.x0, boundary[i]); mb.x1 = Math.max(mb.x1, boundary[i]); mb.z0 = Math.min(mb.z0, boundary[i + 1]); mb.z1 = Math.max(mb.z1, boundary[i + 1]); }
{ const s = Math.max(mb.x1 - mb.x0, mb.z1 - mb.z0) + 1400, cx = (mb.x0 + mb.x1) / 2, cz = (mb.z0 + mb.z1) / 2; mb = { x0: cx - s / 2, z0: cz - s / 2, s }; }
const m2 = (x, z, S) => [(x - mb.x0) / mb.s * S, (z - mb.z0) / mb.s * S];
{
  const c = mBase.getContext('2d'), S = 380;
  c.fillStyle = '#26352c'; c.fillRect(0, 0, S, S);
  c.beginPath(); for (let i = 0; i < boundary.length; i += 2) { const [x, y] = m2(boundary[i], boundary[i + 1], S); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); c.fillStyle = '#3a5140'; c.fill();
  c.fillStyle = '#5d93b8'; for (const w of waterData) { c.beginPath(); for (let i = 0; i < w.o.length; i += 2) { const [x, y] = m2(w.o[i], w.o[i + 1], S); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.fill(); }
  for (const pass of [3, 2, 1, 0]) { c.strokeStyle = ['#f0c27a', '#f2ede0', 'rgba(242,237,224,.7)', 'rgba(242,237,224,.28)'][pass]; c.lineWidth = [2.6, 1.6, 1, 0.6][pass]; c.beginPath();
    for (const r of roadData) { if ((r[1] === 4 ? 0 : r[1]) !== pass) continue; for (let i = 2; i < r.length; i += 2) { const [x, y] = m2(r[i], r[i + 1], S); i === 2 ? c.moveTo(x, y) : c.lineTo(x, y); } } c.stroke(); }
  c.beginPath(); for (let i = 0; i < boundary.length; i += 2) { const [x, y] = m2(boundary[i], boundary[i + 1], S); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); c.strokeStyle = 'rgba(255,255,255,.75)'; c.setLineDash([5, 4]); c.lineWidth = 1.4; c.stroke();
}
function drawMini() {
  const S = mm.width; mctx.drawImage(mBase, 0, 0, S, S);
  const [x, y] = m2(fly.pos.x, fly.pos.z, S);
  mctx.save(); mctx.translate(clamp(x, 4, S - 4), clamp(y, 4, S - 4)); mctx.rotate(fly.yaw);
  const g = mctx.createRadialGradient(0, 0, 0, 0, 0, 46); g.addColorStop(0, 'rgba(255,220,150,.55)'); g.addColorStop(1, 'rgba(255,220,150,0)');
  mctx.fillStyle = g; mctx.beginPath(); mctx.moveTo(0, 0); mctx.arc(0, 0, 46, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); mctx.fill();
  mctx.fillStyle = '#fff'; mctx.strokeStyle = '#222'; mctx.lineWidth = 1; mctx.beginPath(); mctx.moveTo(0, -7); mctx.lineTo(5, 5); mctx.lineTo(0, 2.5); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.restore();
}
mm.addEventListener('click', (e) => { const r = mm.getBoundingClientRect(); const x = mb.x0 + (e.clientX - r.left) / r.width * mb.s, z = mb.z0 + (e.clientY - r.top) / r.height * mb.s; flyTo({ n: '', x, z }, 420, 190, false); });

// ───────────────────────── flight
const byName = (n) => labelData.find((l) => l.n === n);
const start = byName('Kensington') || { x: 0, z: 0 };
const fly = { pos: new V3(start.x - 900, H(start.x, start.z) + 260, start.z + 1100), yaw: 0.65, pitch: -0.22, vel: new V3(), speed: 55, yawV: 0, pitchV: 0 };
const keys = new Set(); let dragging = false, lastInput = 0, helpHidden = false;
const stopAuto = () => { if (auto) { auto = null; tourOn = false; $('b-tour').classList.remove('on'); $('b-tour').textContent = '▶ Guided tour'; caption(null); } };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase(); keys.add(k); lastInput = performance.now();
  if (['w', 'a', 's', 'd', 'q', 'e', ' ', 'c', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { stopAuto(); e.preventDefault(); }
  if (k === 't') toggleTour(); if (k === 'l') setTime(timeIdx + 1); if (k === 'n') toggleLabels(); if (k === 'p') togglePlaces(); if (k === 'b') townLine.visible = !townLine.visible; if (k === 'f') toggleSeason();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('pointerdown', (e) => { dragging = true; canvas.classList.add('drag'); canvas.setPointerCapture(e.pointerId); $('places').style.display = 'none'; });
canvas.addEventListener('pointerup', (e) => { dragging = false; canvas.classList.remove('drag'); });
canvas.addEventListener('pointermove', (e) => { if (!dragging) return; if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1) stopAuto(); fly.yaw += e.movementX * 0.0032; fly.pitch = clamp(fly.pitch - e.movementY * 0.0032, -1.5, 1.2); lastInput = performance.now(); });
canvas.addEventListener('wheel', (e) => { fly.speed = clamp(fly.speed * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 8, 600); e.preventDefault(); }, { passive: false });

const fwd = new V3(), right = new V3(), want = new V3();
function freeFlight(dt) {
  const k = (a) => keys.has(a) ? 1 : 0;
  const turn = k('arrowright') - k('arrowleft'), tilt = k('arrowup') - k('arrowdown');
  fly.yawV += (turn * 1.1 - fly.yawV) * Math.min(1, dt * 6); fly.pitchV += (tilt * 0.8 - fly.pitchV) * Math.min(1, dt * 6);
  fly.yaw += fly.yawV * dt; fly.pitch = clamp(fly.pitch + fly.pitchV * dt, -1.5, 1.2);
  fwd.set(Math.sin(fly.yaw) * Math.cos(fly.pitch), Math.sin(fly.pitch), -Math.cos(fly.yaw) * Math.cos(fly.pitch));
  right.set(Math.cos(fly.yaw), 0, Math.sin(fly.yaw));
  const sp = fly.speed * (keys.has('shift') ? 3.5 : 1);
  want.set(0, 0, 0).addScaledVector(fwd, (k('w') - k('s')) * sp).addScaledVector(right, (k('d') - k('a')) * sp); want.y += (k('e') + k(' ') - k('q') - k('c')) * sp * 0.7;
  fly.vel.lerp(want, Math.min(1, dt * 2.6));
  fly.pos.addScaledVector(fly.vel, dt);
}

// guided moves: fly to a place, then orbit it
let auto = null, tourOn = false, tourIdx = -1;
const TOUR = [
  ['Kensington', 'Kensington', 'The busy heart of town, strung along Farmington Avenue and Main Street.', 520, 210],
  ['Berlin Station', 'Berlin Station', 'Trains have stopped here since the 1800s — today it serves the Hartford Line and Amtrak.', 380, 150],
  ['Paper Goods Pond', 'Paper Goods Pond', 'A quiet pond in Kensington, named for the American Paper Goods factory that once stood beside it.', 430, 150],
  ['Worthington Ridge Historic District', 'Worthington Ridge', 'Berlin’s old main street, lined with 18th- and 19th-century homes from the days of the Yankee tin peddlers.', 480, 170],
  ['Berlin High School', 'Berlin High School', 'Home of the Redcoats, whose football team plays down the road at Sage Park.', 420, 160],
  ['Sage Park', 'Sage Park', 'The town’s main athletic complex — ball fields, a pond, and Scalise Field, where the Redcoats play football.', 520, 180],
  ['East Berlin', 'East Berlin', 'A village of its own on the Mattabesset River, once home to a famous iron bridge works.', 520, 200],
  ['Silver Lake', 'Silver Lake', 'A long, quiet lake on the Meriden line at the south end of town.', 800, 260],
  ['Lamentation Mountain', 'Lamentation Mountain', 'A long traprock ridge with sweeping views, crossed by the Mattabesett Trail.', 900, 240],
  ['Timberlin Golf Course', 'Timberlin', 'The town’s public golf course and park, set in the hills of Kensington.', 700, 230],
  ['Ragged Mountain', 'Ragged Mountain', 'Cliffs loved by hikers and rock climbers, looking down on the Hart Ponds and reservoirs.', 850, 230],
].map(([n, title, blurb, r, h]) => ({ ...(byName(n) || {}), title, blurb, r, h })).filter((s) => s.x !== undefined);

function lookFrom(pos, target) { const dx = target.x - pos.x, dy = target.y - pos.y, dz = target.z - pos.z; return [Math.atan2(dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))]; }
function flyTo(place, r = 480, h = 180, orbit = true) {
  const gy = H(place.x, place.z), target = new V3(place.x, gy + 12, place.z);
  let a = Math.atan2(fly.pos.z - place.z, fly.pos.x - place.x);
  const end = new V3(place.x + Math.cos(a) * r, 0, place.z + Math.sin(a) * r); end.y = Math.max(gy, H(end.x, end.z)) + h;
  const d = fly.pos.distanceTo(end);
  fwd.set(Math.sin(fly.yaw) * Math.cos(fly.pitch), Math.sin(fly.pitch), -Math.cos(fly.yaw) * Math.cos(fly.pitch));
  auto = { phase: 0, t: 0, dur: clamp(d / 260, 3.5, 13), from: fly.pos.clone(), look0: fly.pos.clone().addScaledVector(fwd, Math.max(400, d * 0.6)), end, target, a, r, h, gy, swept: 0, orbit, arch: Math.min(d * 0.07, 260), place };
  fly.vel.set(0, 0, 0);
}
const lookP = new V3();
function autoFlight(dt) {
  const A = auto; A.t += dt;
  if (A.phase === 0) {
    const s = smooth(clamp(A.t / A.dur, 0, 1));
    const prev = fly.pos.clone();
    fly.pos.lerpVectors(A.from, A.end, s); fly.pos.y += Math.sin(Math.PI * s) * A.arch;
    lookP.lerpVectors(A.look0, A.target, smooth(clamp(A.t / (A.dur * 0.8), 0, 1)));
    [fly.yaw, fly.pitch] = lookFrom(fly.pos, lookP);
    fly.vel.copy(fly.pos).sub(prev).divideScalar(Math.max(dt, 1e-3));
    if (A.t >= A.dur) { if (!A.orbit) { auto = null; fly.vel.set(0, 0, 0); return; } A.phase = 1; if (tourOn) caption(A.place); }
  } else {
    const w = 0.085; A.a += w * dt; A.swept += w * dt;
    const prev = fly.pos.clone();
    fly.pos.set(A.target.x + Math.cos(A.a) * A.r, 0, A.target.z + Math.sin(A.a) * A.r);
    const want = Math.max(A.gy, H(fly.pos.x, fly.pos.z)) + A.h; fly.pos.y = prev.y + (want - prev.y) * Math.min(1, dt * 0.8);
    [fly.yaw, fly.pitch] = lookFrom(fly.pos, A.target);
    fly.vel.copy(fly.pos).sub(prev).divideScalar(Math.max(dt, 1e-3));
    if (tourOn && A.swept > 1.75) nextStop();
  }
}
function nextStop() { tourIdx = (tourIdx + 1) % TOUR.length; const s = TOUR[tourIdx]; caption(null); flyTo(s, s.r, s.h, true); }
function toggleTour() { if (tourOn) { stopAuto(); return; } tourOn = true; $('b-tour').classList.add('on'); $('b-tour').textContent = '■ Stop tour'; nextStop(); }
function caption(p) { const c = $('caption'); if (!p) { c.style.opacity = 0; return; } c.querySelector('h2').textContent = p.title || p.n; c.querySelector('p').textContent = p.blurb || ''; c.style.opacity = 1; }
function toggleLabels() { labelsOn = !labelsOn; $('b-labels').classList.toggle('on', labelsOn); }
function togglePlaces() { const p = $('places'); p.style.display = p.style.display === 'block' ? 'none' : 'block'; }
{
  const groups = [['Home', ['home']], ['Villages & neighborhoods', ['town', 'village', 'hood']], ['Hills & ridges', ['peak']], ['Ponds & lakes', ['water']], ['Parks & recreation', ['park']], ['Schools', ['school']], ['Around town', ['civic', 'historic', 'church']]];
  const p = $('places');
  for (const [title, kinds] of groups) {
    const items = labelData.filter((l) => kinds.includes(l.k) && (inTown(l.x, l.z) || l.k === 'peak' || l.k === 'town')).sort((a, b) => a.n.localeCompare(b.n)); if (!items.length) continue;
    const h = document.createElement('h4'); h.textContent = title; p.appendChild(h);
    for (const l of items) { const a = document.createElement('a'); a.textContent = l.n; a.onclick = () => { stopAuto(); p.style.display = 'none'; const big = ['peak', 'water', 'town', 'village', 'park'].includes(l.k); const home = l.k === 'home'; flyTo({ ...l, title: l.n }, home ? 110 : big ? 700 : 380, home ? 45 : big ? 230 : 140, true); }; p.appendChild(a); }
  }
}
let seasonTo = 0;
function toggleSeason() { // fade between summer and autumn
  seasonTo = seasonTo ? 0 : 1; const b = $('b-season'); b.classList.toggle('on', !!seasonTo); b.textContent = seasonTo ? '🍂 Autumn' : '🌳 Summer';
  const step = () => { season.value = clamp(season.value + (seasonTo ? 0.03 : -0.03), 0, 1); if (season.value !== seasonTo) requestAnimationFrame(step); }; step();
}
$('b-season').onclick = toggleSeason;
$('b-tour').onclick = toggleTour; $('b-places').onclick = togglePlaces; $('b-time').onclick = () => setTime(timeIdx + 1); $('b-labels').onclick = toggleLabels;

// ───────────────────────── main loop
let quality = 0.7, qT = 0, qN = 0; const DPR = Math.min(devicePixelRatio, 1.5);
function applyQuality() { TREE_R = 800 + 900 * quality; TREE_LOD[0][1] = 150 + 230 * quality; TREE_LOD[1][1] = 380 + 420 * quality; LODF = 1.05 + 0.35 * quality; renderer.setPixelRatio(quality < 0.25 ? DPR * (0.7 + quality * 1.2) : DPR); }
function adapt(dt) { // nudge detail up or down to hold a smooth frame rate
  if (document.hidden || !started || window.app.lockQuality) { qT = 0; qN = 0; return; }
  qT += dt; qN++; if (qT < 2.5) return;
  const fps = qN / qT; qT = 0; qN = 0; const q0 = quality;
  if (fps < 27) quality = Math.max(0, quality - 0.15); else if (fps > 52) quality = Math.min(1, quality + 0.08);
  if (quality !== q0) applyQuality();
}
const prof = { tiles: 0, trees: 0, bld: 0, render: 0, labels: 0, frames: 0, max: 0 };
const HDG = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
let last = performance.now(), slow = 0, W = 0, Hh = 0, started = false;
function resize() { W = innerWidth; Hh = innerHeight; renderer.setSize(W, Hh, false); camera.aspect = W / Hh; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; frame++;
  if (started) { if (auto) autoFlight(dt); else freeFlight(dt); }
  adapt(dt);
  fly.pos.x = clamp(fly.pos.x, WORLD.x0, WORLD.x1); fly.pos.z = clamp(fly.pos.z, WORLD.z0, WORLD.z1);
  const ground = H(fly.pos.x, fly.pos.z); fly.pos.y = clamp(fly.pos.y, ground + 4, ground + 4000);
  camera.position.copy(fly.pos); camera.rotation.y = -fly.yaw; camera.rotation.x = fly.pitch;
  const agl = fly.pos.y - ground;
  camera.near = clamp(agl * 0.08, 1, 25); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  sky.position.copy(fly.pos); sky.material.uniforms.time && (sky.material.uniforms.time.value = now / 1000);
  waterU.uTime.value = now / 1000; waterU.fogColor.value.copy(scene.fog.color); waterU.fogNear.value = scene.fog.near; waterU.fogFar.value = scene.fog.far;
  const p0 = performance.now();
  for (const r of roots) r.update(fly.pos);
  const p1 = performance.now();
  if (frame % 6 === 0) updateTrees(fly.pos);
  const p2 = performance.now();
  if (frame % 3 === 0) updateBuildings(fly.pos);
  if (frame % 300 === 0) for (const r of roots) r.prune();
  const p3 = performance.now();
  renderer.render(scene, camera);
  const p4 = performance.now();
  updateLabels(W, Hh);
  const p5 = performance.now();
  prof.tiles += p1 - p0; prof.trees += p2 - p1; prof.bld += p3 - p2; prof.render += p4 - p3; prof.labels += p5 - p4; prof.frames++; prof.max = Math.max(prof.max, p5 - p0);
  if (frame % 4 === 0) {
    drawMini();
    $('g-alt').textContent = Math.round(agl * 3.281).toLocaleString(); $('g-spd').textContent = Math.round(fly.vel.length() * 2.237);
    const deg = ((fly.yaw * 180 / Math.PI) % 360 + 360) % 360; $('g-hdg').textContent = HDG[Math.round(deg / 45) % 8] + ' ' + String(Math.round(deg) % 360).padStart(3, '0') + '°';
  }
  if (frame % 20 === 0) nowOver(fly.pos.x, fly.pos.z);
  if (!helpHidden && lastInput && now - lastInput > 9000) { $('help').style.opacity = 0; helpHidden = true; }
  requestAnimationFrame(tick);
}

// ───────────────────────── boot
setTime(0); applyQuality();
progress(0.4, 'Laying out the landscape…');
for (const r of roots) r.load();
await new Promise((res) => { const iv = setInterval(() => { const n = roots.filter((r) => r.state === 2).length; progress(0.4 + 0.5 * n / roots.length); if (n === roots.length) { clearInterval(iv); res(); } }, 100); });
requestAnimationFrame(tick);
progress(1, 'Ready for takeoff');
$('go').style.display = 'block'; $('lmsg').style.opacity = 0.7;
const begin = () => { if (started) return; started = true; lastInput = performance.now(); flyTo({ ...start, title: 'Kensington' }, 700, 250, true); $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 1000); };
$('go').onclick = begin;
window.app = { prof, lockQuality: false, get quality() { return quality; }, set quality(v) { quality = v; applyQuality(); }, fly, flyTo, setTime, begin, H, byName, camera, renderer, scene, toggleTour, toggleSeason, season, stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, tex: renderer.info.memory.textures, treeTiles: treeTiles.size }) };
