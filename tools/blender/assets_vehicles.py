"""Chunky toy vehicles: oversized wheels, rounded bodies, short wheelbases.

Front faces -Y (glTF +Z). Animatable child nodes:
  wheel_fl / wheel_fr / wheel_rl / wheel_rr  -> spin about local X
  siren_l / siren_r                         -> toggle emissive / scale-pulse
  rotor / tail_rotor                        -> spin (air ambulance)
"""

from assets_characters import red_cross
from kit import Model, ball, box, cone, cyl, dome, torus


def wheel(m, name, loc, r=0.42, w=0.36, hub="metal"):
    m.group(name, pivot=loc)
    m.add(cyl(r, w, 14, bevel=0.05), "tire", loc, rot=(0, 90, 0), group=name)
    m.add(cyl(r * 0.52, w + 0.04, 10), hub, loc, rot=(0, 90, 0), group=name)
    m.add(cyl(r * 0.18, w + 0.08, 6), "darkmetal", loc, rot=(0, 90, 0), group=name)


def four_wheels(m, x, yf, yr, r, w, hub="metal"):
    wheel(m, "wheel_fl", (-x, yf, r), r, w, hub)
    wheel(m, "wheel_fr", (x, yf, r), r, w, hub)
    wheel(m, "wheel_rl", (-x, yr, r), r, w, hub)
    wheel(m, "wheel_rr", (x, yr, r), r, w, hub)


def headlights(m, x, y, z, r=0.14):
    m.mirror_x(lambda: cyl(r, 0.08, 10), "lamp", (x, y, z), rot=(90, 0, 0))


def taillights(m, x, y, z, size=(0.22, 0.06, 0.14)):
    m.mirror_x(lambda: box(*size, 0.02), "tail", (x, y, z))


# ---------------------------------------------------------------------------

def ambulance():
    m = Model("veh_ambulance", "vehicles",
              "Player vehicle: chunky box ambulance with light bar, spinning wheels and flashing sirens.",
              role="player")
    # rear patient box + cab + stubby hood
    m.add(box(2.1, 2.3, 1.85, 0.2, 2), "white", (0, 0.55, 1.42))
    m.add(box(1.96, 1.35, 1.3, 0.22, 2), "white", (0, -1.15, 1.17))
    m.add(box(1.9, 0.75, 0.72, 0.18, 2), "white", (0, -1.95, 0.86))
    # underbody + bumpers
    m.add(box(1.86, 3.9, 0.36, 0.1), "darkmetal", (0, -0.15, 0.52))
    m.add(box(2.02, 0.3, 0.3, 0.1, 2), "darkmetal", (0, -2.35, 0.6))
    m.add(box(2.1, 0.3, 0.3, 0.1, 2), "darkmetal", (0, 1.75, 0.6))
    # glass
    m.add(box(1.68, 0.12, 0.56, 0.06), "glass", (0, -1.83, 1.46), rot=(-14, 0, 0))
    m.add(box(1.99, 0.95, 0.46, 0.08), "glass", (0, -1.18, 1.5))
    m.add(box(1.1, 0.06, 0.55, 0.05), "glass", (0, 1.71, 1.75))
    m.add(box(0.04, 0.06, 1.2), "darkmetal", (0, 1.72, 1.35))  # rear door split
    # red livery stripe + crosses
    m.add(box(2.14, 2.34, 0.24, 0.02), "red", (0, 0.55, 1.02))
    m.add(box(2.0, 1.4, 0.2, 0.02), "red", (0, -1.15, 0.97))
    m.add(box(1.94, 0.79, 0.2, 0.02), "red", (0, -1.95, 0.97))
    for sx in (-1, 1):
        red_cross(m, (sx * 1.06, 0.55, 1.62), 0.72, axis="x", thick=0.04)
    red_cross(m, (0, 0.55, 2.355), 1.0, axis="z", thick=0.04)
    red_cross(m, (0, 1.705, 1.02), 0.0 + 0.3, axis="y")
    # lights
    headlights(m, 0.62, -2.33, 0.95)
    taillights(m, 0.8, 1.7, 1.25)
    m.mirror_x(lambda: box(0.12, 0.22, 0.16, 0.04), "white", (1.06, -1.7, 1.48))  # mirrors
    # light bar
    m.add(box(1.4, 0.4, 0.14, 0.05), "darkmetal", (0, -1.15, 1.88))
    for name, x, col in (("siren_l", -0.36, "siren_red"), ("siren_r", 0.36, "siren_blue")):
        m.group(name, pivot=(x, -1.15, 2.02))
        m.add(dome(0.23, cut=0.0, u=12, v=8), col, (x, -1.15, 1.95), scale=(1.4, 0.8, 1.0), group=name)
    four_wheels(m, 0.93, -1.45, 0.95, 0.46, 0.4)
    return m


