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
      nav2: $('nav2'), nav2Arrow: $('nav2-arrow'), nav2Dist: $('nav2-dist'),
      pizzaLabel: $('pizza-label'), pizzaTimer: $('pizza-timer'),
    };
    this.nav2Angle = 0;
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
      e.fareLabel.textContent = `🚑 → ${s.fare.label}`;
      e.fareTimer.textContent = `${Math.ceil(s.fare.timeLeft)}s`;
      const k = Math.max(0, s.fare.timeLeft / s.fare.timeMax);
      e.fareBar.style.width = `${k * 100}%`;
      e.fareBar.style.background = k > 0.5 ? '#3ddc84' : k > 0.2 ? '#ffd45e' : '#ee4b5e';
    } else {
      e.fareLabel.textContent = s.waiting ? 'Pick up a patient!' : 'No calls…';
      e.fareTimer.textContent = '';
      e.fareBar.style.width = '0%';
    }
    if (s.pizza.count) {
      e.pizzaLabel.textContent = `🍕 ×${s.pizza.count} → pizzeria`;
      const tl = Math.ceil(s.pizza.minTime);
      e.pizzaTimer.textContent = tl > 0 ? `hot ${tl}s` : 'cold 🥶';
    } else {
      e.pizzaLabel.textContent = '🍕 Grab pizzas at the orange beams';
      e.pizzaTimer.textContent = '';
    }
    this._nav(dt, s, camera);
    this._nav2(dt, s, camera);
    this._draw(dt, camera, input);
  }

  _screenAngle(s, t, camera) {
    _v.set(s.px, 0, s.pz).project(camera);
    const ax = _v.x, ay = _v.y;
    _v.set(t.x, 0, t.z).project(camera);
    return Math.atan2((_v.x - ax) * innerWidth, (_v.y - ay) * innerHeight); // 0 = up the screen
  }

  _nav2(dt, s, camera) {
    const e = this.el, t = s.pizzaTarget;
    if (!t) { e.nav2.className = 'nav pizza none'; e.nav2Dist.textContent = '--'; return; }
    const target = this._screenAngle(s, t, camera);
    const diff = Math.atan2(Math.sin(target - this.nav2Angle), Math.cos(target - this.nav2Angle));
    this.nav2Angle += diff * Math.min(1, dt * 10);
    e.nav2Arrow.style.transform = `rotate(${this.nav2Angle}rad)`;
    e.nav2Dist.textContent = `${Math.round(Math.hypot(t.x - s.px, t.z - s.pz))}m`;
    e.nav2.className = 'nav pizza';
  }

  // Top-of-screen compass: rotate toward the target *as seen on screen*.
  _nav(dt, s, camera) {
    const e = this.el;
    const t = s.navTarget;
    if (!t) { e.nav.className = 'nav none'; e.navDist.textContent = '--'; return; }
    const target = this._screenAngle(s, t, camera);
    let diff = target - this.navAngle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.navAngle += diff * Math.min(1, dt * 10);
    e.navArrow.style.transform = `rotate(${this.navAngle}rad)`;
    const dist = Math.hypot(t.x - s.px, t.z - s.pz);
    e.navDist.textContent = `${Math.round(dist)}m`;
    e.navLabel.textContent = t.kind === 'drop' ? 'HOSPITAL' : 'PATIENT';
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
  }
}
