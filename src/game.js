import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { MangaPass } from './mangapass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Track, STAGES, ROAD_HALF, LAT_LIMIT } from './track.js';
import { RiderView } from './entities.js';
import { charById } from './characters.js';
import { audio } from './audio.js';
import { clamp, lerp, ordinal, fmtTime, mulberry32 } from './util.js';

const STAGE_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
const PART_POINTS = 3;
const SEND_RATE = 1 / 20;

const $ = (id) => document.getElementById(id);

export class Game {
  constructor(net, opts) {
    this.net = net;
    this.opts = opts; // { seed, length, players:[{id,name,char,bot}], myId, onExit }
    this.myId = opts.myId;
    this.players = new Map();
    this.projectiles = [];
    this.time = 0;
    this.raceTime = -4; // cuenta atrás
    this.state = 'countdown';
    this.sendT = 0;
    this.keys = {};
    this.camMode = 0;
    this.shake = 0;
    this.endTimer = null;
    this.events = [];
    this.initRenderer();
    this.track = new Track(opts.seed, opts.length);
    this.track.build(this.scene);
    this.initSky();
    this.initParticles();
    this.initPlayers(opts.players);
    this.initInput();
    this.initNet();
    this.initHud();
    this.lastCount = 4;
    this.introCard();
    this.clock = new THREE.Clock();
    this.running = true;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    window.__game = this;
  }

