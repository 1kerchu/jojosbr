import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildProceduralRider } from './riders.js';
export { buildProceduralRider };

const BASE = import.meta.env.BASE_URL || './';
const loader = new GLTFLoader();
const loadGLB = (url) => new Promise((res) => loader.load(url, g => res(g), undefined, () => res(null)));

export const Assets = { horse: null, chars: {}, manifest: {} };

// Carga el caballo y los modelos de personaje que haya en public/models/manifest.json
export async function loadAssets(onProgress) {
  let manifest = {};
  try { manifest = await (await fetch(BASE + 'models/manifest.json')).json(); } catch (e) { manifest = {}; }
  Assets.manifest = manifest;
  const jobs = [];
  jobs.push(loadGLB(BASE + 'models/Horse.glb').then(g => { Assets.horse = g; onProgress && onProgress('Caballo'); }));
  for (const [id, cfg] of Object.entries(manifest.characters || {})) {
    jobs.push(Promise.all([loadGLB(BASE + 'models/' + cfg.file), cfg.stand ? loadGLB(BASE + 'models/' + cfg.stand) : null]).then(([g, st]) => {
      if (g) Assets.chars[id] = { gltf: g, cfg, stand: st }; onProgress && onProgress(id);
    }));
  }
  await Promise.all(jobs);
}

const toon = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...extra });

// ------------------------------------------------------------------ jinete low-poly

// pose sentado en el caballo
function poseSeated(rig, t, gallop) {
  const bob = Math.sin(t * gallop) * 0.06;
  rig.hips.position.y = bob;
  rig.hips.rotation.x = 0.25 + Math.sin(t * gallop + 1) * 0.05;
  rig.legL.rotation.set(-1.2, 0, 0.45); rig.legR.rotation.set(-1.2, 0, -0.45);
  rig.shinL.rotation.x = 1.5; rig.shinR.rotation.x = 1.5;
  rig.armL.rotation.set(-0.9 + Math.sin(t * gallop) * 0.1, 0, 0.2); rig.armR.rotation.set(-0.9 + Math.sin(t * gallop) * 0.1, 0, -0.2);
  rig.neck.rotation.x = -0.2;
  if (rig.foreL) { rig.foreL.rotation.x = -0.9; rig.foreR.rotation.x = -0.9; }
}
// pose corriendo a pie (Sandman)
function poseRunning(rig, t, speed) {
  const f = 1.2 + speed * 0.28;
  const a = Math.sin(t * f) * Math.min(1, speed / 15 + 0.2);
  rig.hips.position.y = Math.abs(Math.cos(t * f)) * 0.12;
  rig.hips.rotation.x = 0.35;
  rig.legL.rotation.set(a * 1.1 - 0.3, 0, 0.05); rig.legR.rotation.set(-a * 1.1 - 0.3, 0, -0.05);
  rig.shinL.rotation.x = Math.max(0, -a) * 1.4 + 0.3; rig.shinR.rotation.x = Math.max(0, a) * 1.4 + 0.3;
  rig.armL.rotation.set(-a * 1.2, 0, 0.15); rig.armR.rotation.set(a * 1.2, 0, -0.15);
  rig.neck.rotation.x = -0.3;
  if (rig.foreL) { rig.foreL.rotation.x = -1.3; rig.foreR.rotation.x = -1.3; }
}

// ------------------------------------------------------------------ fantasma del Stand
export function buildStand(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 10), mat); body.position.y = 1.2; g.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), mat); head.position.y = 2.15; g.add(head);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.9, 3, 8), mat); arm.position.set(s * 0.55, 1.4, 0.3); arm.rotation.x = -1.2; g.add(arm);
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat); fist.position.set(s * 0.55, 1.65, 0.85); g.add(fist);
  }
  const aura = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }));
  aura.position.y = 1.4; g.add(aura);
  g.visible = false;
  g.userData.mat = mat;
  return g;
}

