import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, smooth, clamp } from './util.js';

const ROAD_HALF = 14;

// ---------------------------------------------------------------- utilidades de geometría con color por vértice
function paint(geo, colorFn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position, n = pos.count, arr = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) { colorFn(c, pos.getX(i), pos.getY(i), pos.getZ(i)); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const solid = (geo, hex) => { const col = new THREE.Color(hex); return paint(geo, c => c.copy(col)); };
const place = (geo, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
  return geo.clone().applyMatrix4(m);
};
const lambert = (extra = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...extra });

// ---------------------------------------------------------------- paisaje lejano
function butte(rng) {
  const h = 1, segs = 7;
  const top = new THREE.CylinderGeometry(0.75, 0.95, h, segs, 6);
  const skirt = new THREE.CylinderGeometry(0.98, 1.6, 0.35, segs, 2).translate(0, -h / 2 - 0.17, 0);
  const geo = mergeGeometries([paint(top, (c, x, y) => { const band = Math.floor((y + 0.5) * 9) % 2; c.setHex(band ? 0xc4552c : 0xdb7a3e); if (y > 0.45) c.setHex(0xa9472a); }), paint(skirt, c => c.setHex(0xc96a3a))]);
  geo.translate(0, h / 2 + 0.35, 0);
  return geo;
}
function peak(snowLine) {
  const geo = new THREE.ConeGeometry(1, 1, 9, 5);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { // irregularidad
    const y = pos.getY(i); if (y > 0.49) continue;
    const k = 1 + (Math.sin(i * 12.9898) * 0.5) * 0.18;
    pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return paint(geo, (c, x, y) => { const t = y + 0.5; if (t > snowLine) c.setHex(0xf2f6ff); else c.setHex(t > snowLine - 0.12 ? 0x8d97a8 : 0x5b6476); }).translate(0, 0.5, 0);
}
function hill(colHex) {
  const geo = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const col = new THREE.Color(colHex), dark = col.clone().multiplyScalar(0.8);
  return paint(geo, (c, x, y) => c.copy(dark).lerp(col, y));
}

function buildDistant(track, group) {
  const rng = mulberry32(track.seed ^ 0x1d15);
  const parts = [];
  const v = new THREE.Vector3();
  const B = track.stageBounds;
  const add = (geo, s, lat, sx, sy, ry) => { track.pos(s, lat, v); parts.push(place(geo, v.x, track.roadY(s) - 6, v.z, ry, sx, sy, sx)); };
  // Monument Valley: mesetas rojas
  const bt = butte(rng);
  for (let s = B[1] - 400; s < B[2] + 200; s += 70 + rng() * 80) {
    const side = rng() < 0.5 ? -1 : 1;
    add(bt, s, side * (380 + rng() * 650), 40 + rng() * 70, 90 + rng() * 150, rng() * 6);
  }
  // Montañas Rocosas: picos nevados
  const pk = peak(0.62), pk2 = peak(0.5);
  for (let s = B[2] - 500; s < B[3] + 500; s += 50 + rng() * 60) {
    const side = rng() < 0.5 ? -1 : 1;
    const big = rng() < 0.5;
    add(big ? pk : pk2, s, side * (350 + rng() * 700), 160 + rng() * 260, 260 + rng() * 380, rng() * 6);
  }
  // colinas suaves en playa y llanuras
  const hl = hill(0x7f9a4a), hlg = hill(0xb9a85a), hlb = hill(0xb8a070);
  for (let s = 0; s < B[1]; s += 90 + rng() * 90) add(hlb, s, 330 + rng() * 500, 120 + rng() * 140, 40 + rng() * 60, 0);
  for (let s = B[3] - 300; s < B[4] + 200; s += 70 + rng() * 80) { const side = rng() < 0.5 ? -1 : 1; add(rng() < 0.5 ? hl : hlg, s, side * (330 + rng() * 600), 120 + rng() * 200, 25 + rng() * 50, 0); }
  // islas en el Pacífico
  for (let s = -200; s < B[1]; s += 260 + rng() * 300) add(hlb, s, -(700 + rng() * 500), 80 + rng() * 120, 30 + rng() * 40, 0);
  // skyline lejano de Nueva York
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  for (let s = B[4] - 100; s < track.length + 400; s += 25) for (const side of [-1, 1]) {
    if (rng() < 0.3) continue;
    track.pos(Math.min(s, track.length), side * (180 + rng() * 260), v);
    const h = 40 + Math.pow(rng(), 2) * 160;
    parts.push(place(paint(box, (c, x, y) => c.setHex(y > 0.98 ? 0x6a5a8a : 0x2a2440)), v.x, track.roadY(Math.min(s, track.length)) - 2, v.z, rng() * 3, 18 + rng() * 14, h, 18 + rng() * 14));
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), lambert({ flatShading: true }));
  group.add(mesh);
}

