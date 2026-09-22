import * as THREE from 'three';
import { cloneMaterials, spawn } from './assets.js';
import { clamp, damp, wrapAngle } from './utils.js';

// Surface feel: [top-speed factor, grip factor].
const SURF = { road: [1, 1], pave: [0.95, 1], grass: [0.82, 0.7], sand: [0.72, 0.55], water: [0.45, 0.5] };

// Arcade car: the stick gives a desired *world heading* + throttle; the van
// swings its nose toward it at a speed-dependent rate. Lateral grip drops when
// you yank the stick hard at speed -> Crazy-Taxi-style power slides.
export class Ambulance {
  constructor(scene, town) {
    this.town = town;
    this.mesh = cloneMaterials(spawn('veh_ambulance'));
    scene.add(this.mesh);
    this.body = this.mesh; // root node holds the body mesh + child nodes
    this.wheels = {};
    for (const n of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
      const w = this.mesh.getObjectByName(n);
      w.rotation.order = 'YXZ';
      this.wheels[n] = w;
    }
    this.sirens = ['siren_l', 'siren_r'].map((n) => {
      const node = this.mesh.getObjectByName(n);
      const mats = [];
      node.traverse((o) => { if (o.isMesh) mats.push(o.material); });
      return { node, mats, base: mats[0]?.emissiveIntensity ?? 1 };
    });

    // X-ray silhouette where buildings hide the van. Draw order: world (0) ->
    // ghost (5, passes only where something is in front) -> van itself (10).
    const xray = new THREE.MeshBasicMaterial({ color: 0x7a66c9, depthWrite: false, depthFunc: THREE.GreaterDepth });
    const meshes = [];
    this.mesh.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const o of meshes) {
      o.renderOrder = 10;
      const ghost = new THREE.Mesh(o.geometry, xray);
      ghost.renderOrder = 5;
      ghost.castShadow = false;
      o.add(ghost);
    }

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2(); // x, z
    this.heading = Math.PI; // facing north (-Z)
    this.steer = 0;
    this.radius = 1.25;
    this.y = 0; this.vy = 0; this.airborne = false; this.airTime = 0;
    this.lean = 0; this.pitch = 0;

