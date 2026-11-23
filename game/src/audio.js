export class AudioSys {
  constructor() {
    this.on = false; this.muted = false; this.ctx = null; this.master = null;
    this.station = 0; this.step = 0; this.nextStep = 0; this.radioOn = true;
    this.engineOsc = null; this.engineOsc2 = null; this.engineGain = null; this.engineFilter = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenHi = false;
    this.noiseBuf = null;
    this.stations = [
      { name: 'TIDE FM 98.6', song: 'Neon Tideline — Azura Nights', bpm: 92, root: 45, minor: [0, 3, 5, 7, 10],
        kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        hat: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1], bass: [0, -1, -1, 0, 3, -1, -1, 0, 5, -1, -1, 0, 7, -1, 5, -1],
        lead: [12, -1, 10, -1, 12, -1, 15, -1, 14, -1, 12, -1, 10, -1, 7, -1] },
      { name: 'NEON 101.2', song: 'Palm Heights — Sunset Drive', bpm: 104, root: 41, minor: [0, 2, 3, 7, 8],
        kick: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
        hat: [1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1], bass: [0, -1, 0, -1, 3, -1, 5, -1, 0, -1, 0, -1, 7, -1, 5, 3],
        lead: [12, 12, -1, 10, -1, 12, -1, 15, -1, 14, 12, -1, 10, 7, -1, 7] },
      { name: 'BAY 104.5', song: 'Kane Row — Harbor Heavy', bpm: 96, root: 38, minor: [0, 3, 5, 6, 10],
        kick: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
        hat: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0], bass: [0, 0, -1, 0, -1, 3, -1, 0, 0, -1, 5, -1, 6, -1, 5, -1],
        lead: [15, -1, -1, 12, -1, 14, -1, -1, 12, -1, 10, -1, 12, 15, -1, 14] },
    ];
  }
  init() {
    if (this.on) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth';
      this.engineOsc2 = this.ctx.createOscillator(); this.engineOsc2.type = 'square';
      this.engineFilter = this.ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter); this.engineOsc2.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start(); this.engineOsc2.start();
      this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'square';
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.on = true; this.nextStep = this.ctx.currentTime + 0.1;
    } catch (e) { this.on = false; }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!this.on || this.muted) return;
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, freq, type = 'bandpass', when = 0) {
    if (!this.on || this.muted) return;
    const t = this.ctx.currentTime + when, s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02);
  }
  shot() { this.noise(0.09, 0.5, 1800, 'highpass'); this.tone(160, 0.08, 'square', 0.25, 0, 60); }
  explosion() { this.noise(0.9, 0.9, 240, 'lowpass'); this.tone(90, 0.7, 'sine', 0.7, 0, 30); }
  crash() { this.noise(0.25, 0.5, 500, 'lowpass'); this.tone(70, 0.2, 'sine', 0.4, 0, 40); }
  screech() { this.noise(0.35, 0.22, 2600, 'bandpass'); }
  horn() { this.tone(370, 0.28, 'square', 0.16); this.tone(466, 0.28, 'square', 0.14); }
  pickup() { this.tone(660, 0.09, 'sine', 0.3); this.tone(990, 0.12, 'sine', 0.3, 0.08); }
  cash() { [880, 1108, 1318, 1760].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.25, i * 0.07)); }
  mission() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.3, i * 0.09)); }
  fail() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.2, 'sawtooth', 0.16, i * 0.12)); }
  click() { this.tone(1200, 0.05, 'square', 0.15); }
  reload() { this.tone(500, 0.05, 'square', 0.2); this.tone(750, 0.05, 'square', 0.2, 0.12); }
  splash() { this.noise(0.3, 0.3, 900, 'bandpass'); }
  bite() { this.tone(1400, 0.1, 'sine', 0.3); this.tone(1800, 0.12, 'sine', 0.3, 0.09); }
  bounce() { this.tone(220, 0.1, 'sine', 0.3, 0, 440); }
  swish() { this.noise(0.25, 0.3, 1400, 'highpass'); this.tone(880, 0.15, 'sine', 0.2, 0.05, 1320); }
  coin() { this.tone(988, 0.08, 'square', 0.2); this.tone(1319, 0.14, 'square', 0.2, 0.07); }
  jetpack() { this.noise(0.5, 0.25, 700, 'bandpass'); }
  heli() { this.noise(0.4, 0.12, 300, 'lowpass'); }
  engine(speed01, on) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.11 : 0, t, 0.1);
    const f = 55 + speed01 * 165;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5 + 3, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(380 + speed01 * 1400, t, 0.1);
  }
  siren(dist, on) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    if (!on) { this.sirenGain.gain.setTargetAtTime(0, t, 0.2); return; }
    const vol = Math.max(0, 0.11 - dist * 0.00045);
    this.sirenGain.gain.setTargetAtTime(vol, t, 0.2);
    this.sirenHi = !this.sirenHi;
    this.sirenOsc.frequency.setTargetAtTime(this.sirenHi ? 960 : 720, t, 0.05);
  }
  radio(dt, intensity) {
    if (!this.on || !this.radioOn || this.muted) return;
    const st = this.stations[this.station], spb = 60 / st.bpm / 4;
    while (this.nextStep < this.ctx.currentTime + 0.12) {
      const s = this.step % 16, t = this.nextStep - this.ctx.currentTime;
      const when = Math.max(0, t);
      if (st.kick[s]) this.kick(when);
      if (st.snare[s]) this.snareHit(when);
      if (st.hat[s]) this.hatHit(when, intensity);
      const b = st.bass[s]; if (b >= 0) this.tone(this.midi(st.root + st.minor[b % 5] + 12 * Math.floor(b / 5)), spb * 0.9, 'sawtooth', 0.16, when);
      const l = st.lead[s]; if (l >= 0 && intensity > 0.15) this.tone(this.midi(st.root + 24 + st.minor[l % 5] + 12 * Math.floor(l / 5)), spb * 0.8, 'square', 0.07, when);
      this.nextStep += spb; this.step++;
    }
  }
  kick(when) { if (!this.on) return; const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.16); }
  snareHit(when) { this.noise(0.12, 0.22, 1900, 'bandpass', when); }
  hatHit(when, intensity) { this.noise(0.04, 0.08 + intensity * 0.08, 7000, 'highpass', when); }
  nextStation() { this.station = (this.station + 1) % this.stations.length; return this.stations[this.station]; }
}
