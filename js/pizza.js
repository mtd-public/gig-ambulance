import { spawn } from './assets.js';
import { scaleBeam } from './fares.js';
import { pick } from './utils.js';

export const PIZZA_ASSETS = ['marker_pizza', 'prop_pizza_box', 'bld_pizzeria'];
const CAPACITY = 3;
const WAITING = 3;
const ZONE_R = 6.5;
const ROLL_SPEED = 12; // roll through the beam — no full stop needed

// Pizza side-gig, runs in parallel with patient fares (do it MID-DELIVERY):
// pizza boxes wait at orange beams around town -> roll through to grab (up to 3,
// stacked on the roof) -> drop them all at either pizzeria before they go cold.
export class Pizza {
  constructor(scene, town) {
    this.scene = scene;
    this.town = town;
    this.shops = town.pizzaSpots.map((spot) => {
      const marker = spawn('marker_pizza');
      marker.position.set(spot.x, 0, spot.z);
      scaleBeam(marker, ZONE_R);
      marker.visible = false;
      scene.add(marker);
      return { spot, marker };
    });
    this.waiting = []; // {spot, marker, box, t}
    this.carried = []; // {timeLeft, timeMax}
    this.flyers = [];  // boxes arcing from van to shop
  }

  fill(player) {
    const busy = this.town.busy || (this.town.busy = new Set());
    while (this.waiting.length < WAITING) {
      const spots = this.town.pickupSpots.filter((s) => !busy.has(s)
        && Math.hypot(s.x - player.pos.x, s.z - player.pos.z) > 30);
      if (!spots.length) break;
      const spot = pick(spots);
      busy.add(spot);
      const marker = spawn('marker_pizza');
      marker.position.set(spot.x, 0, spot.z);
      scaleBeam(marker, ZONE_R);
      const box = spawn('prop_pizza_box');
      box.position.set(spot.standX, 0.18, spot.standZ);
      box.scale.setScalar(1.4);
      this.scene.add(marker, box);
      this.waiting.push({ spot, marker, box, t: Math.random() * 6 });
    }
  }

  get count() { return this.carried.length; }
  get minTime() { return this.carried.reduce((m, p) => Math.min(m, p.timeLeft), Infinity); }

  // Nav target for the secondary (orange) compass.
  get target() {
    const list = this.carried.length ? this.shops.map((s) => s.spot)
      : this.waiting.map((w) => w.spot);
    return list.length ? { list, kind: this.carried.length ? 'pizzaDrop' : 'pizzaPick' } : null;
  }

  nearestTarget(p) {
    const t = this.target;
    if (!t) return null;
    let best = null, bd = Infinity;
    for (const s of t.list) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bd) { bd = d; best = s; }
    }
    return { x: best.x, z: best.z, kind: t.kind };
  }

  update(dt, t, player, events) {
    const p = player.pos;
    const rolling = player.speed < ROLL_SPEED && !player.airborne;
    for (const c of this.carried) c.timeLeft -= dt;
    for (const s of this.shops) {
      s.marker.visible = this.carried.length > 0;
      const icon = s.marker.getObjectByName('icon');
      icon.position.y = 3.4 + Math.sin(t * 3) * 0.3; icon.rotation.y = t * 2;
    }
    for (const w of [...this.waiting]) {
      w.t += dt;
      const icon = w.marker.getObjectByName('icon');
      icon.position.y = 3.4 + Math.sin(w.t * 3) * 0.3; icon.rotation.y = w.t * 2;
      w.box.rotation.y = w.t;
      if (this.carried.length >= CAPACITY || !rolling) continue;
      if (Math.hypot(w.spot.x - p.x, w.spot.z - p.z) < ZONE_R) this._grab(w, player, events);
    }
    if (this.carried.length && rolling) {
      for (const s of this.shops) {
        if (Math.hypot(s.spot.x - p.x, s.spot.z - p.z) < ZONE_R) { this._drop(s, player, events); break; }
      }
    }
    // Boxes arcing from the roof to the shop door.
    for (const f of this.flyers) {
      f.t += dt;
      const k = Math.min(1, f.t / 0.6);
      f.mesh.position.set(f.x0 + (f.x1 - f.x0) * k, 2.6 + Math.sin(k * Math.PI) * 3 - k * 2.4, f.z0 + (f.z1 - f.z0) * k);
      f.mesh.rotation.y += dt * 10;
      if (k >= 1) this.scene.remove(f.mesh);
    }
    this.flyers = this.flyers.filter((f) => f.t < 0.6);
  }

  _grab(w, player, events) {
    this.waiting.splice(this.waiting.indexOf(w), 1);
    this.town.busy.delete(w.spot);
    this.scene.remove(w.marker, w.box);
    // Hot-timer: distance to the nearer pizzeria, grid-ish route, with slack.
    const d = Math.min(...this.shops.map((s) => Math.hypot(s.spot.x - w.spot.x, s.spot.z - w.spot.z)));
    const timeMax = Math.round(18 + (d * 1.3) / 10);
    this.carried.push({ timeLeft: timeMax, timeMax });
    player.setPizzaStack(this.carried.length);
    events.push({ type: 'pizzaGrab', count: this.carried.length, x: w.spot.x, z: w.spot.z });
    this.fill(player);
  }

  _drop(shop, player, events) {
    let pay = 0, hot = 0;
    for (const c of this.carried) {
      const isHot = c.timeLeft > 0;
      if (isHot) hot++;
      pay += 6 + (isHot ? Math.round(4 + c.timeLeft * 0.4) : 0);
      this.flyers.push({ mesh: this._flyer(), t: 0, x0: player.pos.x, z0: player.pos.z,
        x1: shop.spot.standX, z1: shop.spot.standZ });
    }
    const n = this.carried.length;
    this.carried = [];
    player.setPizzaStack(0);
    events.push({ type: 'pizzaDrop', count: n, hot, pay, x: shop.spot.x, z: shop.spot.z });
  }

  _flyer() {
    const m = spawn('prop_pizza_box');
    this.scene.add(m);
    return m;
  }

  // A hard crash knocks the top box off the roof.
  onCrash(player, events) {
    if (!this.carried.length) return;
    this.carried.pop();
    player.setPizzaStack(this.carried.length);
    events.push({ type: 'pizzaLost', x: player.pos.x, z: player.pos.z });
  }
}
