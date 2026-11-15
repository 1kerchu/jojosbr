// Audio 100% sintetizado con WebAudio (sin archivos externos)
const VOICE_LINES = {
  johnny: { pitch: 1.1, rate: 1.05, ja: { stand: ['タスク！', 'タスク、アクト4！'], spin: '黄金の回転だ！', win: 'ゴールだ！' }, es: { stand: ['¡Tusk!', '¡Tusk, Act 4!'], spin: '¡Rotación dorada!', win: '¡He llegado!' } },
  gyro: { pitch: 0.9, rate: 1.1, ja: { stand: ['ニョホ！', 'ボールブレイカー！', '回転を信じろ！'], spin: '黄金長方形のスケール！', win: 'ニョホホ！' }, es: { stand: ['¡Nyoho!', '¡Ball Breaker!', '¡Confía en el giro!'], spin: '¡El rectángulo dorado!', win: '¡Nyohoho!' } },
  diego: { pitch: 0.75, rate: 1.0, ja: { stand: ['スケアリー・モンスターズ！', 'ウリィィィ！', '無駄無駄！'], spin: 'このディエゴが勝つ！', win: '当然だ！' }, es: { stand: ['¡Scary Monsters!', '¡Wryyy!', '¡Inútil, inútil!'], spin: '¡Diego va a ganar!', win: '¡Por supuesto!' } },
  valentine: { pitch: 0.7, rate: 0.95, ja: { stand: ['D4C！', 'いともたやすく行われるえげつない行為！', 'ラブトレイン！'], spin: 'ナプキンを取るのは私だ！', win: '我が国のために！' }, es: { stand: ['¡D4C!', '¡Dirty Deeds Done Dirt Cheap!', '¡Love Train!'], spin: '¡La servilleta la tomo yo!', win: '¡Por mi país!' } },
  hotpants: { pitch: 1.35, rate: 1.1, ja: { stand: ['クリーム・スターター！'], spin: '負けない！', win: '神に感謝を。' }, es: { stand: ['¡Cream Starter!'], spin: '¡No pienso perder!', win: 'Gracias a Dios.' } },
  sandman: { pitch: 0.85, rate: 1.0, ja: { stand: ['イン・ア・サイレント・ウェイ！'], spin: '大地の声を聞け！', win: '走り抜けた！' }, es: { stand: ['¡In a Silent Way!'], spin: '¡Escucha a la tierra!', win: '¡Lo he conseguido!' } },
  pocoloco: { pitch: 1.2, rate: 1.2, ja: { stand: ['ヘイ・ヤー！', '今日はツイてる！'], spin: 'ラッキー！', win: 'ツイてるぜぇ！' }, es: { stand: ['¡Hey Ya!', '¡Hoy es mi día de suerte!'], spin: '¡Qué suerte!', win: '¡Soy el hombre más afortunado!' } }
};

class AudioSys {
  constructor() { this.ctx = null; this.muted = false; this.musicOn = true; this.voicesOn = true; this.hoofT = 0; this.beat = 0; this.stage = 0; }
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
      case 'spinstart': this.tone(t, 220, 0.4, 0.2, 'triangle', this.sfxBus, 2); break;
      case 'spinhit': this.tone(t, 880, 0.15, 0.25, 'square'); this.tone(t, 1320, 0.2, 0.15, 'triangle'); break;
      case 'spinmiss': this.tone(t, 160, 0.25, 0.25, 'sawtooth', this.sfxBus, 0.6); break;
      case 'golden': [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => { this.tone(t + i * 0.06, f, 0.6, 0.18, 'triangle'); this.tone(t + i * 0.06, f * 2, 0.4, 0.06, 'sine'); }); break;
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

  setStage(i, final) { this.stage = i; this.final = !!final; }

