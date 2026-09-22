import * as THREE from 'three';
import { loadAssets } from './assets.js';
import { Sfx } from './audio.js';
import { BREAKABLE_ASSETS, Breakables } from './breakables.js';
import { FARE_ASSETS, Fares, makeGuideArrow } from './fares.js';
import { FX } from './fx.js';
import { Hud } from './hud.js';
import { InputManager } from './input.js';
import { PICKUP_ASSETS, Pickups } from './pickups.js';
import { PIZZA_ASSETS, Pizza } from './pizza.js';
import { Ambulance } from './player.js';
import { TOWN_ASSETS, Town } from './town.js';
import { TRAFFIC_ASSETS, Traffic } from './traffic.js';
import { damp } from './utils.js';

const GAME_TIME = 90;
const VIEW = 15; // half of the shorter screen dimension, in metres
const CAM_PITCH = THREE.MathUtils.degToRad(52);
let camYaw = Math.PI / 4, camYawTarget = camYaw; // rotate in 90 deg steps with the ⟳ button / Q / E

// ---------- renderer / scene / camera ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc4b0ee);

const hemi = new THREE.HemisphereLight(0xf1eaff, 0x5fbf97, 1.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 140 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(-22, 45, 14);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
const CAM_OFFSET = new THREE.Vector3();
// Stick -> world: screen right and screen up projected onto the ground (follow the camera yaw).
const SCREEN_RIGHT = new THREE.Vector2();
const SCREEN_UP = new THREE.Vector2();
function applyCamYaw() {
  CAM_OFFSET.set(Math.sin(camYaw) * Math.cos(CAM_PITCH), Math.sin(CAM_PITCH), Math.cos(camYaw) * Math.cos(CAM_PITCH))
    .multiplyScalar(140);
  SCREEN_RIGHT.set(Math.cos(camYaw), -Math.sin(camYaw));
  SCREEN_UP.set(-Math.sin(camYaw), -Math.cos(camYaw));
}
applyCamYaw();
function rotateCamera(dir = 1) { camYawTarget += (dir * Math.PI) / 2; }

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  const half = aspect < 1 ? VIEW / aspect * 0.7 : VIEW; // portrait: show a bit more height
  camera.left = -half * aspect; camera.right = half * aspect;
  camera.top = half; camera.bottom = -half;
  camera.updateProjectionMatrix();
  hud?.resize();
}

// ---------- game objects ----------
const input = new InputManager(canvas);
const hud = new Hud(document.getElementById('overlay'));
const sfx = new Sfx();
let town, player, traffic, fares, pickups, pizza, breakables, fx, guide;
input.bindButton(document.getElementById('btn-drift'), 'drift');
input.bindButton(document.getElementById('btn-brake'), 'brake');
input.bindButton(document.getElementById('btn-boost'), 'boost');
document.getElementById('rot-btn').addEventListener('click', () => rotateCamera(1));
input.onKey = (k) => { if (k === 'q') rotateCamera(-1); else if (k === 'e') rotateCamera(1); };
const state = { mode: 'loading', time: GAME_TIME, cash: 0, deliveries: 0, bestCombo: 0, starMult: 1 };
const camFocus = new THREE.Vector3();
window.addEventListener('resize', resize);
resize();

async function boot() {
  const status = document.getElementById('load-status');
  const btn = document.getElementById('start-btn');
  const names = [...new Set(['veh_ambulance', ...TOWN_ASSETS, ...TRAFFIC_ASSETS, ...FARE_ASSETS, ...PICKUP_ASSETS,
    ...PIZZA_ASSETS, ...BREAKABLE_ASSETS, 'prop_palm', 'prop_umbrella'])];
  try {
    await loadAssets(names, (d, n) => { status.textContent = `Loading models ${d}/${n}`; });
  } catch (err) {
    status.textContent = `Failed to load assets: ${err.message}`;
    throw err;
  }
  town = new Town(scene, 7);
  player = new Ambulance(scene, town);
  breakables = new Breakables(scene, town.breakables);
  traffic = new Traffic(scene, town, 26);
  fares = new Fares(scene, town);
  pizza = new Pizza(scene, town);
  pickups = new Pickups(scene, town);
  fx = new FX(scene);
  guide = makeGuideArrow();
  scene.add(guide);
  resetRun();
  status.textContent = '';
  btn.disabled = false;
  btn.textContent = 'START SHIFT';
  btn.onclick = start;
  state.mode = 'title';
  requestAnimationFrame(loop);
}

