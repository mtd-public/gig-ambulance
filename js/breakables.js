import * as THREE from 'three';
import { spawn } from './assets.js';

// Small world props (trees, lamps, cones, hydrants, bins, benches, bushes) as
// *instanced* meshes, so hundreds cost a handful of draw calls. They never hurt
// the van: hitting one just knocks it over ('topple') or sends it flying ('fly'),
// and it pops back later.
export const BREAKABLE_ASSETS = ['prop_tree_pine', 'prop_tree_round', 'prop_bush', 'prop_lamp_post', 'prop_cone',
  'prop_hydrant', 'prop_bin', 'prop_barrier', 'prop_bench'];
const MODE = {
  prop_tree_pine: 'topple', prop_tree_round: 'topple', prop_lamp_post: 'topple',
  prop_bush: 'fly', prop_cone: 'fly', prop_hydrant: 'fly', prop_bin: 'fly', prop_barrier: 'fly', prop_bench: 'fly',
};
const DRAG = { prop_tree_pine: 0.86, prop_tree_round: 0.88, prop_lamp_post: 0.94 }; // speed kept after a hit
const RESPAWN = 25;

const _obj = new THREE.Object3D();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Breakables {
  constructor(scene, specs) {
    // specs: [{type, x, z, y, yaw, s, r}]
    this.items = specs.map((sp) => ({ ...sp, mode: MODE[sp.type], state: 'idle', t: 0 }));
    this.pools = {};
    const byType = {};
    for (const it of this.items) (byType[it.type] ||= []).push(it);
    for (const [type, list] of Object.entries(byType)) {
      const src = spawn(type);
      src.updateMatrixWorld(true);
      const parts = [];
      src.traverse((o) => {
        if (!o.isMesh) return;
        const im = new THREE.InstancedMesh(o.geometry, o.material, list.length);
        im.castShadow = true; im.receiveShadow = true;
        im.frustumCulled = false; // instances span the whole map
        scene.add(im);
        parts.push({ im, local: o.matrixWorld.clone() });
      });
      list.forEach((it, i) => { it.idx = i; it.parts = parts; this._write(it); });
      this.pools[type] = parts;
    }
    this._flush();
  }

  _write(it) {
    const s = it.state === 'gone' ? 0 : it.s * (it.grow ?? 1);
    _qy.setFromAxisAngle(UP, it.yaw);
    if (it.state === 'topple' || it.state === 'down') {
      _q.setFromAxisAngle(it.axis, it.tilt).multiply(_qy);
    } else if (it.state === 'fly') {
      _q.setFromEuler(it.rot).multiply(_qy);
    } else _q.copy(_qy);
    _obj.position.set(it.x, it.y, it.z);
    _obj.quaternion.copy(_q);
    _obj.scale.setScalar(s || 1e-4);
    _obj.updateMatrix();
    for (const p of it.parts) {
      _m.multiplyMatrices(_obj.matrix, p.local);
      p.im.setMatrixAt(it.idx, _m);
      p.dirty = true;
    }
  }

  _flush() {
    for (const parts of Object.values(this.pools)) {
      for (const p of parts) if (p.dirty) { p.im.instanceMatrix.needsUpdate = true; p.dirty = false; }
    }
  }

  update(dt, player, events) {
    const px = player.pos.x, pz = player.pos.z, pr = player.radius;
    const sp = player.speed;
    for (const it of this.items) {
      if (it.state === 'idle') {
        const dx = it.x - px, dz = it.z - pz;
        const min = it.r + pr;
        if (Math.abs(dx) > min || Math.abs(dz) > min || player.y > 1.6) continue;
        if (dx * dx + dz * dz > min * min) continue;
        this._hit(it, player, sp, events);
        continue;
      }
      it.t += dt;
      if (it.state === 'topple') {
        it.tiltVel += 9 * Math.cos(it.tilt) * dt; // falls faster as it goes over
        it.tilt += it.tiltVel * dt;
        if (it.tilt >= it.maxTilt) { it.tilt = it.maxTilt; it.tiltVel *= -0.25; if (Math.abs(it.tiltVel) < 0.3) it.state = 'down'; }
      } else if (it.state === 'fly') {
        it.vy -= 22 * dt;
        it.x += it.vx * dt; it.z += it.vz * dt; it.y += it.vy * dt;
        it.rot.x += it.spin.x * dt; it.rot.z += it.spin.z * dt;
        if (it.y < it.y0) {
          it.y = it.y0; it.vy = Math.abs(it.vy) * 0.3;
          it.vx *= 0.7; it.vz *= 0.7; it.spin.x *= 0.7; it.spin.z *= 0.7;
        }
      }
      // After a while, shrink away and later regrow in place.
      if (it.state !== 'gone' && it.t > 8) {
        it.grow = Math.max(0, 1 - (it.t - 8) * 2);
        if (it.grow === 0) { it.state = 'gone'; it.t = 0; }
      } else if (it.state === 'gone' && it.t > RESPAWN) {
        Object.assign(it, { state: 'idle', x: it.x0, z: it.z0, y: it.y0, grow: 1, t: 0 });
        if (Math.hypot(it.x - px, it.z - pz) < 6) { it.state = 'gone'; it.t = RESPAWN - 3; } // not under the van
      }
      this._write(it);
    }
    this._flush();
  }

  _hit(it, player, sp, events) {
    it.x0 ??= it.x; it.z0 ??= it.z; it.y0 ??= it.y;
    it.t = 0; it.grow = 1;
    const vx = player.vel.x, vz = player.vel.y;
    const n = Math.hypot(vx, vz) || 1;
    if (it.mode === 'topple') {
      it.state = 'topple';
      it.axis = _axis.set(vz / n, 0, -vx / n).clone(); // tip over in the direction of travel
      it.tilt = 0; it.tiltVel = 1 + sp * 0.12; it.maxTilt = Math.PI / 2 * 0.96;
    } else {
      it.state = 'fly';
      it.vx = vx * 1.1 + (Math.random() - 0.5) * 3;
      it.vz = vz * 1.1 + (Math.random() - 0.5) * 3;
      it.vy = 4 + sp * 0.35;
      it.rot = new THREE.Euler(0, 0, 0);
      it.spin = { x: (Math.random() - 0.5) * 14, z: (Math.random() - 0.5) * 14 };
    }
    player.vel.multiplyScalar(DRAG[it.type] ?? 0.97);
    if (sp > 2) events.push({ type: 'smashProp', kind: it.type, x: it.x, z: it.z });
  }
}