def moto_medic():
    m = Model("veh_moto_medic", "vehicles",
              "Unlockable: nimble paramedic scooter with a med-box – faster turning, lower top speed.",
              role="player_alt")
    m.add(box(0.5, 1.5, 0.3, 0.12, 2), "white", (0, 0.05, 0.62))              # deck
    m.add(box(0.55, 0.45, 0.9, 0.18, 2), "white", (0, -0.6, 0.95), rot=(-18, 0, 0))  # leg shield
    m.add(box(0.46, 0.7, 0.18, 0.08, 2), "navy", (0, 0.35, 1.05))              # seat
    m.add(box(0.44, 0.9, 0.35, 0.12, 2), "white", (0, 0.4, 0.8))               # rear cowl
    m.add(box(0.72, 0.6, 0.55, 0.1, 2), "red", (0, 0.72, 1.4))                 # med box
    red_cross(m, (0, 1.025, 1.4), 0.34, "white", axis="y")
    red_cross(m, (0, 0.72, 1.68), 0.34, "white", axis="z")
    m.add(cyl(0.04, 0.6, 6), "darkmetal", (0, -0.78, 0.8), rot=(-18, 0, 0))    # fork
    m.add(box(0.8, 0.07, 0.07, 0.03), "darkmetal", (0, -0.85, 1.38))           # bars
    m.mirror_x(lambda: cyl(0.05, 0.14, 8), "tire", (0.44, -0.85, 1.38), rot=(0, 90, 0))
    m.add(cyl(0.14, 0.08, 10), "lamp", (0, -0.82, 1.25), rot=(72, 0, 0))
    m.group("siren_l", pivot=(0, 0.72, 1.75))
    m.add(dome(0.12, cut=0.0, u=10, v=6), "siren_red", (0, 0.72, 1.7), group="siren_l")
    wheel(m, "wheel_f", (0, -0.8, 0.36), 0.36, 0.26)
    wheel(m, "wheel_r", (0, 0.7, 0.36), 0.36, 0.3)
    return m


def air_ambulance():
    m = Model("veh_air_ambulance", "vehicles",
              "Hospital helipad decoration / late-game unlock: bubbly medevac helicopter.",
              role="decor")
    m.add(ball(1.05, 16, 10), "white", (0, -0.2, 1.35), scale=(1.0, 1.35, 0.95))
    m.add(dome(0.9, cut=0.0, u=14, v=8), "glass", (0, -0.75, 1.45), rot=(-70, 0, 0), scale=(1, 1, 0.9))
    m.add(box(2.12, 1.2, 0.24, 0.02), "red", (0, 0.0, 1.2), scale=(0.98, 1, 1))
    m.add(cyl(0.3, 2.6, 10, r2=0.14), "white", (0, 2.3, 1.6), rot=(-86, 0, 0))  # tail boom
    m.add(box(0.1, 0.7, 0.9, 0.05), "red", (0, 3.55, 1.95), rot=(20, 0, 0))    # fin
    for sx in (-1, 1):
        red_cross(m, (sx * 1.03, 0.05, 1.55), 0.6, axis="x", thick=0.04)
        m.add(box(0.1, 2.4, 0.1, 0.04), "darkmetal", (sx * 0.75, -0.1, 0.12))   # skids
        m.add(box(0.07, 0.07, 0.5), "darkmetal", (sx * 0.72, -0.7, 0.35), rot=(0, sx * 15, 0))
        m.add(box(0.07, 0.07, 0.5), "darkmetal", (sx * 0.72, 0.5, 0.35), rot=(0, sx * 15, 0))
    m.add(cyl(0.2, 0.35, 8), "darkmetal", (0, -0.1, 2.45))
    m.group("rotor", pivot=(0, -0.1, 2.66))
    m.add(cyl(0.18, 0.12, 8), "red", (0, -0.1, 2.66), group="rotor")
    for rz in (0, 90):
        m.add(box(4.6, 0.26, 0.05, 0.02), "darkmetal", (0, -0.1, 2.7), rot=(0, 0, rz), group="rotor")
    m.group("tail_rotor", pivot=(0.12, 3.6, 1.95))
    m.add(box(0.05, 0.9, 0.12), "darkmetal", (0.12, 3.6, 1.95), group="tail_rotor")
    m.group("siren_l", pivot=(0, 0.3, 2.3))
    m.add(ball(0.12, 8, 6), "siren_red", (0, 0.5, 2.28), group="siren_l")
    return m