// ---------------------------------------------------------------- nubes
function cloudTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const x = cv.getContext('2d'), r = mulberry32(77);
  for (let i = 0; i < 22; i++) {
    const cx = 40 + r() * 176, cy = 50 + r() * 40, rad = 18 + r() * 34;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill();
  }
  // base más oscura, estilo anime
  const grd = x.createLinearGradient(0, 60, 0, 128); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(120,110,160,0.35)');
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = grd; x.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function buildClouds(track, group) {
  const rng = mulberry32(track.seed ^ 0xc10d), tex = cloudTexture(), v = new THREE.Vector3();
  track.clouds = [];
  for (let s = -300; s < track.length + 300; s += 45 + rng() * 60) {
    const p = track.params(clamp(s, 0, track.length));
    const mat = new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, depthWrite: false, opacity: 0.9 });
    mat.color.copy(p.skyBottom).lerp(new THREE.Color(0xffffff), 0.55);
    const sp = new THREE.Sprite(mat);
    track.pos(clamp(s, 0, track.length), (rng() - 0.5) * 1600, v);
    sp.position.set(v.x, track.roadY(clamp(s, 0, track.length)) + 170 + rng() * 200, v.z);
    const sc = 160 + rng() * 260; sp.scale.set(sc, sc * 0.45, 1);
    sp.userData.drift = 2 + rng() * 4;
    group.add(sp); track.clouds.push(sp);
  }
}

// ---------------------------------------------------------------- postes de telégrafo con cables
function buildTelegraph(track, group) {
  const posts = [], v = new THREE.Vector3(), lat = ROAD_HALF + 11;
  const end = track.stageBounds[4] - 50;
  for (let s = 30; s < end; s += 42) posts.push(s);
  const pole = mergeGeometries([solid(new THREE.CylinderGeometry(0.16, 0.22, 9, 6).translate(0, 4.5, 0), 0x5a4030), solid(new THREE.BoxGeometry(2.4, 0.18, 0.18).translate(0, 8.3, 0), 0x4a3424),
    solid(new THREE.CylinderGeometry(0.08, 0.08, 0.25, 5).translate(-1, 8.5, 0), 0x88c0d0), solid(new THREE.CylinderGeometry(0.08, 0.08, 0.25, 5).translate(1, 8.5, 0), 0x88c0d0)]);
  const inst = new THREE.InstancedMesh(pole, lambert(), posts.length);
  const d = new THREE.Object3D(), wire = [];
  const tops = posts.map(s => { track.pos(s, lat, v); return { x: v.x, y: track.groundY(s, lat) - 0.2, z: v.z, yaw: track.yaw(s) }; });
  tops.forEach((t, i) => { d.position.set(t.x, t.y, t.z); d.rotation.set(0, t.yaw, 0); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); });
  inst.castShadow = true; group.add(inst);
  for (let i = 0; i < tops.length - 1; i++) {
    const a = tops[i], b = tops[i + 1];
    for (const off of [-1, 1]) {
      const ax = a.x + Math.cos(a.yaw) * off, az = a.z - Math.sin(a.yaw) * off, bx = b.x + Math.cos(b.yaw) * off, bz = b.z - Math.sin(b.yaw) * off;
      const N = 5;
      for (let k = 0; k < N; k++) {
        const t0 = k / N, t1 = (k + 1) / N, sag = (t) => 4 * t * (1 - t) * 1.2;
        wire.push(ax + (bx - ax) * t0, a.y + 8.5 + (b.y - a.y) * t0 - sag(t0), az + (bz - az) * t0, ax + (bx - ax) * t1, a.y + 8.5 + (b.y - a.y) * t1 - sag(t1), az + (bz - az) * t1);
      }
    }
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x1a1414 })));
}

