import * as THREE from 'three';

// Pooled particles: dust puffs (drifts, landings), confetti (deliveries),
// sparkles (pickups). One shared geometry, a few materials.
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    const geo = new THREE.IcosahedronGeometry(0.3, 0);
    const box = new THREE.BoxGeometry(0.25, 0.05, 0.18);
    this.mats = {
      dust: new THREE.MeshStandardMaterial({ color: 0xf2ecff, roughness: 1, transparent: true }),
      confetti: [0xff9fbd, 0xffd45e, 0x56e27d, 0x4ea4ea, 0xa58cf2].map((c) =>
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: c, emissiveIntensity: 0.2 })),
      spark: new THREE.MeshBasicMaterial({ color: 0xfff3b0 }),
    };
    for (let i = 0; i < 140; i++) {
      const m = new THREE.Mesh(i < 90 ? geo : box, this.mats.dust);
      m.visible = false;
      m.userData = { life: 0, vel: new THREE.Vector3(), kind: 'dust', max: 1, spin: 0 };
      scene.add(m);
      this.pool.push(m);
    }
    this.shake = 0;
  }

  _get(boxy) {
    const list = boxy ? this.pool.slice(90) : this.pool.slice(0, 90);
    return list.find((m) => !m.visible) || null;
  }

  dust(x, y, z, n = 1, spread = 1) {
    for (let i = 0; i < n; i++) {
      const m = this._get(false);
      if (!m) return;
      m.material = this.mats.dust;
      m.position.set(x + (Math.random() - 0.5) * spread, y + 0.2, z + (Math.random() - 0.5) * spread);
      m.userData.vel.set((Math.random() - 0.5) * 1.5, 1 + Math.random(), (Math.random() - 0.5) * 1.5);
      Object.assign(m.userData, { life: 0, max: 0.7 + Math.random() * 0.4, kind: 'dust' });
      m.visible = true;
    }
  }

  confetti(x, y, z, n = 40) {
    for (let i = 0; i < n; i++) {
      const m = this._get(true);
      if (!m) return;
      m.material = this.mats.confetti[i % this.mats.confetti.length];
      m.position.set(x, y + 1.5, z);
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 5;
      m.userData.vel.set(Math.cos(a) * s, 7 + Math.random() * 6, Math.sin(a) * s);
      Object.assign(m.userData, { life: 0, max: 2 + Math.random(), kind: 'confetti', spin: 10 * (Math.random() - 0.5) });
      m.visible = true;
    }
  }

  sparkle(x, y, z, n = 10) {
    for (let i = 0; i < n; i++) {
      const m = this._get(false);
      if (!m) return;
      m.material = this.mats.spark;
      m.position.set(x, y + 1, z);
      const a = Math.random() * Math.PI * 2;
      m.userData.vel.set(Math.cos(a) * 4, 3 + Math.random() * 3, Math.sin(a) * 4);
      Object.assign(m.userData, { life: 0, max: 0.5, kind: 'spark' });
      m.visible = true;
    }
  }

  update(dt) {
    this.shake = Math.max(0, this.shake - dt * 2.5);
    let dustAlpha = 0;
    for (const m of this.pool) {
      if (!m.visible) continue;
      const u = m.userData;
      u.life += dt;
      const k = u.life / u.max;
      if (k >= 1) { m.visible = false; continue; }
      m.position.addScaledVector(u.vel, dt);
      if (u.kind === 'dust') {
        u.vel.multiplyScalar(0.94);
        m.scale.setScalar(0.6 + k * 1.6);
        dustAlpha = 0.7;
      } else if (u.kind === 'confetti') {
        u.vel.y -= 14 * dt; u.vel.x *= 0.98; u.vel.z *= 0.98;
        if (m.position.y < 0.05) { m.position.y = 0.05; u.vel.set(0, 0, 0); }
        m.rotation.x += u.spin * dt; m.rotation.z += u.spin * 0.6 * dt;
        m.scale.setScalar(k > 0.8 ? (1 - k) * 5 : 1);
      } else {
        u.vel.y -= 10 * dt;
        m.scale.setScalar((1 - k) * 0.6);
      }
    }
    this.mats.dust.opacity = dustAlpha;
  }
}
