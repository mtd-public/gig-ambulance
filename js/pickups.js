import { spawn } from './assets.js';
import { pick } from './utils.js';

export const PICKUP_ASSETS = ['pu_turbo', 'pu_repair', 'pu_time', 'pu_magnet', 'pu_heart', 'pu_coin', 'pu_star',
  'pu_shield', 'prop_cone', 'prop_hydrant', 'prop_bin', 'prop_barrier', 'prop_bench'];
const POWER_TYPES = ['pu_turbo', 'pu_turbo', 'pu_repair', 'pu_time', 'pu_magnet', 'pu_heart', 'pu_star', 'pu_shield'];
const SMASHABLE = ['prop_cone', 'prop_cone', 'prop_hydrant', 'prop_bin', 'prop_barrier'];

// Spinning power-ups on the roads, breadcrumb coin lines, and knock-overable props.
export class Pickups {
  constructor(scene, town) {
    this.scene = scene;
    this.town = town;
    this.items = [];
    this.props = [];
    for (let i = 0; i < 9; i++) this._spawnPower();
    for (let i = 0; i < 7; i++) this._spawnCoinLine();
    for (const [x, z] of town.propSpots) this._spawnProp(x, z);
    this.magnet = 0;
  }

  _roadPoint() {
    const cell = pick(this.town.roadCells);
    const d = pick([...cell.conn]);
    const [dx, dz] = { E: [1, 0], N: [0, -1], W: [-1, 0], S: [0, 1] }[d];
    const lane = (Math.random() < 0.5 ? -1 : 1) * 1.25;
    return { x: cell.x + dx * 2 + -dz * lane, z: cell.z + dz * 2 + dx * lane, dx, dz };
  }

  _add(type, x, z, respawn) {
    const mesh = spawn(type);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.items.push({ type, mesh, x, z, t: Math.random() * 6, respawn, alive: true });
  }

  _spawnPower() { const p = this._roadPoint(); this._add(pick(POWER_TYPES), p.x, p.z, 'power'); }

  _spawnCoinLine() {
    const p = this._roadPoint();
    for (let i = 0; i < 5; i++) this._add('pu_coin', p.x + p.dx * i * 1.6, p.z + p.dz * i * 1.6, null);
  }

  _spawnProp(x, z) {
    const type = pick(SMASHABLE);
    const mesh = spawn(type);
    mesh.position.set(x, 0.18, z);
    mesh.rotation.y = Math.random() * Math.PI;
    this.scene.add(mesh);
    this.props.push({ type, mesh, x, z, r: type === 'prop_barrier' ? 0.9 : 0.45, hit: false, t: 0 });
  }

  update(dt, t, player, events) {
    const p = player.pos;
    if (this.magnet > 0) this.magnet -= dt;
    let coinsLeft = 0;
    for (const it of this.items) {
      if (!it.alive) {
        it.cool -= dt;
        if (it.cool <= 0 && it.respawn === 'power') {
          const q = this._roadPoint();
          it.x = q.x; it.z = q.z; it.alive = true; it.mesh.visible = true; it.mesh.scale.setScalar(1);
          it.type = pick(POWER_TYPES);
          this.scene.remove(it.mesh); it.mesh = spawn(it.type); this.scene.add(it.mesh);
        }
        continue;
      }
      if (it.type === 'pu_coin') coinsLeft++;
      it.t += dt;
      let dx = p.x - it.x, dz = p.z - it.z;
      let d = Math.hypot(dx, dz);
      if (it.type === 'pu_coin' && this.magnet > 0 && d < 9) {
        it.x += (dx / d) * 18 * dt; it.z += (dz / d) * 18 * dt;
        d = Math.hypot(p.x - it.x, p.z - it.z);
      }
      it.mesh.position.set(it.x, Math.sin(it.t * 3) * 0.15, it.z);
      it.mesh.rotation.y = it.t * 2.2;
      const reach = player.airborne ? 2.2 : 1.9;
      if (d < reach && Math.abs(player.y - 0) < 3) {
        it.alive = false; it.mesh.visible = false; it.cool = 18;
        events.push({ type: 'power', kind: it.type, x: it.x, z: it.z });
      }
    }
    if (coinsLeft < 15) this._spawnCoinLine();
    this.items = this.items.filter((it) => {
      if (it.alive || it.respawn) return true;
      this.scene.remove(it.mesh);
      return false;
    });

    for (const pr of this.props) {
      if (pr.hit) {
        pr.t += dt;
        pr.vy -= 22 * dt;
        pr.mesh.position.x += pr.vx * dt; pr.mesh.position.z += pr.vz * dt;
        pr.mesh.position.y = Math.max(0, pr.mesh.position.y + pr.vy * dt);
        if (pr.mesh.position.y === 0) { pr.vx *= 0.9; pr.vz *= 0.9; pr.spin *= 0.9; pr.vy = Math.abs(pr.vy) * 0.3; }
        pr.mesh.rotation.x += pr.spin * dt; pr.mesh.rotation.z += pr.spin * 0.7 * dt;
        if (pr.t > 20) { // tidy up and put it back
          pr.hit = false; pr.mesh.position.set(pr.x, 0.18, pr.z); pr.mesh.rotation.set(0, Math.random() * 3, 0);
        }
        continue;
      }
      const d = Math.hypot(p.x - pr.x, p.z - pr.z);
      if (d < pr.r + player.radius && player.speed > 3) {
        pr.hit = true; pr.t = 0;
        const s = player.speed;
        pr.vx = player.vel.x * 1.1 + (Math.random() - 0.5) * 3;
        pr.vz = player.vel.y * 1.1 + (Math.random() - 0.5) * 3;
        pr.vy = 5 + s * 0.35;
        pr.spin = (Math.random() < 0.5 ? -1 : 1) * (6 + s * 0.4);
        events.push({ type: 'smashProp', kind: pr.type, x: pr.x, z: pr.z });
      }
    }
  }
}
