import { spawn } from './assets.js';
import { LANES, RING_R, Town } from './town.js';
import { clamp, damp, pick, wrapAngle } from './utils.js';

export const TRAFFIC_ASSETS = ['veh_car_pink', 'veh_car_blue', 'veh_taxi', 'veh_pickup', 'veh_bus'];
const right = (d) => { const [dx, dz] = Town.dirVec(d); return [-dz, dx]; };
// Map-angle (anticlockwise from east, north = +90) of each arm of a junction.
const ARM_ANG = { E: 0, N: 90, W: 180, S: 270 };

class Car {
  constructor(scene, town, model) {
    this.town = town;
    this.model = model;
    this.mesh = spawn(model);
    scene.add(this.mesh);
    this.wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => this.mesh.getObjectByName(n)).filter(Boolean);
    this.isBus = model === 'veh_bus';
    this.radius = this.isBus ? 1.6 : 1.2;
    this.baseCruise = this.isBus ? 7 : 8 + Math.random() * 3;
    this.cruise = this.baseCruise;
    this.nearMissCd = 0;
  }

  spawnAt(cell, dir) {
    this.cell = cell; this.dirIn = dir;
    this.knocked = false; this.knockT = 0;
    this.lane = this.isBus ? LANES[1] : pick(LANES); // buses hug the kerb lane
    const [rx, rz] = right(dir);
    this.x = cell.x + rx * this.lane; this.z = cell.z + rz * this.lane; this.y = 0;
    const [dx, dz] = Town.dirVec(dir);
    this.heading = Math.atan2(dx, dz);
    this.speed = this.cruise;
    this.mesh.visible = true;
    this.mesh.rotation.set(0, this.heading, 0);
    this._pickNext();
  }

  _pickNext() {
    // Leave the current cell in some direction other than back where we came from.
    const back = Town.opposite(this.dirIn);
    const opts = [...this.cell.conn].filter((d) => d !== back);
    const out = opts.length ? pick(opts) : back;
    this.dirOut = out;
    if (this.cell.roundabout) {
      // Circulate anticlockwise (right-hand traffic) from the entry arm to the exit arm.
      const R = RING_R[this.lane];
      const a0 = ARM_ANG[Town.opposite(this.dirIn)];
      let a1 = ARM_ANG[out];
      while (a1 <= a0 + 1) a1 += 360;
      this.path = [];
      for (let a = a0 + 28; a <= a1 - 28 + 0.1; a += 30) {
        const r = (a * Math.PI) / 180;
        this.path.push({ x: this.cell.x + R * Math.cos(r), z: this.cell.z - R * Math.sin(r) });
      }
      if (!this.path.length) {
        const r = (((a0 + a1) / 2) * Math.PI) / 180;
        this.path.push({ x: this.cell.x + R * Math.cos(r), z: this.cell.z - R * Math.sin(r) });
      }
    } else {
      const [r1x, r1z] = right(this.dirIn), [r2x, r2z] = right(out);
      const k = r1x * r2x + r1z * r2z === 0 ? 1 : 0.5; // perpendicular turn vs straight
      this.path = [{ x: this.cell.x + (r1x + r2x) * this.lane * k, z: this.cell.z + (r1z + r2z) * this.lane * k }];
    }
    this.cruise = this.cell.onHwyLine ? this.baseCruise * 1.45 : this.baseCruise; // faster on highways
  }

  update(dt, cars, player) {
    if (this.nearMissCd > 0) this.nearMissCd -= dt;
    if (this.knocked) return this._tumble(dt);

    // Brake for anything close ahead (other cars or the ambulance).
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let want = this.cruise;
    const check = (ox, oz, r) => {
      const dx = ox - this.x, dz = oz - this.z;
      const ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
      if (ahead > 0 && ahead < 5 + r && side < 1.6) want = Math.min(want, (ahead - 2.2 - r) * 1.5);
    };
    for (const c of cars) if (c !== this && !c.knocked) check(c.x, c.z, c.radius);
    check(player.pos.x, player.pos.z, player.radius);
    this.speed = damp(this.speed, clamp(want, 0, this.cruise), 4, dt);

    const wp = this.path[0];
    const dx = wp.x - this.x, dz = wp.z - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.2) {
      this.path.shift();
      if (!this.path.length) {
        const next = this.town.neighbor(this.cell, this.dirOut);
        if (next?.type === 'road') { this.cell = next; this.dirIn = this.dirOut; } else { this.dirIn = Town.opposite(this.dirOut); }
        this._pickNext();
      }
    } else {
      const target = Math.atan2(dx, dz);
      const turn = wrapAngle(target - this.heading);
      this.heading = wrapAngle(this.heading + clamp(turn, -3.0 * dt, 3.0 * dt));
    }
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.y = damp(this.y, this.town.groundHeight(this.x, this.z), 20, dt);
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.set(0, this.heading, 0);
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / 0.4;
  }

  knock(vx, vz) {
    this.knocked = true; this.knockT = 0;
    this.kv = { x: vx * 0.9, y: 7 + Math.hypot(vx, vz) * 0.25, z: vz * 0.9 };
    this.spin = { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 8 };
  }

  _tumble(dt) {
    this.knockT += dt;
    this.kv.y -= 22 * dt;
    this.x += this.kv.x * dt; this.z += this.kv.z * dt; this.y += this.kv.y * dt;
    if (this.y < 0) { this.y = 0; this.kv.y *= -0.35; this.kv.x *= 0.6; this.kv.z *= 0.6; }
    const m = this.mesh;
    m.position.set(this.x, this.y, this.z);
    m.rotation.x += this.spin.x * dt; m.rotation.y += this.spin.y * dt; m.rotation.z += this.spin.z * dt;
    if (this.knockT > 2.2) {
      const s = Math.max(0, 1 - (this.knockT - 2.2) * 3);
      m.scale.setScalar(s);
      if (s === 0) return 'respawn';
    }
    return null;
  }
}

