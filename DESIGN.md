# Gig Ambulance — Game Design Spec

> A cute, chibi, low-poly isometric **rush-delivery** game for phones.
> *Crazy Taxi*'s frantic pickup → drop-off loop, reskinned as a gig-economy
> ambulance driver in a pastel toy town. Steered with a virtual thumbstick,
> like [space-lion](https://github.com/mtd-public/space-lion).

![Prototype screenshot](docs/screenshots/prototype.png)

## 1. Pillars

1. **Always hurrying.** A shift clock is always ticking. Every delivery buys more
   time, so good driving snowballs.
2. **One thumb to drive.** You point the stick where you want to go, and the van
   gets there with style (drifts, bumps, air).
3. **Chaos is cute, not cruel.** Cones fly, cars tumble and patients squeal
   "Wheee — I mean ow!", but crashes cost your tip, not anyone's life.
4. **Readable at a glance.** Green beam = pickup, red beam = drop-off. The nav
   arrow always points to the next stop.

## 2. Core loop

```
 ┌── Shift clock (90 s start) ────────────────────────────────────────────┐
 │  Find a patient (3 waiting at once, green beams)                        │
 │    → stop in the beam (< 4.5 m/s for 0.25 s) → patient hops in          │
 │  Race to the hospital (red beam) before the fare timer ends             │
 │    → stop in the beam → fare + time tip; shift clock +5/+8/+12 s        │
 │  Along the way: coins, power-ups, near misses, drifts, air → combo $    │
 └── Clock hits 0 → Shift Over (cash, deliveries, best combo) ───────────┘
```

- **Fare timer** = `8 + distance / 7.5` s.
  If it runs out, the patient "takes a rival ambulance" and you earn nothing.
- **Fare pay** = `8 + 0.22 × distance`. **Tip** = `1.2 × seconds left`, cut
  20% per crash while the patient is aboard. The **Heart** power-up restores it.
- **Shift bonus** on delivery: +12 s (SPEEDY, >50% time left), +8 s (NICE),
  +5 s (PHEW).

### Later fare types (not in the prototype yet)
| Fare | Twist |
|---|---|
| Meds run | Pick up at the **pharmacy** and deliver to a house (pharmacies already register as drop-off spots) |
| Critical | Short timer, x2 pay. Heartbeat SFX speeds up as time runs out |
| Wobbly granny | Every hard corner or bump drains patience, so drive smoothly |
| Group outing | 3 patients from one stop. Bigger fare, wider van (the bus?) |
| Air ambulance | Late-game unlock: fly the helicopter between helipads |

## 3. Controls (virtual thumbstick, space-lion style)

| Input | Action |
|---|---|
| **Left ~55% of the screen**: touch and drag | A floating thumbstick. The stick direction is an **absolute screen direction**: the van turns to drive *that way on screen*. Deflection sets throttle. |
| Release the stick | Brake to a stop (this is how you park in a beam). This is the one deliberate change from space-lion, where the ship keeps flying. |
| **Right side**: hold | **Siren Rush** boost while the meter has charge |
| Keyboard | WASD / arrows steer; Space / Shift boost |

**Screen to world mapping.** The camera has a fixed yaw of 45°, so the input
module keeps space-lion's screen-space stick. The game projects it onto the
ground with the camera's right and up vectors:
`world = right × sx + up × (−sy)` (see `js/main.js`). Pushing up always means
"up the screen", which suits phones better than tank or relative steering.

**Handling.** Steering authority grows with speed, so a parked van can't
pivot. Asking for a sharp turn at speed drops lateral grip from 7.5 to 2.2,
which produces a power-slide with dust. A U-turn request also sheds speed so
you can whip around. Airtime disables steering.

## 4. Camera

- Orthographic, 45° yaw, **52° pitch**. At 38° the tall buildings hid the van
  too often.
- Frames about 26 m of height (more in portrait) and looks ahead along the
  velocity, so you see what you're driving into.
- The van gets an **x-ray silhouette** when a building hides it.
- Crash shake scales with impact.

## 5. Scoring, combos and juice

| Event | Reward |
|---|---|
| Coin (breadcrumb trails of 5) | +$2 |
| Knock over a cone, bin, hydrant or barrier | +$1 "SMASH" |
| Near miss (passing within ~1.6 m at >12 m/s) | combo +1 |
| Drift longer than 1.2 s | combo +1 |
| Air longer than 0.45 s (ramps) | combo +1 |
| Punt a small car (relative speed >6 m/s) | combo +1, and the car tumbles away |
| Crash into a wall, bus or car | combo reset, van damage, tip −20% |

Combo payouts are `min(10, combo)` dollars each, and the combo decays after
3 s of inactivity. Juice includes floating `+$` text, toasts, confetti on
delivery, dust on drifts and landings, siren flashing with a two-tone synth
siren while carrying, and wheels that spin and steer.

## 6. Power-ups

| Model | Name | Effect |
|---|---|---|
| `pu_turbo` | Siren Rush | Refills the boost meter (25 m/s top speed instead of 15) |
| `pu_repair` | Wrench | −35% damage (damage lowers top speed by up to 35%) |
| `pu_time` | Alarm clock | +8 s on the fare timer (or +5 s shift time if empty) |
| `pu_magnet` | Tip magnet | Pulls coins in from 9 m for 8 s |
| `pu_heart` | Heart | Stabilises the patient: crash penalty cleared, +4 s |
| `pu_star` | Star | ×2 pay on the next delivery |
| `pu_shield` | Bubble bumper | 6 s of crash immunity |
| `pu_coin` | Coin | +$2 |
| `marker_pickup` / `marker_dropoff` | Beams | Zone markers, with a bobbing icon node named `icon` |

## 7. The town

- A **15 × 15 grid of 8 m tiles**. Roads run every 4th row and column, which
  makes 3 × 3 blocks. A forest ring and guard rails bound the map.
- Each block's centre is a **park**; its edge lots get buildings that **face
  the adjacent road**, preferring S/E so fronts face the camera.
- The **hospital** is two tiles wide in the central block and faces the
  camera. Two **pharmacies** and a **lighthouse** landmark are placed
  randomly (seeded).
- Road pieces (`straight`, `crosswalk`, `corner`, `t`, `cross`, `end`) are
  picked and rotated automatically from each cell's connectivity.
- Surfaces: road at y=0, kerbs and lots at +0.18. **Ramps** sit in the
  right-hand lane of a few straights and launch you.
- Traffic (14 cars, including buses) follows right-hand lanes on the road graph,
  brakes for things ahead, and can be punted. Buses can't be punted: they act
  as moving walls.
- All static geometry is **merged per material** at load
  (`bakeStatic`): the whole town is ~60 meshes.

## 8. Art direction

Reference mood (from the shared screenshots):
- **Low-poly racer:** minty teal grass, slate roads with yellow edge lines,
  red/white kerbs, rounded lavender guard rails, tiered faceted pines with
  orange trunks, soft shadows.
- **Cozy purple town:** a lavender/purple base with green and orange accents,
  arched glowing windows, green lamp posts, chunky rounded buildings, thin
  ink outlines.

Rules:
- Shapes are chunky, bevelled boxes, oversized wheels and short wheelbases.
  Characters are about 2.5 heads tall, smooth-shaded, with dot eyes and blush.
- Every colour comes from one palette (`tools/blender/kit.py → PALETTE`).
  Gameplay colours are reserved: **red = medical/urgent**, **green = pickup**,
  **yellow = reward**.
- Emissive is used only on things that should glow: windows, lamps, sirens,
  beams and signs.

## 9. Asset pipeline

All models are procedural. The Blender Python scripts in `tools/blender/`
create **53 GLBs**, isometric preview renders and a manifest.

```
pip install bpy            # Blender as a Python module (5.0)
python3 tools/blender/build.py               # everything (glb + previews + manifest)
python3 tools/blender/build.py --only car_,bus --samples 16
python3 tools/blender/build.py --no-render   # glb + manifest only (fast)
python3 tools/blender/contact_sheet.py       # per-category contact sheets
```

| Category | Assets |
|---|---|
| characters | medic (player driver), doctor, patient_bandage, patient_granny, patient_kid, pedestrian |
| vehicles | ambulance (player), moto_medic, air_ambulance, car_pink, car_blue, taxi, pickup, bus |
| buildings | hospital (2 tiles), house_lilac, house_peach, apartment, cafe, pharmacy, office, lighthouse |
| streets | road_straight / crosswalk / corner / t / cross / end, lot_grass, lot_park |
| props | tree_pine, tree_round, bush, lamp_post, bench, traffic_light, cone, hydrant, bin, guard_rail, fence, ramp, barrier |
| powerups | turbo, repair, time, magnet, heart, coin, star, shield, marker_pickup, marker_dropoff |

Conventions:
- Metres. glTF +Y is up, and models **face +Z**, so `yaw = atan2(dx, dz)`.
  The origin is on the ground at the footprint centre.
- Animatable nodes: `wheel_fl/fr/rl/rr` (spin on local X), `siren_l/siren_r`,
  `rotor`/`tail_rotor`, `light_red/amber/green`, character `head`, marker
  `icon`, lighthouse `lamp`.
- Per-asset metadata (size, tris, node names, gameplay extras such as
  `tile`, `pickup_spot` and `smashable`) lives in `assets/manifest.json`.

## 10. Code architecture (no build step, plain ES modules)

| File | Role |
|---|---|
| `js/input.js` | Floating thumbstick, hold-to-boost and keyboard. Adapted from space-lion's `InputManager` |
| `js/town.js` | Grid layout, road-piece selection, building footprints and colliders, ground height, ramps |
| `js/player.js` | Ambulance arcade physics, collisions, jumps, visuals (lean, wheels, sirens, x-ray) |
| `js/traffic.js` | Lane-following cars, braking, punting, near misses |
| `js/fares.js` | Waiting patients, load/deliver, fare timers, world guide arrow |
| `js/pickups.js` | Power-ups, coin trails, smashable props |
| `js/hud.js` | DOM HUD, **top nav compass**, toasts, floating text, stick drawing |
| `js/fx.js` / `js/audio.js` | Pooled particles and screen shake / WebAudio synth SFX (no audio files) |
| `js/assets.js` | GLTF loading, cloning, static merge-by-material |
| `js/vendor/` | three.js r160 module build and GLTFLoader |

## 11. Roadmap

**Prototype (this commit):** a full loop is playable (shift clock → pickup →
hospital → tips and time), with traffic, ramps, power-ups, combos, the nav
compass, and a title/pause/game-over flow.

Next:
1. **Tuning pass on real phones:** stick sensitivity, grip, camera zoom and
   fare timer curve.
2. **Instancing** for coins, traffic and particles (about 280 draw calls per
   pass today, mostly dynamic objects).
3. **Minimap / route hint:** follow the road graph instead of a straight-line
   arrow, and optionally draw breadcrumbs on the road.
4. More fare types (§2) and pharmacy meds runs.
5. **Rival ambulance AI** (the taxi model) that competes for patients.
6. Upgrades between shifts, bought with cash: tyres (grip), engine, siren
   capacity, the moto-medic and the air ambulance.
7. Day/night palette swap (the windows already glow), weather, and music.
8. Toon outline pass (inverted hull), matching the reference ink lines.