// ---------------------------------------------------------------- campamentos, carretas, vacas
function tentGeo(hex) { return solid(new THREE.ConeGeometry(2.2, 3.2, 4).translate(0, 1.6, 0), hex); }
function wagonGeo() {
  const parts = [solid(new THREE.BoxGeometry(2, 0.9, 4).translate(0, 1.3, 0), 0x7a4a26)];
  const cover = new THREE.CylinderGeometry(1.1, 1.1, 3.6, 10, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 1.75, 0);
  parts.push(solid(cover, 0xf0e6cc));
  for (const [x, z] of [[-1.05, -1.3], [1.05, -1.3], [-1.05, 1.3], [1.05, 1.3]]) parts.push(solid(new THREE.TorusGeometry(0.6, 0.08, 5, 12).rotateY(Math.PI / 2).translate(x, 0.65, z), 0x3a2414));
  return mergeGeometries(parts);
}
function barrelGeo() { return solid(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 8).translate(0, 0.55, 0), 0x8a5a2a); }
function hayGeo() { return solid(new THREE.CylinderGeometry(0.8, 0.8, 1.2, 10).rotateZ(Math.PI / 2).translate(0, 0.8, 0), 0xd8b84a); }
function cowGeo(spots) {
  const body = paint(new THREE.BoxGeometry(1, 1, 2.1).translate(0, 1.2, 0), (c, x, y, z) => c.setHex(spots && Math.sin(x * 9 + z * 5) > 0.3 ? 0x1a1a1a : (spots ? 0xf2f2f2 : 0x7a4a2a)));
  const parts = [body, solid(new THREE.BoxGeometry(0.6, 0.6, 0.7).translate(0, 1.5, 1.3), spots ? 0xf2f2f2 : 0x6a3a1a)];
  for (const [x, z] of [[-0.35, -0.8], [0.35, -0.8], [-0.35, 0.8], [0.35, 0.8]]) parts.push(solid(new THREE.BoxGeometry(0.2, 0.75, 0.2).translate(x, 0.37, z), 0x3a2a1a));
  return mergeGeometries(parts);
}