// ------------------------------------------------------------------ dinosaurio (Scary Monsters)
function buildDino() {
  const g = new THREE.Group();
  const m = toon(0x6a9a3a, { flatShading: true }), belly = toon(0xd8c07a, { flatShading: true }), eye = toon(0xff3300, { emissive: 0xff2200, emissiveIntensity: 2 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8).scale(1, 0.9, 1.6), m); body.position.y = 2.2; g.add(body);
  const bel = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8).scale(0.9, 0.7, 1.4), belly); bel.position.set(0, 1.9, 0.15); g.add(bel);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 1.4, 8), m); neck.position.set(0, 3.1, 1.3); neck.rotation.x = 0.7; g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 1.5), m); head.position.set(0, 3.6, 2.1); g.add(head);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 1.2), belly); jaw.position.set(0, 3.2, 2.2); g.add(jaw);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), eye); e.position.set(s * 0.38, 3.8, 2.5); g.add(e); }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.2, 8), m); tail.position.set(0, 2.2, -2.6); tail.rotation.x = -Math.PI / 2 - 0.2; g.add(tail);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.6, 1.9, -0.2);
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 3, 6), m); th.position.y = -0.7; leg.add(th);
    const ft = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.7), belly); ft.position.set(0, -1.6, 0.2); leg.add(ft);
    g.add(leg); legs.push(leg);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.4, 3, 6), m); arm.position.set(s * 0.6, 2.4, 1.3); arm.rotation.x = -0.8; g.add(arm);
  }
  for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 4), toon(0x3a5a20)); sp.position.set(0, 3.0 - i * 0.12, 1.0 - i * 0.6); g.add(sp); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.legs = legs;
  g.visible = false;
  return g;
}

// ------------------------------------------------------------------ etiqueta con nombre
function nameSprite(text, color) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.font = '64px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 10; ctx.strokeStyle = '#000'; ctx.strokeText(text, 256, 50);
  ctx.fillStyle = color; ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
  sp.scale.set(0.15, 0.028, 1); sp.renderOrder = 10;
  return sp;
}

