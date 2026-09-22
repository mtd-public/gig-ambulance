"""Street furniture and nature. The `*_at` helpers are reused by lots/diorama."""

import math

from kit import FACING, Model, at, ball, box, cone, cyl, dome, ico, prism, torus

H = 0.18  # pavement / lot surface height (road surface is z = 0)


def pine_at(m, x=0.0, y=0.0, z=0.0, s=1.0, twist=0):
    """Tiered faceted pine, after the racing reference: 3 stacked 7-sided cones,
    tapered orange trunk."""
    with at(m, x, y, z):
        m.add(cyl(0.3 * s, 1.1 * s, 7, r2=0.16 * s), "trunk", (0, 0, 0.55 * s))
        tiers = ((1.25, 0.55, 1.15, 1.35), (1.0, 0.38, 1.05, 2.15), (0.75, 0.0, 1.25, 2.95))
        for i, (r1, r2, h, zc) in enumerate(tiers):
            m.add(cyl(r1 * s, h * s, 7, r2=r2 * s), "pine" if i % 2 == 0 else "pine2",
                  (0, 0, zc * s), rot=(0, 0, twist + i * 17))


def round_tree_at(m, x=0.0, y=0.0, z=0.0, s=1.0):
    with at(m, x, y, z):
        m.add(cyl(0.2 * s, 1.3 * s, 7, r2=0.14 * s), "trunk", (0, 0, 0.65 * s))
        m.add(ico(0.95 * s, 1), "leaf", (0, 0, 1.9 * s))
        m.add(ico(0.6 * s, 1), "leaf2", (0.55 * s, -0.2 * s, 1.55 * s))
        m.add(ico(0.55 * s, 1), "leaf", (-0.45 * s, 0.35 * s, 2.35 * s))


def bush_at(m, x=0.0, y=0.0, z=0.0, s=1.0):
    with at(m, x, y, z):
        m.add(ico(0.45 * s, 1), "leaf2", (0, 0, 0.3 * s), scale=(1, 1, 0.8))
        m.add(ico(0.35 * s, 1), "leaf", (0.35 * s, -0.1 * s, 0.25 * s), scale=(1, 1, 0.8))
        m.add(ico(0.3 * s, 1), "leaf", (-0.32 * s, 0.1 * s, 0.22 * s), scale=(1, 1, 0.8))


def lamp_at(m, x=0.0, y=0.0, z=0.0, rot=0):
    """Green lamp post with a warm lantern (after the cozy-town reference)."""
    with at(m, x, y, z):
        m.add(cyl(0.18, 0.25, 8, r2=0.12), "trim_green", (0, 0, 0.12))
        m.add(cyl(0.06, 2.6, 8), "trim_green", (0, 0, 1.45))
        m.add(box(0.36, 0.36, 0.45, 0.06), "lamp", (0, 0, 2.95))
        m.add(cyl(0.3, 0.2, 4, r2=0.05), "trim_green", (0, 0, 3.28), rot=(0, 0, 45))
        m.add(box(0.3, 0.3, 0.08), "trim_green", (0, 0, 2.72))
        m.add(ball(0.06, 6, 4), "trim_green", (0, 0, 3.42))


def bench_at(m, x=0.0, y=0.0, z=0.0):
    with at(m, x, y, z):
        for i in range(3):
            m.add(box(1.6, 0.14, 0.07, 0.02), "wood", (0, -0.18 + i * 0.17, 0.45))
        for i in range(2):
            m.add(box(1.6, 0.06, 0.13, 0.02), "wood", (0, 0.24, 0.65 + i * 0.18), rot=(-12, 0, 0))
        m.mirror_x(lambda: box(0.08, 0.5, 0.45, 0.02), "trim_green", (0.7, 0.0, 0.225))


# ---------------------------------------------------------------------------

def tree_pine():
    m = Model("prop_tree_pine", "props", "Tiered low-poly pine (reference style). Scale 0.7-1.3 for variety.")
    pine_at(m)
    return m


def tree_round():
    m = Model("prop_tree_round", "props", "Puffy round tree.")
    round_tree_at(m)
    return m


def bush():
    m = Model("prop_bush", "props", "Clump of bush blobs for lot edges.")
    bush_at(m)
    return m


def lamp_post():
    m = Model("prop_lamp_post", "props", "Green street lamp with glowing lantern.")
    lamp_at(m)
    return m


def bench():
    m = Model("prop_bench", "props", "Park bench (smashable).", smashable=True)
    bench_at(m)
    return m


def traffic_light():
    m = Model("prop_traffic_light", "props", "Traffic signal on an overhanging arm; lights are separate nodes.")
    m.add(cyl(0.2, 0.2, 8), "darkmetal", (0, 0, 0.1))
    m.add(cyl(0.08, 3.6, 8), "darkmetal", (0, 0, 1.8))
    m.add(box(0.1, 1.8, 0.1), "darkmetal", (0, -0.85, 3.5))
    m.add(box(0.5, 0.45, 1.3, 0.12, 2), "navy", (0, -1.6, 3.0))
    for name, col, z in (("light_red", "siren_red", 3.4), ("light_amber", "beacon_yellow", 3.0),
                         ("light_green", "beacon_green", 2.6)):
        m.group(name, pivot=(0, -1.85, z))
        m.add(cyl(0.15, 0.08, 10), col, (0, -1.83, z), rot=(90, 0, 0), group=name)
        m.add(box(0.36, 0.2, 0.05), "navy", (0, -1.9, z + 0.18), rot=(-20, 0, 0))
    return m