function buildCamps(track, group) {
  const rng = mulberry32(track.seed ^ 0xca39), v = new THREE.Vector3();
  const parts = [];
  track.fires = [];
  const tents = [tentGeo(0xf2ead2), tentGeo(0xd9c7a0), tentGeo(0xc94a3a)], wagon = wagonGeo(), barrel = barrelGeo(), hay = hayGeo();
  const camp = (s, side) => {
    const n = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const ls = s + (rng() - 0.5) * 50, lat = side * (ROAD_HALF + 14 + rng() * 30);
      track.pos(ls, lat, v); const y = track.groundY(ls, lat) - 0.1, yaw = track.yaw(ls);
      const r = rng();
      const g = r < 0.45 ? tents[Math.floor(rng() * 3)] : r < 0.7 ? wagon : r < 0.85 ? barrel : hay;
      parts.push(place(g, v.x, y, v.z, yaw + (rng() - 0.5) * 1.2));
    }
    // hoguera
    const ls = s, lat = side * (ROAD_HALF + 22);
    track.pos(ls, lat, v); const y = track.groundY(ls, lat);
    parts.push(place(solid(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 5).rotateZ(Math.PI / 2), 0x3a2414), v.x, y + 0.15, v.z, 0));
    parts.push(place(solid(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 5).rotateZ(Math.PI / 2), 0x3a2414), v.x, y + 0.15, v.z, Math.PI / 2));
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 6), new THREE.MeshBasicMaterial({ color: 0xffa23d }));
    fire.position.set(v.x, y + 0.7, v.z); group.add(fire); track.fires.push(fire);
  };
  // un campamento en cada salida de etapa y algunos sueltos por el camino
  for (let i = 1; i < 5; i++) { camp(track.stageBounds[i] + 25, -1); camp(track.stageBounds[i] + 25, 1); }
  for (let s = 250; s < track.stageBounds[4] - 100; s += 260 + rng() * 300) camp(s, rng() < 0.5 ? -1 : 1);
  // carretas sueltas al borde del camino
  for (let s = 150; s < track.stageBounds[4]; s += 180 + rng() * 260) {
    const lat = (rng() < 0.5 ? -1 : 1) * (ROAD_HALF + 6 + rng() * 6);
    track.pos(s, lat, v); parts.push(place(rng() < 0.6 ? wagon : barrel, v.x, track.groundY(s, lat) - 0.1, v.z, track.yaw(s) + (rng() - 0.5) * 0.4));
  }
  // rebaños de vacas en las llanuras
  const cows = [cowGeo(false), cowGeo(true)];
  for (let s = track.stageBounds[3] + 60; s < track.stageBounds[4] - 60; s += 140 + rng() * 120) {
    const side = rng() < 0.5 ? -1 : 1, base = side * (ROAD_HALF + 25 + rng() * 60), cg = cows[rng() < 0.5 ? 0 : 1];
    for (let k = 0; k < 6 + rng() * 8; k++) {
      const ls = s + (rng() - 0.5) * 40, lat = base + (rng() - 0.5) * 30;
      track.pos(ls, lat, v); parts.push(place(cg, v.x, track.groundY(ls, lat) - 0.05, v.z, rng() * 6, 1.1));
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), lambert({ flatShading: true }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
}

// ---------------------------------------------------------------- vía y tren de vapor en las Grandes Llanuras
function buildTrain(track, group) {
  const s0 = track.stageBounds[3] - 200, s1 = track.stageBounds[4] - 100, lat = ROAD_HALF + 70;
  const v = new THREE.Vector3(), rail = [], sleepers = [];
  for (let s = s0; s < s1; s += 3) {
    for (const off of [-0.8, 0.8]) {
      track.pos(s, lat + off, v); const a = [v.x, track.groundY(s, lat) + 0.25, v.z];
      track.pos(s + 3, lat + off, v); rail.push(...a, v.x, track.groundY(s + 3, lat) + 0.25, v.z);
    }
    sleepers.push(s);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(rail, 3));
  group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x333333 })));
  const sg = solid(new THREE.BoxGeometry(2.4, 0.15, 0.4), 0x4a3424);
  const inst = new THREE.InstancedMesh(sg, lambert(), sleepers.length), d = new THREE.Object3D();
  sleepers.forEach((s, i) => { track.pos(s, lat, v); d.position.set(v.x, track.groundY(s, lat) + 0.1, v.z); d.rotation.set(0, track.yaw(s), 0); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); });
  group.add(inst);
  // locomotora + vagones
  const loco = mergeGeometries([
    solid(new THREE.CylinderGeometry(0.9, 0.9, 4.2, 12).rotateX(Math.PI / 2).translate(0, 1.9, 0.6), 0x1e1e24),
    solid(new THREE.BoxGeometry(2, 2.4, 1.8).translate(0, 2.2, -2.1), 0x8a1e1e),
    solid(new THREE.BoxGeometry(2.3, 0.2, 2.2).translate(0, 3.5, -2.1), 0x1e1e24),
    solid(new THREE.CylinderGeometry(0.3, 0.45, 1.3, 8).translate(0, 3.3, 2), 0x1e1e24),
    solid(new THREE.ConeGeometry(1, 0.9, 4).rotateX(-Math.PI / 2).translate(0, 0.8, 3.1), 0xc9a23a),
    solid(new THREE.BoxGeometry(2.1, 0.5, 6.4).translate(0, 0.8, 0), 0x2a2a2a),
    solid(new THREE.SphereGeometry(0.25, 8, 6).translate(0, 2.4, 2.75), 0xfff2a0)
  ]);
  const car = mergeGeometries([solid(new THREE.BoxGeometry(2.2, 2.2, 5.5).translate(0, 1.9, 0), 0x6a3a22), solid(new THREE.BoxGeometry(2.4, 0.2, 5.7).translate(0, 3.05, 0), 0x2a1a12), solid(new THREE.BoxGeometry(2.1, 0.5, 5.5).translate(0, 0.6, 0), 0x2a2a2a)]);
  const mat = lambert();
  const train = new THREE.Group();
  const cars = [new THREE.Mesh(loco, mat)];
  for (let i = 0; i < 5; i++) cars.push(new THREE.Mesh(car, mat));
  cars.forEach(c => { c.castShadow = true; group.add(c); });
  const tex = cloudTexture();
  const smoke = [];
  for (let i = 0; i < 40; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xd8d8d8, opacity: 0 })); sp.userData.life = 0; group.add(sp); smoke.push(sp); }
  track.train = { cars, s: s0 + 100, s0, s1, lat, smoke, si: 0, t: 0 };
}

