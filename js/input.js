// Virtual thumbstick (left side) + hold-to-boost (right side), unified across
// touch/mouse via Pointer Events, with a keyboard fallback. Same feel as
// space-lion's stick: the stick gives an *absolute screen direction*; the game
// converts it to a world heading using the camera's orientation.
export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.hasDirection = false; // stick currently deflected past the deadzone
    this.dirX = 0; this.dirY = 0; // unit screen direction (y down)
    this.magnitude = 0; // 0..1 deflection = throttle
    this.boosting = false;

    this.stickActive = false;
    this.stickBaseX = 0; this.stickBaseY = 0;
    this.stickThumbX = 0; this.stickThumbY = 0;
    this.stickRadius = 60;

    this._stickId = null;
    this._boostIds = new Set();
    this._keys = new Set();
    this._bind();
  }

  _isStickZone(x) { return x < window.innerWidth * 0.55; }

  _bind() {
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this._stickId === null && this._isStickZone(e.clientX)) {
        this._stickId = e.pointerId;
        this.stickActive = true;
        this.stickBaseX = this.stickThumbX = e.clientX;
        this.stickBaseY = this.stickThumbY = e.clientY;
      } else {
        this._boostIds.add(e.pointerId);
        this.boosting = true;
      }
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }, { passive: false });

    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._stickId) return;
      e.preventDefault();
      this._updateStick(e.clientX, e.clientY);
    }, { passive: false });

    const end = (e) => {
      if (e.pointerId === this._stickId) {
        this._stickId = null;
        this.stickActive = false;
        this.hasDirection = false; // unlike space-lion: releasing = brake, so you can stop in zones
        this.magnitude = 0;
      }
      if (this._boostIds.delete(e.pointerId) && this._boostIds.size === 0) this.boosting = false;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', end);

    window.addEventListener('keydown', (e) => this._keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this._keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this._keys.clear());
  }

  _updateStick(x, y) {
    let dx = x - this.stickBaseX, dy = y - this.stickBaseY;
    const d = Math.hypot(dx, dy);
    // Floating base: drag past the rim and the base follows your thumb.
    if (d > this.stickRadius) {
      const over = d - this.stickRadius;
      this.stickBaseX += (dx / d) * over;
      this.stickBaseY += (dy / d) * over;
      dx = x - this.stickBaseX; dy = y - this.stickBaseY;
    }
    this.stickThumbX = this.stickBaseX + dx;
    this.stickThumbY = this.stickBaseY + dy;
    const dd = Math.hypot(dx, dy);
    if (dd > 8) {
      this.hasDirection = true;
      this.dirX = dx / dd; this.dirY = dy / dd;
      this.magnitude = Math.min(1, (dd - 8) / (this.stickRadius * 0.7));
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

  get boost() { return this.boosting || this._keys.has(' ') || this._keys.has('shift'); }
}