def traffic_cone():
    m = Model("prop_cone", "props", "Traffic cone – bonk it for style points.", smashable=True)
    m.add(box(0.6, 0.6, 0.08, 0.03), "orange", (0, 0, 0.04))
    m.add(cyl(0.24, 0.8, 10, r2=0.05), "orange", (0, 0, 0.48))
    m.add(cyl(0.19, 0.16, 10, r2=0.145), "white", (0, 0, 0.5))
    return m


def hydrant():
    m = Model("prop_hydrant", "props", "Fire hydrant – knocking it over sprays a water geyser.", smashable=True)
    m.add(cyl(0.25, 0.1, 10), "red", (0, 0, 0.05))
    m.add(cyl(0.18, 0.6, 10), "red", (0, 0, 0.4))
    m.add(dome(0.2, 0.0, 10, 6), "red", (0, 0, 0.7))
    m.add(cyl(0.04, 0.1, 6), "yellow", (0, 0, 0.93))
    m.mirror_x(lambda: cyl(0.07, 0.14, 8), "yellow", (0.22, 0, 0.5), rot=(0, 90, 0))
    m.add(cyl(0.09, 0.12, 8), "yellow", (0, -0.2, 0.5), rot=(90, 0, 0))
    return m


def trash_bin():
    m = Model("prop_bin", "props", "Street bin (smashable – litter confetti!).", smashable=True)
    m.add(cyl(0.32, 0.85, 10, r2=0.36), "trim_green", (0, 0, 0.43))
    m.add(cyl(0.4, 0.1, 10), "frame", (0, 0, 0.9))
    m.add(dome(0.34, 0.0, 10, 6), "trim_green", (0, 0, 0.94), scale=(1, 1, 0.4))
    return m


def guard_rail():
    """Pill-shaped rail on a red/white curb, after the racing reference."""
    m = Model("prop_guard_rail", "props", "4 m rounded guard rail on a striped curb; tile along lot edges / tracks.")
    for i in range(8):
        m.add(box(0.5, 0.5, 0.2, 0.04), "curb_red" if i % 2 == 0 else "white", (-1.75 + i * 0.5, 0, 0.1))
    m.add(box(4.0, 0.4, 0.3, 0.1), "rail", (0, 0.05, 0.35))
    m.add(cyl(0.26, 4.0, 10), "rail", (0, 0.05, 0.75), rot=(0, 90, 0))
    m.mirror_x(lambda: ball(0.26, 10, 6), "rail", (2.0, 0.05, 0.75))
    return m


def fence():
    m = Model("prop_fence", "props", "4 m green railing (cozy-town style) for parks and terraces.")
    m.add(box(4.0, 0.14, 0.1, 0.03), "trim_green", (0, 0, 0.95))
    m.add(box(4.0, 0.1, 0.08), "trim_green", (0, 0, 0.3))
    for i in range(9):
        m.add(box(0.07, 0.07, 0.9), "trim_green", (-1.8 + i * 0.45, 0, 0.5))
    m.mirror_x(lambda: box(0.2, 0.2, 1.1, 0.05), "trim_green", (1.95, 0, 0.55))
    m.mirror_x(lambda: ball(0.12, 8, 6), "lamp", (1.95, 0, 1.2))
    return m


def ramp():
    m = Model("prop_ramp", "props", "Stunt ramp! Launches the ambulance for air-time bonus (drive toward -Z... er, its back).",
              gameplay="ramp")
    L, Hh, W = 3.6, 1.1, 3.0
    # wedge: low edge at -Y (front) rising to +Y
    m.add(prism([(-L / 2, 0), (L / 2, 0), (L / 2, Hh)], W), "white", (0, 0, 0), rot=FACING["x"])
    ang = math.degrees(math.atan2(Hh, L))
    for i in range(4):  # chevron stripes on the slope
        t = -L / 2 + 0.45 + i * 0.85
        m.add(box(W + 0.02, 0.42, 0.03), "orange", (0, t, (t + L / 2) / L * Hh + 0.01), rot=(ang, 0, 0))
    m.add(box(W, 0.2, Hh, 0.05), "orange", (0, L / 2 - 0.1, Hh / 2))
    return m


def barrier():
    m = Model("prop_barrier", "props", "Road-works barrier (smashable).", smashable=True)
    for z in (0.55, 0.95):
        for i in range(5):
            m.add(box(0.4, 0.1, 0.25), "red" if i % 2 == 0 else "white", (-0.8 + i * 0.4, 0, z))
    m.mirror_x(lambda: box(0.1, 0.6, 1.1, 0.03), "darkmetal", (0.95, 0, 0.55))
    m.mirror_x(lambda: ball(0.1, 8, 6), "beacon_yellow", (0.95, 0, 1.2))
    return m


ALL = [tree_pine, tree_round, bush, lamp_post, bench, traffic_light, traffic_cone, hydrant,
       trash_bin, guard_rail, fence, ramp, barrier]
