import * as THREE from 'three';
import { bakeStatic, spawn } from './assets.js';
import { mulberry32, pick, shuffle } from './utils.js';

// Grid town built from the 8 m road tiles + building lots.
// Grid (c, r): x = (c - mid) * TILE, z = (r - mid) * TILE. North = -Z.
export const TILE = 8;
export const PAVE_H = 0.18;
const HALF = TILE / 2;
const ROAD_HALF = 2.5;
const DIRS = { E: [1, 0], N: [0, -1], W: [-1, 0], S: [0, 1] };
const ORDER = ['E', 'N', 'W', 'S'];

// Road pieces as authored (connections in un-rotated space).
const ROAD_BASES = [
  ['road_cross', 'ENWS'], ['road_t', 'ENW'], ['road_straight', 'NS'], ['road_corner', 'EN'], ['road_end', 'N'],
];

// Building footprints in the model's local space (x, z), metres: rects [cx, cz, hx, hz] and circles [cx, cz, r].
// Local z = -(Blender y). Buildings face +Z (their street side).
const FOOTPRINTS = {
  bld_house_lilac: { rects: [[0, -0.5, 2.6, 2.3]] },
  bld_house_peach: { rects: [[0, -0.5, 2.6, 2.3]] },
  bld_apartment: { rects: [[0, -0.6, 3.2, 2.8]] },
  bld_cafe: { rects: [[0, -0.8, 2.9, 2.4]], circles: [[2.6, 3.0, 0.9]] },
  bld_pharmacy: { rects: [[0, -0.7, 2.8, 2.5]] },
  bld_office: { rects: [[0, -0.6, 2.8, 2.8]] },
  bld_lighthouse: { circles: [[0, -0.6, 2.4]] },
  bld_hospital: { rects: [[0, -0.9, 7.1, 2.5], [0, -0.6, 2.7, 2.8]], circles: [[-2.5, 3.5, 0.3], [2.5, 3.5, 0.3]] },
  lot_park: { circles: [[0, 0, 1.5], [-2.8, -2.8, 0.55], [2.9, -2.6, 0.5], [-2.7, 2.9, 0.5], [2.8, 2.8, 0.55]] },
};
const PICKUP_BUILDINGS = ['bld_house_lilac', 'bld_house_peach', 'bld_apartment', 'bld_cafe', 'bld_office'];

export const TOWN_ASSETS = [
  ...new Set([...ROAD_BASES.map((b) => b[0]), 'road_crosswalk', 'lot_grass', ...Object.keys(FOOTPRINTS),
    'prop_tree_pine', 'prop_tree_round', 'prop_lamp_post', 'prop_ramp', 'prop_guard_rail']),
];

function rotateDir(d, k) { return ORDER[(ORDER.indexOf(d) + k) % 4]; }
function yawForDir(d) { const [dx, dz] = DIRS[d]; return Math.atan2(dx, dz); }
// Rotate a local (x, z) offset by yaw (three.js Y rotation).
export function rotXZ(x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}

export class Town {
  constructor(scene, seed = 7) {
    this.scene = scene;
    this.rng = mulberry32(seed);
    this.N = 15; // grid size; roads every 4th row/col, forest ring outside
    this.mid = (this.N - 1) / 2;
    this.cells = [];
    this.rects = [];   // static colliders {cx, cz, hx, hz}
    this.circles = []; // static colliders {x, z, r}
    this.pickupSpots = [];
    this.dropoffSpots = [];
    this.ramps = [];
    this.roadCells = [];
    this.lampSpots = [];
    this.propSpots = [];
    this._layout();
    this._build();
  }

  worldOf(c, r) { return [(c - this.mid) * TILE, (r - this.mid) * TILE]; }
  cellAt(x, z) {
    const c = Math.round(x / TILE + this.mid), r = Math.round(z / TILE + this.mid);
    return this.cells[r]?.[c];
  }
  get halfExtent() { return (this.N / 2) * TILE; }