function resetRun() {
  const h = fares.hospital;
  player.place(h.x, h.z, Math.PI * 0.5);
  player.damage = 0; player.boost = 1;
  state.time = GAME_TIME; state.cash = 0; state.deliveries = 0; state.starMult = 1;
  state.combo = 0; state.bestCombo = 0;
  fares.fill(player);
  pizza.fill(player);
  camFocus.set(player.pos.x, 0, player.pos.z);
}

function start() {
  sfx.unlock();
  document.getElementById('screen').classList.add('hidden');
  hud.show(true);
  if (state.mode === 'over') resetRun();
  state.mode = 'playing';
}

document.getElementById('pause-btn').addEventListener('click', () => {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  input.reset();
  sfx.setSiren(false);
  showCard(`<h1>PAUSED</h1><p class="tag">Take a breather, medic.</p><button id="resume">RESUME</button>`);
  document.getElementById('resume').onclick = () => {
    document.getElementById('screen').classList.add('hidden');
    state.mode = 'playing';
  };
});

function showCard(html) {
  const s = document.getElementById('screen');
  s.querySelector('.card').innerHTML = html;
  s.classList.remove('hidden');
}

function gameOver() {
  state.mode = 'over';
  input.reset();
  sfx.setSiren(false);
  hud.show(false);
  showCard(`<h1>SHIFT<br><span>OVER</span></h1>
    <div class="stats">💵 $${state.cash}<br>🚑 ${state.deliveries} patient${state.deliveries === 1 ? '' : 's'} delivered<br>
    🔥 best combo x${state.bestCombo}</div>
    <p class="tag">${state.deliveries >= 6 ? 'Employee of the month!' : state.deliveries >= 3 ? 'Solid shift.' : 'The hospital called. They\'re worried.'}</p>
    <button id="again">ANOTHER SHIFT</button>`);
  document.getElementById('again').onclick = start;
}

// ---------- scoring ----------
function earn(amount, x, z, label) {
  state.cash += amount;
  hud.float(`${label ? `${label} ` : ''}+$${amount}`, x, 2.5, z);
}

function bumpCombo(label, x, z) {
  state.combo = (state.combo || 0) + 1;
  state.comboT = 3;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  const bonus = Math.min(10, state.combo);
  earn(bonus, x, z, label);
}

function handleEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case 'crash':
        sfx.crash(); fx.shake = Math.min(1, e.impact / 18);
        fares.onCrash();
        if (fares.current) hud.toast('OUCH! Tip -20%', 'bad');
        if (e.impact > 9) pizza.onCrash(player, events);
        state.combo = 0;
        break;
      case 'pizzaGrab':
        sfx.coin(); fx.sparkle(e.x, 0, e.z, 8);
        hud.toast(`🍕 Pizza ${e.count}/3`, 'good');
        break;
      case 'pizzaDrop':
        state.cash += e.pay; sfx.deliver(); fx.confetti(e.x, 0, e.z, 25);
        hud.toast(`🍕 ×${e.count} delivered${e.hot === e.count ? ' — piping hot!' : ''} +$${e.pay}`, 'good');
        state.time += 2 * e.hot;
        if (e.hot) hud.float(`+${2 * e.hot}s`, e.x, 4, e.z, '#e07b12');
        break;
      case 'pizzaLost': sfx.bonk(); hud.toast('A pizza flew off the roof!', 'bad'); break;
      case 'bonk': sfx.bonk(); break;
      case 'land':
        fx.dust(player.pos.x, 0, player.pos.z, 8, 2);
        if (e.air > 0.45) { sfx.jump(); bumpCombo(`AIR ${e.air.toFixed(1)}s!`, player.pos.x, player.pos.z); }
        break;
      case 'smashCar':
        sfx.crash(); fx.shake = 0.5; fx.dust(e.x, 0, e.z, 6, 2);
        bumpCombo('BONK!', e.x, e.z);
        break;
      case 'bump': sfx.bonk(); fx.shake = 0.3; state.combo = 0; break;
      case 'nearMiss': bumpCombo('NEAR MISS', e.x, e.z); break;
      case 'smashProp': sfx.bonk(); fx.dust(e.x, 0.2, e.z, 4, 1.2); earn(1, e.x, e.z, 'SMASH'); break;
      case 'power': applyPower(e); break;
      case 'load':
        sfx.load(); fx.sparkle(e.x, 0, e.z, 14);
        hud.toast(`“${e.text}”`, 'good');
        break;
      case 'deliver': {
        const total = Math.round((e.fare + e.tip) * state.starMult);
        state.cash += total;
        state.time += e.timeBonus;
        state.deliveries++;
        sfx.deliver(); fx.confetti(e.x, 0, e.z, 50);
        hud.toast(`${e.rating} +$${total}`, 'big good');
        hud.float(`+${e.timeBonus}s`, e.x, 4, e.z, '#4ea4ea');
        if (e.clean) hud.toast('Smooth ride bonus!', 'good');
        if (state.starMult > 1) hud.toast('STAR x2!', 'good');
        state.starMult = 1;
        break;
      }
      case 'fareFail': sfx.fail(); hud.toast(e.text, 'bad'); break;
      default: break;
    }
  }
}

function applyPower(e) {
  const { x, z } = e;
  fx.sparkle(x, 0, z, 12);
  switch (e.kind) {
    case 'pu_coin': sfx.coin(); earn(2, x, z); return;
    case 'pu_turbo': player.boost = 1; hud.toast('SIREN RUSH ready!'); break;
    case 'pu_repair': player.damage = Math.max(0, player.damage - 0.35); hud.toast('Patched up!', 'good'); break;
    case 'pu_time':
      if (fares.current) { fares.addTime(8); hud.toast('+8s fare time'); } else { state.time += 5; hud.toast('+5s shift'); }
      break;
    case 'pu_magnet': pickups.magnet = 8; hud.toast('TIP MAGNET!'); break;
    case 'pu_heart':
      if (fares.current) { fares.current.crashes = 0; fares.addTime(4); hud.toast('Patient stabilised ♥', 'good'); } else hud.toast('♥');
      break;
    case 'pu_star': state.starMult = 2; hud.toast('Next fare x2!'); break;
    case 'pu_shield': player.shield = 6; hud.toast('BUBBLE BUMPER!'); break;
    default: break;
  }
  sfx.power();
}

