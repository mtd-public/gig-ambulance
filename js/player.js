import * as THREE from 'three';
import { cloneMaterials, spawn } from './assets.js';
import { clamp, damp, wrapAngle } from './utils.js';

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
    this.prevGround = 0;
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

  update(dt, ctl, wantBoost, t) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx; // right-hand vector
    let vF = this.vel.x * fx + this.vel.y * fz;
    let vL = this.vel.x * rx + this.vel.y * rz;

    this.boosting = wantBoost && this.boost > 0.02 && !!ctl;
    this.boost = clamp(this.boost + (this.boosting ? -0.32 : 0.04) * dt, 0, 1);
    const top = this.boosting ? this.boostSpeed : this.maxSpeed * (1 - this.damage * 0.35);

    let targetSpeed = 0, diff = 0;
    if (ctl && !this.airborne) {
      const want = Math.atan2(ctl.x, ctl.z);
      diff = wrapAngle(want - this.heading);
      // Steering authority grows with speed (can't pivot a parked van) and eases off at top speed.
      const sp = Math.abs(vF);
      const rate = 1.2 + Math.min(sp, 8) * 0.42 - Math.max(0, sp - 16) * 0.05;
      const turn = clamp(diff, -rate * dt, rate * dt);
      this.heading = wrapAngle(this.heading + turn);
      this.steer = damp(this.steer, clamp(diff, -0.6, 0.6), 12, dt);
      // Hard U-turn requests shed speed so you can whip around.
      const align = Math.cos(Math.min(Math.abs(diff), Math.PI / 1.4));
      targetSpeed = top * ctl.mag * (0.45 + 0.55 * Math.max(0, align));
    } else {
      this.steer = damp(this.steer, 0, 8, dt);
    }

    if (!this.airborne) {
      const accel = targetSpeed > vF ? (this.boosting ? 22 : 13) : (ctl ? 10 : 24);
      vF += clamp(targetSpeed - vF, -accel * dt, accel * dt);
      // Grip: drop it when turning hard at speed -> slide.
      const hard = Math.abs(diff) > 0.55 && Math.abs(vF) > 9;
      this.drifting = hard || Math.abs(vL) > 3.5;
      const grip = hard ? 2.2 : 7.5;
      vL = damp(vL, 0, grip, dt);
      this.driftTime = this.drifting ? this.driftTime + dt : 0;
    }

    // Re-project velocity onto the (possibly rotated) heading.
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    this.vel.set(nfx * vF + -nfz * vL, nfz * vF + nfx * vL);
    if (this.airborne) this.vel.multiplyScalar(0.999);

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;

    // Static collisions (buildings, trees, lamps, bounds).
    const before = this.vel.clone();
    const hit = this.town.collide(this.pos, this.radius);
    if (hit) {
      const vn = this.vel.x * hit.nx + this.vel.y * hit.nz; // negative = into wall
      if (vn < 0) {
        this.vel.x -= 1.35 * vn * hit.nx;
        this.vel.y -= 1.35 * vn * hit.nz;
        this.vel.multiplyScalar(0.7);
        const impact = -vn;
        if (impact > 4) this.crash(impact, before);
      }
    }

    // Vertical: follow the ground, launch off ramp lips, land with a squash.
    const g = this.town.groundHeight(this.pos.x, this.pos.z);
    if (!this.airborne) {
      const rise = (g - this.prevGround) / Math.max(dt, 1e-3);
      if (g < this.y - 0.35 && this.y > 0.5) {
        this.airborne = true; this.airTime = 0;
        this.vy = Math.max(this.lastRise || 0, 3) * 0.9;
      } else {
        this.y = damp(this.y, g, 30, dt);
        this.lastRise = rise;
      }
    }
    if (this.airborne) {
      this.airTime += dt;
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= g) {
        this.y = g; this.airborne = false;
        this.events.push({ type: 'land', air: this.airTime });
        this.pitch = -0.12;
      }
    }
    this.prevGround = g;
    if (this.shield > 0) this.shield -= dt;

    this._visuals(dt, vF, t);
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
    const targetLean = this.airborne ? 0 : clamp(-this.steer * Math.abs(vF) / 30, -0.12, 0.12);
    this.lean = damp(this.lean, targetLean, 8, dt);
    this.pitch = damp(this.pitch, this.airborne ? -0.18 : 0, 5, dt);
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
