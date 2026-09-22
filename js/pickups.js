import { spawn } from './assets.js';
import { LANES } from './town.js';
import { pick } from './utils.js';

export const PICKUP_ASSETS = ['pu_turbo', 'pu_repair', 'pu_time', 'pu_magnet', 'pu_heart', 'pu_coin', 'pu_star',
  'pu_shield'];
const POWER_TYPES = ['pu_turbo', 'pu_turbo', 'pu_repair', 'pu_time', 'pu_magnet', 'pu_heart', 'pu_star', 'pu_shield'];

// Spinning power-ups on the roads and breadcrumb coin lines.
export class Pickups {
  constructor(scene, town) {
    this.scene = scene;
    this.town = town;
    this.items = [];
    for (let i = 0; i < 16; i++) this._spawnPower();
    for (let i = 0; i < 12; i++) this._spawnCoinLine();
    this.magnet = 0;
  }

  _roadPoint() {
    const cell = pick(this.town.roadCells);
    const d = pick([...cell.conn]);
    const [dx, dz] = { E: [1, 0], N: [0, -1], W: [-1, 0], S: [0, 1] }[d];
    const lane = (Math.random() < 0.5 ? -1 : 1) * pick(LANES);
    return { x: cell.x + dx * 3 + -dz * lane, z: cell.z + dz * 3 + dx * lane, dx, dz };
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
    for (let i = 0; i < 5; i++) this._add('pu_coin', p.x + p.dx * i * 2, p.z + p.dz * i * 2, null);
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
    if (coinsLeft < 30) this._spawnCoinLine();
    this.items = this.items.filter((it) => {
      if (it.alive || it.respawn) return true;
      this.scene.remove(it.mesh);
      return false;
    });

  }
}