// ---------- main loop ----------
let last = performance.now();
const clock = { t: 0 };

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock.t += dt;
  const t = clock.t;
  const playing = state.mode === 'playing';

  if (playing) {
    const raw = input.read();
    let ctl = null;
    if (raw) {
      const wx = SCREEN_RIGHT.x * raw.x + SCREEN_UP.x * -raw.y;
      const wz = SCREEN_RIGHT.y * raw.x + SCREEN_UP.y * -raw.y;
      const n = Math.hypot(wx, wz) || 1;
      ctl = { x: wx / n, z: wz / n, mag: raw.mag };
    }
    player.update(dt, ctl, { boost: input.boost, drift: input.drift, brake: input.brake }, t);
    const events = player.events.splice(0);
    events.push(...traffic.update(dt, player));
    breakables.update(dt, player, events);
    fares.update(dt, t, player, events);
    pizza.update(dt, t, player, events);
    pickups.update(dt, t, player, events);
    handleEvents(events);
    if (player.drifting && player.speed > 8 && !player.airborne) {
      fx.dust(player.pos.x - Math.sin(player.heading) * 1.6, 0, player.pos.z - Math.cos(player.heading) * 1.6, 1, 1.5);
      if (player.driftTime > 1.2 && !player._driftAwarded) {
        player._driftAwarded = true; bumpCombo('DRIFT!', player.pos.x, player.pos.z);
      }
    } else player._driftAwarded = false;
    if (player.boosting && Math.random() < 0.5) fx.dust(player.pos.x, 0, player.pos.z, 1, 1);
    const loose = player.surface === 'sand' || player.surface === 'water' || player.surface === 'grass';
    if (loose && player.speed > 7 && !player.airborne && Math.random() < 0.35) {
      fx.dust(player.pos.x, player.y, player.pos.z, 1, 1.6); // kicked-up sand / spray / grass
    }
    if (state.comboT > 0 && (state.comboT -= dt) <= 0) state.combo = 0;
    state.time -= dt;
    sfx.setSiren(player.sirenOn);
    if (state.time <= 0) gameOver();
  } else if (player) {
    // idle attract mode: sirens twinkle, nothing moves
    player._visuals?.(dt, 0, t);
    traffic.update(dt * 0.5, player);
  }

  if (player) {
    fx.update(dt);
    town.update(t);
    // Ease the camera yaw toward its 90-degree step.
    if (Math.abs(camYawTarget - camYaw) > 1e-4) { camYaw = damp(camYaw, camYawTarget, 7, dt); applyCamYaw(); }
    // Camera: follow with look-ahead along velocity, plus crash shake.
    const ahead = new THREE.Vector3(player.pos.x + player.vel.x * 0.45, 0, player.pos.z + player.vel.y * 0.45);
    camFocus.x = damp(camFocus.x, ahead.x, 4, dt);
    camFocus.z = damp(camFocus.z, ahead.z, 4, dt);
    const sh = fx.shake * fx.shake * 0.8;
    camera.position.copy(camFocus).add(CAM_OFFSET);
    camera.position.x += (Math.random() - 0.5) * sh; camera.position.y += (Math.random() - 0.5) * sh;
    camera.lookAt(camFocus);
    sun.position.copy(camFocus).add(SUN_OFFSET);
    sun.target.position.copy(camFocus);

    // Hovering guide arrow over the van.
    const target = fares.target;
    guide.visible = !!target && playing;
    if (target) {
      guide.position.set(player.pos.x, player.y + 3.6 + Math.sin(t * 4) * 0.15, player.pos.z);
      guide.rotation.y = Math.atan2(target.x - player.pos.x, target.z - player.pos.z);
      const col = target.kind === 'drop' ? 0xff5468 : 0x56e27d;
      guide.userData.mat.color.setHex(col); guide.userData.mat.emissive.setHex(col);
    }
    hud.update(dt, {
      time: state.time, cash: state.cash, damage: player.damage, boost: player.boost,
      fare: fares.current && { ...fares.current, label: fares.current.dest.name },
      waiting: fares.waiting.length, navTarget: target, px: player.pos.x, pz: player.pos.z,
      pizza: { count: pizza.count, minTime: pizza.minTime }, pizzaTarget: pizza.nearestTarget(player.pos),
    }, camera, input);
  }
  renderer.render(scene, camera);
}

boot();

// Debug handle for poking at the prototype from the console.
window.GIG = { get state() { return state; }, get player() { return player; }, get town() { return town; },
  get fares() { return fares; }, get pizza() { return pizza; }, get traffic() { return traffic; },
  get inputState() { return { active: input.stickActive, dir: input.hasDirection }; },
  rotateCamera, scene, camera };
