import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, fbm, noise2, clamp, lerp, smooth } from './util.js';

export const ROAD_HALF = 14;      // mitad del ancho del camino de tierra
export const LAT_LIMIT = 40;      // límite lateral jugable
const STEP = 2;                   // resolución de muestreo de la pista

// Etapas de la carrera (una sola partida dividida en etapas, como en la SBR)
export const STAGES = [
  {
    name: '1st STAGE', place: 'San Diego Beach', jp: 'サンディエゴ',
    ground: [0xe8d3a0, 0xd9bf85], road: 0xc9a66b, heightAmp: 6, sideAmp: 10, wallStart: 999, wallH: 0, beach: 1,
    skyTop: 0x2b8cff, skyBottom: 0xffc4e8, fog: 0xffd9e8, sun: 0xfff1c9, sunEl: 0.35, props: ['palm', 'rock', 'grass'], fence: true
  },
  {
    name: '2nd STAGE', place: 'Arizona Desert', jp: 'アリゾナ砂漠',
    ground: [0xd4703a, 0xb8542a], road: 0xc98250, heightAmp: 10, sideAmp: 14, wallStart: 45, wallH: 70, beach: 0, mesa: 1,
    skyTop: 0x5a1e8c, skyBottom: 0xff9a3c, fog: 0xf59a5c, sun: 0xffb36b, sunEl: 0.12, props: ['cactus', 'cactus', 'rock', 'skull'], fence: false
  },
  {
    name: '3rd STAGE', place: 'Rocky Mountains', jp: 'ロッキー山脈',
    ground: [0x5f7a5a, 0x46604a], road: 0x8a7458, heightAmp: 45, sideAmp: 30, wallStart: 40, wallH: 110, beach: 0, snow: 1,
    skyTop: 0x1d2a6b, skyBottom: 0xb7c9ff, fog: 0xc5d2f0, sun: 0xe8f0ff, sunEl: 0.25, props: ['pine', 'pine', 'pine', 'rock'], fence: false
  },
  {
    name: '4th STAGE', place: 'Great Plains', jp: '大平原',
    ground: [0x9cb34a, 0xc9b450], road: 0xa98a5a, heightAmp: 8, sideAmp: 8, wallStart: 999, wallH: 0, beach: 0,
    skyTop: 0x3070d8, skyBottom: 0xffd27a, fog: 0xffe0a0, sun: 0xffe2a0, sunEl: 0.2, props: ['tree', 'grass', 'grass', 'windmill'], fence: true
  },
  {
    name: 'FINAL STAGE', place: 'New York City', jp: 'ニューヨーク',
    ground: [0x585466, 0x47435a], road: 0x6e6a78, heightAmp: 3, sideAmp: 2, wallStart: 999, wallH: 0, beach: 0, city: 1,
    skyTop: 0x0a0630, skyBottom: 0xb33a8a, fog: 0x5a2a6a, sun: 0xffc0f0, sunEl: 0.05, props: ['building', 'building', 'lamp'], fence: true
  }
];

const NUM_KEYS = ['heightAmp', 'sideAmp', 'wallStart', 'wallH', 'beach', 'mesa', 'snow', 'city', 'sunEl'];
const COL_KEYS = ['road', 'skyTop', 'skyBottom', 'fog', 'sun'];

function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

