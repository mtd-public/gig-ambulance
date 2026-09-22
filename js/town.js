import * as THREE from 'three';
import { bakeStatic, spawn } from './assets.js';
import { mulberry32, pick, shuffle } from './utils.js';

// Grid town built from 16 m tiles: 12 m four-lane roads, 2 m pavements/shoulders.
// Grid (c, r): x = (c - mid) * TILE, z = (r - mid) * TILE. North = -Z.
//
//   row/col 0, 14      countryside (farms, trees) — drivable grass; beach to the east
//   row/col 1, 13      highway ring            (grass shoulders, no kerbs)
//   row/col 7          highway spokes          (stop at the park)
//   row/col 4, 10      city streets            (raised pavements) ringing the park;
//                                              two of their crossings are roundabouts
//   rows/cols 5..9     GRAND CENTRAL PARK      (hills, pond, trees — all drivable)
//   everything else    2x2-lot blocks: every lot touches two roads
export const TILE = 16;
export const PAVE_H = 0.18;
export const ROAD_HALF = 6;
const HALF = TILE / 2;
const SIDE = HALF - ROAD_HALF;
export const LANES = [1.5, 4.5]; // lane-centre offsets from the road centreline
export const RING_R = { 1.5: 3.9, 4.5: 6.7 }; // roundabout lane radii per lane offset
export const ISLAND_R = 2.45;
const DIRS = { E: [1, 0], N: [0, -1], W: [-1, 0], S: [0, 1] };
const ORDER = ['E', 'N', 'W', 'S'];
const ROAD_LINES = [1, 4, 7, 10, 13];
const HWY_LINES = [1, 7, 13];
const PARK = [5, 9]; // inclusive cell range (rows & cols)
const ROUNDABOUTS = [[4, 10], [10, 4]]; // [row, col] — an alternative junction style, not every crossroads
export const HOSPITAL_NAMES = ['St. Bandage General', 'Mercy Mint Hospital', 'Lil’ Heart Medical'];

// Beach along the east coast (x in metres).
const SAND_X = 106, SEA_X = 152, SEA_END = 178;

const ROAD_BASES = {
  road_cross: 'ENWS', road_t: 'ENW', road_straight: 'NS', road_corner: 'EN', road_end: 'N',
};

// Footprints in model-local space (x, z) — local z = -(Blender y). Buildings face +Z.
const FOOTPRINTS = {
  bld_house_lilac: { rects: [[0, -0.5, 2.6, 2.3]] },
  bld_house_peach: { rects: [[0, -0.5, 2.6, 2.3]] },
  bld_apartment: { rects: [[0, -0.6, 3.2, 2.8]] },
  bld_cafe: { rects: [[0, -0.8, 2.9, 2.4]], circles: [[2.6, 3.0, 0.9]] },
  bld_pharmacy: { rects: [[0, -0.7, 2.8, 2.5]] },
  bld_pizzeria: { rects: [[0, -0.8, 3.0, 2.4]], circles: [[2.9, 4.2, 0.9]] },
  bld_office: { rects: [[0, -0.6, 2.8, 2.8]] },
  bld_lighthouse: { circles: [[0, -0.6, 2.4]] },
  bld_hospital: { rects: [[0, -0.9, 7.1, 2.5], [0, -0.6, 2.7, 2.8]], circles: [[-2.5, 3.5, 0.3], [2.5, 3.5, 0.3]] },
  lot_park: { circles: [[0, 0, 1.5], [-4.8, -4.6, 0.5], [5.2, -4.2, 0.45], [-4.6, 5.0, 0.45], [4.8, 4.8, 0.5],
    [-6.3, -1.8, 0.4], [6.4, 2.0, 0.45], [2.6, -5.6, 0.35]] },
};
const HOMES = ['bld_house_lilac', 'bld_house_peach', 'bld_apartment', 'bld_cafe', 'bld_office'];
const PICKUP_BUILDINGS = [...HOMES, 'bld_lighthouse'];

export const TOWN_ASSETS = [
  ...new Set([...Object.keys(ROAD_BASES), 'road_crosswalk', 'road_roundabout', 'hwy_straight', 'hwy_corner',
    ...Object.keys(FOOTPRINTS), 'prop_ramp']),
];

// Grand Central Park terrain: gentle hills (gaussian bumps) faded to pavement
// height at the edges, plus a shallow pond. Coordinates relative to park centre.
const PARK_HILLS = [[-19, -15, 3.4, 9], [17, 13, 4.2, 11], [-12, 20, 2.4, 7], [21, -19, 2.8, 8], [2, 25, 1.6, 6],
  [-26, 4, 2.0, 6]];