// ---------------------------------------------------------------- matas rodantes (desierto)
function buildTumbleweeds(track, group) {
  const g = new THREE.IcosahedronGeometry(0.9, 1);
  const m = new THREE.MeshLambertMaterial({ color: 0xa88a50, wireframe: true });
  track.weeds = [];
  for (let i = 0; i < 18; i++) {
    const w = new THREE.Mesh(g, m);
    w.userData = { s: track.stageBounds[1] + Math.random() * (track.stageBounds[2] - track.stageBounds[1]), lat: (Math.random() - 0.5) * 120, sp: 4 + Math.random() * 6, dir: Math.random() < 0.5 ? -1 : 1 };
    group.add(w); track.weeds.push(w);
  }
}

export function buildScenery(track, group) {
  buildDistant(track, group);
  buildClouds(track, group);
  buildTelegraph(track, group);
  buildCamps(track, group);
  buildTrain(track, group);
  buildTumbleweeds(track, group);
}

const _v = new THREE.Vector3();
export function updateScenery(track, dt, time) {
  for (const f of track.fires || []) { const k = 0.8 + Math.sin(time * 17 + f.position.x) * 0.15 + Math.random() * 0.1; f.scale.set(k, 0.8 + Math.random() * 0.5, k); }
  for (const c of track.clouds || []) c.position.x += c.userData.drift * dt;
  for (const w of track.weeds || []) {
    const u = w.userData; u.lat += u.sp * u.dir * dt;
    if (Math.abs(u.lat) > 90) u.dir *= -1;
    track.pos(u.s, u.lat, _v); w.position.set(_v.x, track.groundY(u.s, u.lat) + 0.9 + Math.abs(Math.sin(time * 3 + u.s)) * 0.6, _v.z);
    w.rotation.x += u.sp * dt * 0.8 * u.dir; w.rotation.z += dt;
  }
  const tr = track.train;
  if (tr) {
    tr.s += 30 * dt; if (tr.s > tr.s1) tr.s = tr.s0 + 40;
    tr.cars.forEach((c, i) => {
      const s = tr.s - i * 6.4; const ok = s > tr.s0 && s < tr.s1; c.visible = ok; if (!ok) return;
      track.pos(s, tr.lat, _v); c.position.set(_v.x, track.groundY(s, tr.lat) + 0.2, _v.z); c.rotation.y = track.yaw(s);
    });
    tr.t -= dt;
    if (tr.t <= 0 && tr.cars[0].visible) {
      tr.t = 0.12; const sp = tr.smoke[tr.si = (tr.si + 1) % tr.smoke.length];
      const c = tr.cars[0]; sp.position.set(c.position.x + Math.sin(c.rotation.y) * 2, c.position.y + 4.2, c.position.z + Math.cos(c.rotation.y) * 2);
      sp.userData.life = 2.5; sp.scale.set(2, 1.2, 1);
    }
    for (const sp of tr.smoke) {
      if (sp.userData.life <= 0) { sp.material.opacity = 0; continue; }
      sp.userData.life -= dt; sp.position.y += 2.5 * dt; sp.scale.multiplyScalar(1 + dt * 0.9);
      sp.material.opacity = Math.max(0, sp.userData.life / 2.5) * 0.7;
    }
  }
}