    this.maxSpeed = 15;
    this.boostSpeed = 25;
    this.boost = 1; // 0..1 siren-rush meter
    this.boosting = false;
    this.damage = 0; // 0..1
    this.shield = 0; // seconds of invulnerability
    this.drifting = false;
    this.driftTime = 0;
    this.sirenOn = false;
    this.events = []; // {type, ...} consumed by main each frame
  }

  get speed() { return this.vel.length(); }
  get forward() { return new THREE.Vector2(Math.sin(this.heading), Math.cos(this.heading)); }

  place(x, z, heading) {
    this.pos.set(x, 0, z); this.heading = heading; this.vel.set(0, 0);
  }

  // ctl: {x, z, mag} desired world direction + throttle (or null); btn: {boost, drift, brake}
  update(dt, ctl, btn, t) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx; // right-hand vector
    let vF = this.vel.x * fx + this.vel.y * fz;
    let vL = this.vel.x * rx + this.vel.y * rz;
    const sp = Math.abs(vF);
    this.surface = this.town.surface(this.pos.x, this.pos.z);
    const [speedK, gripK] = SURF[this.surface] || SURF.road;

    this.boosting = btn.boost && this.boost > 0.02 && !!ctl && !btn.brake;
    this.boost = clamp(this.boost + (this.boosting ? -0.32 : 0.04) * dt, 0, 1);
    const top = (this.boosting ? this.boostSpeed : this.maxSpeed * (1 - this.damage * 0.35)) * speedK;
    const handbrake = btn.drift && sp > 5 && !this.airborne;

    // Steering: smooth the requested angle, then drive the yaw *rate* with a
    // damped spring so the van eases into and out of turns instead of snapping.
    let targetSpeed = 0, diff = 0;
    if (ctl && !this.airborne) {
      const raw = Math.atan2(ctl.x, ctl.z);
      if (this.wantAngle === undefined) this.wantAngle = raw;
      this.wantAngle = wrapAngle(this.wantAngle + wrapAngle(raw - this.wantAngle) * (1 - Math.exp(-14 * dt)));
      diff = wrapAngle(this.wantAngle - this.heading);
      const maxRate = (0.9 + Math.min(sp, 10) * 0.28) * (handbrake ? 1.55 : 1);
      const desired = clamp(diff * 3.0, -maxRate, maxRate);
      this.yawRate = damp(this.yawRate || 0, desired, handbrake ? 7 : 10, dt);
      this.steer = damp(this.steer, clamp(diff, -0.6, 0.6), 10, dt);
      const align = Math.cos(Math.min(Math.abs(diff), Math.PI / 1.4));
      targetSpeed = top * ctl.mag * (0.5 + 0.5 * Math.max(0, align));
    } else {
      this.wantAngle = this.heading;
      this.yawRate = damp(this.yawRate || 0, 0, 8, dt);
      this.steer = damp(this.steer, 0, 8, dt);
    }
    if (!this.airborne) this.heading = wrapAngle(this.heading + this.yawRate * dt);

    if (!this.airborne) {
      let accel;
      if (btn.brake) { targetSpeed = 0; accel = 38; } // hard brake
      else if (handbrake) { targetSpeed = Math.min(targetSpeed, sp); accel = 4; } // carry speed through the slide
      else accel = targetSpeed > vF ? (this.boosting ? 22 : 13) : (ctl ? 10 : 11);
      vF += clamp(targetSpeed - vF, -accel * dt, accel * dt);
      // Grip: handbrake or a hard yank at speed lets the tail step out.
      const hard = Math.abs(diff) > 0.7 && sp > 11;
      const grip = (handbrake ? 1.3 : hard ? 2.6 : 7.5) * gripK;
      if (vF > top + 0.5) vF += (top - vF) * Math.min(1, 1.5 * dt); // bog down in sand/water
      vL = damp(vL, 0, grip, dt);
      this.drifting = (handbrake || hard || Math.abs(vL) > 3.5) && sp > 6;
      this.driftTime = this.drifting ? this.driftTime + dt : 0;
    }

    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    this.vel.set(nfx * vF + -nfz * vL, nfz * vF + nfx * vL);
    if (this.airborne) this.vel.multiplyScalar(0.999);

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;

    // Static collisions: buildings hurt; fountains/tables/world edge just bounce.
    const before = this.vel.clone();
    const hit = this.town.collide(this.pos, this.radius);
    if (hit) {
      const vn = this.vel.x * hit.nx + this.vel.y * hit.nz; // negative = into it
      if (vn < 0) {
        const hard = hit.kind === 'building';
        this.vel.x -= (hard ? 1.35 : 1.1) * vn * hit.nx;
        this.vel.y -= (hard ? 1.35 : 1.1) * vn * hit.nz;
        this.vel.multiplyScalar(hard ? 0.7 : 0.85);
        const impact = -vn;
        if (hard && impact > 4) this.crash(impact, before);
        else if (!hard && impact > 5) this.events.push({ type: 'bonk', impact });
      }
    }

    // Vertical: hug the ground, but if it falls away faster than a ballistic
    // arc from our current vertical speed (ramp lips, hill crests), go airborne.
    const g = this.town.groundHeight(this.pos.x, this.pos.z);
    if (!this.airborne) {
      const ballistic = this.y + this.vy * dt - 11 * dt * dt;
      if (g < ballistic - 0.05 && sp > 6) {
        this.airborne = true; this.airTime = 0; this.y = ballistic;
      } else {
        const step = g - this.y;
        // kerbs are steps, not slopes: don't turn them into launch speed
        this.vy = step > 0.1 ? 0 : clamp(step / Math.max(dt, 1e-3), -12, 12);
        this.y = g;
      }
    }
    if (this.airborne) {
      this.airTime += dt;
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= g) {
        this.y = g; this.airborne = false; this.vy = 0;
        this.events.push({ type: 'land', air: this.airTime });
        if (this.airTime > 0.3) this.pitch = -0.12;
      }
    }
    if (this.shield > 0) this.shield -= dt;

    this._visuals(dt, vF, t);
  }

  // Pizza boxes stacked on the roof of the patient box (visible cargo).
  setPizzaStack(n) {
    this._boxes ||= [];
    while (this._boxes.length < n) {
      const b = spawn('prop_pizza_box');
      b.position.set((Math.random() - 0.5) * 0.12, 2.43 + this._boxes.length * 0.15, -0.55);
      b.rotation.y = (Math.random() - 0.5) * 0.5;
      this.mesh.add(b);
      this._boxes.push(b);
    }
    while (this._boxes.length > n) this.mesh.remove(this._boxes.pop());
  }

  crash(impact, vel) {
    if (this.shield > 0) { this.events.push({ type: 'bonk', impact }); return; }
    const dmg = clamp((impact - 4) / 60, 0.01, 0.18);
    this.damage = clamp(this.damage + dmg, 0, 1);
    this.events.push({ type: 'crash', impact, vx: vel.x, vz: vel.y });
  }

  _visuals(dt, vF, t) {
    const m = this.mesh;
    m.position.set(this.pos.x, this.y, this.pos.z);
    m.rotation.order = 'YXZ';
    m.rotation.y = this.heading;
    // Body roll into turns + pitch under accel; airborne nose-up tilt.
    let slopeP = 0, slopeR = 0;
    if (!this.airborne) { // tilt with hills / ramps / kerbs
      const gh = (a, b) => this.town.groundHeight(this.pos.x + a, this.pos.z + b);
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      slopeP = -Math.atan2(gh(fx * 1.6, fz * 1.6) - gh(-fx * 1.6, -fz * 1.6), 3.2);
      slopeR = -Math.atan2(gh(-fz, fx) - gh(fz, -fx), 2);
    }
    const targetLean = this.airborne ? 0 : clamp(-this.steer * Math.abs(vF) / 30, -0.12, 0.12);
    this.lean = damp(this.lean, targetLean + clamp(slopeR, -0.4, 0.4), 8, dt);
    this.pitch = damp(this.pitch, this.airborne ? -0.18 : clamp(slopeP, -0.5, 0.5), 7, dt);
    m.rotation.z = this.lean;
    m.rotation.x = this.pitch;
    for (const [n, w] of Object.entries(this.wheels)) {
      w.rotation.x += (vF * dt) / 0.46;
      w.rotation.y = n.endsWith('fl') || n.endsWith('fr') ? this.steer * 0.8 : 0;
    }
    // Sirens flash while carrying a patient or boosting.
    const on = this.sirenOn || this.boosting;
    const phase = Math.floor(t * 6) % 2;
    this.sirens.forEach((s, i) => {
      const lit = on && phase === i;
      for (const mat of s.mats) mat.emissiveIntensity = lit ? s.base * 2.2 : on ? s.base * 0.4 : s.base * 0.15;
      s.node.scale.setScalar(lit ? 1.15 : 1);
    });
  }
}