export class Traffic {
  constructor(scene, town, count = 14) {
    this.town = town;
    this.cars = [];
    for (let i = 0; i < count; i++) {
      const model = i % 7 === 6 ? 'veh_bus' : TRAFFIC_ASSETS[i % 4];
      const car = new Car(scene, town, model);
      this._respawn(car, null);
      this.cars.push(car);
    }
  }

  _respawn(car, player) {
    for (let tries = 0; tries < 30; tries++) {
      const cell = pick(this.town.roadCells);
      if (player && Math.hypot(cell.x - player.pos.x, cell.z - player.pos.z) < 30) continue;
      car.mesh.scale.setScalar(1);
      car.spawnAt(cell, pick([...cell.conn]));
      return;
    }
  }

  // Returns interaction events for scoring / juice.
  update(dt, player) {
    const events = [];
    for (const car of this.cars) {
      if (car.update(dt, this.cars, player) === 'respawn') this._respawn(car, player);
      if (car.knocked) continue;
      const dx = car.x - player.pos.x, dz = car.z - player.pos.z;
      const d = Math.hypot(dx, dz), min = car.radius + player.radius;
      if (d < min && d > 1e-3) {
        const nx = dx / d, nz = dz / d;
        const rel = (player.vel.x - Math.sin(car.heading) * car.speed) * nx
          + (player.vel.y - Math.cos(car.heading) * car.speed) * nz;
        if (rel > 6 && !car.isBus) {
          car.knock(player.vel.x + nx * 6, player.vel.y + nz * 6);
          player.vel.multiplyScalar(0.72);
          events.push({ type: 'smashCar', x: car.x, z: car.z, impact: rel });
          if (player.shield <= 0) player.damage = Math.min(1, player.damage + 0.04);
        } else {
          // Shove apart; buses are immovable walls.
          player.pos.x -= nx * (min - d); player.pos.z -= nz * (min - d);
          const vn = player.vel.x * nx + player.vel.y * nz;
          if (vn > 0) { player.vel.x -= 1.4 * vn * nx; player.vel.y -= 1.4 * vn * nz; }
          if (rel > 5) {
            player.crash(rel, player.vel.clone());
            events.push({ type: 'bump', x: car.x, z: car.z, impact: rel });
          }
        }
      } else if (d < min + 1.6 && player.speed > 12 && car.nearMissCd <= 0) {
        car.nearMissCd = 3;
        events.push({ type: 'nearMiss', x: car.x, z: car.z });
      }
    }
    return events;
  }
}
