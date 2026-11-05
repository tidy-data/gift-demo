/** Original, procedural WebAudio score. No recordings or third-party audio. */
export class GiftAudio {
  constructor() { this.ctx = null; this.master = null; this.muted = false; this.pads = []; }
  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = .48;
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14; compressor.knee.value = 18;
      compressor.ratio.value = 5; compressor.attack.value = .004; compressor.release.value = .3;
      this.master.connect(compressor); compressor.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }
  setMuted(value) { this.muted = value; if (this.master) this.master.gain.setTargetAtTime(value ? 0 : .48, this.ctx.currentTime, .05); }
  tone(freq, start, duration, volume = .08, type = 'sine', endFreq = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + start, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), t + duration);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(volume, t + Math.min(.06, duration / 4));
    g.gain.exponentialRampToValueAtTime(.0001, t + duration);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + duration + .05);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  noise(duration, volume = .1, low = 100, high = 5000, start = 0, sweep = false) {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate, buffer = this.ctx.createBuffer(1, Math.ceil(sr * duration), sr), d = buffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = .7;
    const t = this.ctx.currentTime + start;
    filter.frequency.setValueAtTime(sweep ? low : Math.sqrt(low * high), t);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(high, t + duration);
    const gain = this.ctx.createGain(); gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + duration * .25);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t); src.stop(t + duration + .02); src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  thud() { this.tone(90, 0, .65, .5, 'sine', 30); this.noise(.22, .18, 80, 500); this.tone(45, 0, .8, .22); }
  tap() { this.tone(640, 0, .17, .07, 'sine', 340); }
  crack() {
    this.noise(.18, .26, 1500, 6500); this.noise(.12, .2, 900, 4000, .13);
    this.tone(70, 0, .55, .24, 'sine', 35);
    for (let i = 0; i < 6; i++) this.tone(900 + Math.random() * 1800, i * .11, .5, .022, 'sine');
  }
  rise(duration = 2.7) { this.noise(duration, .12, 90, 4800, 0, true); this.tone(60, 0, duration, .15, 'sawtooth', 210); }
  boom() {
    this.tone(95, 0, 2.7, .8, 'sine', 22); this.tone(48, 0, 3.5, .48, 'triangle', 18);
    this.noise(1.2, .62, 40, 1100); this.noise(2.3, .24, 1800, 8000);
    for (let i = 0; i < 9; i++) this.tone(260 * Math.pow(2, [0,4,7,11,12,16][i%6]/12), i * .055, 1.4, .022, 'sine');
  }
  galaxy() {
    if (!this.ctx) return;
    [110, 164.81, 220, 277.18, 329.63].forEach((f, i) => this.tone(f, i * .17, 8, .028, 'sine'));
    for (let i = 0; i < 14; i++) this.tone(700 + Math.random() * 1700, i * .24, 1.2, .017, 'sine');
    this.noise(5, .028, 2500, 8500);
  }
  finale() {
    [261.63,329.63,392,523.25,659.25].forEach((f,i) => this.tone(f, i*.28, 3.8, .04, 'sine'));
    this.tone(130.81, 0, 5, .055, 'sine');
  }
}
