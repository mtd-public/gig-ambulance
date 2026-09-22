"""Floating pickups. Each icon hovers with its centre ~1.1 m up; the game spins
and bobs the whole node. Bright, emissive-accented, readable from the iso camera."""

from assets_characters import red_cross
from assets_props import pizza_slice_at
from kit import FACING, Model, ball, box, cone, cyl, dome, heart_pts, prism, star_pts, torus

Z = 1.1  # hover height of icon centre
BOLT = [(-0.05, 0.55), (0.3, 0.55), (0.1, 0.12), (0.32, 0.12), (-0.15, -0.6), (0.0, -0.08), (-0.22, -0.08)]


def _halo(m, col):
    """Soft ground ring so pickups read at a glance even under buildings' shade."""
    m.add(torus(0.75, 0.05, 20, 4), col, (0, 0, 0.05), scale=(1, 1, 0.4))


def turbo():
    m = Model("pu_turbo", "powerups", "Siren Rush: 4 s speed boost + traffic parts like the Red Sea.", effect="boost")
    m.add(cyl(0.55, 0.16, 20), "red", (0, 0, Z), rot=(90, 0, 0), smooth=False)
    m.add(torus(0.55, 0.06, 20, 5), "white", (0, 0, Z), rot=(90, 0, 0))
    m.add(prism(BOLT, 0.3), "beacon_yellow", (0, 0, Z), rot=FACING["y"])
    _halo(m, "beacon_yellow")
    return m


def repair():
    m = Model("pu_repair", "powerups", "Wrench: repairs 35% ambulance damage.", effect="repair")
    m.add(box(0.2, 0.14, 0.9, 0.06), "metal", (0, 0, Z - 0.15), rot=(0, 30, 0))
    m.add(cyl(0.24, 0.14, 12), "metal", (0.26, 0, Z + 0.3), rot=(90, 0, 0))
    m.add(box(0.14, 0.18, 0.22), "blue", (0.34, 0, Z + 0.46), rot=(0, 30, 0))  # jaw notch (coloured)
    m.add(box(0.24, 0.18, 0.3, 0.05), "blue", (-0.24, 0, Z - 0.52), rot=(0, 30, 0))  # grip
    _halo(m, "sign_green")
    return m


def time_bonus():
    m = Model("pu_time", "powerups", "Alarm clock: +10 s to the current fare's timer.", effect="time")
    m.add(cyl(0.45, 0.25, 20), "sky", (0, 0, Z), rot=(90, 0, 0), smooth=True)
    m.add(cyl(0.37, 0.27, 20), "white", (0, 0, Z), rot=(90, 0, 0))
    m.add(box(0.05, 0.3, 0.26), "eye", (0, 0, Z + 0.12))
    m.add(box(0.2, 0.3, 0.05), "eye", (0.09, 0, Z))
    m.mirror_x(lambda: dome(0.16, 0.0, 10, 5), "beacon_yellow", (0.3, 0, Z + 0.38), rot=(0, 35, 0))
    m.mirror_x(lambda: box(0.07, 0.07, 0.18), "darkmetal", (0.28, 0, Z - 0.48), rot=(0, 25, 0))
    _halo(m, "sky")
    return m


def magnet():
    m = Model("pu_magnet", "powerups", "Tip magnet: pulls coins in from 8 m for 8 s.", effect="magnet")
    m.add(torus(0.36, 0.14, 12, 8, arc=180), "red", (0, 0, Z - 0.1), rot=(-90, 0, 0), smooth=True)
    m.mirror_x(lambda: cyl(0.14, 0.3, 10), "red", (0.36, 0, Z + 0.05), smooth=True)
    m.mirror_x(lambda: cyl(0.14, 0.2, 10), "metal", (0.36, 0, Z + 0.3))
    _halo(m, "red")
    return m


def heart():
    m = Model("pu_heart", "powerups", "Heart: stabilises the patient (+patience, tip multiplier kept).", effect="stabilise")
    m.add(prism(heart_pts(1.1), 0.3), "pink", (0, 0, Z), rot=FACING["y"])
    red_cross(m, (0, 0, Z + 0.02), 0.3, "white", axis="y", thick=0.36)
    _halo(m, "pink")
    return m


def coin():
    m = Model("pu_coin", "powerups", "Tip coin: +$5. Chains along roads like breadcrumbs.", effect="coin")
    m.add(cyl(0.42, 0.12, 20), "gold", (0, 0, Z), rot=(90, 0, 0))
    m.add(torus(0.38, 0.04, 20, 4), "darkgold", (0, 0, Z), rot=(90, 0, 0))
    red_cross(m, (0, 0, Z), 0.36, "darkgold", axis="y", thick=0.18)
    return m


def star():
    m = Model("pu_star", "powerups", "Star: x2 tip multiplier for the next drop-off.", effect="multiplier")
    m.add(prism(star_pts(5, 0.6, 0.27), 0.3), "beacon_yellow", (0, 0, Z), rot=FACING["y"])
    _halo(m, "beacon_yellow")
    return m


def shield():
    m = Model("pu_shield", "powerups", "Bubble bumper: 6 s of crash immunity.", effect="shield")
    m.add(ball(0.6, 20, 12), "bubble", (0, 0, Z), smooth=True)
    red_cross(m, (0, 0, Z), 0.45, "white", axis="y", thick=0.12)
    _halo(m, "sky")
    return m


def _marker(name, desc, col, beam, icon):
    m = Model(name, "powerups", desc, effect="marker")
    m.add(torus(2.3, 0.14, 32, 5), col, (0, 0, 0.1), scale=(1, 1, 0.5))
    m.add(cyl(2.2, 4.0, 24, r2=1.9), beam, (0, 0, 2.0))
    m.group("icon", pivot=(0, 0, 3.4))
    icon(m)
    return m


def marker_pickup():
    def icon(m):
        m.add(cone(0.5, 0.8, 4), "beacon_green", (0, 0, 3.2), rot=(180, 0, 45), group="icon")
        m.add(box(0.35, 0.35, 0.5), "beacon_green", (0, 0, 3.85), rot=(0, 0, 45), group="icon")
    return _marker("marker_pickup", "Pickup zone: green beam + bobbing arrow. Stop inside to load.",
                   "beacon_green", "beam_green", icon)


def marker_dropoff():
    def icon(m):
        m.add(cyl(0.55, 0.15, 16), "white", (0, 0, 3.4), rot=(90, 0, 0), group="icon")
        red_cross(m, (0, 0, 3.4), 0.7, "sign_red", axis="y", thick=0.22, group="icon")
    return _marker("marker_dropoff", "Drop-off zone: red beam + cross. Stop inside to deliver.",
                   "beacon_red", "beam_red", icon)


def marker_pizza():
    def icon(m):
        pizza_slice_at(m, 0, 0, 2.75, 0.9, group="icon")
    return _marker("marker_pizza", "Pizza zone: orange beam + spinning slice. Roll through (no full stop needed).",
                   "beacon_orange", "beam_orange", icon)


ALL = [turbo, repair, time_bonus, magnet, heart, coin, star, shield, marker_pickup, marker_dropoff, marker_pizza]