function textCanvasTexture(lines, opts = {}) {
  const cv = document.createElement('canvas');
  cv.width = opts.w || 1024; cv.height = opts.h || 256;
  const ctx = cv.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, cv.width, cv.height);
  grd.addColorStop(0, opts.bg1 || '#2a0a4a'); grd.addColorStop(1, opts.bg2 || '#d1146b');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, cv.width - 14, cv.height - 14);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => {
    const size = l.size || 90;
    ctx.font = `${size}px Bangers, Impact, sans-serif`;
    ctx.lineWidth = 10; ctx.strokeStyle = '#000';
    const y = cv.height * (lines.length === 1 ? 0.5 : (i === 0 ? 0.36 : 0.74));
    ctx.strokeText(l.text, cv.width / 2, y);
    ctx.fillStyle = l.color || '#fff';
    ctx.fillText(l.text, cv.width / 2, y);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function dirtTexture(seed) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 512;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 128, 512);
  const r = mulberry32(seed);
  for (let i = 0; i < 2600; i++) {
    const v = 180 + r() * 75 | 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.35 + r() * 0.4})`;
    ctx.fillRect(r() * 128, r() * 512, 1 + r() * 3, 1 + r() * 3);
  }
  // huellas de cascos
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = 'rgba(120,120,120,0.35)';
    ctx.beginPath(); ctx.ellipse(20 + r() * 88, r() * 512, 3, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  // surcos
  ctx.strokeStyle = 'rgba(150,150,150,0.4)'; ctx.lineWidth = 3;
  for (const x of [38, 90]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Track {
  constructor(seed, targetLength = 7500) {
    this.seed = seed;
    const rng = mulberry32(seed);
    this.rng = rng;
    // Puntos de control: avanzamos hacia el "este" (+x) con curvas suaves
    const pts = [];
    let x = 0, z = 0, heading = 0;
    const seg = 220;
    const n = Math.ceil(targetLength / seg) + 1;
    pts.push(new THREE.Vector3(-seg, 0, 0));
    for (let i = 0; i < n; i++) {
      pts.push(new THREE.Vector3(x, 0, z));
      heading += (rng() - 0.5) * 0.7;
      heading = clamp(heading, -0.85, 0.85);
      if (i < 2) heading *= 0.3;
      x += Math.cos(heading) * seg; z += Math.sin(heading) * seg;
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const total = curve.getLength();
    const N = Math.floor(total / STEP);
    const sp = curve.getSpacedPoints(N);
    // recortamos el tramo inicial (antes de la salida) para que s=0 sea la línea de salida
    let startIdx = 0, acc = 0;
    for (let i = 1; i < sp.length; i++) { acc += sp[i].distanceTo(sp[i - 1]); if (acc >= seg * 0.6) { startIdx = i; break; } }
    const P = sp.slice(startIdx);
    this.count = P.length;
    this.px = new Float32Array(this.count); this.pz = new Float32Array(this.count);
    this.tx = new Float32Array(this.count); this.tz = new Float32Array(this.count);
    this.hy = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) { this.px[i] = P[i].x; this.pz[i] = P[i].z; }
    for (let i = 0; i < this.count; i++) {
      const a = Math.max(0, i - 1), b = Math.min(this.count - 1, i + 1);
      let dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1; this.tx[i] = dx / l; this.tz[i] = dz / l;
    }
    this.length = (this.count - 1) * STEP;
    this.finishS = this.length - 160; // dejamos un poco de pista después de meta
    const ns = STAGES.length;
    this.stageBounds = [];
    for (let i = 0; i <= ns; i++) this.stageBounds.push(this.finishS * i / ns);
    for (let i = 0; i < this.count; i++) {
      const s = i * STEP;
      const p = this.params(s);
      // altura del camino: colinas suaves; en montañas hay subidas fuertes
      this.hy[i] = 4 + (fbm(s * 0.0016, 3.7, 3) + 0.4) * p.heightAmp + Math.sin(s * 0.0009) * p.heightAmp * 0.4;
    }
    // suavizado de la altura del camino
    for (let pass = 0; pass < 4; pass++) {
      const c = this.hy.slice();
      for (let i = 2; i < this.count - 2; i++) this.hy[i] = (c[i - 2] + c[i - 1] * 2 + c[i] * 3 + c[i + 1] * 2 + c[i + 2]) / 9;
    }
    for (let i = 0; i < this.count; i++) this.hy[i] = Math.max(this.hy[i], 2.5); // el camino nunca queda bajo el mar
    this.obstacles = [];
    this.parts = [];
  }

  stageIndex(s) {
    for (let i = 0; i < STAGES.length; i++) if (s < this.stageBounds[i + 1]) return i;
    return STAGES.length - 1;
  }

  // Parámetros visuales/terreno interpolados entre etapas
  params(s) {
    const L = this.finishS || 1, ns = STAGES.length;
    const f = clamp(s / L, 0, 0.99999) * ns;
    const i = Math.floor(f), t = f - i;
    const A = STAGES[i], B = STAGES[Math.min(ns - 1, i + 1)];
    const k = smooth(0.82, 1.0, t);
    const out = { stage: i, k };
    for (const key of NUM_KEYS) out[key] = lerp(A[key] || 0, B[key] || 0, k);
    if (A.wallStart === 999 || B.wallStart === 999) out.wallStart = A.wallStart === 999 && B.wallStart === 999 ? 999 : (A.wallStart === 999 ? B.wallStart : A.wallStart);
    out.colA = new THREE.Color(A.ground[0]).lerp(new THREE.Color(B.ground[0]), k);
    out.colB = new THREE.Color(A.ground[1]).lerp(new THREE.Color(B.ground[1]), k);
    for (const key of COL_KEYS) out[key] = new THREE.Color(A[key]).lerp(new THREE.Color(B[key]), k);
    return out;
  }

  idx(s) { return clamp(s / STEP, 0, this.count - 1.001); }

  roadY(s) {
    const f = this.idx(s), i = Math.floor(f), t = f - i;
    return this.hy[i] + (this.hy[i + 1] - this.hy[i]) * t;
  }
  slope(s) { return (this.roadY(s + 3) - this.roadY(s - 3)) / 6; }

  sideHeight(s, lat, p) {
    const d = Math.max(0, Math.abs(lat) - ROAD_HALF - 3);
    if (d <= 0) return 0;
    p = p || this.params(s);
    let h = fbm(s * 0.004, lat * 0.006 + 11, 4) * p.sideAmp * smooth(0, 70, d);
    if (p.wallStart < 900) {
      const w = smooth(p.wallStart, p.wallStart + 45, d);
      h += p.wallH * w * (0.65 + 0.45 * fbm(s * 0.006, Math.sign(lat) * 5.3, 3));
      if (p.mesa > 0.5) h = Math.round(h / 9) * 9 * p.mesa + h * (1 - p.mesa); // escalones de meseta
    }
    if (p.beach > 0 && lat < 0) h -= p.beach * smooth(25, 140, d) * 16;
    return h;
  }

  groundY(s, lat) { return this.roadY(s) + this.sideHeight(s, lat); }

  // Posición en el mundo a partir de coordenadas de pista (s = distancia, lat = desplazamiento lateral)
  pos(s, lat, out = new THREE.Vector3()) {
    const f = this.idx(s), i = Math.floor(f), t = f - i;
    const x = this.px[i] + (this.px[i + 1] - this.px[i]) * t;
    const z = this.pz[i] + (this.pz[i + 1] - this.pz[i]) * t;
    const tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * t;
    const tz = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * t;
    out.set(x - tz * lat, this.groundY(s, lat), z + tx * lat);
    return out;
  }
  yaw(s) {
    const f = this.idx(s), i = Math.floor(f);
    return Math.atan2(this.tx[i], this.tz[i]);
  }

  // ---------------------------------------------------------------- construcción visual
  build(scene) {
    const group = new THREE.Group();
    this.group = group;
    scene.add(group);
    this.buildTerrain(group);
    this.buildRoad(group);
    this.buildWater(group);
    this.buildProps(group);
    this.buildFences(group);
    this.buildGates(group);
    this.buildObstacles(group);
    this.buildParts(group);
    this.buildCrowd(group);
    return group;
  }

  buildTerrain(group) {
    const lats = [];
    const base = [0, 5, 10, 15, 19, 24, 30, 36, 44, 54, 66, 82, 100, 125, 155, 195, 245, 310, 400];
    for (let i = base.length - 1; i > 0; i--) lats.push(-base[i]);
    for (const b of base) lats.push(b);
    const rows = Math.floor(this.length / 6) + 1;
    const cols = lats.length;
    const pos = new Float32Array(rows * cols * 3);
    const col = new Float32Array(rows * cols * 3);
    const v = new THREE.Vector3();
    const snowC = new THREE.Color(0xf4f8ff), stripeA = new THREE.Color(0xe8894a), stripeB = new THREE.Color(0x9c3b22);
    const tmp = new THREE.Color();
    for (let r = 0; r < rows; r++) {
      const s = Math.min(this.length, r * 6);
      const p = this.params(s);
      const ry = this.roadY(s);
      for (let c = 0; c < cols; c++) {
        const lat = lats[c];
        this.pos(s, lat, v);
        const h = this.sideHeight(s, lat, p);
        v.y = ry + h - (Math.abs(lat) < ROAD_HALF + 2 ? 0.15 : 0);
        const k = (r * cols + c) * 3;
        pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
        const n = noise2(s * 0.03, lat * 0.05) * 0.5 + 0.5;
        tmp.copy(p.colA).lerp(p.colB, n);
        if (p.mesa > 0.01 && h > 6) {
          const band = Math.floor(h / 4.5) % 2 === 0 ? stripeA : stripeB;
          tmp.lerp(band, 0.75 * p.mesa);
        }
        if (p.snow > 0.01) { const sn = smooth(45, 75, h + n * 12); tmp.lerp(snowC, sn * p.snow); }
        if (p.beach > 0.01 && lat < 0 && h < -1) tmp.lerp(new THREE.Color(0xf2e2b5), p.beach);
        col[k] = tmp.r; col[k + 1] = tmp.g; col[k + 2] = tmp.b;
      }
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  buildRoad(group) {
    const lats = [-ROAD_HALF - 1.5, -ROAD_HALF, -ROAD_HALF / 2, 0, ROAD_HALF / 2, ROAD_HALF, ROAD_HALF + 1.5];
    const rows = Math.floor(this.length / 3) + 1, cols = lats.length;
    const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2), col = new Float32Array(rows * cols * 3);
    const v = new THREE.Vector3();
    for (let r = 0; r < rows; r++) {
      const s = Math.min(this.length, r * 3);
      const p = this.params(s);
      for (let c = 0; c < cols; c++) {
        this.pos(s, lats[c], v);
        const edge = c === 0 || c === cols - 1;
        v.y = this.roadY(s) + (edge ? -0.1 : 0.04);
        const k = r * cols + c;
        pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
        uv[k * 2] = (lats[c] + ROAD_HALF) / (ROAD_HALF * 2); uv[k * 2 + 1] = s / 30;
        const rc = p.road.clone();
        if (edge) rc.lerp(p.colA, 0.6);
        col[k * 3] = rc.r; col[k * 3 + 1] = rc.g; col[k * 3 + 2] = rc.b;
      }
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ map: dirtTexture(this.seed), vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.position.y = 0.02;
    group.add(mesh);
  }

  buildWater(group) {
    // mar del Pacífico: una franja solo en el lado de la playa de la 1ª etapa (nunca bajo el camino)
    const sEnd = this.stageBounds[1] + 200, rows = Math.ceil(sEnd / 20) + 1;
    const lats = [-ROAD_HALF - 40, -200, -500, -900];
    const pos = new Float32Array(rows * lats.length * 3), v = new THREE.Vector3();
    for (let r = 0; r < rows; r++) for (let c = 0; c < lats.length; c++) {
      this.pos(Math.min(this.length, r * 20) - 300 * (r === 0), lats[c], v);
      const k = (r * lats.length + c) * 3; pos[k] = v.x; pos[k + 1] = -2.5; pos[k + 2] = v.z;
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < lats.length - 1; c++) { const a = r * lats.length + c, b2 = a + 1, d = a + lats.length, e = d + 1; idx.push(a, b2, d, b2, e, d); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: 0x1e9bd7, emissive: 0x06304a, side: THREE.DoubleSide });
    const water = new THREE.Mesh(geo, mat);
    group.add(water);
    this.water = water;
  }

  propGeometry(type) {
    const G = THREE;
    switch (type) {
      case 'cactus': {
        const parts = [
          colored(new G.CylinderGeometry(0.55, 0.65, 6, 7).translate(0, 3, 0), 0x2f8a3a),
          colored(new G.CylinderGeometry(0.35, 0.35, 2.4, 6).rotateZ(Math.PI / 2).translate(-1.1, 2.6, 0), 0x2f8a3a),
          colored(new G.CylinderGeometry(0.35, 0.35, 2.2, 6).translate(-2.2, 3.6, 0), 0x2f8a3a),
          colored(new G.CylinderGeometry(0.35, 0.35, 1.8, 6).rotateZ(Math.PI / 2).translate(1, 3.4, 0), 0x2f8a3a),
          colored(new G.CylinderGeometry(0.35, 0.35, 1.8, 6).translate(1.8, 4.2, 0), 0x2f8a3a)
        ];
        return mergeGeometries(parts);
      }
      case 'palm': {
        const parts = [colored(new G.CylinderGeometry(0.3, 0.5, 9, 6).translate(0, 4.5, 0), 0x8a6a3a)];
        for (let i = 0; i < 6; i++) {
          const leaf = new G.ConeGeometry(0.9, 5, 4).rotateZ(Math.PI / 2 + 0.5).translate(2.4, 8.4, 0).rotateY(i / 6 * Math.PI * 2);
          parts.push(colored(leaf, 0x2fa84a));
        }
        return mergeGeometries(parts);
      }
      case 'pine': {
        const parts = [colored(new G.CylinderGeometry(0.4, 0.6, 3, 6).translate(0, 1.5, 0), 0x5a3a22)];
        for (let i = 0; i < 3; i++) parts.push(colored(new G.ConeGeometry(3.4 - i * 0.9, 4.5, 7).translate(0, 4 + i * 2.6, 0), i === 2 ? 0x2c5a3a : 0x1f4a30));
        parts.push(colored(new G.ConeGeometry(0.9, 1.4, 7).translate(0, 10.6, 0), 0xf4f8ff));
        return mergeGeometries(parts);
      }
      case 'tree': {
        const parts = [colored(new G.CylinderGeometry(0.4, 0.6, 4, 6).translate(0, 2, 0), 0x6a4a2a),
          colored(new G.IcosahedronGeometry(3, 0).translate(0, 6, 0), 0x5f9a3a),
          colored(new G.IcosahedronGeometry(2.2, 0).translate(1.6, 5.2, 0.8), 0x7ab040)];
        return mergeGeometries(parts);
      }
      case 'grass': {
        const parts = [];
        for (let i = 0; i < 4; i++) parts.push(colored(new G.ConeGeometry(0.25, 1.4, 3).translate((i - 1.5) * 0.4, 0.7, (i % 2) * 0.3), i % 2 ? 0xb8c45a : 0x8aa840));
        return mergeGeometries(parts);
      }
      case 'rock': return colored(new G.DodecahedronGeometry(2.2, 0).scale(1.3, 0.8, 1).translate(0, 0.8, 0), 0x8a7a6a);
      case 'skull': {
        const parts = [colored(new G.SphereGeometry(0.9, 6, 5).translate(0, 0.9, 0), 0xf2ead8),
          colored(new G.ConeGeometry(0.25, 2.4, 5).rotateZ(1.2).translate(1.5, 1.6, 0), 0xf2ead8),
          colored(new G.ConeGeometry(0.25, 2.4, 5).rotateZ(-1.2).translate(-1.5, 1.6, 0), 0xf2ead8)];
        return mergeGeometries(parts);
      }
      case 'windmill': {
        const parts = [colored(new G.CylinderGeometry(0.3, 0.9, 12, 4).translate(0, 6, 0), 0x9a8a7a)];
        for (let i = 0; i < 4; i++) parts.push(colored(new G.BoxGeometry(0.4, 4, 0.1).translate(0, 2, 0).rotateZ(i * Math.PI / 2).translate(0, 12, 0.6), 0xd8d0c0));
        return mergeGeometries(parts);
      }
      case 'lamp': {
        const parts = [colored(new G.CylinderGeometry(0.15, 0.2, 7, 5).translate(0, 3.5, 0), 0x222230),
          colored(new G.SphereGeometry(0.6, 6, 5).translate(0, 7.2, 0), 0xfff2b0)];
        return mergeGeometries(parts);
      }
    }
    return null;
  }

  buildProps(group) {
    const rng = mulberry32(this.seed ^ 0xabc);
    const byType = {};
    const area = this.finishS;
    const count = Math.floor(area / 4);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const s = rng() * this.length;
      const st = STAGES[this.stageIndex(s)];
      const type = st.props[Math.floor(rng() * st.props.length)];
      if (type === 'building') continue; // los edificios van aparte
      const side = rng() < 0.5 ? -1 : 1;
      const far = type === 'grass' ? 6 + rng() * 60 : 8 + Math.pow(rng(), 1.6) * 230;
      const lat = side * (ROAD_HALF + far);
      if (st.beach && side < 0 && far > 30) continue;
      (byType[type] = byType[type] || []).push({ s, lat, r: rng() * Math.PI * 2, sc: 0.7 + rng() * 0.8 });
    }
    const v = new THREE.Vector3();
    for (const type in byType) {
      const geo = this.propGeometry(type);
      if (!geo) continue;
      const list = byType[type];
      const emissive = type === 'lamp';
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, emissive: emissive ? 0x553300 : 0x000000 });
      const inst = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((o, k) => {
        this.pos(o.s, o.lat, v);
        dummy.position.copy(v); dummy.position.y -= 0.3;
        dummy.rotation.set(0, o.r, 0);
        dummy.scale.setScalar(type === 'pine' && Math.abs(o.lat) > 60 ? o.sc * 1.8 : o.sc);
        dummy.updateMatrix();
        inst.setMatrixAt(k, dummy.matrix);
      });
      inst.castShadow = type !== 'grass';
      group.add(inst);
    }
    this.buildCity(group, rng);
  }

  buildCity(group, rng) {
    const s0 = this.stageBounds[STAGES.length - 1];
    const list = [];
    for (let s = s0 + 40; s < this.length; s += 14) {
      for (const side of [-1, 1]) {
        for (let row = 0; row < 3; row++) {
          if (rng() < 0.25) continue;
          const lat = side * (ROAD_HALF + 16 + row * 26 + rng() * 6);
          const h = 14 + Math.pow(rng(), 2) * (row === 0 ? 30 : 70) + row * 8;
          list.push({ s, lat, w: 10 + rng() * 8, d: 10 + rng() * 8, h, c: rng() });
        }
      }
    }
    if (!list.length) return;
    // textura de ventanas iluminadas
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) {
      if (rng() < 0.55) { ctx.fillStyle = rng() < 0.2 ? '#ff7ad9' : '#ffd88a'; ctx.fillRect(x, y, 4, 5); }
    }
    const win = new THREE.CanvasTexture(cv); win.wrapS = win.wrapT = THREE.RepeatWrapping; win.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3650, roughness: 0.8, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 2.2 });
    mat.onBeforeCompile = (sh) => {
      // escalamos el UV de las ventanas según el tamaño de cada edificio (instanceMatrix)
      sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_INSTANCING
          vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vEmissiveMapUv = vEmissiveMapUv * vec2(max(isc.x, isc.z) / 8.0, isc.y / 16.0);
        #endif`);
    };
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    const dummy = new THREE.Object3D(), v = new THREE.Vector3(), c = new THREE.Color();
    list.forEach((b, k) => {
      this.pos(b.s, b.lat, v);
      dummy.position.copy(v); dummy.position.y -= 1;
      dummy.rotation.set(0, this.yaw(b.s), 0);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix(); inst.setMatrixAt(k, dummy.matrix);
      c.setHSL(0.7 + b.c * 0.2, 0.25, 0.35 + b.c * 0.2); inst.setColorAt(k, c);
    });
    inst.castShadow = true;
    group.add(inst);
  }

  buildFences(group) {
    const posts = [];
    for (let s = 0; s < this.length; s += 5) {
      const st = STAGES[this.stageIndex(s)];
      if (!st.fence && s > 120 && s < this.finishS - 200) continue;
      posts.push(s);
    }
    const geo = new THREE.BoxGeometry(0.25, 1.4, 0.25).translate(0, 0.7, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.8 });
    const inst = new THREE.InstancedMesh(geo, mat, posts.length * 2);
    const railGeo = new THREE.BoxGeometry(0.12, 0.12, 5.05);
    const rails = new THREE.InstancedMesh(railGeo, mat, posts.length * 2);
    const dummy = new THREE.Object3D(), v = new THREE.Vector3();
    let k = 0;
    for (const s of posts) for (const side of [-1, 1]) {
      const lat = side * (ROAD_HALF + 2.5);
      this.pos(s, lat, v);
      dummy.position.copy(v); dummy.rotation.set(0, this.yaw(s), 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      inst.setMatrixAt(k, dummy.matrix);
      this.pos(s + 2.5, lat, v);
      dummy.position.copy(v); dummy.position.y += 1.15; dummy.rotation.set(0, this.yaw(s + 2.5), 0); dummy.updateMatrix();
      rails.setMatrixAt(k, dummy.matrix);
      k++;
    }
    group.add(inst, rails);
  }

  buildGates(group) {
    this.gates = [];
    const mk = (s, lines, bg1, bg2) => {
      const g = new THREE.Group();
      const v = this.pos(s, 0);
      g.position.copy(v);
      g.rotation.y = this.yaw(s);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.7 });
      for (const side of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 13, 8), postMat);
        p.position.set(side * (ROAD_HALF + 3), 6.5, 0); p.castShadow = true; g.add(p);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.8), new THREE.MeshStandardMaterial({ color: side < 0 ? 0xff3d7f : 0xffe14d, side: THREE.DoubleSide, emissive: side < 0 ? 0x550022 : 0x554400 }));
        flag.position.set(side * (ROAD_HALF + 3) + 1.5, 12, 0); flag.rotation.y = Math.PI / 2; g.add(flag);
        flag.userData.wave = true;
      }
      const tex = textCanvasTexture(lines, { bg1, bg2 });
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 + 6, 6.5), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }));
      banner.position.set(0, 10, 0);
      banner.rotation.y = Math.PI; // mirando hacia los jinetes que llegan
      g.add(banner);
      group.add(g);
      this.gates.push(g);
      return g;
    };
    mk(0.5, [{ text: 'STEEL BALL RUN', size: 110, color: '#ffe14d' }, { text: 'START  →  NEW YORK  6,000 km', size: 60 }]);
    for (let i = 1; i < STAGES.length; i++) {
      const st = STAGES[i];
      mk(this.stageBounds[i], [{ text: st.name, size: 100, color: '#ffe14d' }, { text: st.place, size: 64 }], '#0a3a6a', '#7a14d1');
    }
    mk(this.finishS, [{ text: 'GOAL!!', size: 130, color: '#ffe14d' }, { text: 'NEW YORK', size: 64 }], '#d1146b', '#ffb02e');
    // línea de meta a cuadros
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 32;
    const ctx = cv.getContext('2d');
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff'; ctx.fillRect(x * 16, y * 16, 16, 16); }
    const t = new THREE.CanvasTexture(cv);
    for (const s of [0.5, this.finishS]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 2), new THREE.MeshBasicMaterial({ map: t }));
      const v = this.pos(s, 0); line.position.copy(v); line.position.y = this.roadY(s) + 0.12;
      line.rotation.set(-Math.PI / 2, 0, -this.yaw(s) - Math.PI); // perpendicular al camino
      line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, this.yaw(s), 0);
      group.add(line);
    }
  }

  buildObstacles(group) {
    const rng = mulberry32(this.seed ^ 0x51ed);
    const geoRock = new THREE.DodecahedronGeometry(1, 0).scale(1.4, 0.9, 1.2);
    const geoLog = new THREE.CylinderGeometry(0.7, 0.7, 7, 8).rotateZ(Math.PI / 2);
    const geoWeed = new THREE.IcosahedronGeometry(1.1, 1);
    const matRock = new THREE.MeshStandardMaterial({ color: 0x7a6a5a, flatShading: true });
    const matLog = new THREE.MeshStandardMaterial({ color: 0x6a4420 });
    const matWeed = new THREE.MeshStandardMaterial({ color: 0xb8a060, wireframe: true });
    this.obstacleMeshes = [];
    for (let s = 260; s < this.finishS - 80; s += 55 + rng() * 75) {
      // evitamos las puertas de etapa
      if (this.stageBounds.some(b => Math.abs(b - s) < 40)) continue;
      const st = this.stageIndex(s);
      const r = rng();
      let type = r < 0.45 ? 'rock' : r < 0.75 ? 'log' : 'weed';
      if (STAGES[st].city) type = 'barrel';
      const lat = type === 'log' ? (rng() - 0.5) * 12 : (rng() - 0.5) * ROAD_HALF * 1.7;
      const o = { s, lat, type, w: type === 'log' ? 3.5 : 1.6, id: this.obstacles.length };
      this.obstacles.push(o);
      let mesh;
      if (type === 'rock') mesh = new THREE.Mesh(geoRock, matRock);
      else if (type === 'log') mesh = new THREE.Mesh(geoLog, matLog);
      else if (type === 'weed') mesh = new THREE.Mesh(geoWeed, matWeed);
      else mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 10), new THREE.MeshStandardMaterial({ color: 0xa8342a }));
      const v = this.pos(s, lat);
      mesh.position.copy(v); mesh.position.y = this.roadY(s) + (type === 'log' ? 0.6 : 0.8);
      mesh.rotation.y = this.yaw(s) + (type === 'log' ? (rng() - 0.5) * 0.3 : rng() * 6);
      mesh.castShadow = true;
      mesh.userData.obs = o;
      group.add(mesh);
      this.obstacleMeshes.push(mesh);
    }
  }

  buildParts(group) {
    const rng = mulberry32(this.seed ^ 0xc0de);
    const names = ['Corazón', 'Ojo izquierdo', 'Brazo derecho', 'Columna', 'Oreja', 'Pierna izquierda', 'Torso', 'Ojo derecho', 'Cabeza'];
    this.partMeshes = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const s = this.finishS * (0.06 + 0.9 * (i + rng() * 0.6) / n);
      const lat = (rng() - 0.5) * ROAD_HALF * 1.4;
      const part = { id: i, s, lat, name: names[i], taken: false };
      this.parts.push(part);
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffc23d, emissiveIntensity: 2.2, roughness: 0.3 }));
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.08, 6, 24), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.4, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd86b, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 20;
      g.add(core, halo, beam);
      const v = this.pos(s, lat); g.position.copy(v); g.position.y = this.roadY(s) + 2.2;
      g.userData = { part, core, halo };
      group.add(g);
      this.partMeshes.push(g);
    }
  }

  buildCrowd(group) {
    const rng = mulberry32(this.seed ^ 0x777);
    const zones = [[-30, 60], [this.finishS - 90, this.finishS + 40]];
    const list = [];
    for (const [a, b] of zones) for (let s = a; s < b; s += 1.6) for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
      if (rng() < 0.3) continue;
      list.push({ s: Math.max(0, s), lat: side * (ROAD_HALF + 4.5 + row * 1.4 + rng() * 0.6), c: rng(), h: 1.5 + rng() * 0.4 });
    }
    const geo = new THREE.CapsuleGeometry(0.35, 1, 2, 6).translate(0, 0.85, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    const dummy = new THREE.Object3D(), v = new THREE.Vector3(), c = new THREE.Color();
    list.forEach((o, k) => {
      this.pos(o.s, o.lat, v);
      dummy.position.copy(v); dummy.scale.set(1, o.h / 1.5, 1); dummy.updateMatrix();
      inst.setMatrixAt(k, dummy.matrix);
      c.setHSL(o.c, 0.7, 0.55); inst.setColorAt(k, c);
    });
    this.crowd = inst; this.crowdData = list;
    group.add(inst);
  }

  update(dt, time) {
    for (const g of this.partMeshes) {
      if (!g.visible) continue;
      g.userData.core.rotation.y += dt * 2;
      g.userData.halo.rotation.x = Math.sin(time * 2) * 0.5 + Math.PI / 2;
      g.userData.halo.rotation.z += dt;
      g.position.y = this.roadY(g.userData.part.s) + 2.2 + Math.sin(time * 3 + g.userData.part.id) * 0.3;
    }
    for (const gate of this.gates) gate.children.forEach(ch => { if (ch.userData.wave) ch.rotation.x = Math.sin(time * 4 + ch.position.x) * 0.25; });
    if (this.crowd) {
      // la multitud salta animada
      const dummy = this._d || (this._d = new THREE.Object3D()); const v = this._v || (this._v = new THREE.Vector3());
      for (let k = 0; k < this.crowdData.length; k += 1) {
        const o = this.crowdData[k];
        if ((k + Math.floor(time * 10)) % 3) continue;
        this.pos(o.s, o.lat, v);
        dummy.position.copy(v); dummy.position.y += Math.max(0, Math.sin(time * 9 + k)) * 0.5;
        dummy.scale.set(1, o.h / 1.5, 1); dummy.updateMatrix();
        this.crowd.setMatrixAt(k, dummy.matrix);
      }
      this.crowd.instanceMatrix.needsUpdate = true;
    }
  }

  // puntos 2D para el minimapa
  mapPoints(n = 200) {
    const out = [];
    for (let i = 0; i <= n; i++) { const s = this.finishS * i / n; const k = Math.floor(this.idx(s)); out.push([this.px[k], this.pz[k]]); }
    return out;
  }
}