  // banda sonora western épica generada en tiempo real; cambia de instrumentos según la etapa
  music() {
    const bpm = this.final ? 168 : 150, spb = 60 / bpm / 4; // semicorcheas
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // Mi menor: Em - C - D - B7 (cadencia andaluza/western)
    const chords = [[40, 47, 52, 55, 59], [36, 43, 48, 52, 55], [38, 45, 50, 54, 57], [35, 42, 47, 51, 54]];
    const melody = [ // una nota por corchea (0 = silencio), 4 compases
      [76, 0, 74, 76, 79, 0, 76, 74], [72, 0, 0, 74, 76, 0, 72, 0], [74, 0, 78, 0, 81, 79, 78, 76], [75, 0, 0, 0, 78, 0, 75, 71],
      [76, 79, 83, 0, 81, 79, 76, 0], [79, 0, 76, 72, 74, 0, 72, 71], [74, 78, 81, 0, 86, 0, 84, 83], [83, 0, 81, 0, 78, 0, 75, 0]];
    const st = this.stage || 0;
    while (this.nextBeat < this.ctx.currentTime + 0.25) {
      const t = this.nextBeat, step = this.beat % 16, bar = Math.floor(this.beat / 16) % 8, ch = chords[bar % 4];
      const bus = this.musicBus;
      // bajo galopante (ta-ta-tum)
      if ([0, 3, 4, 8, 11, 12].includes(step)) this.tone(t, midi(ch[0] + (step === 12 ? 7 : 0)), spb * 1.6, 0.26, 'sawtooth', bus);
      // batería
      if (step === 0 || step === 8 || (this.final && step === 14)) this.tone(t, 110, 0.22, 0.75, 'sine', bus, 0.3);
      if (step === 4 || step === 12) this.noiseHit(t, 0.16, 1900, 0.42, 'bandpass', bus);
      if (step % 2 === 0) this.noiseHit(t, 0.03, 9000, st === 4 ? 0.16 : 0.09, 'highpass', bus);
      // guitarra rasgueada (arpegio del acorde)
      if (step % 4 === 2) ch.slice(1).forEach((n, i) => this.pluck(t + i * 0.012, midi(n + 12), 0.05));
      // pad de cuerdas en montaña y llanura
      if (step === 0 && (st === 2 || st === 3)) ch.slice(1, 4).forEach(n => this.tone(t, midi(n + 12), spb * 15, 0.035, 'triangle', bus));
      // melodía: silbido western en el desierto, trompeta en la final, campanas en la playa
      const mel = melody[bar][Math.floor(step / 2)];
      if (mel && step % 2 === 0 && (bar >= 2 || st >= 1)) {
        if (st === 1) this.whistle(t, midi(mel), spb * 1.8);
        else if (st === 4) { this.tone(t, midi(mel), spb * 1.8, 0.07, 'square', bus); this.tone(t, midi(mel - 12), spb * 1.8, 0.05, 'sawtooth', bus); }
        else if (st === 0) this.tone(t, midi(mel + 12), spb * 3, 0.06, 'sine', bus);
        else this.tone(t, midi(mel), spb * 1.8, 0.055, 'square', bus);
      }
      this.nextBeat += spb; this.beat++;
    }
  }
  pluck(t, f, g) {
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const flt = this.ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(4000, t); flt.frequency.exponentialRampToValueAtTime(400, t + 0.25);
    const gn = this.ctx.createGain(); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(flt).connect(gn).connect(this.musicBus); o.start(t); o.stop(t + 0.4);
  }
  whistle(t, f, dur) {
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 2, t);
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 6; const lg = this.ctx.createGain(); lg.gain.value = f * 0.02; lfo.connect(lg).connect(o.frequency);
    const gn = this.ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.09, t + 0.04); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    o.connect(gn).connect(this.musicBus); o.start(t); lfo.start(t); o.stop(t + dur + 0.15); lfo.stop(t + dur + 0.15);
  }

  // ------------------------------------------------------------ voces (síntesis de voz del navegador)
  voice(charId, kind, loud = true) {
    if (this.muted || !this.voicesOn || !window.speechSynthesis) return;
    const now = performance.now();
    if (now - (this.lastVoice || 0) < 1400) return;
    this.lastVoice = now;
    const L = VOICE_LINES[charId]; if (!L) return;
    const voices = speechSynthesis.getVoices();
    const ja = voices.find(v => /^ja/i.test(v.lang));
    const es = voices.find(v => /^es/i.test(v.lang));
    const useJa = !!ja;
    const opts = (useJa ? L.ja : L.es)[kind] || (useJa ? L.ja : L.es).stand;
    const text = Array.isArray(opts) ? opts[Math.floor(Math.random() * opts.length)] : opts;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = useJa ? ja : (es || null); u.lang = useJa ? 'ja-JP' : 'es-ES';
    u.pitch = L.pitch; u.rate = L.rate; u.volume = loud ? 1 : 0.5;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
}
export const audio = new AudioSys();
