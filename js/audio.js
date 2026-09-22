// Tiny WebAudio synth: no sample files. Everything is gated behind the first
// user gesture (start button), per browser autoplay rules.
export class Sfx {
  constructor() { this.ctx = null; this.siren = null; this.muted = false; }

  unlock() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { this.ctx = null; }
  }

  _tone(freq, dur, type = 'square', vol = 0.08, slide = 0) {
    const c = this.ctx;
    if (!c || this.muted) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }

  coin() { this._tone(988, 0.07, 'square', 0.05); setTimeout(() => this._tone(1319, 0.12, 'square', 0.05), 60); }
  power() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.1, 'triangle', 0.08), i * 55)); }
  load() { [392, 523, 659].forEach((f, i) => setTimeout(() => this._tone(f, 0.12, 'triangle', 0.09), i * 70)); }
  deliver() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this._tone(f, 0.16, 'square', 0.06), i * 80)); }
  fail() { this._tone(330, 0.4, 'sawtooth', 0.06, -200); }
  crash() { this._tone(110, 0.25, 'sawtooth', 0.12, -60); this._tone(70, 0.3, 'square', 0.08, -30); }
  bonk() { this._tone(520, 0.08, 'triangle', 0.08, -300); }
  jump() { this._tone(300, 0.25, 'triangle', 0.07, 500); }

  // Two-tone siren while a patient is aboard.
  setSiren(on) {
    const c = this.ctx;
    if (!c) return;
    if (on && !this.siren && !this.muted) {
      const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = 760;
      lfo.type = 'square'; lfo.frequency.value = 1.6; lg.gain.value = 130;
      lfo.connect(lg).connect(o.frequency);
      g.gain.value = 0.025;
      o.connect(g).connect(c.destination);
      o.start(); lfo.start();
      this.siren = { o, lfo, g };
    } else if (!on && this.siren) {
      const { o, lfo, g } = this.siren;
      g.gain.setTargetAtTime(0, c.currentTime, 0.05);
      setTimeout(() => { o.stop(); lfo.stop(); }, 300);
      this.siren = null;
    }
  }
}