const POND = { x: 8, z: -9, r: 8 };

function rotateDir(d, k) { return ORDER[(ORDER.indexOf(d) + k) % 4]; }
function yawForDir(d) { const [dx, dz] = DIRS[d]; return Math.atan2(dx, dz); }
export function rotXZ(x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}
function fitRotation(base, conn) {
  if (base.length !== conn.size) return -1;
  for (let k = 0; k < 4; k++) {
    const rot = new Set([...base].map((d) => rotateDir(d, k)));
    if ([...conn].every((d) => rot.has(d))) return k;
  }
  return -1;
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export class Town {
  constructor(scene, seed = 11) {
    this.scene = scene;
    this.rng = mulberry32(seed);
    this.N = 15;
    this.mid = (this.N - 1) / 2;
    this.cells = [];
    this.rects = [];
    this.circles = [];
    this.pickupSpots = [];
    this.dropoffSpots = [];
    this.pizzaSpots = [];
    this.ramps = [];
    this.roadCells = [];
    this.breakables = []; // specs for js/breakables.js: {type, x, z, y, yaw, s, r}
    this.bounds = (this.N / 2) * TILE + 90;
    const [x0, z0] = this.worldOf(PARK[0], PARK[0]);
    const [x1, z1] = this.worldOf(PARK[1], PARK[1]);
    this.park = { x0: x0 - HALF, x1: x1 + HALF, z0: z0 - HALF, z1: z1 + HALF, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
    this._layout();
    this._build();
  }

  worldOf(c, r) { return [(c - this.mid) * TILE, (r - this.mid) * TILE]; }
  cellAt(x, z) {
    const c = Math.round(x / TILE + this.mid), r = Math.round(z / TILE + this.mid);
    return this.cells[r]?.[c];
  }
  inPark(x, z) { const p = this.park; return x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1; }

  parkHeight(x, z) {
    const p = this.park;
    const lx = x - p.cx, lz = z - p.cz;
    let h = 0;
    for (const [hx, hz, amp, r] of PARK_HILLS) h += amp * Math.exp(-((lx - hx) ** 2 + (lz - hz) ** 2) / (2 * r * r));
    h *= smooth(1, 9, Math.min(x - p.x0, p.x1 - x, z - p.z0, p.z1 - z)); // flat where it meets the pavement
    const pd = Math.hypot(lx - POND.x, lz - POND.z);
    if (pd < POND.r + 3) h = h * smooth(POND.r, POND.r + 3, pd) - 0.45 * (1 - smooth(POND.r - 3, POND.r, pd));
    return PAVE_H + h;
  }

  _layout() {
    const N = this.N;
    const inParkCell = (r, c) => r >= PARK[0] && r <= PARK[1] && c >= PARK[0] && c <= PARK[1];
    for (let r = 0; r < N; r++) {
      this.cells.push([]);
      for (let c = 0; c < N; c++) {
        const edge = r === 0 || c === 0 || r === N - 1 || c === N - 1;
        let type = edge ? 'country' : 'lot';
        if (inParkCell(r, c)) type = 'park';
        else if (!edge && (ROAD_LINES.includes(r) || ROAD_LINES.includes(c))) type = 'road';
        this.cells[r].push({ c, r, type, conn: new Set() });
      }
    }
    for (const row of this.cells) {
      for (const cell of row) {
        if (cell.type !== 'road') continue;
        for (const d of ORDER) {
          const [dx, dz] = DIRS[d];
          if (this.cells[cell.r + dz]?.[cell.c + dx]?.type === 'road') cell.conn.add(d);
        }
        const two = cell.conn.size === 2;
        const ew = two && cell.conn.has('E') && cell.conn.has('W');
        const ns = two && cell.conn.has('N') && cell.conn.has('S');
        cell.bend = two && !ew && !ns;
        cell.hwy = (ew && HWY_LINES.includes(cell.r)) || (ns && HWY_LINES.includes(cell.c))
          || (cell.bend && HWY_LINES.includes(cell.r) && HWY_LINES.includes(cell.c));
        cell.onHwyLine = HWY_LINES.includes(cell.r) || HWY_LINES.includes(cell.c);
        cell.roundabout = cell.conn.size === 4 && ROUNDABOUTS.some(([r, c]) => r === cell.r && c === cell.c);
        this.roadCells.push(cell);
      }
    }
    const roadsAround = (cell) => ORDER.filter((d) => {
      const [dx, dz] = DIRS[d];
      return this.cells[cell.r + dz]?.[cell.c + dx]?.type === 'road';
    });

    // Three hospitals, each the bottom row (2 lots) of a block, facing south.
    [[3, 8], [9, 2], [12, 11]].forEach(([r, c], i) => {
      Object.assign(this.cells[r][c], { building: 'bld_hospital', facing: 'S', span: 2, name: HOSPITAL_NAMES[i] });
      this.cells[r][c + 1].building = 'covered';
    });
    // Waterfront pizzeria facing the east ring highway, right by the beach.
    Object.assign(this.cells[5][12], { building: 'bld_pizzeria', facing: 'E', beach: true });

    const pool = [];
    for (const row of this.cells) {
      for (const cell of row) {
        if (cell.type !== 'lot' || cell.building) continue;
        const pref = ['S', 'E', 'W', 'N'].filter((d) => roadsAround(cell).includes(d));
        cell.facing = this.rng() < 0.7 ? pref[0] : pick(pref, this.rng);
        pool.push(cell);
      }
    }
    shuffle(pool, this.rng);
    const specials = ['bld_pizzeria', 'bld_pharmacy', 'bld_lighthouse', 'lot_park', 'lot_park'];
    pool.forEach((cell, i) => { cell.building = specials[i] || pick(HOMES, this.rng); });

    // Countryside farms just outside the ring (not on the beach side).
    const rim = [];
    for (let i = 2; i < N - 2; i++) rim.push([0, i, 'S'], [N - 1, i, 'N'], [i, 0, 'E']);
    shuffle(rim, this.rng);
    for (const [r, c, facing] of rim.slice(0, 7)) {
      Object.assign(this.cells[r][c], { building: pick(['bld_house_lilac', 'bld_house_peach'], this.rng), facing });
    }
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
    const brk = (type, x, z, y, s, r) => this.breakables.push({ type, x, z, y, yaw: rng() * 6, s, r });
    const tree = (x, z, y, s) => brk(rng() < 0.75 ? 'prop_tree_pine' : 'prop_tree_round', x, z, y, s, 0.45 * s);
    const occupied = [];

    for (const row of this.cells) {
      for (const cell of row) {
        const [x, z] = this.worldOf(cell.c, cell.r);
        cell.x = x; cell.z = z;
        if (cell.type === 'road') {
          let piece, k = 0;
          if (cell.roundabout) piece = 'road_roundabout';
          else if (cell.hwy) {
            piece = cell.bend ? 'hwy_corner' : 'hwy_straight';
            k = fitRotation(cell.bend ? 'EN' : 'NS', cell.conn);
          } else {
            piece = Object.keys(ROAD_BASES).find((n) => fitRotation(ROAD_BASES[n], cell.conn) >= 0) || 'road_straight';
            k = Math.max(0, fitRotation(ROAD_BASES[piece], cell.conn));
            if (piece === 'road_straight' && rng() < 0.3) piece = 'road_crosswalk';
          }
          cell.piece = piece;
          add(piece, x, z, k * Math.PI / 2);
          if (!cell.hwy) { // street furniture on pavement corners
            const o = ROAD_HALF + SIDE / 2;
            for (const [sx, sz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
              const px = x + sx * o, pz = z + sz * o;
              if (rng() < 0.35) brk('prop_lamp_post', px, pz, PAVE_H, 1, 0.3);
              else if (rng() < 0.35) {
                const type = pick(['prop_cone', 'prop_cone', 'prop_hydrant', 'prop_bin', 'prop_barrier', 'prop_bench'], rng);
                brk(type, px, pz, PAVE_H, 1, type === 'prop_barrier' || type === 'prop_bench' ? 0.9 : 0.45);
              }
            }
          }
        } else if (cell.building && cell.building !== 'covered') {
          const yaw = yawForDir(cell.facing);
          const cx = cell.span === 2 ? x + TILE / 2 : x;
          add(cell.building, cx, z, yaw);
          this._addFootprint(cell.building, cx, z, yaw);
          occupied.push([cx, z, cell.span === 2 ? 16 : 8]);
          const [fx, fz] = DIRS[cell.facing];
          const kerb = TILE - LANES[1]; // near-side outer lane, right by the kerb
          const spot = { x: cx + fx * kerb, z: z + fz * kerb, building: cell.building, yaw,
            standX: cx + fx * (HALF + 1.0), standZ: z + fz * (HALF + 1.0), beach: !!cell.beach };
          if (cell.building === 'bld_hospital') this.dropoffSpots.push({ ...spot, kind: 'hospital', name: cell.name });
          else if (cell.building === 'bld_pizzeria') this.pizzaSpots.push(spot);
          if (PICKUP_BUILDINGS.includes(cell.building)) this.pickupSpots.push(spot);
          if (cell.building !== 'lot_park' && cell.span !== 2) {
            for (const [lx, lz] of [[-5.8, -5.6], [5.8, -5.8]]) {
              if (rng() < 0.75) {
                const [ox, oz] = rotXZ(lx + (rng() - 0.5), lz + (rng() - 0.5), yaw);
                tree(cx + ox, z + oz, PAVE_H, 0.7 + rng() * 0.4);
              }
            }
          }
        }
      }
    }

    this._buildPark(brk, tree);
    this._buildBeach(brk);

    // Stunt ramps in lanes of straight roads (highways too).
    const straights = this.roadCells.filter((c) => c.piece === 'road_straight' || c.piece === 'hwy_straight');
    shuffle(straights, rng);
    for (const cell of straights.slice(0, 7)) {
      const along = cell.conn.has('N') ? 'N' : 'E';
      const dir = rng() < 0.5 ? along : rotateDir(along, 2);
      const yaw = yawForDir(dir) + Math.PI; // ramp rises toward its local -Z
      const [dx, dz] = DIRS[dir];
      const lane = LANES[rng() < 0.5 ? 0 : 1];
      const rx = cell.x - dz * lane, rz = cell.z + dx * lane;
      add('prop_ramp', rx, rz, yaw);
      this.ramps.push({ x: rx, z: rz, yaw, len: 3.6, half: 1.5, h: 1.1 });
    }

    // Countryside: sparse trees & bushes out to the soft world edge (not on the beach).
    const inner = (this.N / 2) * TILE - TILE;
    const B = this.bounds - 6;
    let placed = 0;
    for (let i = 0; i < 1400 && placed < 150; i++) {
      const x = (rng() * 2 - 1) * B, z = (rng() * 2 - 1) * B;
      if (Math.max(Math.abs(x), Math.abs(z)) < inner + 12 || x > SAND_X - 4) continue;
      if (occupied.some(([ox, oz, r]) => Math.abs(x - ox) < r + 2 && Math.abs(z - oz) < r + 2)) continue;
      if (rng() < 0.2) brk('prop_bush', x, z, 0, 1 + rng(), 0.6);
      else tree(x, z, 0, 0.9 + rng() * 0.8);
      placed++;
    }

    this.scene.add(bakeStatic(statics));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshStandardMaterial({ color: 0x4cc79a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  // Low-poly heightfield (flat-shaded facets) with a path loop, pond and trees.
  _buildPark(brk, tree) {
    const p = this.park, rng = this.rng;
    const W = p.x1 - p.x0, D = p.z1 - p.z0;
    const seg = 56;
    const geo = new THREE.PlaneGeometry(W, D, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const cGrass = new THREE.Color(0x4cc79a), cHill = new THREE.Color(0x86dfb2), cPath = new THREE.Color(0xeacba2);
    const cSand = new THREE.Color(0xf3dca8), c = new THREE.Color();
    const pathR = Math.min(W, D) * 0.36;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + p.cx, z = pos.getZ(i) + p.cz;
      const h = this.parkHeight(x, z);
      pos.setY(i, h);
      const lx = x - p.cx, lz = z - p.cz;
      const onLoop = Math.abs(Math.hypot(lx, lz * 1.1) - pathR) < 1.6;
      const onCross = Math.abs(lx) < 1.4 || Math.abs(lz) < 1.4;
      if (Math.hypot(lx - POND.x, lz - POND.z) < POND.r + 1.5) c.copy(cSand);
      else if (onLoop || onCross) c.copy(cPath);
      else c.copy(cGrass).lerp(cHill, Math.min(1, (h - PAVE_H) / 4));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const flat = geo.toNonIndexed();
    flat.computeVertexNormals();
    const mesh = new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    mesh.position.set(p.cx, 0, p.cz);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 28),
      new THREE.MeshStandardMaterial({ color: 0x7ccbf2, roughness: 0.15, transparent: true, opacity: 0.85 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(p.cx + POND.x, PAVE_H - 0.12, p.cz + POND.z);
    this.scene.add(pond);

    // Trees on the slopes; benches & lamps along the loop path.
    let n = 0;
    for (let i = 0; i < 400 && n < 55; i++) {
      const lx = (rng() - 0.5) * (W - 6), lz = (rng() - 0.5) * (D - 6);
      if (Math.abs(Math.hypot(lx, lz * 1.1) - pathR) < 3 || Math.abs(lx) < 3 || Math.abs(lz) < 3) continue;
      if (Math.hypot(lx - POND.x, lz - POND.z) < POND.r + 3) continue;
      const x = p.cx + lx, z = p.cz + lz;
      tree(x, z, this.parkHeight(x, z) - 0.1, 0.8 + rng() * 0.7);
      n++;
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.2;
      const x = p.cx + Math.cos(a) * (pathR + 2.4), z = p.cz + Math.sin(a) * (pathR + 2.4) / 1.1;
      brk(i % 2 ? 'prop_lamp_post' : 'prop_bench', x, z, this.parkHeight(x, z), 1, i % 2 ? 0.3 : 0.9);
    }
    // Picnic pickups at the park gates (patients and pizzas both use these).
    const gates = [['N', p.cx, p.z0], ['S', p.cx, p.z1], ['W', p.x0, p.cz], ['E', p.x1, p.cz]];
    for (const [d, gx, gz] of gates) {
      const [dx, dz] = DIRS[d];
      this.pickupSpots.push({ x: gx + dx * (SIDE + LANES[1] + 0.1), z: gz + dz * (SIDE + LANES[1] + 0.1),
        standX: gx - dx * 1.0, standZ: gz - dz * 1.0, yaw: yawForDir(d), building: 'park' });
    }
  }

  _buildBeach(brk) {
    const rng = this.rng;
    const B = this.bounds;
    const len = 2 * B;
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(SEA_X - SAND_X + 8, len),
      new THREE.MeshStandardMaterial({ color: 0xf3dca8, roughness: 1 }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set((SAND_X + SEA_X + 8) / 2, 0.0, 0);
    sand.receiveShadow = true;
    this.scene.add(sand);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, len + 400),
      new THREE.MeshStandardMaterial({ color: 0x5fbfee, roughness: 0.2, emissive: 0x2a6ea8, emissiveIntensity: 0.15 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(SEA_X + 200, -0.06, 0);
    this.scene.add(sea);
    this.foam = new THREE.Mesh(new THREE.PlaneGeometry(1.4, len),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    this.foam.rotation.x = -Math.PI / 2;
    this.foam.position.set(SEA_X, -0.03, 0);
    this.scene.add(this.foam);
    for (let i = 0; i < 46; i++) {
      const x = SAND_X + 6 + rng() * (SEA_X - SAND_X - 10), z = (rng() * 2 - 1) * (B - 10);
      if (rng() < 0.6) brk('prop_palm', x, z, 0, 0.9 + rng() * 0.5, 0.35);
      else brk('prop_umbrella', x, z, 0, 1, 0.5);
    }
  }

  update(t) { if (this.foam) this.foam.position.x = SEA_X + Math.sin(t * 0.8) * 1.2; }

  _addFootprint(name, x, z, yaw) {
    const fp = FOOTPRINTS[name];
    if (!fp) return;
    const swap = Math.abs(Math.round(yaw / (Math.PI / 2))) % 2 === 1;
    for (const [cx, cz, hx, hz] of fp.rects || []) {
      const [ox, oz] = rotXZ(cx, cz, yaw);
      this.rects.push({ cx: x + ox, cz: z + oz, hx: swap ? hz : hx, hz: swap ? hx : hz });
    }
    for (const [cx, cz, r] of fp.circles || []) {
      const [ox, oz] = rotXZ(cx, cz, yaw);
      this.circles.push({ x: x + ox, z: z + oz, r });
    }
  }

  _onCarriageway(cell, x, z) {
    const lx = x - cell.x, lz = z - cell.z;
    const inX = Math.abs(lx) < ROAD_HALF, inZ = Math.abs(lz) < ROAD_HALF;
    if (inX && inZ) return true;
    if (inX && ((lz < 0 && cell.conn.has('N')) || (lz > 0 && cell.conn.has('S')))) return true;
    return inZ && ((lx > 0 && cell.conn.has('E')) || (lx < 0 && cell.conn.has('W')));
  }

  // What's under the wheels: 'road' | 'pave' | 'grass' | 'sand' | 'water'.
  surface(x, z) {
    if (x > SEA_X) return 'water';
    if (x > SAND_X) return 'sand';
    if (this.inPark(x, z)) {
      const p = this.park;
      return Math.hypot(x - p.cx - POND.x, z - p.cz - POND.z) < POND.r - 1 ? 'water' : 'grass';
    }
    const cell = this.cellAt(x, z);
    if (!cell || cell.type !== 'road') return 'grass';
    if (cell.roundabout && Math.hypot(x - cell.x, z - cell.z) < ISLAND_R) return 'grass';
    if (this._onCarriageway(cell, x, z)) return 'road';
    return cell.hwy ? 'grass' : 'pave';
  }

  // Surface height: roads/verges/countryside 0, pavements & lots +0.18, ramps,
  // park hills, roundabout mounds, and a gentle slope into the sea.
  groundHeight(x, z) {
    for (const rp of this.ramps) {
      const [lx, lz] = rotXZ(x - rp.x, z - rp.z, -rp.yaw);
      if (Math.abs(lx) < rp.half && lz > -rp.len / 2 && lz < rp.len / 2) return ((rp.len / 2 - lz) / rp.len) * rp.h;
    }
    if (x > SEA_X) return -0.5 * smooth(SEA_X, SEA_X + 12, x);
    if (this.inPark(x, z)) return this.parkHeight(x, z);
    const cell = this.cellAt(x, z);
    if (!cell) return 0;
    if (cell.type === 'road') {
      if (cell.roundabout) {
        const r = Math.hypot(x - cell.x, z - cell.z);
        if (r < ISLAND_R) return 0.25 + 0.75 * Math.sqrt(Math.max(0, 1 - (r / ISLAND_R) ** 2));
      }
      return this._onCarriageway(cell, x, z) || cell.hwy ? 0 : PAVE_H;
    }
    if (cell.type === 'country') return cell.building ? PAVE_H : 0;
    return PAVE_H;
  }

  // Push a circle out of buildings / soft obstacles. Returns {nx, nz, kind} or null;
  // only kind 'building' should damage the van.
  collide(p, r) {
    let hit = null;
    for (const b of this.rects) {
      if (Math.abs(p.x - b.cx) > b.hx + r || Math.abs(p.z - b.cz) > b.hz + r) continue;
      const qx = Math.max(b.cx - b.hx, Math.min(p.x, b.cx + b.hx));
      const qz = Math.max(b.cz - b.hz, Math.min(p.z, b.cz + b.hz));
      const dx = p.x - qx, dz = p.z - qz;
      const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 1e-4) { // centre inside the box: push out along the shallowest axis
        const ex = b.hx - Math.abs(p.x - b.cx), ez = b.hz - Math.abs(p.z - b.cz);
        if (ex < ez) {
          const s = Math.sign(p.x - b.cx) || 1; p.x = b.cx + s * (b.hx + r); hit = { nx: s, nz: 0, kind: 'building' };
        } else {
          const s = Math.sign(p.z - b.cz) || 1; p.z = b.cz + s * (b.hz + r); hit = { nx: 0, nz: s, kind: 'building' };
        }
        continue;
      }
      const nx = dx / d, nz = dz / d;
      p.x += nx * (r - d); p.z += nz * (r - d);
      hit = { nx, nz, kind: 'building' };
    }
    for (const c of this.circles) {
      const dx = p.x - c.x, dz = p.z - c.z;
      if (Math.abs(dx) > r + c.r || Math.abs(dz) > r + c.r) continue;
      const d = Math.hypot(dx, dz), min = r + c.r;
      if (d >= min || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d;
      p.x += nx * (min - d); p.z += nz * (min - d);
      hit = hit?.kind === 'building' ? hit : { nx, nz, kind: 'soft' }; // fountains, tables: bounce, no damage
    }
    const B = this.bounds;
    if (p.x > SEA_END) { hit = { nx: -1, nz: 0, kind: 'soft' }; p.x = SEA_END; }
    if (p.x < -B) { hit = { nx: 1, nz: 0, kind: 'soft' }; p.x = -B; }
    if (Math.abs(p.z) > B) { hit = { nx: 0, nz: -Math.sign(p.z), kind: 'soft' }; p.z = Math.sign(p.z) * B; }
    return hit;
  }

  neighbor(cell, d) { const [dx, dz] = DIRS[d]; return this.cells[cell.r + dz]?.[cell.c + dx]; }
  static dirVec(d) { return DIRS[d]; }
  static opposite(d) { return rotateDir(d, 2); }
}
