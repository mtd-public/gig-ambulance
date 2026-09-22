# Gig Ambulance — Game Design Spec

> A cute, chibi, low-poly isometric **rush-delivery** game for phones.
> *Crazy Taxi*'s frantic pickup → drop-off loop, reskinned as a gig-economy
> ambulance driver in a pastel toy town. Steered with a virtual thumbstick,
> like [space-lion](https://github.com/mtd-public/space-lion).

![Prototype screenshot](docs/screenshots/prototype.png)

![Grand Central Park, a double-lane roundabout, and the beach](docs/screenshots/park-roundabout-beach.png)

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
 │    → stop in the beam (6.5 m zone, < 6 m/s for 0.25 s) → patient hops in│
 │  Race to THEIR hospital (1 of 3, red beam) before the fare timer ends   │
 │    → stop in the beam → fare + time tip; shift clock +5/+8/+12 s        │
 │  Along the way: coins, power-ups, near misses, drifts, air → combo $    │
 └── Clock hits 0 → Shift Over (cash, deliveries, best combo) ───────────┘
```

- **Fare timer** = `10 + 1.3 × distance / 11` s. Each patient is assigned one of
  three hospitals (St. Bandage General, Mercy Mint Hospital, Lil' Heart Medical),
  and it isn't always the nearest one.
  If it runs out, the patient "takes a rival ambulance" and you earn nothing.
- **Fare pay** = `8 + 0.22 × distance`. **Tip** = `1.2 × seconds left`, cut
  20% per crash while the patient is aboard. The **Heart** power-up restores it.
- **Shift bonus** on delivery: +12 s (SPEEDY, >50% time left), +8 s (NICE),
  +5 s (PHEW).

### Pizza side gig (runs in parallel, even mid-patient)
- Three pizza boxes wait around town under **orange beams**. Roll through a beam
  (under 12 m/s, no full stop needed) to grab one. You can carry up to 3, and
  they stack on the ambulance roof.
- Drop them at either **pizzeria**: one in town, one on the beach. That pays $6
  per pizza, plus a hot tip (`4 + 0.4 × seconds left`) and +2 s of shift time
  for each hot pizza.
- The hot timer is `18 + 1.3 × distance-to-nearest-pizzeria / 10` s. Cold
  pizzas pay only the $6.
- A hard crash (impact over 9 m/s) knocks the top box off the roof.
- A second, smaller **orange compass** at the top points to the next pizza stop.

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
| **Left ~60% of the screen**: touch and drag | A floating thumbstick. The stick direction is an **absolute screen direction**: the van turns to drive *that way on screen*. Deflection sets throttle, on a smoothstep curve so small moves are gentle. |
| Release the stick | Coast down (11 m/s²). Unlike space-lion, the van doesn't keep going. |
| **DRIFT** (big yellow button) | Handbrake slide: grip drops to 1.3, turn rate ×1.55, and speed carries through the corner |
| **BRAKE** | Hard stop (38 m/s²) |
| **BOOST** | **Siren Rush** while the meter has charge |
| ⟳ button | Rotates the camera 90°, eased. Stick mapping follows the camera. |
| Keyboard | WASD / arrows steer; Space drift; X brake; Shift boost; Q/E rotate |

**Screen to world mapping.** The camera has a fixed yaw of 45°, so the input
module keeps space-lion's screen-space stick. The game projects it onto the
ground with the camera's right and up vectors:
`world = right × sx + up × (−sy)` (see `js/main.js`). Pushing up always means
"up the screen", which suits phones better than tank or relative steering.

**Handling.** The stick angle is smoothed, then drives the yaw *rate* through a
damped spring (`rate = clamp(3 × error, ±max)`), so the van eases into and out
of turns instead of snapping. Steering authority grows with speed, so a parked
van can't pivot. A hard yank at speed also lets the tail step out. Surfaces
change the feel (top speed × / grip ×): road 1/1, pavement 0.95/1,
grass 0.82/0.7, sand 0.72/0.55, water 0.45/0.5. The van tilts to follow hills,
and goes airborne whenever the ground drops away faster than a ballistic arc:
ramp lips, hill crests, the roundabout mound. Kerbs count as steps, not launches.

**Joystick robustness.** A new touch in the stick zone always takes the stick
over. Lost pointer capture, a mouse released outside the window, blur, tab
hiding and pause all reset input. This fixes the stick getting stuck until a
reload after a system gesture or notification swallowed the `pointerup`.

## 4. Camera

- Orthographic, 45° yaw (rotatable in 90° steps), **52° pitch**. At 38° the
  tall buildings hid the van too often.
- Frames about 26 m of height (more in portrait) and looks ahead along the
  velocity, so you see what you're driving into.
- The van gets an **x-ray silhouette** when a building hides it.
- Crash shake scales with impact.

## 5. Scoring, combos and juice

| Event | Reward |
|---|---|
| Coin (breadcrumb trails of 5) | +$2 |
| Knock over a cone, bin, hydrant, barrier, bench, lamp, tree, palm or umbrella | +$1 "SMASH" (no damage, a slight slowdown) |
| Near miss (passing within ~1.6 m at >12 m/s) | combo +1 |
| Drift longer than 1.2 s | combo +1 |
| Air longer than 0.45 s (ramps) | combo +1 |
| Punt a small car (relative speed >6 m/s) | combo +1, and the car tumbles away |
| Crash into a **building** or a car/bus (the only things that damage the van) | combo reset, van damage, tip −20% |

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

A **15 × 15 grid of 16 m tiles** (240 m across), surrounded by open,
drivable countryside:

| Rows / cols | What |
|---|---|
| 0, 14 | Countryside: farms, trees, bushes (all drivable grass; no walls) |
| 1, 13 | **Highway ring**: 4 lanes, flush grass shoulders, rounded bends |
| 7 | Highway spokes that end at the park |
| 4, 10 | City streets (4 lanes, raised pavements) that ring the park. Two of their crossings are **double-lane roundabouts**; the others stay regular crossroads. |
| 5–9 | **Grand Central Park**: an 80 × 80 m low-poly heightfield with hills up to ~4 m, a pond, a path loop, trees, benches and lamps. All of it is drivable (catch air off the crests!) |
| others | 2×2-lot blocks, so every lot touches two roads |

- Roads are **12 m wide** (4 × 3 m lanes) with 2 m pavements or shoulders,
  plus a double white centre line, dashed lane lines and yellow edges.
- **3 hospitals** (each 2 tiles wide), **2 pizzerias** (one on the waterfront),
  a pharmacy, a lighthouse, 2 small parks, and homes, cafés and offices with
  roomy yards.
- **Beach:** the east coast is sand (x 106–152 m), then shallow sea out to 178 m.
  It has palms and umbrellas and is drivable, but slow.
- **Collisions:** only buildings are solid and hurt. Fountains and tables bounce
  you without damage. Everything small (trees, lamps, street furniture, palms,
  umbrellas) is an **instanced breakable**: it topples or flies off, then regrows
  about 25 s later.
- Traffic (26 cars) keeps to lanes on the road graph, circles roundabouts
  anti-clockwise, and drives about 45% faster on highways.
- Ramps sit in random lanes of straight roads and highways.

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
create **61 GLBs**, isometric preview renders and a manifest.

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
| buildings | hospital (2 tiles), house_lilac, house_peach, apartment, cafe, pharmacy, **pizzeria**, office, lighthouse |
| streets | road_straight / crosswalk / corner / t / cross / end / **roundabout**, **hwy_straight / hwy_corner**, lot_grass, lot_park |
| props | tree_pine, tree_round, bush, lamp_post, bench, traffic_light, cone, hydrant, bin, guard_rail, fence, ramp, barrier, **pizza_box, palm, umbrella** |
| powerups | turbo, repair, time, magnet, heart, coin, star, shield, marker_pickup, marker_dropoff, **marker_pizza** |

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
| `js/pickups.js` | Power-ups and coin trails |
| `js/pizza.js` | Pizza side gig: pickups, roof stack, pizzeria drop-offs, hot timers |
| `js/breakables.js` | Instanced breakable props (topple / fly / regrow) |
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
