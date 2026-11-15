import * as THREE from 'three';
import { RiderView } from './entities.js';
import { charById } from './characters.js';

// Vista 3D giratoria del jinete elegido en el lobby
const fakeTrack = { pos: (s, lat, o = new THREE.Vector3()) => o.set(0, 0, 0), roadY: () => 0, sideHeight: () => 0, yaw: () => 0, slope: () => 0 };

export class Preview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    this.scene.add(new THREE.HemisphereLight(0xfff0ff, 0x553366, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(4, 7, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff5fd2, 2.2); rim.position.set(-5, 3, -5); this.scene.add(rim);
    this.rimLight = rim;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshStandardMaterial({ color: 0x2a0a4a, roughness: 0.6 }));
    disc.rotation.x = -Math.PI / 2; disc.receiveShadow = true; this.scene.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.1, 3.3, 64), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; this.scene.add(ring);
    this.ring = ring;
    this.pivot = new THREE.Group(); this.scene.add(this.pivot);
    this.view = null; this.t = 0; this.running = false;
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
  }
  setChar(id) {
    const c = charById(id);
    if (this.view) this.pivot.remove(this.view.group);
    this.view = new RiderView(c, c.name, true);
    this.view.showStand(1);
    this.pivot.add(this.view.group);
    this.rimLight.color.set(c.color);
    this.ring.material.color.set(c.color);
    this.st = { s: 0, lat: 0, a: 0, v: 9, y: 0, steer: 0 };
  }
  start() { if (!this.running) { this.running = true; this.clock.getDelta(); requestAnimationFrame(this.loop); } }
  stop() { this.running = false; }
  loop() {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.floor(w * this.renderer.getPixelRatio())) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    this.pivot.rotation.y = this.t * 0.5;
    if (this.view) {
      this.view.update(dt, this.st, fakeTrack);
      this.view.group.position.set(0, 0, 0);
      this.view.group.rotation.y = 0;
      this.view.standT = 1.0; // el Stand siempre visible en la vista previa
    }
    const onFoot = this.view && this.view.onFoot;
    this.camera.position.set(0, onFoot ? 2.2 : 2.8, onFoot ? 7 : 9.5);
    this.camera.lookAt(0, onFoot ? 1.3 : 1.7, 0);
    this.renderer.render(this.scene, this.camera);
  }
  dispose() { this.stop(); this.renderer.dispose(); }
}
