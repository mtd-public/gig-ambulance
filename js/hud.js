import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

// DOM HUD (timers, cash, meters, toasts, top nav compass) + a 2D overlay
// canvas for the thumbstick and floating world-space "+$12" texts.
export class Hud {
  constructor(overlay) {
    this.canvas = overlay;
    this.ctx = overlay.getContext('2d');
    this.el = {
      hud: $('hud'), time: $('hud-time'), timeVal: document.querySelector('#hud-time .val'),
      cash: document.querySelector('#hud-cash .val'), fareLabel: $('fare-label'), fareTimer: $('fare-timer'),
      fareBar: $('fare-bar'), dmg: $('dmg-bar'), boost: $('boost-bar'), toasts: $('toasts'),
      nav: $('nav'), navArrow: $('nav-arrow'), navDist: $('nav-dist'), navLabel: $('nav-label'),
    };
    this.floaters = [];
    this.navAngle = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = innerWidth * dpr; this.canvas.height = innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  toast(text, cls = '') {
    const d = document.createElement('div');
    d.className = `toast ${cls}`;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 1600);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
  }

  float(text, x, y, z, color = '#2f9e62') {
    this.floaters.push({ text, p: new THREE.Vector3(x, y, z), t: 0, color });
  }

  update(dt, s, camera, input) {
    const e = this.el;
    e.timeVal.textContent = Math.ceil(Math.max(0, s.time));
    e.time.classList.toggle('warn', s.time < 10);
    e.cash.textContent = s.cash;
    e.dmg.style.height = `${Math.round(s.damage * 100)}%`;
    e.boost.style.height = `${Math.round(s.boost * 100)}%`;
    if (s.fare) {
      e.fareLabel.textContent = `🚑 ${s.fare.label}`;
      e.fareTimer.textContent = `${Math.ceil(s.fare.timeLeft)}s`;
      const k = Math.max(0, s.fare.timeLeft / s.fare.timeMax);
      e.fareBar.style.width = `${k * 100}%`;
      e.fareBar.style.background = k > 0.5 ? '#3ddc84' : k > 0.2 ? '#ffd45e' : '#ee4b5e';
    } else {
      e.fareLabel.textContent = s.waiting ? 'Pick up a patient!' : 'No calls…';
      e.fareTimer.textContent = '';
      e.fareBar.style.width = '0%';
    }
    this._nav(dt, s, camera);
    this._draw(dt, camera, input);
  }

  // Top-of-screen compass: rotate toward the target *as seen on screen*.
  _nav(dt, s, camera) {
    const e = this.el;
    const t = s.navTarget;
    if (!t) { e.nav.className = 'nav none'; e.navDist.textContent = '--'; return; }
    _v.set(s.px, 0, s.pz).project(camera);
    const ax = _v.x, ay = _v.y;
    _v.set(t.x, 0, t.z).project(camera);
    const dx = (_v.x - ax) * innerWidth, dy = (_v.y - ay) * innerHeight;
    const target = Math.atan2(dx, dy); // 0 = up the screen
    let diff = target - this.navAngle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.navAngle += diff * Math.min(1, dt * 10);
    e.navArrow.style.transform = `rotate(${this.navAngle}rad)`;
    const dist = Math.hypot(t.x - s.px, t.z - s.pz);
    e.navDist.textContent = `${Math.round(dist)}m`;
    e.navLabel.textContent = t.kind === 'drop' ? 'HOSPITAL' : 'PICKUP';
    e.nav.className = `nav ${t.kind === 'drop' ? 'drop' : 'pickup'}${dist < 12 ? ' near' : ''}`;
  }

  _draw(dt, camera, input) {
    const c = this.ctx;
    c.clearRect(0, 0, innerWidth, innerHeight);
    // floating texts
    c.textAlign = 'center';
    c.font = '900 22px "Trebuchet MS", system-ui, sans-serif';
    c.lineWidth = 5;
    c.strokeStyle = '#3b2e5a';
    this.floaters = this.floaters.filter((f) => (f.t += dt) < 1.2);
    for (const f of this.floaters) {
      _v.copy(f.p).project(camera);
      const x = (_v.x * 0.5 + 0.5) * innerWidth;
      const y = (-_v.y * 0.5 + 0.5) * innerHeight - f.t * 60;
      c.globalAlpha = Math.min(1, (1.2 - f.t) * 3);
      c.strokeText(f.text, x, y);
      c.fillStyle = f.color;
      c.fillText(f.text, x, y);
    }
    c.globalAlpha = 1;
    // thumbstick
    if (input.stickActive) {
      c.beginPath();
      c.arc(input.stickBaseX, input.stickBaseY, input.stickRadius, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,253,248,0.28)'; c.fill();
      c.lineWidth = 4; c.strokeStyle = 'rgba(59,46,90,0.55)'; c.stroke();
      c.beginPath();
      c.arc(input.stickThumbX, input.stickThumbY, 26, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,253,248,0.9)'; c.fill();
      c.strokeStyle = '#3b2e5a'; c.stroke();
    } else {
      // resting hint in the stick zone
      c.beginPath();
      c.arc(90, innerHeight - 110, 44, 0, Math.PI * 2);
      c.lineWidth = 3; c.strokeStyle = 'rgba(59,46,90,0.25)'; c.stroke();
    }
    if (input.boosting) {
      c.beginPath();
      c.arc(innerWidth - 90, innerHeight - 110, 40, 0, Math.PI * 2);
      c.fillStyle = 'rgba(238,75,94,0.35)'; c.fill();
    }
  }
}