// ------------------------------------------------------------------ vista de un competidor
export class RiderView {
  constructor(char, name, isLocal) {
    this.char = char;
    this.group = new THREE.Group();
    this.body = new THREE.Group();   // se inclina con el giro
    this.group.add(this.body);
    this.onFoot = !char.horseColor;
    this.mixer = null;
    // caballo
    if (!this.onFoot && Assets.horse) {
      const src = Assets.horse.scene;
      const horse = SkeletonUtils.clone(src);
      // caja a partir de los vértices base (las morph targets del caballo inflan la caja automática)
      const box = new THREE.Box3();
      src.traverse(o => { if (o.isMesh) { const a = o.geometry.attributes.position; const bb = new THREE.Box3().setFromBufferAttribute(a); box.union(bb); } });
      const h = box.max.y - box.min.y;
      const sc = 2.3 / h;
      horse.scale.setScalar(sc);
      horse.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true;
          o.material = o.material.clone();
          o.material.color = new THREE.Color(char.horseColor);
          o.material.vertexColors = true;
          o.material.roughness = 0.8;
        }
      });
      this.body.add(horse);
      this.horse = horse;
      this.horseLen = (box.max.z - box.min.z) * sc;
      this.mixer = new THREE.AnimationMixer(horse);
      const clip = Assets.horse.animations[0];
      if (clip) { this.action = this.mixer.clipAction(clip); this.action.play(); this.action.time = Math.random() * clip.duration; }
      // silla de montar
      const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.8), toon(0x5a2a10));
      saddle.position.set(0, 1.42, -0.05); this.body.add(saddle);
      const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 1.0), toon(new THREE.Color(char.color).getHex()));
      blanket.position.set(0, 1.37, -0.05); this.body.add(blanket);
    }
    // jinete: modelo descargado o low-poly
    const custom = Assets.chars[char.id];
    this.riderRoot = new THREE.Group();
    if (custom && custom.cfg.mount) {
      // modelo que ya incluye caballo + jinete (p.ej. Johnny sobre Slow Dancer)
      if (this.horse) { this.horse.visible = false; this.mixer = null; this.body.children.slice().forEach(c => { if (c !== this.horse) this.body.remove(c); }); }
      const m = this.prepareModel(custom);
      this.body.add(m);
      this.mountModel = m;
      this.gallopRig = this.makeGallopRig(m, custom.cfg.gallop);
    } else if (custom) {
      const m = this.prepareModel(custom);
      const holder = new THREE.Group(); holder.add(m);
      if (!this.onFoot) holder.position.set(0, custom.cfg.seatY ?? 0.1, custom.cfg.seatZ ?? 0);
      this.riderRoot.add(holder);
      this.customHolder = holder;
      this.customModel = m;
    } else {
      this.rider = buildProceduralRider(char.look, char.id);
      this.riderRoot.add(this.rider);
      if (this.onFoot) this.rider.position.y = 1.0;
    }
    if (this.onFoot) { this.riderRoot.scale.setScalar(1.25); this.body.add(this.riderRoot); }
    else if (!this.mountModel) { this.riderRoot.position.set(0, 1.5, -0.05); this.body.add(this.riderRoot); }
    // Stand y forma de dinosaurio
    this.stand = buildStand(new THREE.Color(char.color));
    if (custom && custom.stand) {
      // Stand con modelo real (D4C): lo hacemos semitransparente y brillante
      this.stand.children.forEach(c => c.visible = false);
      const sm = SkeletonUtils.clone(custom.stand.scene);
      const ls = []; sm.traverse(o => { if (o.isLight || o.isCamera) ls.push(o); }); ls.forEach(l => l.parent.remove(l));
      const box = new THREE.Box3().setFromObject(custom.stand.scene);
      const sc = 2.4 / (box.max.y - box.min.y || 1);
      sm.scale.setScalar(sc); sm.position.y = -box.min.y * sc;
      const mats = [];
      sm.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.material = o.material.clone(); o.material.transparent = true; o.material.depthWrite = false; o.material.emissive = new THREE.Color(char.color); o.material.emissiveIntensity = 0.5; mats.push(o.material); } });
      this.stand.add(sm);
      this.stand.userData.mats = mats;
    }
    this.stand.position.set(0.9, this.onFoot ? 0.5 : 1.2, -1.4);
    this.group.add(this.stand);
    if (char.id === 'diego') { this.dino = buildDino(); this.body.add(this.dino); }
    // escudo (D4C / Hey Ya!)
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(2.6, 20, 14), new THREE.MeshBasicMaterial({ color: 0xff8be0, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true }));
    this.shield.position.y = 1.6; this.shield.visible = false; this.group.add(this.shield);
    if (!isLocal) { this.tag = nameSprite(name, char.color); this.tag.position.y = 4.2; this.group.add(this.tag); }
    this.standT = 0; this.t = Math.random() * 10;
  }

  // Clona y escala un modelo descargado, oculta partes sobrantes y lo sienta
  prepareModel(custom) {
    const cfg = custom.cfg;
    const m = SkeletonUtils.clone(custom.gltf.scene);
    const lights = []; m.traverse(o => { if (o.isLight || o.isCamera) lights.push(o); });
    lights.forEach(l => l.parent && l.parent.remove(l)); // algunos modelos de Sketchfab traen luces dentro
    m.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      const bones = o.isSkinnedMesh ? o.skeleton.bones.map(b => b.name) : [];
      if (cfg.hideSkinBone && bones.includes(cfg.hideSkinBone)) o.visible = false;
      if (cfg.keepSkinBone && !bones.includes(cfg.keepSkinBone)) o.visible = false;
      if (cfg.hideMesh && new RegExp(cfg.hideMesh).test(o.name)) o.visible = false;
    });
    const visBox = () => {
      m.updateMatrixWorld(true);
      const box = new THREE.Box3();
      m.traverse(o => { if (o.isMesh && o.visible) box.union(new THREE.Box3().setFromObject(o, true)); });
      return box;
    };
    // escala con la pose original (de pie)
    const box0 = visBox();
    const sc = (cfg.height || 1.75) / ((box0.max.y - box0.min.y) || 1);
    const wrap = new THREE.Group();
    wrap.add(m);
    if (cfg.legs && !this.onFoot) {
      this.poseSeated(m, cfg);
      // anclamos el punto medio de las caderas en el origen (= la silla)
      m.updateMatrixWorld(true);
      const byName = {}; m.traverse(o => { if (o.isBone) byName[o.name] = o; });
      const hip = new THREE.Vector3();
      cfg.legs.thighs.forEach(n => { const bn = byName[n]; if (bn) hip.add(bn.getWorldPosition(new THREE.Vector3()).multiplyScalar(0.5)); });
      m.position.set(-hip.x, -hip.y, -hip.z);
    } else {
      m.position.set(-(box0.min.x + box0.max.x) / 2, -box0.min.y, -(box0.min.z + box0.max.z) / 2);
    }
    wrap.scale.setScalar(sc);
    if (cfg.rotY) wrap.rotation.y = cfg.rotY;
    const outer = new THREE.Group(); outer.add(wrap);
    return outer;
  }

  // Orienta huesos hacia direcciones del espacio del modelo (+Z delante, +Y arriba) => postura de montar
  poseSeated(m, cfg) {
    const byName = {};
    m.traverse(o => { if (o.isBone) byName[o.name] = o; });
    const firstBoneChild = (b) => { let c = b.children.find(x => x.isBone); return c; };
    const endOf = (b, depth = 1) => { let e = b; for (let i = 0; i < depth; i++) { const c = firstBoneChild(e); if (!c) break; e = c; } return e; };
    const aim = (bone, end, dir) => {
      if (!bone || !end || bone === end) return;
      m.updateMatrixWorld(true);
      const bp = bone.getWorldPosition(new THREE.Vector3()), ep = end.getWorldPosition(new THREE.Vector3());
      const cur = ep.sub(bp); if (cur.lengthSq() < 1e-10) return; cur.normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize());
      const wq = bone.getWorldQuaternion(new THREE.Quaternion());
      const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
      bone.updateMatrixWorld(true);
    };
    const L = cfg.legs;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    [0, 1].forEach(i => {
      const sgn = i === 0 ? 1 : -1; // izquierda del personaje = +X mirando a +Z
      const th = byName[L.thighs[i]], kn = byName[L.knees[i]];
      aim(th, kn, V(sgn * 0.55, -0.22, 0.8));
      if (kn) aim(kn, endOf(kn, 1), V(sgn * 0.22, -1, -0.5));
    });
    // brazos: buscamos hombro->codo->muñeca por nombre
    const find = (re) => Object.values(byName).find(b => re.test(b.name));
    for (const side of [['Left', 1], ['Right', -1]]) {
      const [n, sgn] = side;
      const arm = find(new RegExp('^' + n + '[ _]arm(_1)?_', 'i'));
      const elbow = find(new RegExp('^' + n + '[ _]elbow(_1)?_', 'i'));
      const wrist = find(new RegExp('^' + n + '[ _]wrist', 'i'));
      if (arm && elbow) aim(arm, elbow, V(sgn * 0.3, -0.75, 0.55));
      if (elbow && wrist) aim(elbow, wrist, V(-sgn * 0.15, -0.25, 1));
    }
  }

  // Galope procedural para modelos con caballo incluido
  makeGallopRig(m, g) {
    if (!g) return null;
    const byName = {};
    m.traverse(o => { if (o.isBone) byName[o.name.replace(/_\d+$/, '')] = byName[o.name] = o; });
    m.updateMatrixWorld(true);
    const mk = (name, phase) => {
      const b = byName[name]; if (!b) { console.warn('gallop bone missing', name); return null; }
      const P = b.parent.getWorldQuaternion(new THREE.Quaternion());
      const Wm = m.getWorldQuaternion(new THREE.Quaternion());
      // P relativo al modelo
      const Prel = Wm.clone().invert().multiply(P);
      return { b, rest: b.quaternion.clone(), Prel, PrelInv: Prel.clone().invert(), phase };
    };
    const list = [];
    g.front.forEach((n, i) => { const r = mk(n, i * 0.6); if (r) list.push(r); });
    g.back.forEach((n, i) => { const r = mk(n, Math.PI + i * 0.6); if (r) list.push(r); });
    return list;
  }
  showStand(sec = 1.6) { this.standT = sec; }

  update(dt, st, track) {
    this.t += dt;
    const p = track.pos(st.s, st.lat);
    this.group.position.set(p.x, track.roadY(st.s) + track.sideHeight(st.s, st.lat) + (st.y || 0), p.z);
    const yaw = track.yaw(st.s) + (st.a || 0);
    this.group.rotation.y = yaw;
    // inclinación por la pendiente y el giro
    this.body.rotation.x = -Math.atan(track.slope(st.s)) * 0.8;
    this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, -(st.steer || 0) * 0.12, Math.min(1, dt * 6));
    const v = st.v || 0;
    const stun = st.stun > 0;
    if (stun) this.body.rotation.y += dt * 14; else this.body.rotation.y = THREE.MathUtils.lerp(this.body.rotation.y, 0, Math.min(1, dt * 8));
    if (this.mixer) {
      this.action.timeScale = Math.max(0.05, v / 22);
      this.mixer.update(dt);
    }
    if (this.gallopRig) {
      this.gph = (this.gph || 0) + dt * (2 + v * 0.32);
      const amp = Math.min(0.75, 0.1 + v / 45);
      const axis = new THREE.Vector3(1, 0, 0), q = new THREE.Quaternion();
      for (const r of this.gallopRig) {
        q.setFromAxisAngle(axis, Math.sin(this.gph + r.phase) * amp);
        r.b.quaternion.copy(r.PrelInv).multiply(q).multiply(r.Prel).multiply(r.rest);
      }
      this.mountModel.position.y = Math.abs(Math.sin(this.gph)) * 0.12 * Math.min(1, v / 20);
      this.mountModel.rotation.x = Math.sin(this.gph * 2) * 0.03 * Math.min(1, v / 20);
    }
    if (this.customHolder) this.customHolder.position.y = (this.customHolder.userData.baseY ??= this.customHolder.position.y) + Math.sin(this.t * (4 + v * 0.35)) * 0.05;
    const dino = !!st.dino;
    if (this.dino) {
      this.dino.visible = dino;
      if (this.horse) this.horse.visible = !dino;
      if (dino) { const ph = this.t * (1 + v * 0.2); this.dino.userData.legs.forEach((l, i) => l.rotation.x = Math.sin(ph + i * Math.PI) * 0.8); this.riderRoot.position.y = 3.15; this.riderRoot.position.z = 0.2; }
      else { this.riderRoot.position.y = 1.5; this.riderRoot.position.z = -0.05; }
    }
    if (this.rider) {
      const rig = this.rider.userData.rig;
      if (this.onFoot) poseRunning(rig, this.t, v);
      else poseSeated(rig, this.t, 4 + v * 0.35);
    }
    // Stand
    if (this.standT > 0) {
      this.standT -= dt;
      this.stand.visible = true;
      const k = Math.min(1, this.standT * 2, (1.6 - this.standT) * 4 + 0.2);
      this.stand.userData.mat.opacity = 0.55 * Math.max(0, k);
      if (this.stand.userData.mats) this.stand.userData.mats.forEach(mt => mt.opacity = 0.85 * Math.max(0, k));
      this.stand.position.y = (this.onFoot ? 0.5 : 1.2) + Math.sin(this.t * 3) * 0.15;
      this.stand.rotation.y = Math.sin(this.t * 2) * 0.2;
    } else this.stand.visible = false;
    this.shield.visible = st.shield > 0;
    if (this.shield.visible) { this.shield.rotation.y += dt * 2; this.shield.rotation.x += dt; }
  }

  dispose(scene) { scene.remove(this.group); }
}
