import * as THREE from 'three';

// Jinetes low-poly estilizados (cel shading + contorno de tinta + cara manga dibujada)
let gradient = null;
function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter; gradient.needsUpdate = true;
  return gradient;
}
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
const INK = new THREE.MeshBasicMaterial({ color: 0x0a0408, side: THREE.BackSide });

// añade una "cáscara" negra invertida para el contorno
function inked(mesh, k = 1.07) {
  const shell = new THREE.Mesh(mesh.geometry, INK);
  shell.scale.setScalar(k); shell.raycast = () => {};
  mesh.add(shell);
  mesh.castShadow = true;
  return mesh;
}
const part = (geo, mat, x = 0, y = 0, z = 0, k) => { const m = inked(new THREE.Mesh(geo, mat), k); m.position.set(x, y, z); return m; };
function limb(len, r0, r1, mat) {
  const g = new THREE.Group();
  const m = part(new THREE.CylinderGeometry(r0, r1, len, 8), mat, 0, -len / 2, 0, 1.12);
  const j = part(new THREE.SphereGeometry(r0, 8, 6), mat, 0, 0, 0, 1.12);
  g.add(m, j);
  return g;
}

// cara manga en canvas: ojos marcados, cejas, labios y sombras de "JoJo"
function faceTexture(look, id) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const x = cv.getContext('2d');
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  x.fillStyle = hex(look.skin); x.fillRect(0, 0, 512, 256);
  const cx = 128; // u = 0.25 → mira a +Z
  x.strokeStyle = '#140a0a'; x.fillStyle = '#140a0a'; x.lineCap = 'round';
  // ojos
  for (const sx of [-1, 1]) {
    const ex = cx + sx * 26;
    x.lineWidth = 5; x.beginPath(); x.moveTo(ex - 13, 118); x.quadraticCurveTo(ex, 108, ex + 13, 116); x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(ex, 124, 11, 6, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = id === 'hotpants' ? '#5a7ad8' : id === 'sandman' ? '#3a2a1a' : '#2a1a10';
    x.beginPath(); x.arc(ex + sx * 1, 124, 5, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#140a0a';
    // cejas gruesas en ángulo
    x.lineWidth = 7; x.beginPath(); x.moveTo(ex - 15 * sx * -1, 100 - (sx > 0 ? 0 : 0)); x.lineTo(ex + 14 * sx, 96 + (id === 'pocoloco' ? 0 : 6)); x.stroke();
  }
  // nariz y labios
  x.lineWidth = 3; x.beginPath(); x.moveTo(cx, 128); x.lineTo(cx - 5, 150); x.lineTo(cx + 2, 152); x.stroke();
  if (id === 'pocoloco') { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx, 172, 22, 10, 0, 0, Math.PI); x.fill(); x.lineWidth = 3; x.stroke(); }
  else {
    x.fillStyle = id === 'hotpants' ? '#c2406a' : '#7a3a3a';
    x.beginPath(); x.moveTo(cx - 14, 170); x.quadraticCurveTo(cx, 164, cx + 14, 170); x.quadraticCurveTo(cx, 180, cx - 14, 170); x.fill();
  }
  // trazos de sombra marcados en las mejillas
  x.globalAlpha = 0.35; x.lineWidth = 2;
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(cx + sx * (40 + i * 5), 150 + i * 6); x.lineTo(cx + sx * (48 + i * 5), 142 + i * 6); x.stroke(); }
  x.globalAlpha = 1;
  if (id === 'sandman') { // pintura de guerra
    x.fillStyle = '#d94b2b'; x.fillRect(cx - 50, 136, 22, 5); x.fillRect(cx + 28, 136, 22, 5);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildProceduralRider(look, id) {
  const root = new THREE.Group();
  const skin = toon(look.skin), shirt = toon(look.shirt), pants = toon(look.pants), hatM = toon(look.hatColor), acc = toon(look.accent), hairM = toon(look.hair);
  const boots = toon(id === 'hotpants' ? 0xf4f0ee : 0x3a2414), dark = toon(0x221a18);
  const hips = new THREE.Group(); root.add(hips);
  // torso con forma (más ancho de hombros)
  const torsoGeo = new THREE.CylinderGeometry(0.29, 0.21, 0.62, 10); torsoGeo.translate(0, 0.42, 0);
  const torso = part(torsoGeo, shirt); hips.add(torso);
  hips.add(part(new THREE.SphereGeometry(0.23, 10, 8), pants, 0, 0.08, 0)); // cadera
  const chest = part(new THREE.SphereGeometry(0.29, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), shirt, 0, 0.72, 0); chest.scale.set(1.05, 0.5, 0.75); hips.add(chest);
  hips.add(part(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 12), acc, 0, 0.16, 0)); // cinturón
  hips.add(part(new THREE.BoxGeometry(0.1, 0.08, 0.04), toon(0xd8c070), 0, 0.16, 0.24, 1.1)); // hebilla
  const neck = new THREE.Group(); neck.position.y = 0.8; hips.add(neck);
  neck.add(part(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 8), skin, 0, 0.04, 0, 1.1));
  // cabeza con cara dibujada
  const headMat = new THREE.MeshToonMaterial({ map: faceTexture(look, id), gradientMap: toonGradient() });
  const head = part(new THREE.SphereGeometry(0.19, 20, 16), headMat, 0, 0.23, 0, 1.06); head.scale.set(0.95, 1.1, 1); neck.add(head);
  const jaw = part(new THREE.SphereGeometry(0.13, 10, 8), skin, 0, 0.13, 0.04, 1.06); jaw.scale.set(1, 0.8, 1); neck.add(jaw);
  const extras = new THREE.Group(); extras.position.y = 0.23; neck.add(extras);

  switch (id) {
    case 'hotpants': {
      // capucha rosa con cruz y mechones plateados
      const hood = part(new THREE.SphereGeometry(0.235, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hatM); hood.rotation.x = -0.35; hood.position.set(0, 0.02, -0.02); extras.add(hood);
      const back = part(new THREE.ConeGeometry(0.2, 0.42, 10), hatM, 0, -0.18, -0.16); back.rotation.x = 2.6; extras.add(back);
      extras.add(part(new THREE.BoxGeometry(0.035, 0.16, 0.02), acc, 0, 0.13, 0.21, 1.15));
      extras.add(part(new THREE.BoxGeometry(0.11, 0.035, 0.02), acc, 0, 0.15, 0.205, 1.15));
      for (const sx of [-1, 1]) { const lock = part(new THREE.ConeGeometry(0.05, 0.22, 6), hairM, sx * 0.13, -0.02, 0.12); lock.rotation.z = sx * 0.3; lock.rotation.x = Math.PI; extras.add(lock); }
      // hombreras y bote de spray
      for (const sx of [-1, 1]) hips.add(part(new THREE.SphereGeometry(0.11, 8, 6), hatM, sx * 0.31, 0.72, 0));
      hips.add(part(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), toon(0xd0d0d8), 0.22, 0.14, -0.15));
      break;
    }
    case 'sandman': {
      // pelo largo negro, cinta con plumas y trenzas
      const hair = part(new THREE.SphereGeometry(0.205, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM); hair.position.y = 0.02; extras.add(hair);
      const mane = part(new THREE.CylinderGeometry(0.17, 0.12, 0.55, 10, 1, true, Math.PI * 0.6, Math.PI * 1.8), hairM, 0, -0.25, -0.06); extras.add(mane);
      for (const sx of [-1, 1]) { const br = part(new THREE.CylinderGeometry(0.035, 0.025, 0.5, 6), hairM, sx * 0.17, -0.3, 0.05); br.rotation.z = sx * 0.12; extras.add(br); extras.add(part(new THREE.SphereGeometry(0.04, 6, 5), acc, sx * 0.185, -0.55, 0.05)); }
      const band = part(new THREE.TorusGeometry(0.2, 0.025, 6, 20), acc, 0, 0.05, 0, 1.1); band.rotation.x = Math.PI / 2; extras.add(band);
      for (let i = 0; i < 3; i++) { const f = part(new THREE.ConeGeometry(0.035, 0.32, 5), toon(i === 1 ? 0xffffff : 0xd94b2b), -0.06 + i * 0.06, 0.2, -0.17); f.rotation.x = -0.5 + i * 0.1; extras.add(f); }
      // collar de cuentas y chaleco abierto
      const neckl = part(new THREE.TorusGeometry(0.17, 0.025, 6, 16), toon(0x2dd3c8), 0, 0.72, 0.02, 1.1); neckl.rotation.x = Math.PI / 2 - 0.3; hips.add(neckl);
      for (const sx of [-1, 1]) { const vest = part(new THREE.BoxGeometry(0.14, 0.55, 0.04), toon(0x8a5a2a), sx * 0.18, 0.45, 0.2); vest.rotation.y = sx * -0.35; hips.add(vest); }
      break;
    }
    case 'pocoloco': {
      // gorra roja con orejeras y visera, gran sonrisa
      const cap = part(new THREE.SphereGeometry(0.215, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), hatM); cap.position.y = 0.02; extras.add(cap);
      extras.add(part(new THREE.BoxGeometry(0.32, 0.025, 0.2), hatM, 0, 0.03, 0.24, 1.1));
      for (const sx of [-1, 1]) { const flap = part(new THREE.BoxGeometry(0.05, 0.2, 0.13), acc, sx * 0.2, -0.08, 0); extras.add(flap); }
      extras.add(part(new THREE.SphereGeometry(0.05, 8, 6), acc, 0, 0.23, 0));
      // pañuelo y tirantes
      const sc = part(new THREE.ConeGeometry(0.14, 0.18, 8), toon(0x2dd36f), 0, 0.64, 0.17); sc.rotation.x = Math.PI + 0.4; hips.add(sc);
      for (const sx of [-1, 1]) hips.add(part(new THREE.BoxGeometry(0.04, 0.6, 0.03), toon(0x5a3a1a), sx * 0.12, 0.45, 0.235));
      // Hey Ya! diminuto sobre el hombro
      const hy = new THREE.Group(); hy.position.set(0.32, 0.92, 0);
      hy.add(part(new THREE.SphereGeometry(0.08, 8, 6), toon(0xffe23d), 0, 0, 0));
      hy.add(part(new THREE.SphereGeometry(0.05, 8, 6), toon(0xffe23d), 0, 0.1, 0));
      hips.add(hy);
      break;
    }
    default: {
      const hair = part(new THREE.SphereGeometry(0.205, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM); hair.position.y = 0.02; extras.add(hair);
      const hat = part(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 16), hatM, 0, 0.1, 0); extras.add(hat);
      extras.add(part(new THREE.CylinderGeometry(0.16, 0.19, 0.2, 12), hatM, 0, 0.2, 0));
    }
  }
  // brazos con guantes, piernas con botas altas
  const armL = limb(0.32, 0.075, 0.065, shirt), armR = limb(0.32, 0.075, 0.065, shirt);
  armL.position.set(0.33, 0.74, 0); armR.position.set(-0.33, 0.74, 0);
  const foreL = limb(0.3, 0.06, 0.05, id === 'sandman' ? skin : shirt), foreR = limb(0.3, 0.06, 0.05, id === 'sandman' ? skin : shirt);
  foreL.position.y = -0.32; foreR.position.y = -0.32; armL.add(foreL); armR.add(foreR);
  for (const f of [foreL, foreR]) f.add(part(new THREE.SphereGeometry(0.06, 8, 6), id === 'sandman' ? skin : dark, 0, -0.32, 0));
  hips.add(armL, armR);
  const legL = limb(0.48, 0.1, 0.085, pants), legR = limb(0.48, 0.1, 0.085, pants);
  legL.position.set(0.13, 0.05, 0); legR.position.set(-0.13, 0.05, 0);
  const shinL = limb(0.46, 0.085, 0.07, id === 'sandman' ? pants : boots), shinR = limb(0.46, 0.085, 0.07, id === 'sandman' ? pants : boots);
  shinL.position.y = -0.48; shinR.position.y = -0.48;
  for (const sh of [shinL, shinR]) { const b = part(new THREE.BoxGeometry(0.13, 0.09, 0.27), id === 'sandman' ? toon(0xd8c8a0) : boots, 0, -0.48, 0.05); sh.add(b); }
  legL.add(shinL); legR.add(shinR);
  hips.add(legL, legR);
  root.userData.rig = { hips, torso, neck, armL, armR, legL, legR, shinL, shinR, foreL, foreR };
  return root;
}
