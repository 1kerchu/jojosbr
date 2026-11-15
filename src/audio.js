// Audio 100% sintetizado con WebAudio (sin archivos externos)
class AudioSys {
  constructor() { this.ctx = null; this.muted = false; this.musicOn = true; this.hoofT = 0; this.beat = 0; }
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.32; this.musicBus.connect(this.master);
    // ruido blanco compartido
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // viento
    this.wind = this.ctx.createBufferSource(); this.wind.buffer = this.noise; this.wind.loop = true;
    this.windF = this.ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 600; this.windF.Q.value = 0.6;
    this.windG = this.ctx.createGain(); this.windG.gain.value = 0;
    this.wind.connect(this.windF).connect(this.windG).connect(this.sfxBus); this.wind.start();
    this.nextBeat = this.ctx.currentTime + 0.1;
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7; }

  noiseHit(t, dur, freq, gain, type = 'lowpass', bus = this.sfxBus) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(t, freq, dur, gain, type = 'square', bus = this.sfxBus, slide = 0) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }

  sfx(name) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'beep': this.tone(t, 660, 0.25, 0.3, 'square'); break;
      case 'go': this.tone(t, 990, 0.6, 0.35, 'square'); this.tone(t, 1320, 0.6, 0.2, 'sawtooth'); break;
      case 'shoot': this.tone(t, 1400, 0.18, 0.2, 'sawtooth', this.sfxBus, 0.3); this.noiseHit(t, 0.1, 4000, 0.3, 'highpass'); break;
      case 'ball': this.tone(t, 300, 0.5, 0.25, 'triangle', this.sfxBus, 3); this.tone(t, 450, 0.5, 0.15, 'sine', this.sfxBus, 3); break;
      case 'hit': this.noiseHit(t, 0.35, 1200, 0.8); this.tone(t, 180, 0.3, 0.4, 'square', this.sfxBus, 0.4); break;
      case 'stumble': this.noiseHit(t, 0.4, 500, 0.9); this.tone(t, 90, 0.3, 0.4, 'sine', this.sfxBus, 0.5); break;
      case 'jump': this.noiseHit(t, 0.15, 900, 0.3); break;
      case 'pickup': [880, 1108, 1318, 1760].forEach((f, i) => this.tone(t + i * 0.07, f, 0.3, 0.2, 'triangle')); break;
      case 'stand': this.tone(t, 110, 0.9, 0.35, 'sawtooth', this.sfxBus, 2); this.noiseHit(t, 0.6, 2500, 0.25, 'bandpass'); break;
      case 'boom': this.noiseHit(t, 1.0, 300, 1.2); this.tone(t, 60, 0.8, 0.6, 'sine', this.sfxBus, 0.5); break;
      case 'spray': this.noiseHit(t, 0.7, 3000, 0.5, 'bandpass'); break;
      case 'teleport': this.tone(t, 200, 0.6, 0.3, 'sine', this.sfxBus, 8); this.tone(t + 0.1, 2400, 0.4, 0.15, 'triangle', this.sfxBus, 0.2); break;
      case 'stage': [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.1, f, 0.5, 0.2, 'square')); break;
      case 'finish': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(t + i * 0.12, f, 0.5, 0.22, 'square')); break;
      case 'dino': this.tone(t, 180, 1.2, 0.5, 'sawtooth', this.sfxBus, 0.35); this.noiseHit(t, 1.0, 700, 0.6); break;
      case 'luck': [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone(t + i * 0.05, f, 0.25, 0.18, 'sine')); break;
    }
  }

  // se llama cada frame con la velocidad del jugador
  update(dt, speed, running) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windG.gain.setTargetAtTime(this.muted ? 0 : Math.min(0.25, speed / 220), t, 0.2);
    this.windF.frequency.setTargetAtTime(400 + speed * 18, t, 0.2);
    // cascos: patrón de galope (tres golpes + pausa)
    if (running && speed > 2 && !this.muted) {
      this.hoofT -= dt;
      if (this.hoofT <= 0) {
        const period = Math.max(0.28, 1.2 - speed * 0.018);
        for (let i = 0; i < 3; i++) this.noiseHit(t + i * period * 0.16, 0.06, 700 + Math.random() * 300, 0.55);
        this.hoofT = period;
      }
    }
    if (this.musicOn && !this.muted) this.music();
  }

  music() {
    // bucle de bajo + batería, tonalidad de Mi menor, 140 bpm
    const spb = 60 / 140 / 2;
    const bass = [40, 40, 52, 40, 43, 43, 55, 43, 38, 38, 50, 38, 45, 47, 50, 52];
    const lead = [0, 0, 67, 0, 71, 0, 69, 67, 0, 0, 64, 0, 66, 0, 67, 71];
    while (this.nextBeat < this.ctx.currentTime + 0.2) {
      const t = this.nextBeat, b = this.beat % 16, bar = Math.floor(this.beat / 16) % 4;
      const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
      this.tone(t, midi(bass[b] + (bar === 3 ? 2 : 0)), spb * 0.9, 0.22, 'sawtooth', this.musicBus);
      if (b % 4 === 0) { this.tone(t, 120, 0.25, 0.7, 'sine', this.musicBus, 0.3); }
      if (b % 8 === 4) this.noiseHit(t, 0.18, 1800, 0.45, 'bandpass', this.musicBus);
      this.noiseHit(t, 0.04, 8000, 0.12, 'highpass', this.musicBus);
      if (lead[b] && bar >= 2) this.tone(t, midi(lead[b] + 12), spb * 1.8, 0.06, 'square', this.musicBus);
      this.nextBeat += spb; this.beat++;
    }
  }
}
export const audio = new AudioSys();
