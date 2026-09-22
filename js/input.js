// Virtual thumbstick (left side of the screen) + on-screen DRIFT / BRAKE / BOOST
// buttons (right thumb), unified across touch/mouse via Pointer Events, with a
// keyboard fallback. Like space-lion's stick, it gives an *absolute screen
// direction*; the game converts it to a world heading via the camera.
export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.hasDirection = false;
    this.dirX = 0; this.dirY = 0; // unit screen direction (y down)
    this.magnitude = 0; // 0..1 deflection = throttle

    this.stickActive = false;
    this.stickBaseX = 0; this.stickBaseY = 0;
    this.stickThumbX = 0; this.stickThumbY = 0;
    this.stickRadius = 70;

    this.held = { drift: false, brake: false, boost: false };
    this._stickId = null;
    this._keys = new Set();
    this.onKey = null; // (key) => void, for one-shot actions like camera rotate
    this._bind();
  }

  _isStickZone(x) { return x < window.innerWidth * 0.6; }

  _bind() {
    const el = this.canvas;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!this._isStickZone(e.clientX)) return;
      // A new touch in the stick zone always takes the stick over. The previous
      // owner may have vanished without a pointerup (system gesture, notification,
      // app switch) — refusing new touches is what made the stick "stick".
      this._stickId = e.pointerId;
      this.stickActive = true;
      this.hasDirection = false;
      this.magnitude = 0;
      this.stickBaseX = this.stickThumbX = e.clientX;
      this.stickBaseY = this.stickThumbY = e.clientY;
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }, { passive: false });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._stickId) return;
      e.preventDefault();
      // Mouse released outside the window: no pointerup ever arrives.
      if (e.pointerType === 'mouse' && e.buttons === 0) { this.releaseStick(); return; }
      this._updateStick(e.clientX, e.clientY);
    }, { passive: false });
    const end = (e) => { if (e.pointerId === this._stickId) this.releaseStick(); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this._keys.has(k) && this.onKey) this.onKey(k);
      this._keys.add(k);
      if (k === ' ') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this._keys.delete(e.key.toLowerCase()));
    // Leaving the app/tab mid-touch never delivers pointerup: reset everything.
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    window.addEventListener('pagehide', () => this.reset());
  }

  releaseStick() {
    this._stickId = null;
    this.stickActive = false;
    this.hasDirection = false;
    this.magnitude = 0;
  }

  // Drop all held input (stick, buttons, keys). Also called when pausing.
  reset() {
    this.releaseStick();
    this._keys.clear();
    for (const k in this.held) this.held[k] = false;
    for (const b of this._buttons || []) b.classList.remove('down');
  }

  // Hold-buttons: each tracks its own pointer so they work alongside the stick.
  bindButton(el, name) {
    (this._buttons ||= []).push(el);
    el.style.touchAction = 'none';
    let owner = null;
    const on = (e) => {
      e.preventDefault();
      owner = e.pointerId;
      this.held[name] = true;
      el.classList.add('down');
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    };
    const off = (e) => {
      if (owner !== null && e.pointerId !== owner) return;
      owner = null;
      this.held[name] = false;
      el.classList.remove('down');
    };
    el.addEventListener('pointerdown', on, { passive: false });
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _updateStick(x, y) {
    let dx = x - this.stickBaseX, dy = y - this.stickBaseY;
    const d = Math.hypot(dx, dy);
    if (d > this.stickRadius) { // floating base follows the thumb past the rim
      const over = d - this.stickRadius;
      this.stickBaseX += (dx / d) * over;
      this.stickBaseY += (dy / d) * over;
      dx = x - this.stickBaseX; dy = y - this.stickBaseY;
    }
    this.stickThumbX = this.stickBaseX + dx;
    this.stickThumbY = this.stickBaseY + dy;
    const dd = Math.hypot(dx, dy);
    const dead = 10;
    if (dd > dead) {
      this.hasDirection = true;
      this.dirX = dx / dd; this.dirY = dy / dd;
      const k = Math.min(1, (dd - dead) / (this.stickRadius * 0.75 - dead));
      this.magnitude = k * k * (3 - 2 * k); // smoothstep: gentle near the centre
    } else {
      this.hasDirection = false;
      this.magnitude = 0;
    }
  }

  // Returns {x, y, mag} in screen space or null. Keyboard wins when pressed.
  read() {
    const k = this._keys;
    let x = 0, y = 0;
    if (k.has('arrowleft') || k.has('a')) x -= 1;
    if (k.has('arrowright') || k.has('d')) x += 1;
    if (k.has('arrowup') || k.has('w')) y -= 1;
    if (k.has('arrowdown') || k.has('s')) y += 1;
    if (x || y) {
      const n = Math.hypot(x, y);
      return { x: x / n, y: y / n, mag: 1 };
    }
    if (this.hasDirection) return { x: this.dirX, y: this.dirY, mag: this.magnitude };
    return null;
  }

  get drift() { return this.held.drift || this._keys.has(' '); }
  get brake() { return this.held.brake || this._keys.has('x') || this._keys.has('b'); }
  get boost() { return this.held.boost || this._keys.has('shift'); }
}