def _compact(name, desc, body, roof=None, trim="white"):
    m = Model(name, "vehicles", desc, role="traffic")
    m.add(box(1.75, 2.9, 0.75, 0.28, 2), body, (0, 0, 0.78))
    m.add(box(1.52, 1.55, 0.7, 0.18, 2), roof or body, (0, 0.2, 1.42))
    # individual panes set into the flat parts of the cabin (no wrap-around band)
    for sx in (-1, 1):
        for y in (-0.1, 0.5):
            m.add(box(0.04, 0.5, 0.3, 0.05), "glass", (sx * 0.76, y, 1.44))
    m.add(box(1.08, 0.04, 0.3, 0.05), "glass", (0, -0.575, 1.44))   # windscreen
    m.add(box(0.95, 0.04, 0.26, 0.05), "glass", (0, 0.975, 1.46))   # rear window
    m.add(box(1.8, 0.2, 0.2, 0.08), trim, (0, -1.45, 0.58))
    m.add(box(1.8, 0.2, 0.2, 0.08), trim, (0, 1.45, 0.58))
    headlights(m, 0.55, -1.46, 0.85, 0.13)
    taillights(m, 0.6, 1.46, 0.9, (0.26, 0.06, 0.12))
    four_wheels(m, 0.8, -0.9, 0.95, 0.4, 0.34)
    return m


def car_bubble_pink():
    return _compact("veh_car_pink", "Traffic: rounded bubble hatchback (pink).", "pink", "white")


def car_bubble_blue():
    return _compact("veh_car_blue", "Traffic: rounded bubble hatchback (sky blue).", "sky", "white")


def car_taxi():
    m = _compact("veh_taxi", "Traffic / rival: yellow cab stealing your fares.", "yellow", trim="darkmetal")
    m.add(box(0.55, 0.3, 0.26, 0.06), "white", (0, 0.2, 1.9))
    m.add(box(0.5, 0.32, 0.1), "tire", (0, 0.2, 1.9))
    for sx in (-1, 1):  # checker strip down each flank
        for i in range(8):
            for row in range(2):
                col = "tire" if (i + row) % 2 else "white"
                m.add(box(0.04, 0.2, 0.1), col, (sx * 0.875, -0.7 + i * 0.2, 0.9 + row * 0.1))
    return m


def pickup():
    """Chunky pickup, a nod to the racing reference shot."""
    m = Model("veh_pickup", "vehicles", "Traffic: stubby pickup truck with a roll bar.", role="traffic")
    m.add(box(1.9, 3.6, 0.7, 0.2, 2), "orange", (0, 0, 0.95))
    m.add(box(1.7, 1.2, 0.8, 0.22, 2), "orange", (0, -0.2, 1.65))
    m.mirror_x(lambda: box(0.04, 0.62, 0.32, 0.05), "glass", (0.85, -0.22, 1.68))
    m.add(box(1.2, 0.04, 0.32, 0.05), "glass", (0, -0.8, 1.68))   # windscreen
    m.add(box(1.0, 0.04, 0.26, 0.05), "glass", (0, 0.4, 1.7))     # rear window
    m.add(box(1.5, 1.45, 0.08), "darkmetal", (0, 1.0, 1.28))  # bed floor
    m.mirror_x(lambda: box(0.08, 0.08, 0.5), "white", (0.6, 0.35, 1.55))
    m.add(box(1.28, 0.08, 0.08), "white", (0, 0.35, 1.8))
    m.add(box(1.96, 0.25, 0.28, 0.1), "white", (0, -1.85, 0.72))
    m.add(box(1.96, 0.25, 0.28, 0.1), "white", (0, 1.85, 0.72))
    m.add(box(0.8, 0.5, 0.25, 0.08), "darkmetal", (0.3, 1.0, 1.45))  # crate
    headlights(m, 0.6, -1.82, 1.0, 0.14)
    taillights(m, 0.75, 1.82, 1.05)
    four_wheels(m, 0.9, -1.15, 1.2, 0.48, 0.42, hub="white")
    return m


def bus():
    m = Model("veh_bus", "vehicles", "Traffic: big slow city bus – a moving wall to weave around.", role="traffic")
    m.add(box(2.3, 6.4, 2.1, 0.35, 2), "purple", (0, 0, 1.55))
    for sx in (-1, 1):  # row of separate side windows
        for i in range(6):
            m.add(box(0.04, 0.72, 0.55, 0.06), "glass", (sx * 1.15, -2.25 + i * 0.9, 1.9))
    m.mirror_x(lambda: box(0.9, 0.04, 0.75, 0.08), "glass", (0.5, -3.2, 1.75))   # split windscreen
    m.add(box(1.4, 0.04, 0.5, 0.06), "glass", (0, 3.2, 1.95))
    m.add(box(2.34, 6.44, 0.18), "yellow", (0, 0, 1.3))
    m.add(box(1.8, 0.4, 0.3, 0.08), "roof_purple", (0, -3.2, 2.72))  # route sign
    m.add(box(1.4, 0.05, 0.18), "lamp", (0, -3.41, 2.72))
    headlights(m, 0.75, -3.2, 0.95, 0.15)
    taillights(m, 0.85, 3.2, 1.0)
    four_wheels(m, 1.0, -2.1, 2.1, 0.5, 0.4)
    return m


ALL = [ambulance, moto_medic, air_ambulance, car_bubble_pink, car_bubble_blue, car_taxi, pickup, bus]
