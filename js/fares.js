import * as THREE from 'three';
import { spawn } from './assets.js';
import { pick } from './utils.js';

export const FARE_ASSETS = ['char_patient_bandage', 'char_patient_granny', 'char_patient_kid', 'char_pedestrian',
  'char_doctor', 'marker_pickup', 'marker_dropoff'];
const PATIENTS = ['char_patient_bandage', 'char_patient_granny', 'char_patient_kid', 'char_pedestrian'];
const LINES = {
  char_patient_granny: ['My hip! Step on it, dear!', 'Mind the potholes!'],
  char_patient_kid: ['Wheee — I mean ow!', 'Is this the fast one?'],
  char_patient_bandage: ['I bonked my head. Twice.', 'Hospital, pronto!'],
  char_pedestrian: ['Allergic reaction! Hurry!', 'I think I sprained… everything.'],
};
const ZONE_R = 3.2;
const STOP_SPEED = 4.5;
const WAITING = 3;

// Crazy-Taxi loop: several patients wait around town; stop in a green beam to
// load one, then race to the red beam before their timer runs out.
export class Fares {
  constructor(scene, town) {
    this.scene = scene;
    this.town = town;
    this.waiting = [];
    this.current = null; // {patient, dest, timeLeft, timeMax, crashes, fareBase}
    this.hospital = town.dropoffSpots.find((s) => s.kind === 'hospital');
    this.dropMarker = this._marker('marker_dropoff');
    this.dropMarker.visible = false;
    this.doctor = spawn('char_doctor');
    this.doctor.position.set(this.hospital.standX + 1.5, 0.18, this.hospital.standZ);
    this.doctor.rotation.y = this.hospital.yaw;
    scene.add(this.doctor);
    this.dwell = 0;
  }

  _marker(name) {
    const m = spawn(name);
    this.scene.add(m);
    return m;
  }

  fill(player) {
    const used = new Set(this.waiting.map((w) => w.spot));
    while (this.waiting.length < WAITING) {
      const spots = this.town.pickupSpots.filter((s) => !used.has(s)
        && Math.hypot(s.x - player.pos.x, s.z - player.pos.z) > 22);
      if (!spots.length) break;
      const spot = pick(spots);
      used.add(spot);
      const model = pick(PATIENTS);
      const who = spawn(model);
      who.position.set(spot.standX, 0.18, spot.standZ);
      who.rotation.y = spot.yaw;
      this.scene.add(who);
      const marker = this._marker('marker_pickup');
      marker.position.set(spot.x, 0, spot.z);
      this.waiting.push({ spot, model, who, marker, wave: Math.random() * 6 });
    }
  }

  // Where the nav arrow should point.
  get target() {
    if (this.current) return { x: this.current.dest.x, z: this.current.dest.z, kind: 'drop' };
    return this._nearestWaiting;
  }

  update(dt, t, player, events) {
    const p = player.pos;
    const slow = player.speed < STOP_SPEED && !player.airborne;
    let nearest = null, nd = Infinity;
    for (const w of this.waiting) {
      w.wave += dt;
      w.who.position.y = 0.18 + Math.abs(Math.sin(w.wave * 5)) * 0.18; // hop + wave for attention
      w.who.rotation.y = w.spot.yaw + Math.sin(w.wave * 2) * 0.4;
      w.marker.getObjectByName('icon').position.y = 3.4 + Math.sin(t * 3) * 0.3;
      w.marker.getObjectByName('icon').rotation.y = t * 2;
      const d = Math.hypot(w.spot.x - p.x, w.spot.z - p.z);
      if (d < nd) { nd = d; nearest = w; }
    }
    this._nearestWaiting = nearest ? { x: nearest.spot.x, z: nearest.spot.z, kind: 'pickup' } : null;

    if (!this.current) {
      if (nearest && nd < ZONE_R && slow) {
        this.dwell += dt;
        if (this.dwell > 0.25) this._load(nearest, player, events);
      } else this.dwell = 0;
      return;
    }

    const c = this.current;
    c.timeLeft -= dt;
    this.dropMarker.getObjectByName('icon').position.y = 3.4 + Math.sin(t * 3) * 0.3;
    this.dropMarker.getObjectByName('icon').rotation.y = t * 2;
    this.doctor.position.y = 0.18 + Math.abs(Math.sin(t * 6)) * 0.12;
    if (c.timeLeft <= 0) {
      events.push({ type: 'fareFail', text: 'Patient took a rival ambulance!' });
      this._endFare(player);
      return;
    }
    const d = Math.hypot(c.dest.x - p.x, c.dest.z - p.z);
    if (d < ZONE_R && slow) {
      this.dwell += dt;
      if (this.dwell > 0.25) this._deliver(player, events);
    } else this.dwell = 0;
  }

  _load(w, player, events) {
    this.waiting.splice(this.waiting.indexOf(w), 1);
    this.scene.remove(w.who); this.scene.remove(w.marker);
    const dest = this.hospital;
    const dist = Math.hypot(dest.x - w.spot.x, dest.z - w.spot.z);
    // Manhattan-ish time budget: generous early, tight if you dawdle.
    const timeMax = Math.round(8 + dist / 7.5);
    this.current = { model: w.model, dest, timeLeft: timeMax, timeMax, crashes: 0, fareBase: Math.round(8 + dist * 0.22) };
    this.dropMarker.position.set(dest.x, 0, dest.z);
    this.dropMarker.visible = true;
    player.sirenOn = true;
    this.dwell = 0;
    events.push({ type: 'load', text: pick(LINES[w.model]), x: w.spot.x, z: w.spot.z });
    this.fill(player);
  }

  _deliver(player, events) {
    const c = this.current;
    const ratio = c.timeLeft / c.timeMax;
    const rating = ratio > 0.5 ? 'SPEEDY!' : ratio > 0.2 ? 'NICE' : 'PHEW…';
    const tipMult = Math.max(0, 1 - c.crashes * 0.2);
    const tip = Math.round(c.timeLeft * 1.2 * tipMult);
    const timeBonus = ratio > 0.5 ? 12 : ratio > 0.2 ? 8 : 5;
    events.push({ type: 'deliver', fare: c.fareBase, tip, rating, timeBonus, x: c.dest.x, z: c.dest.z,
      clean: c.crashes === 0 });
    this._endFare(player);
  }

  _endFare(player) {
    this.current = null;
    this.dropMarker.visible = false;
    player.sirenOn = false;
    this.dwell = 0;
  }

  onCrash() { if (this.current) this.current.crashes++; }
  addTime(s) { if (this.current) this.current.timeLeft = Math.min(this.current.timeMax + 10, this.current.timeLeft + s); }
}

// World-space helper arrow that hovers over the van (in addition to the HUD compass).
export function makeGuideArrow() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x56e27d, emissive: 0x56e27d, emissiveIntensity: 0.6, roughness: 0.4 });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.2), mat);
  shaft.position.z = -0.2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.0, 4), mat);
  head.rotation.x = Math.PI / 2; head.rotation.y = Math.PI / 4;
  head.position.z = 0.85;
  head.scale.set(1, 1, 0.35);
  g.add(shaft, head);
  g.userData.mat = mat;
  return g;
}