  _layout() {
    const N = this.N;
    const isRoadLine = (i) => i >= 1 && i <= N - 2 && (i - 1) % 4 === 0;
    for (let r = 0; r < N; r++) {
      this.cells.push([]);
      for (let c = 0; c < N; c++) {
        const edge = r === 0 || c === 0 || r === N - 1 || c === N - 1;
        const road = !edge && (isRoadLine(r) || isRoadLine(c));
        this.cells[r].push({ c, r, type: road ? 'road' : edge ? 'forest' : 'lot', conn: new Set() });
      }
    }
    for (const row of this.cells) {
      for (const cell of row) {
        if (cell.type !== 'road') continue;
        for (const d of ORDER) {
          const [dx, dz] = DIRS[d];
          if (this.cells[cell.r + dz]?.[cell.c + dx]?.type === 'road') cell.conn.add(d);
        }
        this.roadCells.push(cell);
      }
    }
    // Hospital: the central block's bottom row, two cells wide, facing south (toward the camera).
    const hc = Math.floor(N / 2) - 1, hr = 8;
    const H0 = this.cells[hr][hc], H1 = this.cells[hr][hc + 1];
    H0.building = 'bld_hospital'; H0.facing = 'S'; H0.span = 2; H1.building = 'covered';

    // Remaining lots: centre of each 3x3 block is a park, edges get buildings.
    const pool = [];
    for (const row of this.cells) {
      for (const cell of row) {
        if (cell.type !== 'lot' || cell.building) continue;
        const roadsAround = ORDER.filter((d) => {
          const [dx, dz] = DIRS[d];
          return this.cells[cell.r + dz]?.[cell.c + dx]?.type === 'road';
        });
        if (!roadsAround.length) { cell.building = 'lot_park'; cell.facing = 'S'; continue; }
        // Prefer facing the camera (S/E) so fronts are visible.
        cell.facing = ['S', 'E', 'W', 'N'].find((d) => roadsAround.includes(d));
        pool.push(cell);
      }
    }
    shuffle(pool, this.rng);
    const specials = ['bld_pharmacy', 'bld_pharmacy', 'bld_lighthouse'];
    pool.forEach((cell, i) => { cell.building = specials[i] || pick(PICKUP_BUILDINGS, this.rng); });
  }

