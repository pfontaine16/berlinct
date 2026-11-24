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
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, toneMapped: false }));
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
    const kind = b[0], cx = b[5] - ch.cx, cz = b[6] - ch.cz, area = b[7], n = (b.length - 8) / 2, r0 = hash(b[5] * 10 | 0, b[6] * 10 | 0), r1 = hash(b[6] * 10 | 0, b[5] * 7 | 0);
    let pts = []; for (let i = 0; i < n; i++) pts.push([b[8 + i * 2], b[9 + i * 2]]);
    let A = 0; for (let i = 0, j = n - 1; i < n; j = i++) A += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    if (A < 0) pts.reverse();
    let base = 1e9, hi = -1e9; for (const p of pts) { const h = H(b[5] + p[0], b[6] + p[1]); base = Math.min(base, h); hi = Math.max(hi, h); }
    const hip = (kind === 0 || kind === 1 || kind === 5) && n <= 14 && area < 700;
    const total = b[1] * (kind === 0 ? 1.25 : 1) + (hi - base);
    const wall = WALLS[kind][Math.floor(r0 * WALLS[kind].length)];
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
    const top = hi + Math.max(2.6, b[1] * (kind === 0 ? 1.25 : 1) - rise * 0.75);
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
    } else {
      const faces = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []);
      for (const f of faces) tri([cx + pts[f[0]][0], top, cz + pts[f[0]][1]], [cx + pts[f[1]][0], top, cz + pts[f[1]][1]], [cx + pts[f[2]][0], top, cz + pts[f[2]][1]], roof, roof, roof);
      if (area > 150) { // parapet lip
        const lip = mul(wall, 0.9), t2 = top + 0.5;
        for (let i = 0, j = n - 1; i < n; j = i++) { const p = pts[j], q = pts[i]; tri([cx + p[0], top, cz + p[1]], [cx + p[0], t2, cz + p[1]], [cx + q[0], t2, cz + q[1]], lip, lip, lip); tri([cx + p[0], top, cz + p[1]], [cx + q[0], t2, cz + q[1]], [cx + q[0], top, cz + q[1]], lip, lip, lip); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('wuv', new THREE.Float32BufferAttribute(Wv, 4));
  g.computeBoundingSphere();
  ch.mesh = new THREE.Mesh(g, bMat); ch.mesh.position.set(ch.cx, 0, ch.cz); ch.mesh.matrixAutoUpdate = false; ch.mesh.updateMatrix(); buildings.add(ch.mesh);
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
const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, toneMapped: false });
treeMat.onBeforeCompile = (sh) => { // leafy mottling
  sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vLeaf;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vLeaf = position * 26.0 + vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z) * 0.37;`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLeaf;`).replace('#include <color_fragment>', `#include <color_fragment>
float lf = sin(vLeaf.x) * sin(vLeaf.y * 1.3) * sin(vLeaf.z) + 0.5 * sin(vLeaf.x * 2.7 + vLeaf.y * 2.1) * sin(vLeaf.z * 2.3 - vLeaf.y);
diffuseColor.rgb *= 0.86 + 0.24 * lf;`);
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
const RANGE = { town: 40000, village: 14000, hood: 5000, peak: 11000, water: 5500, park: 3800, school: 3000, civic: 2400, church: 2400, historic: 2400 };
const PRIO = { town: 0, village: 1, peak: 2, hood: 3, water: 4, park: 5, school: 6, civic: 7, historic: 7, church: 8 };
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
  if (k === 't') toggleTour(); if (k === 'l') setTime(timeIdx + 1); if (k === 'n') toggleLabels(); if (k === 'p') togglePlaces(); if (k === 'b') townLine.visible = !townLine.visible;
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
  ['East Berlin', 'East Berlin', 'A village of its own on the Mattabesset River, once home to a famous iron bridge works.', 520, 200],
  ['Silver Lake', 'Silver Lake', 'A long, quiet lake on the Meriden line at the south end of town.', 800, 260],
  ['Lamentation Mountain', 'Lamentation Mountain', 'A long traprock ridge with sweeping views, crossed by the Mattabesett Trail.', 900, 240],
  ['Timberlin Golf Course', 'Timberlin', 'The town’s public golf course and park, set in the hills of Kensington.', 700, 230],
  ['Ragged Mountain', 'Ragged Mountain', 'Cliffs loved by hikers and rock climbers, looking down on the Hart Ponds and reservoirs.', 850, 230],
  ['Berlin High School', 'Berlin High School', 'Home of the Redcoats.', 420, 160],
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
  const groups = [['Villages & neighborhoods', ['town', 'village', 'hood']], ['Hills & ridges', ['peak']], ['Ponds & lakes', ['water']], ['Parks & recreation', ['park']], ['Schools', ['school']], ['Around town', ['civic', 'historic', 'church']]];
  const p = $('places');
  for (const [title, kinds] of groups) {
    const items = labelData.filter((l) => kinds.includes(l.k) && (inTown(l.x, l.z) || l.k === 'peak' || l.k === 'town')).sort((a, b) => a.n.localeCompare(b.n)); if (!items.length) continue;
    const h = document.createElement('h4'); h.textContent = title; p.appendChild(h);
    for (const l of items) { const a = document.createElement('a'); a.textContent = l.n; a.onclick = () => { stopAuto(); p.style.display = 'none'; const big = ['peak', 'water', 'town', 'village', 'park'].includes(l.k); flyTo({ ...l, title: l.n }, big ? 700 : 380, big ? 230 : 140, true); }; p.appendChild(a); }
  }
}
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
window.app = { prof, lockQuality: false, get quality() { return quality; }, set quality(v) { quality = v; applyQuality(); }, fly, flyTo, setTime, begin, H, byName, camera, renderer, scene, toggleTour, stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, tex: renderer.info.memory.textures, treeTiles: treeTiles.size }) };