  // ------------------------------------------------------------------ render
  initRenderer() {
    const canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xffd9e8, 160, 1300);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.3, 4000);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a6a4a, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);
    this.composer = new EffectComposer(this.renderer);
    this.manga = new MangaPass(this.scene, this.camera);
    this.composer.addPass(this.manga);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.45, 1.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight); this.composer.setSize(window.innerWidth, window.innerHeight);
      const sl = $('speedlines'); sl.width = window.innerWidth; sl.height = window.innerHeight;
    };
    window.addEventListener('resize', this.onResize);
  }

  initSky() {
    const geo = new THREE.SphereGeometry(3000, 32, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 0.3, 1).normalize() }, sunCol: { value: new THREE.Color() }, time: { value: 0 }, night: { value: 0 } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float time; uniform float night; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
        void main(){
          float y = clamp(vP.y*1.6+0.15, 0.0, 1.0);
          vec3 c = mix(bottom, top, pow(y, 0.7));
          float sd = max(dot(normalize(vP), normalize(sunDir)), 0.0);
          c += sunCol * (pow(sd, 600.0)*3.0 + pow(sd, 12.0)*0.35);
          // rayos tipo manga alrededor del sol
          float ang = atan(vP.z - sunDir.z, vP.x - sunDir.x);
          c += sunCol * 0.06 * step(0.5, fract(ang*8.0/3.14159 + time*0.02)) * pow(sd, 4.0);
          vec3 q = floor(vP*300.0);
          float st = step(0.9975, h(q)) * night * y;
          c += vec3(st);
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.scene.add(this.sky);
  }

  initParticles() {
    const N = 1600;
    this.pN = N; this.pI = 0;
    this.pPos = new Float32Array(N * 3); this.pVel = new Float32Array(N * 3); this.pLife = new Float32Array(N); this.pCol = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    this.particles = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4, map: tex, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.8 }));
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    this.glow = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.9, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const M = 600; this.gN = M; this.gI = 0;
    this.gPos = new Float32Array(M * 3); this.gVel = new Float32Array(M * 3); this.gLife = new Float32Array(M); this.gCol = new Float32Array(M * 3);
    this.glow.geometry.setAttribute('position', new THREE.BufferAttribute(this.gPos, 3));
    this.glow.geometry.setAttribute('color', new THREE.BufferAttribute(this.gCol, 3));
    this.glow.frustumCulled = false;
    this.scene.add(this.glow);
  }
  dust(pos, color, n = 1, spread = 1) {
    for (let k = 0; k < n; k++) {
      const i = this.pI = (this.pI + 1) % this.pN;
      this.pPos[i * 3] = pos.x + (Math.random() - 0.5) * spread; this.pPos[i * 3 + 1] = pos.y + 0.2; this.pPos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * spread;
      this.pVel[i * 3] = (Math.random() - 0.5) * 3; this.pVel[i * 3 + 1] = 1 + Math.random() * 2.5; this.pVel[i * 3 + 2] = (Math.random() - 0.5) * 3;
      this.pLife[i] = 0.8 + Math.random() * 0.6;
      this.pCol[i * 3] = color.r; this.pCol[i * 3 + 1] = color.g; this.pCol[i * 3 + 2] = color.b;
    }
  }
  sparks(pos, color, n = 30, speed = 10) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.gI = (this.gI + 1) % this.gN;
      this.gPos[i * 3] = pos.x; this.gPos[i * 3 + 1] = pos.y; this.gPos[i * 3 + 2] = pos.z;
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI - Math.PI / 2;
      this.gVel[i * 3] = Math.cos(th) * Math.cos(ph) * speed; this.gVel[i * 3 + 1] = Math.abs(Math.sin(ph)) * speed; this.gVel[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * speed;
      this.gLife[i] = 0.6 + Math.random() * 0.6;
      this.gCol[i * 3] = c.r; this.gCol[i * 3 + 1] = c.g; this.gCol[i * 3 + 2] = c.b;
    }
  }
  updateParticles(dt) {
    for (let i = 0; i < this.pN; i++) {
      if (this.pLife[i] <= 0) { this.pPos[i * 3 + 1] = -9999; continue; }
      this.pLife[i] -= dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt; this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt; this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      this.pVel[i * 3 + 1] -= 2 * dt;
    }
    for (let i = 0; i < this.gN; i++) {
      if (this.gLife[i] <= 0) { this.gPos[i * 3 + 1] = -9999; continue; }
      this.gLife[i] -= dt;
      this.gPos[i * 3] += this.gVel[i * 3] * dt; this.gPos[i * 3 + 1] += this.gVel[i * 3 + 1] * dt; this.gPos[i * 3 + 2] += this.gVel[i * 3 + 2] * dt;
      this.gVel[i * 3 + 1] -= 12 * dt;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;
    this.glow.geometry.attributes.position.needsUpdate = true;
    this.glow.geometry.attributes.color.needsUpdate = true;
  }

  // ------------------------------------------------------------------ jugadores
  newState(i, n) {
    const row = Math.floor(i / 4), col = i % 4;
    return {
      s: 2 - row * 7, lat: (col - 1.5) * 6.5, a: 0, v: 0, y: 0, vy: 0, steer: 0,
      stamina: 1, exhausted: false, charge: 0.4, cond: 1, spinCd: 0,
      eff: { slow: 0, stun: 0, blind: 0, boost: 0, dino: 0, shield: 0 },
      stun: 0, dino: 0, shield: 0
    };
  }
  initPlayers(list) {
    list.forEach((p, i) => this.addPlayer(p, i, list.length));
  }
  addPlayer(p, i, n) {
    const char = charById(p.char);
    const isLocal = p.id === this.myId;
    const sim = isLocal || (p.bot && this.net.isHost);
    const pl = {
      id: p.id, name: p.name, char, bot: !!p.bot, isLocal, sim,
      st: this.newState(i, n), view: new RiderView(char, p.name, isLocal),
      finished: false, finishTime: null, splits: [], parts: 0, lastObs: -1, ramCD: {},
      skill: p.bot ? (p.skill || 0.95) : 1, ai: p.bot ? { laneT: 0, lane: 0, sprintT: 0, abilityDelay: 2 + Math.random() * 4 } : null,
      target: null, nextStage: 1
    };
    pl.st.s = Math.max(-26, pl.st.s);
    this.scene.add(pl.view.group);
    this.players.set(p.id, pl);
    if (isLocal) this.me = pl;
    return pl;
  }

  // ------------------------------------------------------------------ entrada
  initInput() {
    this.onKey = (e, down) => {
      const k = e.code;
      this.keys[k] = down;
      if (down && !e.repeat && (k === 'KeyQ' || k === 'KeyR')) this.spinPress();
      if (down && k === 'KeyC') this.camMode = (this.camMode + 1) % 3;
      if (down && k === 'KeyM') { audio.setMuted(!audio.muted); }
      if (down && k === 'KeyV') { audio.voicesOn = !audio.voicesOn; this.toast(audio.voicesOn ? '🗣️ Voces activadas' : '🔇 Voces desactivadas'); }
      if (down && k === 'Escape') this.togglePause();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    };
    this.kd = e => this.onKey(e, true); this.ku = e => this.onKey(e, false);
    window.addEventListener('keydown', this.kd); window.addEventListener('keyup', this.ku);
    // controles táctiles
    this.touch = { steer: 0, up: false, jump: false, sprint: false, ability: false, down: false };
    document.querySelectorAll('[data-touch]').forEach(btn => {
      const key = btn.dataset.touch;
      const set = (v) => (e) => { e.preventDefault(); if (key === 'spin') { if (v) this.spinPress(); return; } if (key === 'left') this.touch.steer = v ? -1 : 0; else if (key === 'right') this.touch.steer = v ? 1 : 0; else this.touch[key] = v; };
      btn.addEventListener('touchstart', set(true), { passive: false }); btn.addEventListener('touchend', set(false), { passive: false });
      btn.addEventListener('mousedown', set(true)); btn.addEventListener('mouseup', set(false)); btn.addEventListener('mouseleave', set(false));
    });
    // mando
    this.pad = () => { const g = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null; return g; };
  }
  readInput() {
    const k = this.keys, t = this.touch, g = this.pad();
    let steer = (k.KeyA || k.ArrowLeft ? -1 : 0) + (k.KeyD || k.ArrowRight ? 1 : 0) + t.steer;
    let up = !!(k.KeyW || k.ArrowUp || t.up), down = !!(k.KeyS || k.ArrowDown || t.down);
    let jump = !!(k.Space || t.jump), sprint = !!(k.ShiftLeft || k.ShiftRight || t.sprint), ability = !!(k.KeyE || k.KeyF || t.ability);
    if (g) {
      const ax = g.axes[0] || 0; if (Math.abs(ax) > 0.15) steer += ax;
      up = up || g.buttons[7]?.pressed || g.buttons[0]?.pressed && false || (g.axes[1] < -0.5);
      if (g.buttons[7]?.value > 0.2) up = true;
      down = down || g.buttons[6]?.value > 0.2;
      const lb = !!g.buttons[4]?.pressed; if (lb && !this._lb) this.spinPress(); this._lb = lb;
      jump = jump || g.buttons[0]?.pressed; sprint = sprint || g.buttons[5]?.pressed || g.buttons[1]?.pressed; ability = ability || g.buttons[2]?.pressed || g.buttons[3]?.pressed;
    }
    return { steer: clamp(steer, -1, 1), up, down, jump, sprint, ability };
  }

  togglePause() {
    const el = $('pause'); el.classList.toggle('hidden');
  }

  // ------------------------------------------------------------------ red
  initNet() {
    const net = this.net;
    net.on('st', (m, from) => { const p = this.players.get(m.id); if (p && !p.sim) this.applyRemote(p, m.d); });
    net.on('snap', (m) => {
      for (const id in m.d) { const p = this.players.get(id); if (p && !p.sim) this.applyRemote(p, m.d[id]); }
    });
    net.on('ev', (m, from) => { if (net.isHost) net.broadcast(m, from); this.onEvent(m); });
    net.on('pickreq', (m) => { if (net.isHost) this.grantPart(m.part, m.by); });
    net.on('picked', (m) => this.onPicked(m.part, m.by));
    net.on('end', () => this.showResults());
    net.on('leave', (m) => { const p = this.players.get(m.id); if (p) { this.toast(`${p.name} se ha desconectado`); p.view.dispose(this.scene); this.players.delete(m.id); } });
    net.on('hostlost', () => { this.toast('Se perdió la conexión con el anfitrión'); });
  }
  pack(p) {
    const s = p.st;
    const flags = (s.eff.dino > 0 ? 1 : 0) | (s.eff.shield > 0 ? 2 : 0) | (s.eff.stun > 0 ? 4 : 0) | (p.finished ? 8 : 0);
    return [+s.s.toFixed(2), +s.lat.toFixed(2), +s.a.toFixed(3), +s.v.toFixed(2), +s.y.toFixed(2), flags, +s.steer.toFixed(2), p.parts];
  }
  applyRemote(p, d) {
    p.target = { s: d[0], lat: d[1], a: d[2], v: d[3], y: d[4], flags: d[5], steer: d[6], t: this.time };
    p.parts = d[7] || p.parts;
    if (!p.inited) { Object.assign(p.st, { s: d[0], lat: d[1] }); p.inited = true; }
  }
  sendEvent(ev) { this.onEvent(ev); this.net.broadcast({ t: 'ev', ...ev }); }

  onEvent(m) {
    const p = this.players.get(m.id) || this.players.get(m.by);
    switch (m.k) {
      case 'fire': this.spawnProjectile(m); break;
      case 'fx': this.playFx(m); break;
      case 'hit': {
        const tgt = this.players.get(m.target);
        if (tgt && tgt.sim) this.applyHit(tgt, m.eff, m.dur, m.by);
        if (tgt) {
          const wp = tgt.view.group.position.clone(); wp.y += 2;
          this.sparks(wp, m.color || '#ffffff', 40, 12);
          if (tgt.isLocal || (this.me && this.distTo(tgt) < 120)) this.popWorld(m.word || 'DORA!', wp, m.color || '#ff3d7f');
        }
        break;
      }
      case 'blocked': { const tgt = this.players.get(m.target); if (tgt) this.popWorld('BLOCKED!', tgt.view.group.position.clone().setY(tgt.view.group.position.y + 3), '#ff8be0'); break; }
      case 'finish': {
        const fp = this.players.get(m.id); if (!fp) break;
        if (!fp.finished) { fp.finished = true; fp.finishTime = m.time; }
        if (!fp.isLocal) this.toast(`🏁 ${fp.name} ha llegado a Nueva York (${fmtTime(m.time)})`);
        this.checkEnd();
        break;
      }
      case 'split': {
        const sp = this.players.get(m.id); if (!sp) break;
        sp.splits[m.stage] = m.time;
        break;
      }
    }
  }
  distTo(p) { return Math.abs(p.st.s - this.me.st.s); }

  // ------------------------------------------------------------------ habilidades
  useAbility(p) {
    const st = p.st, ab = p.char.ability;
    if (st.charge < 1 || st.eff.stun > 0 || p.finished) return false;
    st.charge = 0;
    const base = { id: p.id, by: p.id };
    this.sendEvent({ ...base, k: 'fx', kind: ab.id });
    switch (ab.id) {
      case 'nails':
        for (const off of [-0.07, 0, 0.07]) this.sendEvent({ ...base, k: 'fire', kind: 'nail', s: st.s + 2, lat: st.lat, y: st.y + 1.8, a: st.a + off, pid: Math.random().toString(36).slice(2) });
        break;
      case 'steelball': {
        const tgt = this.nearestAhead(p, 300);
        this.sendEvent({ ...base, k: 'fire', kind: 'ball', s: st.s + 2, lat: st.lat + 0.6, y: st.y + 1.9, a: st.a, target: tgt ? tgt.id : null, pid: Math.random().toString(36).slice(2) });
        break;
      }
      case 'dino': st.eff.dino = 5; break;
      case 'd4c': st.s = Math.min(st.s + 70, this.track.finishS - 1); st.eff.shield = 3; break;
      case 'cream':
        for (const o of this.players.values()) {
          if (o === p) continue; const ds = o.st.s - st.s;
          if (ds < 2 && ds > -60 && Math.abs(o.st.lat - st.lat) < 16) this.hitOther(p, o, 'blind', 3, '#ffb3c9', 'SPLAT!');
        }
        break;
      case 'sound':
        for (const o of this.players.values()) {
          if (o === p) continue; const ds = o.st.s - st.s;
          if (ds > -3 && ds < 95) {
            const delay = Math.max(0, ds) / 120;
            setTimeout(() => { if (o.st.y < 0.6 || !o.sim) this.hitOther(p, o, 'stun', 1.3, '#e8c27a', 'BOOM!!'); }, delay * 1000);
          }
        }
        break;
      case 'luck': {
        const r = Math.random();
        if (r < 0.32) { st.eff.boost = 4; this.luckText(p, '¡TURBO DE LA SUERTE!'); }
        else if (r < 0.56) { st.eff.shield = 4; this.luckText(p, '¡ESCUDO!'); }
        else if (r < 0.8) { st.stamina = 1; st.exhausted = false; st.eff.boost = 1.5; this.luckText(p, '¡ESTAMINA AL MÁXIMO!'); }
        else {
          const part = this.track.parts.find(pt => !pt.taken && pt.s > st.s && pt.s - st.s < 500);
          if (part) { this.requestPart(part.id, p); this.luckText(p, '¡EL CADÁVER TE LLAMA!'); }
          else { st.eff.boost = 3; this.luckText(p, '¡TURBO DE LA SUERTE!'); }
        }
        break;
      }
    }
    return true;
  }
  // ------------------------------------------------------------------ desgaste del caballo
  wear(p, amount) {
    const st = p.st, before = st.cond;
    st.cond = Math.max(0.15, st.cond - amount);
    if (p.isLocal && before >= 0.4 && st.cond < 0.4) this.toast('⚠️ Tu caballo está muy castigado: corre menos. Recoge partes del Cadáver o haz un Golden Spin perfecto.');
  }

  // ------------------------------------------------------------------ Golden Spin: minijuego de ritmo para recuperar estamina
  spinPress() {
    const me = this.me; if (!me || this.state === 'countdown' || me.finished) return;
    const sp = this.spin;
    if (!sp) {
      if (me.st.spinCd > 0) { this.toast(`Golden Spin listo en ${Math.ceil(me.st.spinCd)} s`); return; }
      this.spin = { t: 0, beats: [0.9, 1.7, 2.5], res: [] };
      audio.sfx('spinstart');
      $('spin').classList.remove('hidden');
      return;
    }
    const next = sp.beats[sp.res.length]; if (next == null) return;
    const err = Math.abs(sp.t - next);
    const r = err < 0.09 ? 'perfect' : err < 0.2 ? 'good' : 'miss';
    sp.res.push(r);
    audio.sfx(r === 'miss' ? 'spinmiss' : 'spinhit');
    const el = $('spin-judge'); el.textContent = r === 'perfect' ? '¡PERFECTO!' : r === 'good' ? 'BIEN' : 'FALLO'; el.className = r; void el.offsetWidth; el.classList.add('pop');
    if (sp.res.length === sp.beats.length) this.finishSpin();
  }
  updateSpin(dt) {
    const sp = this.spin; if (!sp) return;
    sp.t += dt;
    const next = sp.beats[sp.res.length];
    if (next != null && sp.t > next + 0.25) { sp.res.push('miss'); audio.sfx('spinmiss'); if (sp.res.length === sp.beats.length) { this.finishSpin(); return; } }
    const nb = sp.beats[sp.res.length];
    if (nb != null) {
      const k = clamp((nb - sp.t) / 0.8, 0, 1);
      $('spin-ring').style.transform = `translate(-50%,-50%) scale(${1 + k * 2.2})`;
      $('spin-ring').style.opacity = 1 - k * 0.5;
    }
    $('spin-count').textContent = `${sp.res.length}/3`;
  }
  finishSpin() {
    const sp = this.spin, st = this.me.st; this.spin = null;
    const perfect = sp.res.filter(r => r === 'perfect').length, good = sp.res.filter(r => r === 'good').length;
    st.stamina = Math.min(1, st.stamina + perfect * 0.2 + good * 0.12 + 0.05);
    st.cond = Math.min(1, st.cond + perfect * 0.05);
    if (st.stamina > 0.35) st.exhausted = false;
    st.spinCd = 12;
    setTimeout(() => $('spin').classList.add('hidden'), 500);
    if (perfect === 3) {
      st.eff.boost = Math.max(st.eff.boost, 2.5);
      this.bigText('GOLDEN SPIN!!', 'gold'); this.flash('#ffd23f'); audio.sfx('golden'); audio.voice(this.me.char.id, 'spin');
      this.sendEvent({ k: 'fx', id: this.me.id, by: this.me.id, kind: 'golden' });
    } else this.toast(`Spin: ${perfect} perfectos, ${good} bien → +${Math.round((perfect * 0.2 + good * 0.12 + 0.05) * 100)}% estamina`);
  }
  botSpin(p) {
    const q = p.skill > 0.97 ? 0.75 : 0.5;
    let perfect = 0; for (let i = 0; i < 3; i++) if (Math.random() < q) perfect++;
    p.st.stamina = Math.min(1, p.st.stamina + perfect * 0.2 + 0.1); p.st.exhausted = false; p.st.spinCd = 12;
    if (perfect === 3) { p.st.eff.boost = 2.5; this.sendEvent({ k: 'fx', id: p.id, by: p.id, kind: 'golden' }); }
  }

  luckText(p, txt) { if (p.isLocal) this.toast('🍀 Hey Ya!: ' + txt); }
  nearestAhead(p, range) {
    let best = null, bd = Infinity;
    for (const o of this.players.values()) {
      if (o === p || o.finished) continue;
      const ds = o.st.s - p.st.s;
      if (ds > 0 && ds < range && ds < bd) { bd = ds; best = o; }
    }
    return best;
  }
  hitOther(by, target, eff, dur, color, word) {
    this.sendEvent({ k: 'hit', by: by.id, target: target.id, eff, dur, color, word });
  }
  applyHit(p, eff, dur, by) {
    const st = p.st;
    if (st.eff.shield > 0) { this.sendEvent({ k: 'blocked', target: p.id }); return; }
    if (eff === 'stun') { st.eff.stun = Math.max(st.eff.stun, dur); st.v *= 0.45; this.wear(p, 0.05); }
    else if (eff === 'slow') st.eff.slow = Math.max(st.eff.slow, dur);
    else if (eff === 'blind') { st.eff.blind = Math.max(st.eff.blind, dur); st.eff.slow = Math.max(st.eff.slow, dur * 0.6); }
    if (p.isLocal) { this.shake = 0.6; audio.sfx('hit'); }
  }

  spawnProjectile(m) {
    let mesh;
    if (m.kind === 'nail') {
      mesh = new THREE.Group();
      const n = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.9, 6).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffb3f0, emissive: 0xff4fd8, emissiveIntensity: 3 }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 6, 16), new THREE.MeshBasicMaterial({ color: 0x8af7ff }));
      mesh.add(n, ring); mesh.userData.spin = ring;
      audio.sfx('shoot');
    } else {
      mesh = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.15, emissive: 0x335577, emissiveIntensity: 0.6 }));
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 6, 24), new THREE.MeshBasicMaterial({ color: 0x7dff6a }));
      const r2 = r1.clone(); r2.rotation.x = Math.PI / 2;
      mesh.add(b, r1, r2); mesh.userData.spin = mesh;
      audio.sfx('ball');
    }
    this.scene.add(mesh);
    const speed = m.kind === 'nail' ? 120 : 85;
    this.projectiles.push({ ...m, mesh, vs: Math.cos(m.a) * speed, vl: Math.sin(m.a) * speed, life: m.kind === 'nail' ? 1.3 : 5, speed });
  }
  updateProjectiles(dt) {
    const v = new THREE.Vector3();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      if (pr.kind === 'ball' && pr.target) {
        const t = this.players.get(pr.target);
        if (t) {
          const ds = t.st.s - pr.s, dl = t.st.lat - pr.lat, d = Math.hypot(ds, dl) || 1;
          pr.vs = lerp(pr.vs, ds / d * pr.speed, Math.min(1, dt * 4)); pr.vl = lerp(pr.vl, dl / d * pr.speed, Math.min(1, dt * 4));
          pr.y = lerp(pr.y, (t.st.y || 0) + 1.8, dt * 3);
        }
      }
      pr.s += pr.vs * dt; pr.lat += pr.vl * dt;
      this.track.pos(pr.s, pr.lat, v);
      pr.mesh.position.set(v.x, this.track.roadY(pr.s) + this.track.sideHeight(pr.s, pr.lat) + pr.y, v.z);
      pr.mesh.rotation.y = this.track.yaw(pr.s) + Math.atan2(pr.vl, pr.vs);
      if (pr.mesh.userData.spin) { pr.mesh.userData.spin.rotation.z += dt * 30; }
      if (Math.random() < 0.6) this.sparks(pr.mesh.position, pr.kind === 'nail' ? '#ff7ae0' : '#7dff6a', 1, 2);
      // solo el dueño del proyectil decide si impacta
      const owner = this.players.get(pr.by);
      let hit = false;
      if (owner && owner.sim) {
        for (const o of this.players.values()) {
          if (o.id === pr.by || o.finished) continue;
          if (Math.abs(o.st.s - pr.s) < 2.4 && Math.abs(o.st.lat - pr.lat) < 2 && Math.abs((o.st.y || 0) + 1.8 - pr.y) < 2.2) {
            if (pr.kind === 'nail') this.hitOther(owner, o, 'slow', 2.6, '#ff7ae0', 'DOJYAAN!');
            else this.hitOther(owner, o, 'stun', 1.7, '#7dff6a', 'SPIN!!');
            hit = true; break;
          }
        }
      }
      if (hit || pr.life <= 0 || Math.abs(pr.lat) > LAT_LIMIT + 20) {
        this.scene.remove(pr.mesh);
        if (hit && pr.kind === 'ball') this.net.broadcast({ t: 'ev', k: 'fx', kind: 'kill', pid: pr.pid });
        this.projectiles.splice(i, 1);
      }
    }
  }

  playFx(m) {
    const p = this.players.get(m.id);
    if (m.kind === 'kill') { const i = this.projectiles.findIndex(x => x.pid === m.pid); if (i >= 0) { this.scene.remove(this.projectiles[i].mesh); this.projectiles.splice(i, 1); } return; }
    if (!p) return;
    if (m.kind === 'golden') {
      const gp = p.view.group.position.clone(); gp.y += 2;
      this.sparks(gp, '#ffd23f', 90, 10);
      if (!p.isLocal && this.me && this.distTo(p) < 150) this.popWorld('GOLDEN SPIN!', gp, '#ffd23f');
      return;
    }
    p.view.showStand(1.8);
    if (this.me && this.distTo(p) < 150) audio.voice(p.char.id, 'stand', p.isLocal);
    const wp = p.view.group.position.clone(); wp.y += 2.5;
    const near = p.isLocal || (this.me && this.distTo(p) < 150);
    if (near) {
      this.popWorld('ゴゴゴゴ', wp.clone().add(new THREE.Vector3(0, 1.5, 0)), '#c86bff', 'menace');
      if (p.isLocal) this.standBanner(p.char);
    }
    switch (m.kind) {
      case 'dino': if (near) { audio.sfx('dino'); this.popWorld('SCARY MONSTERS!', wp, '#ffb02e'); } this.sparks(wp, '#ffb02e', 60, 9); if (!p.sim) p.st.eff.dino = 5; break;
      case 'd4c': if (near) audio.sfx('teleport'); this.sparks(wp, '#ff5fd2', 80, 14); if (!p.sim) p.st.eff.shield = 3; if (p.isLocal) this.flash('#ff5fd2'); break;
      case 'cream': if (near) audio.sfx('spray'); this.sprayFx(p); break;
      case 'sound': if (near) audio.sfx('boom'); this.soundWave(p); break;
      case 'luck': if (near) audio.sfx('luck'); this.sparks(wp, '#2dd36f', 60, 8); this.sparks(wp, '#ffe23d', 40, 8); break;
      default: if (near) audio.sfx('stand');
    }
  }
  sprayFx(p) {
    const base = p.view.group.position.clone(); base.y += 1.6;
    const back = new THREE.Vector3(-Math.sin(p.view.group.rotation.y), 0, -Math.cos(p.view.group.rotation.y));
    for (let k = 0; k < 120; k++) {
      const i = this.pI = (this.pI + 1) % this.pN;
      this.pPos[i * 3] = base.x; this.pPos[i * 3 + 1] = base.y; this.pPos[i * 3 + 2] = base.z;
      const sp = 20 + Math.random() * 30;
      this.pVel[i * 3] = back.x * sp + (Math.random() - 0.5) * 12; this.pVel[i * 3 + 1] = Math.random() * 4; this.pVel[i * 3 + 2] = back.z * sp + (Math.random() - 0.5) * 12;
      this.pLife[i] = 1.2; this.pCol[i * 3] = 1; this.pCol[i * 3 + 1] = 0.6 + Math.random() * 0.2; this.pCol[i * 3 + 2] = 0.7;
    }
  }
  soundWave(p) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.25, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(p.view.group.position); ring.position.y += 0.5;
    this.scene.add(ring);
    const t0 = this.time;
    const upd = () => {
      const k = this.time - t0;
      ring.scale.setScalar(1 + k * 110); ring.material.opacity = Math.max(0, 0.9 - k * 1.1);
      if (k < 0.9 && this.running) requestAnimationFrame(upd); else this.scene.remove(ring);
    };
    upd();
    if (p.isLocal || this.distTo(p) < 120) {
      const ahead = p.view.group.position.clone().add(new THREE.Vector3(Math.sin(p.view.group.rotation.y) * 20, 3, Math.cos(p.view.group.rotation.y) * 20));
      this.popWorld('ドォォン', ahead, '#ffd27a', 'big');
    }
  }

  // ------------------------------------------------------------------ Cadáver Sagrado
  requestPart(partId, p) {
    if (this.net.isHost) this.grantPart(partId, p.id);
    else this.net.broadcast({ t: 'pickreq', part: partId, by: p.id });
  }
  grantPart(partId, by) {
    const part = this.track.parts[partId];
    if (!part || part.taken) return;
    this.net.broadcast({ t: 'picked', part: partId, by });
    this.onPicked(partId, by);
  }
  onPicked(partId, by) {
    const part = this.track.parts[partId];
    if (!part || part.taken) return;
    part.taken = true;
    const mesh = this.track.partMeshes[partId];
    this.sparks(mesh.position, '#ffd86b', 80, 12);
    mesh.visible = false;
    const p = this.players.get(by);
    if (!p) return;
    p.parts++;
    if (p.sim) { p.st.charge = 1; p.st.eff.boost = Math.max(p.st.eff.boost, 2.5); p.st.stamina = Math.min(1, p.st.stamina + 0.4); p.st.cond = Math.min(1, p.st.cond + 0.15); }
    if (p.isLocal) {
      audio.sfx('pickup');
      this.bigText(`CADÁVER SAGRADO<br><small>${part.name} · +${PART_POINTS} pts · Stand cargado</small>`, 'gold');
    } else this.toast(`✨ ${p.name} consiguió una parte del Cadáver (${part.name})`);
  }

  // ------------------------------------------------------------------ simulación
  stepRacer(p, inp, dt) {
    const st = p.st, c = p.char.stats, e = st.eff, T = this.track;
    for (const k in e) e[k] = Math.max(0, e[k] - dt);
    st.charge = Math.min(1, st.charge + dt / p.char.ability.cooldown);
    const racing = this.state === 'race' || this.state === 'post';
    if (!racing) { inp = { steer: 0, up: false, down: false, jump: false, sprint: false, ability: false }; }
    if (p.finished) inp = { steer: -st.lat * 0.05, up: false, down: false, jump: false, sprint: false, ability: false };
    let max = 34 * c.speed * p.skill;
    const sprinting = inp.sprint && inp.up && !st.exhausted && st.stamina > 0;
    if (sprinting) {
      max *= 1.3; st.stamina -= 0.14 / c.stamina * dt;
      if (st.stamina < 0.15) this.wear(p, 0.03 * dt);
      if (st.stamina <= 0) { st.stamina = 0; st.exhausted = true; this.wear(p, 0.06); if (p.isLocal) this.toast('¡Tu caballo está agotado! Usa el Golden Spin (Q) para recuperarte.'); }
    } else {
      st.stamina = Math.min(1, st.stamina + 0.075 * c.stamina * dt * (inp.up ? 1 : 1.8) * (0.6 + 0.4 * st.cond));
      if (st.exhausted && st.stamina > 0.35) st.exhausted = false;
    }
    st.sprinting = sprinting;
    // rebufo: ir pegado detrás de otro jinete da velocidad extra
    let draft = false;
    if (racing && !p.finished && st.v > 15) for (const o of this.players.values()) {
      if (o === p) continue; const ds = o.st.s - st.s;
      if (ds > 3.5 && ds < 20 && Math.abs(o.st.lat - st.lat) < 2.6) { draft = true; break; }
    }
    st.draft = draft ? Math.min(1, (st.draft || 0) + dt * 1.5) : Math.max(0, (st.draft || 0) - dt * 2);
    max *= 1 + 0.1 * st.draft;
    if (draft && st.draft > 0.6) st.stamina = Math.min(1, st.stamina + 0.03 * dt);
    if (st.exhausted) max *= 0.8;
    max *= 0.82 + 0.18 * st.cond;   // un caballo desgastado corre menos
    st.spinCd = Math.max(0, st.spinCd - dt);
    if (e.boost > 0) max *= 1.45;
    if (e.dino > 0) max *= 1.35;
    if (e.slow > 0) max *= 0.6;
    if (e.stun > 0) max *= 0.25;
    const off = Math.abs(st.lat) > ROAD_HALF + 1;
    if (off) { max *= e.dino > 0 ? 0.92 : 0.72; if (st.v > 25) this.wear(p, 0.004 * dt); }
    max *= clamp(1 - T.slope(st.s) * 1.6, 0.78, 1.15);
    const target = !racing ? 0 : inp.up ? max : (inp.down ? 0 : max * 0.2);
    const rate = target > st.v ? 0.62 * c.accel : (inp.down ? 2.5 : 0.7);
    st.v += (target - st.v) * (1 - Math.exp(-rate * dt));
    if (e.boost > 0 && st.v < max * 0.8) st.v += 30 * dt;
    // giro
    const turn = 1.5 * c.handling * (1 - 0.3 * Math.min(1, st.v / 50));
    st.steer = lerp(st.steer, inp.steer, Math.min(1, dt * 10));
    st.a += st.steer * turn * dt;
    if (Math.abs(inp.steer) < 0.05) st.a *= Math.exp(-2.4 * dt);
    st.a = clamp(st.a, -0.85, 0.85);
    // salto
    if (inp.jump && st.y <= 0.001 && racing && e.stun <= 0) { st.vy = 8.6; if (p.isLocal) audio.sfx('jump'); }
    st.y += st.vy * dt; st.vy -= 26 * dt;
    if (st.y < 0) { if (st.vy < -6 && p.isLocal) this.shake = 0.15; st.y = 0; st.vy = 0; }
    st.s += st.v * Math.cos(st.a) * dt;
    st.lat += st.v * Math.sin(st.a) * dt;
    if (Math.abs(st.lat) > LAT_LIMIT) { st.lat = Math.sign(st.lat) * LAT_LIMIT; st.a *= -0.3; st.v *= 0.96; }
    st.s = clamp(st.s, -30, T.length - 4);
    // obstáculos
    for (const o of T.obstacles) {
      const ds = o.s - st.s;
      if (ds > 3) break;
      if (ds < -2 || o.id === p.lastObs) continue;
      if (Math.abs(ds) < 1.6 && Math.abs(o.lat - st.lat) < o.w && st.y < 1.1) {
        p.lastObs = o.id;
        if (e.dino > 0) { if (p.isLocal) this.popWorld('CRASH!', p.view.group.position.clone().setY(p.view.group.position.y + 3), '#ffb02e'); continue; }
        if (o.type === 'weed') { st.v *= 0.8; continue; }
        st.v *= 0.35; e.stun = Math.max(e.stun, 0.55); this.wear(p, 0.08);
        if (p.isLocal) { audio.sfx('stumble'); this.shake = 0.5; this.popWorld(o.type === 'log' ? '¡TRONCO!' : 'GOGYAAN!', p.view.group.position.clone().setY(p.view.group.position.y + 3), '#ffffff'); }
      }
    }
    // partes del Cadáver
    for (const part of T.parts) {
      if (part.taken || part.req) continue;
      if (Math.abs(part.s - st.s) < 2.6 && Math.abs(part.lat - st.lat) < 2.8) { part.req = this.net.isHost ? false : true; this.requestPart(part.id, p); setTimeout(() => part.req = false, 1500); }
    }
    // colisiones con otros jinetes
    for (const o of this.players.values()) {
      if (o === p) continue;
      const ds = o.st.s - st.s, dl = o.st.lat - st.lat;
      if (Math.abs(ds) < 3.2 && Math.abs(dl) < 2.0) {
        const push = (2.0 - Math.abs(dl)) * 0.5;
        st.lat -= Math.sign(dl || 1) * push;
        if (e.dino > 0 && !(p.ramCD[o.id] > this.time)) { p.ramCD[o.id] = this.time + 1.5; this.hitOther(p, o, 'stun', 1.0, '#ffb02e', 'WRYYY!'); }
      }
    }
    // etapas y meta
    if (!p.finished) {
      while (p.nextStage < STAGES.length && st.s >= T.stageBounds[p.nextStage]) {
        const stg = p.nextStage - 1;
        this.sendEvent({ k: 'split', id: p.id, stage: stg, time: this.raceTime });
        if (p.isLocal) this.stageClear(stg);
        p.nextStage++;
      }
      if (st.s >= T.finishS) {
        p.finished = true; p.finishTime = this.raceTime;
        this.sendEvent({ k: 'split', id: p.id, stage: STAGES.length - 1, time: this.raceTime });
        this.sendEvent({ k: 'finish', id: p.id, time: this.raceTime });
        if (p.isLocal) this.onLocalFinish();
      }
    }
    if (inp.ability) this.useAbility(p);
  }

  // IA de los bots (solo la ejecuta el anfitrión)
  botInput(p, dt) {
    const st = p.st, ai = p.ai, T = this.track;
    ai.laneT -= dt;
    if (ai.laneT <= 0) { ai.lane = (Math.random() - 0.5) * ROAD_HALF * 1.4; ai.laneT = 2 + Math.random() * 4; }
    let targetLat = ai.lane, jump = false;
    // buscamos partes del cadáver cercanas
    for (const part of T.parts) { const ds = part.s - st.s; if (!part.taken && ds > 0 && ds < 140) { targetLat = part.lat; break; } }
    // esquivar obstáculos
    for (const o of T.obstacles) {
      const ds = o.s - st.s;
      if (ds < 0) continue; if (ds > 40) break;
      if (Math.abs(o.lat - targetLat) < o.w + 2 || Math.abs(o.lat - st.lat) < o.w + 1.5) {
        if (o.type === 'log' || (ds < 9 && p.skill > 0.97)) { if (ds < 7 + st.v * 0.1) jump = true; }
        else targetLat = o.lat + (st.lat > o.lat ? 1 : -1) * (o.w + 3.5);
      }
    }
    targetLat = clamp(targetLat, -ROAD_HALF + 1, ROAD_HALF - 1);
    const desiredA = clamp((targetLat - st.lat) * 0.06, -0.45, 0.45);
    const steer = clamp((desiredA - st.a) * 4, -1, 1);
    ai.sprintT -= dt;
    let sprint = false;
    if (st.stamina > 0.55) ai.sprinting = true; if (st.stamina < 0.2) ai.sprinting = false;
    sprint = !!ai.sprinting;
    // "rubber band" suave respecto al jugador humano más adelantado
    let leader = -Infinity; for (const o of this.players.values()) if (!o.bot) leader = Math.max(leader, o.st.s);
    const gap = leader - st.s;
    p.skill = clamp((p.baseSkill || (p.baseSkill = p.skill)) + clamp(gap / 3000, -0.07, 0.08), 0.85, 1.1);
    if (st.spinCd <= 0 && st.stamina < 0.3 && Math.random() < dt * 0.8) this.botSpin(p);
    let ability = false;
    ai.abilityDelay -= dt;
    if (st.charge >= 1 && ai.abilityDelay <= 0) {
      const id = p.char.ability.id;
      if (id === 'nails' || id === 'steelball') ability = !!this.nearestAhead(p, id === 'nails' ? 90 : 220);
      else if (id === 'cream') ability = [...this.players.values()].some(o => o !== p && o.st.s < st.s && o.st.s > st.s - 50);
      else if (id === 'sound') ability = [...this.players.values()].some(o => o !== p && o.st.s > st.s && o.st.s < st.s + 80);
      else ability = true;
      if (ability) ai.abilityDelay = 2 + Math.random() * 5;
    }
    return { steer, up: true, down: false, jump, sprint, ability };
  }

  smoothRemote(p, dt) {
    const t = p.target; if (!t) return;
    const st = p.st, age = this.time - t.t;
    const ts = t.s + t.v * Math.cos(t.a) * Math.min(age, 0.3);
    if (Math.abs(ts - st.s) > 25) st.s = ts; else st.s += (ts - st.s) * Math.min(1, dt * 8);
    st.lat += (t.lat - st.lat) * Math.min(1, dt * 8);
    st.a += (t.a - st.a) * Math.min(1, dt * 8);
    st.v = t.v; st.y = t.y; st.steer = t.steer;
    st.eff.dino = t.flags & 1 ? 1 : 0; st.eff.shield = t.flags & 2 ? 1 : 0; st.eff.stun = t.flags & 4 ? 0.2 : 0;
    if ((t.flags & 8) && !p.finished) { /* el evento finish llegará por separado */ }
  }

  // ------------------------------------------------------------------ bucle
  loop() {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.raceTime += dt;
    this.update(dt);
    this.composer.render();
  }

  update(dt) {
    // cuenta atrás
    if (this.state === 'countdown') {
      const n = Math.ceil(-this.raceTime);
      if (n !== this.lastCount && n >= 0) {
        this.lastCount = n;
        if (n > 0 && n <= 3) { this.bigText(String(n), 'count'); audio.sfx('beep'); }
      }
      const up = this.readInput().up;
      if (up && this.upSince == null) this.upSince = this.raceTime;
      if (!up) this.upSince = null;
      if (this.raceTime >= 0) {
        this.state = 'race'; this.bigText('GO!!', 'go'); audio.sfx('go'); this.stageBanner(0);
        const st = this.me.st;
        if (this.upSince != null && this.upSince > -0.5) { st.eff.boost = 1.6; st.v = 20; setTimeout(() => this.bigText('PERFECT START!', 'gold'), 700); audio.sfx('luck'); }
        else if (this.upSince != null && this.upSince < -1.6) { st.eff.stun = 0.9; setTimeout(() => this.toast('¡Salida en falso! Pulsa W justo al decir GO para una salida perfecta.'), 300); }
        // los bots también intentan salir bien
        for (const p of this.players.values()) if (p.sim && p.bot && Math.random() < 0.5) p.st.eff.boost = 1.2;
      }
    }
    const inp = this.readInput();
    for (const p of this.players.values()) {
      if (p.isLocal) this.stepRacer(p, inp, dt);
      else if (p.sim) this.stepRacer(p, this.botInput(p, dt), dt);
      else { this.smoothRemote(p, dt); for (const k in p.st.eff) if (k === 'blind' || k === 'slow') p.st.eff[k] = Math.max(0, p.st.eff[k] - dt); }
      p.view.update(dt, { ...p.st, stun: p.st.eff.stun, dino: p.st.eff.dino, shield: p.st.eff.shield }, this.track);
      // polvo de los cascos
      if (p.st.v > 8 && p.st.y < 0.2 && Math.random() < p.st.v / 50 && (p.isLocal || this.distTo(p) < 140)) {
        const pr = this.track.params(p.st.s);
        this.dust(p.view.group.position, Math.abs(p.st.lat) < ROAD_HALF ? pr.road : pr.colA, 1, 1.5);
      }
      if (p.st.eff.boost > 0 && Math.random() < 0.5) this.sparks(p.view.group.position.clone().setY(p.view.group.position.y + 1.2), '#ffe14d', 1, 3);
    }
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.track.update(dt, this.time, this.camera);
    // envío de estado
    this.sendT -= dt;
    if (this.sendT <= 0 && !this.net.offline) {
      this.sendT = SEND_RATE;
      if (this.net.isHost) {
        const d = {}; for (const p of this.players.values()) d[p.id] = this.pack(p);
        this.net.broadcast({ t: 'snap', d });
      } else this.net.broadcast({ t: 'st', id: this.myId, d: this.pack(this.me) });
    }
    this.updateCamera(dt);
    this.updateEnvironment();
    this.updateHud(dt);
    audio.update(dt, this.me ? this.me.st.v : 0, this.state !== 'countdown');
    if (this.state === 'post' && this.net.isHost && this.endAt && this.time > this.endAt) this.endRace();
  }

  updateCamera(dt) {
    const me = this.me; if (!me) return;
    const g = me.view.group;
    const yaw = g.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const dists = [[9.5, 4.2], [15, 7], [5.5, 2.8]];
    let [back, up] = dists[this.camMode];
    if (me.st.eff.dino > 0) { back += 3; up += 2; }
    const desired = g.position.clone().addScaledVector(fwd, -back); desired.y += up;
    if (me.finished) { const a = this.time * 0.4; desired.set(g.position.x + Math.cos(a) * 12, g.position.y + 5, g.position.z + Math.sin(a) * 12); }
    let intro = false;
    if (this.state === 'countdown') {
      // cámara cinemática: empieza delante del jinete y gira hasta colocarse detrás
      intro = true;
      const t = clamp((this.raceTime + 4) / 3.4, 0, 1), e = t * t * (3 - 2 * t);
      const ang = yaw + lerp(0.55, Math.PI, e);
      const dist = lerp(5.2, back, e), h = lerp(1.9, up, e);
      desired.set(g.position.x + Math.sin(ang) * dist, g.position.y + h, g.position.z + Math.cos(ang) * dist);
      this.camera.position.copy(desired); this.camInit = true;
    }
    const k = 1 - Math.exp(-dt * 6);
    if (!this.camInit) { this.camera.position.copy(desired); this.camInit = true; }
    this.camera.position.lerp(desired, k);
    const minY = this.track.groundY(me.st.s - back * 0.8, me.st.lat) + 1.2;
    if (this.camera.position.y < minY) this.camera.position.y = minY;
    const look = g.position.clone().addScaledVector(fwd, intro ? lerp(0, 6, clamp((this.raceTime + 4) / 3.4, 0, 1)) : 6); look.y += 2.2;
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); const s = this.shake * 0.8; this.camera.position.x += (Math.random() - 0.5) * s; this.camera.position.y += (Math.random() - 0.5) * s; }
    this.camera.lookAt(look);
    const fast = me.st.eff.boost > 0 || me.st.sprinting;
    const fov = 68 + Math.min(18, me.st.v * 0.25) + (fast ? 6 : 0);
    this.camera.fov = lerp(this.camera.fov, fov, Math.min(1, dt * 3)); this.camera.updateProjectionMatrix();
    // la sombra sigue al jugador
    const sd = this.lightDir || new THREE.Vector3(0.4, 0.6, 0.3);
    this.sun.position.copy(g.position).addScaledVector(sd, 150);
    this.sun.target.position.copy(g.position);
    this.sky.position.copy(this.camera.position);
  }

  updateEnvironment() {
    const s = this.me ? this.me.st.s : 0;
    const p = this.track.params(Math.max(0, s));
    this.skyMat.uniforms.top.value.copy(p.skyTop);
    this.skyMat.uniforms.bottom.value.copy(p.skyBottom);
    this.skyMat.uniforms.sunCol.value.copy(p.sun);
    this.skyMat.uniforms.time.value = this.time;
    this.skyMat.uniforms.night.value = p.city;
    const yaw = this.track.yaw(Math.max(0, s));
    // el sol del cielo queda delante (atardeceres), pero la luz principal entra de lado para no dejar a los jinetes a contraluz
    this.sunDir = new THREE.Vector3(Math.sin(yaw) * 0.8 + 0.3, Math.max(0.08, p.sunEl), Math.cos(yaw) * 0.8).normalize();
    const ly = yaw + 1.25;
    this.lightDir = new THREE.Vector3(Math.sin(ly), Math.max(0.45, p.sunEl + 0.35), Math.cos(ly)).normalize();
    this.skyMat.uniforms.sunDir.value.copy(this.sunDir);
    this.scene.fog.color.copy(p.fog);
    this.sun.color.copy(p.sun);
    this.sun.intensity = lerp(2.6, 0.9, p.city);
    this.hemi.intensity = lerp(1.35, 0.8, p.city) + p.snow * 0.25;
    this.hemi.color.copy(p.skyTop).lerp(new THREE.Color(0xffffff), 0.5);
    this.bloom.strength = lerp(0.5, 0.9, p.city);
    // gradación por etapa: cálido en el desierto, frío en montaña, magenta de noche
    const tint = this.manga.uniforms.tint.value;
    tint.setRGB(1, 1, 1).lerp(new THREE.Color(1.08, 0.97, 0.88), p.mesa).lerp(new THREE.Color(0.92, 0.98, 1.08), p.snow).lerp(new THREE.Color(1.05, 0.92, 1.1), p.city);
    // cambio de etapa del jugador
    const si = this.track.stageIndex(Math.max(0, s));
    audio.setStage(si, s > this.track.finishS - 900);
    if (si !== this.curStage) { if (this.curStage !== undefined && this.state !== 'countdown') this.stageBanner(si); this.curStage = si; }
  }

  // ------------------------------------------------------------------ HUD
  initHud() {
    $('hud').classList.remove('hidden');
    $('touch').classList.toggle('hidden', !('ontouchstart' in window));
    const sl = $('speedlines'); sl.width = window.innerWidth; sl.height = window.innerHeight;
    this.slCtx = sl.getContext('2d');
    this.map = $('minimap'); this.mapCtx = this.map.getContext('2d');
    const pts = this.track.mapPoints(160);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const W = this.map.width, H = this.map.height, pad = 14;
    const sc = Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxZ - minZ || 1));
    this.mapTf = (x, z) => [pad + (x - minX) * sc + ((W - pad * 2) - (maxX - minX) * sc) / 2, pad + (z - minZ) * sc + ((H - pad * 2) - (maxZ - minZ) * sc) / 2];
    this.mapPts = pts.map(([x, z]) => this.mapTf(x, z));
    $('ability-name').textContent = this.me.char.ability.name;
    $('stand-name').textContent = '「' + this.me.char.stand + '」';
    $('hud-char').style.setProperty('--c', this.me.char.color);
  }
  updateHud(dt) {
    const me = this.me; if (!me) return;
    const st = me.st;
    // posición
    const order = this.ranking();
    const pos = order.indexOf(me) + 1;
    $('pos').innerHTML = `${pos}<sup>${ordinal(pos).slice(-2)}</sup><span>/${order.length}</span>`;
    $('speed').textContent = Math.round(st.v * 3.6 * 0.5);
    $('timer').textContent = fmtTime(Math.max(0, me.finished ? me.finishTime : this.raceTime));
    $('stamina').style.width = (st.stamina * 100).toFixed(1) + '%';
    $('stamina').classList.toggle('exhausted', st.exhausted);
    $('charge').style.width = (st.charge * 100).toFixed(1) + '%';
    $('ability').classList.toggle('ready', st.charge >= 1);
    $('parts').textContent = me.parts;
    $('cond').style.width = (st.cond * 100).toFixed(1) + '%';
    $('cond').className = st.cond < 0.4 ? 'bad' : st.cond < 0.7 ? 'mid' : '';
    $('spin-cd').textContent = st.spinCd > 0 ? Math.ceil(st.spinCd) + 's' : 'Q';
    this.updateSpin(dt);
    const si = this.track.stageIndex(Math.max(0, st.s));
    $('stage').textContent = `${STAGES[si].name} · ${STAGES[si].place}`;
    const prog = clamp(st.s / this.track.finishS, 0, 1);
    $('progress-fill').style.width = (prog * 100).toFixed(2) + '%';
    $('dist').textContent = Math.max(0, Math.round((this.track.finishS - st.s))) + ' m';
    // ceguera de Cream Starter
    $('cream').style.opacity = st.eff.blind > 0 ? Math.min(1, st.eff.blind) * 0.92 : 0;
    // tabla de clasificación en vivo
    if (!this._lbT || this.time - this._lbT > 0.25) {
      this._lbT = this.time;
      $('leaderboard').innerHTML = order.slice(0, 8).map((p, i) => `<li class="${p.isLocal ? 'me' : ''}" style="--c:${p.char.color}"><b>${i + 1}</b>${p.name}${p.parts ? ` <i>✦${p.parts}</i>` : ''}${p.finished ? ' 🏁' : ''}</li>`).join('');
    }
    this.drawMap(order);
    this.drawSpeedLines(st);
    $('draft').classList.toggle('on', (st.draft || 0) > 0.5);
  }
  ranking() {
    return [...this.players.values()].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; if (b.finished) return 1;
      return b.st.s - a.st.s;
    });
  }
  drawMap(order) {
    const c = this.mapCtx, W = this.map.width, H = this.map.height;
    c.clearRect(0, 0, W, H);
    const pts = this.mapPts;
    const colors = ['#ffd27a', '#ff7a3c', '#9fb8ff', '#b8e05a', '#ff5fd2'];
    for (let i = 0; i < pts.length - 1; i++) {
      const stg = Math.min(STAGES.length - 1, Math.floor(i / (pts.length - 1) * STAGES.length));
      c.strokeStyle = '#000'; c.lineWidth = 7; c.beginPath(); c.moveTo(...pts[i]); c.lineTo(...pts[i + 1]); c.stroke();
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const stg = Math.min(STAGES.length - 1, Math.floor(i / (pts.length - 1) * STAGES.length));
      c.strokeStyle = colors[stg]; c.lineWidth = 4; c.beginPath(); c.moveTo(...pts[i]); c.lineTo(...pts[i + 1]); c.stroke();
    }
    for (const part of this.track.parts) if (!part.taken) { const [x, y] = this.at(part.s); c.fillStyle = '#ffe9a0'; c.fillRect(x - 2, y - 2, 4, 4); }
    for (const p of order.slice().reverse()) {
      const [x, y] = this.at(p.st.s);
      c.fillStyle = p.char.color; c.strokeStyle = p.isLocal ? '#fff' : '#000'; c.lineWidth = p.isLocal ? 3 : 1.5;
      c.beginPath(); c.arc(x, y, p.isLocal ? 6 : 4, 0, Math.PI * 2); c.fill(); c.stroke();
    }
  }
  at(s) { const f = clamp(s / this.track.finishS, 0, 1) * (this.mapPts.length - 1); const i = Math.floor(f), t = f - i; const a = this.mapPts[i], b = this.mapPts[Math.min(this.mapPts.length - 1, i + 1)]; return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }
  drawSpeedLines(st) {
    const c = this.slCtx, W = c.canvas.width, H = c.canvas.height;
    c.clearRect(0, 0, W, H);
    let k = clamp((st.v - 36) / 20, 0, 1);
    if ((st.draft || 0) > 0.3) k = Math.max(k, 0.45 * st.draft);
    if (st.eff.boost > 0 || st.eff.dino > 0) k = Math.max(k, 0.8);
    if (k <= 0.01) return;
    const cx = W / 2, cy = H * 0.45, n = Math.floor(40 * k);
    c.strokeStyle = `rgba(255,255,255,${0.35 * k})`;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r0 = Math.max(W, H) * (0.32 + Math.random() * 0.2), r1 = Math.max(W, H) * 0.75;
      c.lineWidth = 1 + Math.random() * 3;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.stroke();
    }
  }

  // ------------------------------------------------------------------ textos estilo manga
  popWorld(text, wpos, color, cls = '') {
    const v = wpos.clone().project(this.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) return;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth, y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const el = document.createElement('div');
    el.className = 'ono ' + cls; el.textContent = text;
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.setProperty('--c', color);
    el.style.setProperty('--r', ((Math.random() - 0.5) * 30).toFixed(1) + 'deg');
    $('fx').appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }
  bigText(html, cls = '') {
    const el = $('bigtext');
    el.className = ''; void el.offsetWidth; el.className = 'show ' + cls;
    el.innerHTML = html;
  }
  toast(msg) {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
    $('toasts').appendChild(el); setTimeout(() => el.remove(), 4200);
  }
  flash(color) { const f = $('flash'); f.style.background = color; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
  standBanner(char) {
    const el = $('standbanner');
    el.innerHTML = `<span class="sn">「${char.stand}」</span><span class="an">${char.ability.name}</span>`;
    el.style.setProperty('--c', char.color);
    el.className = ''; void el.offsetWidth; el.className = 'show';
  }
  introCard() {
    const c = this.me.char, el = $('introcard');
    el.innerHTML = `<div class="ic-name">${c.name}</div><div class="ic-stand">Stand: 「${c.stand}」</div><div class="ic-horse">🐎 ${c.horse}</div><div class="ic-go">ゴゴゴゴ</div>`;
    el.style.setProperty('--c', c.color);
    el.className = ''; void el.offsetWidth; el.className = 'show';
  }
  stageBanner(i) {
    const st = STAGES[i];
    const el = $('stagebanner');
    el.innerHTML = `<div class="n">${st.name}</div><div class="p">${st.place}</div><div class="jp">${st.jp}</div>`;
    el.className = ''; void el.offsetWidth; el.className = 'show';
    if (i > 0) audio.sfx('stage');
  }
  stageClear(stg) {
    // puesto provisional en esta etapa
    let rank = 1;
    for (const p of this.players.values()) if (p !== this.me && p.splits[stg] != null && p.splits[stg] < this.raceTime) rank++;
    this.toast(`${STAGES[stg].name} completada — llegaste ${ordinal(rank)} (${fmtTime(this.raceTime)})`);
  }

  onLocalFinish() {
    audio.sfx('finish'); audio.voice(this.me.char.id, 'win');
    const pos = this.ranking().indexOf(this.me) + 1;
    this.bigText(`GOAL!!<br><small>${ordinal(pos)} · ${fmtTime(this.me.finishTime)}</small>`, 'goal');
    this.flash('#ffe14d');
    if (this.state === 'race') this.state = 'post';
    this.checkEnd();
  }
  checkEnd() {
    const all = [...this.players.values()];
    const humans = all.filter(p => !p.bot);
    if (!this.net.isHost) return;
    if (all.every(p => p.finished)) { this.endAt = this.time + 3; this.state = 'post'; return; }
    if (humans.every(p => p.finished)) { this.state = 'post'; this.endAt = Math.min(this.endAt || Infinity, this.time + 10); return; }
    if (humans.some(p => p.finished) && !this.endAt) { this.state = 'post'; this.endAt = this.time + 60; this.net.broadcast({ t: 'ev', k: 'noop' }); }
  }
  endRace() {
    if (this.ended) return;
    this.net.broadcast({ t: 'end' });
    this.showResults();
  }

  computeResults() {
    const list = [...this.players.values()];
    const pts = new Map(list.map(p => [p.id, { p, stagePts: [], total: 0 }]));
    for (let stg = 0; stg < STAGES.length; stg++) {
      const arrived = list.filter(p => p.splits[stg] != null).sort((a, b) => a.splits[stg] - b.splits[stg]);
      arrived.forEach((p, i) => {
        const v = (STAGE_POINTS[i] || 0) * (stg === STAGES.length - 1 ? 2 : 1);
        pts.get(p.id).stagePts[stg] = { pos: i + 1, pts: v };
        pts.get(p.id).total += v;
      });
    }
    for (const r of pts.values()) r.total += r.p.parts * PART_POINTS;
    return [...pts.values()].sort((a, b) => b.total - a.total || (a.p.finishTime ?? 1e9) - (b.p.finishTime ?? 1e9) || b.p.st.s - a.p.st.s);
  }

  showResults() {
    if (this.ended) return;
    this.ended = true;
    const res = this.computeResults();
    const el = $('results');
    const rows = res.map((r, i) => `<tr class="${r.p.isLocal ? 'me' : ''}" style="--c:${r.p.char.color}">
      <td class="rk">${ordinal(i + 1)}</td><td class="nm">${r.p.name}<small>${r.p.char.name}</small></td>
      ${STAGES.map((_, s) => `<td>${r.stagePts[s] ? `${ordinal(r.stagePts[s].pos)}<small>+${r.stagePts[s].pts}</small>` : '—'}</td>`).join('')}
      <td>✦${r.p.parts}<small>+${r.p.parts * PART_POINTS}</small></td><td>${fmtTime(r.p.finishTime)}</td><td class="tot">${r.total}</td></tr>`).join('');
    el.querySelector('.table').innerHTML = `<table><thead><tr><th></th><th>Jinete</th>${STAGES.map((s, i) => `<th>${i === STAGES.length - 1 ? 'FINAL ×2' : 'Etapa ' + (i + 1)}</th>`).join('')}<th>Cadáver</th><th>Tiempo</th><th>Puntos</th></tr></thead><tbody>${rows}</tbody></table>`;
    const winner = res[0].p;
    el.querySelector('.winner').innerHTML = `🏆 ${winner.name} gana la Steel Ball Run`;
    const myRank = res.findIndex(r => r.p.isLocal);
    el.querySelector('.tbc').classList.toggle('hidden', myRank !== res.length - 1 || res.length < 2);
    el.classList.remove('hidden');
    $('btn-again').classList.toggle('hidden', !this.net.isHost);
  }

  destroy() {
    this.running = false;
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.kd); window.removeEventListener('keyup', this.ku);
    this.renderer.dispose();
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    $('hud').classList.add('hidden'); $('results').classList.add('hidden'); $('pause').classList.add('hidden');
    for (const id of ['fx', 'toasts']) $(id).innerHTML = '';
  }
}