  _build() {
    const statics = new THREE.Group();
    const add = (name, x, z, yaw = 0, y = 0, s = 1) => {
      const o = spawn(name);
      o.position.set(x, y, z);
      o.rotation.y = yaw;
      if (s !== 1) o.scale.setScalar(s);
      statics.add(o);
      return o;
    };
    const rng = this.rng;
    for (const row of this.cells) {
      for (const cell of row) {
        const [x, z] = this.worldOf(cell.c, cell.r);
        cell.x = x; cell.z = z;
        if (cell.type === 'road') {
          const { name, k } = this._roadPiece(cell.conn);
          const piece = name === 'road_straight' && rng() < 0.2 ? 'road_crosswalk' : name;
          cell.piece = piece;
          add(piece, x, z, k * Math.PI / 2);
          // pavement corners -> lamps / smashable props
          for (const [sx, sz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
            const spot = [x + sx * 3.3, z + sz * 3.3];
            if (rng() < 0.18) this.lampSpots.push(spot); else if (rng() < 0.25) this.propSpots.push(spot);
          }
        } else if (cell.type === 'forest') {
          add('lot_grass', x, z);
          for (let i = 0; i < 3; i++) {
            const px = x + (rng() - 0.5) * 6, pz = z + (rng() - 0.5) * 6;
            const s = 0.8 + rng() * 0.6;
            add(rng() < 0.8 ? 'prop_tree_pine' : 'prop_tree_round', px, pz, rng() * 6, PAVE_H, s);
          }
        } else if (cell.building && cell.building !== 'covered') {
          const yaw = yawForDir(cell.facing);
          let cx = x, cz = z;
          if (cell.span === 2) cx += TILE / 2; // hospital straddles two cells
          add(cell.building, cx, cz, yaw);
          this._addFootprint(cell.building, cx, cz, yaw);
          const [fx, fz] = DIRS[cell.facing];
          const spot = { x: cx + fx * 6.6, z: cz + fz * 6.6, building: cell.building, yaw,
            standX: cx + fx * 4.8, standZ: cz + fz * 4.8 };
          if (cell.building === 'bld_hospital') this.dropoffSpots.push({ ...spot, kind: 'hospital' });
          else if (cell.building === 'bld_pharmacy') this.dropoffSpots.push({ ...spot, kind: 'pharmacy' });
          if (PICKUP_BUILDINGS.includes(cell.building) || cell.building === 'bld_lighthouse') this.pickupSpots.push(spot);
        }
      }
    }
    for (const [x, z] of this.lampSpots) {
      add('prop_lamp_post', x, z, 0, PAVE_H);
      this.circles.push({ x, z, r: 0.25 });
    }
    // Stunt ramps on a few straight road cells, aligned with the road.
    const straights = this.roadCells.filter((c) => c.piece === 'road_straight');
    shuffle(straights, rng);
    for (const cell of straights.slice(0, 4)) {
      const along = cell.conn.has('N') ? 'N' : 'E';
      const dir = rng() < 0.5 ? along : rotateDir(along, 2);
      // Ramp model rises toward its local -Z; point that along `dir`.
      const yaw = yawForDir(dir) + Math.PI;
      const [dx, dz] = DIRS[dir];
      const rx = cell.x - dz * 1.25, rz = cell.z + dx * 1.25; // sit in the right-hand lane
      add('prop_ramp', rx, rz, yaw);
      this.ramps.push({ x: rx, z: rz, yaw, len: 3.6, half: 1.5, h: 1.1 });
    }
    // Soft outer boundary: guard rails around the playable road ring.
    const ext = (this.N / 2 - 1) * TILE;
    for (let i = -ext + 2; i < ext; i += 4) {
      add('prop_guard_rail', i, -ext, 0, PAVE_H); add('prop_guard_rail', i, ext, 0, PAVE_H);
      add('prop_guard_rail', -ext, i, Math.PI / 2, PAVE_H); add('prop_guard_rail', ext, i, Math.PI / 2, PAVE_H);
    }
    this.bounds = ext - 0.8;

    const baked = bakeStatic(statics);
    this.scene.add(baked);
    // Ground plane beyond the town.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: 0x3fb98c, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.3;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _roadPiece(conn) {
    for (const [name, dirs] of ROAD_BASES) {
      if (dirs.length !== conn.size) continue;
      for (let k = 0; k < 4; k++) {
        const rot = new Set([...dirs].map((d) => rotateDir(d, k)));
        if ([...conn].every((d) => rot.has(d))) return { name, k };
      }
    }
    return { name: 'road_straight', k: 0 };
  }

  _addFootprint(name, x, z, yaw) {
    const fp = FOOTPRINTS[name];
    if (!fp) return;
    const quarter = Math.round(yaw / (Math.PI / 2));
    const swap = Math.abs(quarter) % 2 === 1;
    for (const [cx, cz, hx, hz] of fp.rects || []) {
      const [ox, oz] = rotXZ(cx, cz, yaw);
      this.rects.push({ cx: x + ox, cz: z + oz, hx: swap ? hz : hx, hz: swap ? hx : hz });
    }
    for (const [cx, cz, r] of fp.circles || []) {
      const [ox, oz] = rotXZ(cx, cz, yaw);
      this.circles.push({ x: x + ox, z: z + oz, r });
    }
  }

  // Surface height: road 0, pavements/lots +0.18, ramps rise to 1.1.
  groundHeight(x, z) {
    for (const rp of this.ramps) {
      const [lx, lz] = rotXZ(x - rp.x, z - rp.z, -rp.yaw);
      if (Math.abs(lx) < rp.half && lz > -rp.len / 2 && lz < rp.len / 2) {
        return ((rp.len / 2 - lz) / rp.len) * rp.h;
      }
    }
    const cell = this.cellAt(x, z);
    if (!cell) return 0;
    if (cell.type !== 'road') return PAVE_H;
    const lx = x - cell.x, lz = z - cell.z;
    const inX = Math.abs(lx) < ROAD_HALF, inZ = Math.abs(lz) < ROAD_HALF;
    if (inX && inZ) return 0;
    if (inX && ((lz < 0 && cell.conn.has('N')) || (lz > 0 && cell.conn.has('S')))) return 0;
    if (inZ && ((lx > 0 && cell.conn.has('E')) || (lx < 0 && cell.conn.has('W')))) return 0;
    return PAVE_H;
  }

  // Push a circle (x, z, r) out of static colliders. Returns collision normal + depth or null.
  collide(p, r) {
    let hit = null;
    for (const b of this.rects) {
      const qx = Math.max(b.cx - b.hx, Math.min(p.x, b.cx + b.hx));
      const qz = Math.max(b.cz - b.hz, Math.min(p.z, b.cz + b.hz));
      let dx = p.x - qx, dz = p.z - qz;
      let d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 1e-4) { // centre inside the box: push out along the shallowest axis
        const ex = b.hx - Math.abs(p.x - b.cx), ez = b.hz - Math.abs(p.z - b.cz);
        if (ex < ez) { dx = Math.sign(p.x - b.cx) || 1; dz = 0; d = -ex; } else { dz = Math.sign(p.z - b.cz) || 1; dx = 0; d = -ez; }
        const n = { x: dx, z: dz };
        p.x += n.x * (r - d); p.z += n.z * (r - d);
        hit = { nx: n.x, nz: n.z };
        continue;
      }
      const nx = dx / d, nz = dz / d;
      p.x += nx * (r - d); p.z += nz * (r - d);
      hit = { nx, nz };
    }
    for (const c of this.circles) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz), min = r + c.r;
      if (d >= min || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d;
      p.x += nx * (min - d); p.z += nz * (min - d);
      hit = { nx, nz };
    }
    const B = this.bounds;
    if (Math.abs(p.x) > B) { hit = { nx: -Math.sign(p.x), nz: 0 }; p.x = Math.sign(p.x) * B; }
    if (Math.abs(p.z) > B) { hit = { nx: 0, nz: -Math.sign(p.z) }; p.z = Math.sign(p.z) * B; }
    return hit;
  }

  // Road graph helpers for traffic.
  neighbor(cell, d) { const [dx, dz] = DIRS[d]; return this.cells[cell.r + dz]?.[cell.c + dx]; }
  static dirVec(d) { return DIRS[d]; }
  static opposite(d) { return rotateDir(d, 2); }
}
