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
const ZONE_R = 6.5;
const STOP_SPEED = 6;
// Marker beams are authored ~2.3 m wide; scale them so the beam *is* the zone.
export const BEAM_SCALE = ZONE_R / 2.3;
export function scaleBeam(m, zone = ZONE_R) {
  const k = zone / 2.3;
  m.scale.set(k, 1, k);
  const icon = m.getObjectByName('icon');
  if (icon) icon.scale.set(1.5 / k, 1.5, 1.5 / k); // keep the floating icon round (and a bit bigger)
  return m;
}
const WAITING = 3;

// Crazy-Taxi loop: several patients wait around town; stop in a green beam to
// load one, then race to the red beam before their timer runs out.
export class Fares {
  constructor(scene, town) {
    this.scene = scene;
    this.town = town;
    this.waiting = [];
    this.current = null; // {model, dest, timeLeft, timeMax, crashes, fareBase}
    this.hospitals = town.dropoffSpots.filter((s) => s.kind === 'hospital');
    this.hospital = this.hospitals[0];
    this.dropMarker = this._marker('marker_dropoff');
    this.dropMarker.visible = false;
    this.doctors = this.hospitals.map((h) => {
      const doc = spawn('char_doctor');
      doc.position.set(h.standX + 1.5, 0.18, h.standZ);
      doc.rotation.y = h.yaw;
      scene.add(doc);
      return doc;
    });
    this.dwell = 0;
  }

  _marker(name) {
    const m = spawn(name);
    scaleBeam(m);
    this.scene.add(m);
    return m;
  }

  fill(player) {
    const busy = this.town.busy || (this.town.busy = new Set()); // shared with pizza orders
    while (this.waiting.length < WAITING) {
      const spots = this.town.pickupSpots.filter((s) => !busy.has(s)
        && Math.hypot(s.x - player.pos.x, s.z - player.pos.z) > 30);
      if (!spots.length) break;
      const spot = pick(spots);
      busy.add(spot);
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
    const doc = this.doctors[this.hospitals.indexOf(c.dest)];
    if (doc) doc.position.y = 0.18 + Math.abs(Math.sin(t * 6)) * 0.12;
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
    this.town.busy.delete(w.spot);
    this.scene.remove(w.who); this.scene.remove(w.marker);
    // Each patient needs a particular hospital (their doctor is there) — not always the nearest.
    const dest = pick(this.hospitals);
    const dist = Math.hypot(dest.x - w.spot.x, dest.z - w.spot.z);
    // Manhattan-ish budget: roads are grid-aligned, so allow ~1.3x the straight line.
    const timeMax = Math.round(10 + (dist * 1.3) / 11);
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
