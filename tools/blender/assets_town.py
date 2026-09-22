"""Modular town: 8 m road tiles + 8 m building lots that snap to the same grid.

Heights: road surface z = 0, pavements / lots top out at z = H (0.18) so the
ambulance visibly *bumps up* when it cuts a corner across the kerb.
Road tiles: N = +Y (glTF -Z), E = +X, S = -Y, W = -X. Rotate in 90 deg steps.
Buildings face -Y (their street side) and include their own lot base.
"""

import math

from assets_characters import red_cross
from assets_props import H, bench_at, bush_at, lamp_at, pine_at, pizza_slice_at, round_tree_at
from kit import FACING, Model, arch_pts, at, ball, box, cone, cyl, dome, prism, torus

TILE = 16.0
HALF = TILE / 2
ROAD = 6.0          # half road width: 12 m = 4 lanes of 3 m
SIDE = HALF - ROAD  # pavement / shoulder width (2 m)
LANE = 3.0
BASE = 0.3          # slab thickness below z = 0
DIRS = {"N": (0, 1), "E": (1, 0), "S": (0, -1), "W": (-1, 0)}


def slab(m, mat_, x0, x1, y0, y1, top, bevel=0.0):
    m.add(box(x1 - x0, y1 - y0, top + BASE, bevel), mat_, ((x0 + x1) / 2, (y0 + y1) / 2, (top - BASE) / 2))


def paint(m, mat_, d, a0, a1, lat, width, z=0.01):
    """Road marking along direction d from `along` a0..a1 at lateral offset lat."""
    dx, dy = DIRS[d]
    px, py = -dy, dx
    a = (a0 + a1) / 2
    size = (width, a1 - a0) if dx == 0 else (a1 - a0, width)
    m.add(box(size[0], size[1], 0.02), mat_, (dx * a + px * lat, dy * a + py * lat, z))


def _markings(m, conns, crosswalk=False, junction_zebras=False):
    """4-lane markings: yellow edge lines, double white centre line, dashed lane
    dividers (period 4 m so they line up tile-to-tile), optional zebras."""
    e, w = ROAD - 0.3, 0.16
    for d in DIRS:
        if d in conns:
            for lat in (-e, e):
                paint(m, "roadline", d, ROAD, HALF, lat, w)
        else:
            dx, dy = DIRS[d]
            left, right = ("W", "E") if dx == 0 else ("S", "N")
            lo = -ROAD if left in conns else -e - w / 2
            hi = ROAD if right in conns else e + w / 2
            L, mid = hi - lo, (lo + hi) / 2
            size = (L, w) if dx == 0 else (w, L)
            m.add(box(size[0], size[1], 0.02), "roadline",
                  (dx * e + (mid if dx == 0 else 0), dy * e + (mid if dx != 0 else 0), 0.01))
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        xa, ya = ("E" if sx > 0 else "W"), ("N" if sy > 0 else "S")
        if xa in conns and ya in conns:
            m.add(box(ROAD - e + w / 2, w, 0.02), "roadline", (sx * (e + ROAD) / 2, sy * e, 0.01))
            m.add(box(w, ROAD - e + w / 2, 0.02), "roadline", (sx * e, sy * (e + ROAD) / 2, 0.01))
    straight = conns in ("NS", "EW")
    through = straight or len(conns) <= 2
    for d in conns:
        if junction_zebras:
            break
        a0 = 0.0 if through else ROAD
        for lat in (-0.18, 0.18):  # double centre line
            paint(m, "zebra", d, a0, HALF, lat, 0.12)
        centres = (2.0, 6.0) if straight else (6.0,) if through else (7.0,)
        for c in centres:
            if crosswalk and c == 2.0:
                continue
            for lat in (-LANE, LANE):
                paint(m, "zebra", d, c - 1.0, c + 1.0, lat, 0.14)
    if crosswalk:
        for i in range(13):
            m.add(box(0.5, 2.6, 0.02), "zebra", (-5.4 + i * 0.9, 0, 0.012))
    if junction_zebras:
        for d in conns:
            dx, dy = DIRS[d]
            for i in range(13):
                lat = -5.4 + i * 0.9
                size = (0.5, 1.6) if dx == 0 else (1.6, 0.5)
                m.add(box(size[0], size[1], 0.02), "zebra", (dx * 7.0 - dy * lat, dy * 7.0 + dx * lat, 0.012))


def road_tile(name, conns, desc, crosswalk=False, junction_zebras=False):
    """City street: 12 m carriageway, raised 2 m pavements on closed sides/corners."""
    m = Model(name, "streets", desc, tile=[1, 1], connections=conns, surface="street")
    m.add(box(TILE, TILE, BASE), "road", (0, 0, -BASE / 2))
    for sx in (-1, 1):
        for sy in (-1, 1):
            slab(m, "sidewalk", *sorted((sx * ROAD, sx * HALF)), *sorted((sy * ROAD, sy * HALF)), H, 0.05)
    for d, (dx, dy) in DIRS.items():
        if d in conns:
            continue
        if dx == 0:
            slab(m, "sidewalk", -ROAD, ROAD, *sorted((dy * ROAD, dy * HALF)), H, 0.05)
        else:
            slab(m, "sidewalk", *sorted((dx * ROAD, dx * HALF)), -ROAD, ROAD, H, 0.05)
    _markings(m, conns, crosswalk, junction_zebras)
    return m


def hwy_tile(name, conns, desc):
    """Highway: same 12 m carriageway but flush grass shoulders (no kerbs) so you
    can peel off onto the verge at full speed; reflector posts; rounded inner bends."""
    m = Model(name, "streets", desc, tile=[1, 1], connections=conns, surface="highway")
    m.add(box(TILE, TILE, BASE), "grass", (0, 0, -BASE / 2 - 0.01))
    m.add(box(2 * ROAD, 2 * ROAD, BASE), "road", (0, 0, -BASE / 2))
    for d in conns:
        dx, dy = DIRS[d]
        size = (2 * ROAD, SIDE) if dx == 0 else (SIDE, 2 * ROAD)
        m.add(box(size[0], size[1], BASE), "road", (dx * (ROAD + SIDE / 2), dy * (ROAD + SIDE / 2), -BASE / 2))
    # round the inside of a bend: fill the corner square with asphalt minus a quarter circle
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        xa, ya = ("E" if sx > 0 else "W"), ("N" if sy > 0 else "S")
        if len(conns) == 2 and xa in conns and ya in conns:
            # corner square minus a quarter circle centred on the tile corner
            n = 6
            pts = [(sx * ROAD, sy * ROAD), (sx * ROAD, sy * HALF)]
            for i in range(1, n):
                t = math.pi / 2 * (1 - i / n)
                pts.append((sx * (HALF - SIDE * math.sin(t)), sy * (HALF - SIDE * math.cos(t))))
            pts.append((sx * HALF, sy * ROAD))
            m.add(prism(pts, BASE), "road", (0, 0, -BASE / 2))
    _markings(m, conns)
    # reflector posts on the shoulders of open-ended arms
    for d in conns:
        dx, dy = DIRS[d]
        for lat in (-(ROAD + 1.0), ROAD + 1.0):
            for a in (ROAD + 1.0,):
                x, y = dx * a - dy * lat, dy * a + dx * lat
                m.add(cyl(0.07, 0.7, 6), "white", (x, y, 0.35))
                m.add(cyl(0.075, 0.12, 6), "curb_red", (x, y, 0.6))
    return m


def road_straight():
    return road_tile("road_straight", "NS", "4-lane street, N-S.")


def road_crosswalk():
    return road_tile("road_crosswalk", "NS", "4-lane street with zebra crossing.", crosswalk=True)


def road_corner():
    return road_tile("road_corner", "EN", "90 deg street corner, N-E.")


def road_t():
    return road_tile("road_t", "ENW", "T-junction, open N/E/W.")


def road_cross():
    return road_tile("road_cross", "ENSW", "Four-way crossroads with zebra crossings.", junction_zebras=True)


def road_end():
    return road_tile("road_end", "N", "Dead end, open to the N.")


def roundabout():
    """Double-lane roundabout (12 m arms, 2 x 3 m ring lanes) around a drivable grassy
    mound with flowers — hop it for air. Right-hand traffic circulates anticlockwise."""
    conns = "ENSW"
    m = Model("road_roundabout", "streets", "Double-lane roundabout with a hoppable grass island.",
              tile=[1, 1], connections=conns, surface="street", island_r=2.45)
    m.add(box(TILE, TILE, BASE), "road", (0, 0, -BASE / 2))
    for sx in (-1, 1):
        for sy in (-1, 1):
            slab(m, "sidewalk", *sorted((sx * ROAD, sx * HALF)), *sorted((sy * ROAD, sy * HALF)), H, 0.05)
    # island: kerb ring + grass disc + low mound + flowers
    m.add(cyl(2.45, 0.25, 32), "curb", (0, 0, 0.125))
    m.add(cyl(2.25, 0.3, 32), "grass", (0, 0, 0.15))
    m.add(dome(2.1, 0.0, 24, 8), "grass2", (0, 0, 0.3), scale=(1, 1, 0.35), smooth=True)
    for i in range(10):
        a = 2 * math.pi * i / 10
        m.add(ball(0.13, 8, 6), "pink" if i % 2 else "yellow", (1.75 * math.cos(a), 1.75 * math.sin(a), 0.42))
    # ring markings: dashed lane divider at r = 5.4, solid line hugging the island
    n = 40
    for i in range(n):
        if i % 2:
            continue
        a = 2 * math.pi * (i + 0.5) / n
        m.add(box(0.14, 2 * math.pi * 5.4 / n * 0.95, 0.02), "zebra", (5.4 * math.cos(a), 5.4 * math.sin(a), 0.01),
              rot=(0, 0, math.degrees(a)))
    m.add(torus(2.75, 0.07, 40, 3), "roadline", (0, 0, 0.0), scale=(1, 1, 0.2))
    # give-way (yield) dashes across the entry lanes of each arm (right-hand traffic)
    for d, (dx, dy) in DIRS.items():
        for i in range(5):
            lat = -0.6 - i * 1.2  # right-hand side of an arriving car
            m.add(box(0.7 if dx == 0 else 0.25, 0.25 if dx == 0 else 0.7, 0.02), "zebra",
                  (dx * 7.2 - dy * lat, dy * 7.2 + dx * lat, 0.012))
    # edge lines on the arm mouths
    e, w = ROAD - 0.3, 0.16
    for d in conns:
        for lat in (-e, e):
            paint(m, "roadline", d, ROAD, HALF, lat, w)
    return m


def hwy_straight():
    return hwy_tile("hwy_straight", "NS", "Highway straight: grass shoulders, no kerbs – leave the road anywhere.")


def hwy_corner():
    return hwy_tile("hwy_corner", "EN", "Highway bend N-E with a rounded inside corner.")


# ---------------------------------------------------------------------------
# Lots
# ---------------------------------------------------------------------------

def lot_base(m, tiles=1, mat_="grass", path=True, path_w=1.6, front=-1.5):
    """Lot slab; `front` = y of the building's street face (path runs to it)."""
    w = TILE * tiles
    slab(m, mat_, -w / 2, w / 2, -HALF, HALF, H, 0.06)
    if path:
        L = front + HALF
        m.add(box(path_w, L, 0.03), "sidewalk", (0, -HALF + L / 2, H + 0.005))


def arch_window(m, x, y, z, w=0.8, h=1.2, axis="y", glass="window", frame="frame", sill=True):
    """Arched window centred on a wall plane at (x, y) (axis y) or (x, y) (axis x)."""
    rot = FACING[axis]
    m.add(prism(arch_pts(w + 0.2, h + 0.12), 0.16), frame, (x, y, z - 0.06), rot=rot)
    m.add(prism(arch_pts(w, h), 0.24), glass, (x, y, z), rot=rot)
    if sill:
        size = (w + 0.35, 0.3, 0.1) if axis == "y" else (0.3, w + 0.35, 0.1)
        m.add(box(*size, 0.03), "trim_green", (x, y, z - 0.08))


def door(m, x, y, z=H, w=0.95, h=1.7, col="orange", axis="y"):
    rot = FACING[axis]
    m.add(prism(arch_pts(w + 0.24, h + 0.12), 0.16), "frame", (x, y, z), rot=rot)
    m.add(prism(arch_pts(w, h), 0.22), col, (x, y, z), rot=rot)
    knob = (x + w * 0.3, y - 0.13, z + h * 0.45) if axis == "y" else (x - 0.13, y + w * 0.3, z + h * 0.45)
    m.add(ball(0.05, 8, 6), "gold", knob)


def gable_roof(m, cx, cy, z, w, d, rise, roof, wall, ov=0.35, t=0.26):
    """Two chunky slabs meeting at a ridge along Y (gable faces the street)."""
    half = w / 2
    a = math.atan2(rise, half)
    s = math.hypot(half, rise) + ov
    for sx in (-1, 1):
        mx = sx * (s / 2 * math.cos(a) + t / 2 * math.sin(a))
        mz = z + rise - s / 2 * math.sin(a) + t / 2 * math.cos(a)
        m.add(box(s, d + 2 * ov * 0.6, t, 0.06), roof, (cx + mx, cy, mz), rot=(0, sx * math.degrees(a), 0))
    m.add(cyl(0.2, d + 2 * ov * 0.6 + 0.1, 8), roof, (cx, cy, z + rise + t * 0.7), rot=(90, 0, 0))
    m.add(prism([(-half, 0), (half, 0), (0, rise)], d), wall, (cx, cy, z), rot=FACING["y"])


def cottage(name, desc, wall, roof, door_col, chimney=True):
    m = Model(name, "buildings", desc, tile=[1, 1], pickup_spot=[0, -3.2])
    lot_base(m)
    W, D, WH, cy = 4.6, 4.0, 2.8, 0.5
    fy = cy - D / 2
    m.add(box(W, D, WH, 0.1, 2), wall, (0, cy, H + WH / 2))
    m.add(box(W + 0.12, D + 0.12, 0.35, 0.05), "frame", (0, cy, H + 0.17))  # plinth
    gable_roof(m, 0, cy, H + WH, W, D, 1.9, roof, wall)
    door(m, 0, fy, col=door_col)
    for x in (-1.45, 1.45):
        arch_window(m, x, fy, H + 1.0, 0.75, 1.15)
    arch_window(m, W / 2, cy, H + 1.0, 0.75, 1.15, axis="x")
    arch_window(m, -W / 2, cy, H + 1.0, 0.75, 1.15, axis="x")
    m.add(cyl(0.42, 0.24, 14), "frame", (0, fy, H + WH + 0.8), rot=(90, 0, 0))  # round attic window
    m.add(cyl(0.32, 0.3, 14), "window", (0, fy, H + WH + 0.8), rot=(90, 0, 0))
    if chimney:
        m.add(box(0.6, 0.6, 1.3, 0.06), "wall_purple", (1.3, cy + 0.8, H + WH + 1.5))
        m.add(box(0.75, 0.75, 0.18, 0.04), "frame", (1.3, cy + 0.8, H + WH + 2.2))
    bush_at(m, -2.8, -2.2, H, 0.9)
    bush_at(m, 2.9, -1.6, H, 0.8)
    pine_at(m, 3.0, 2.8, H, 0.7, 10)
    for x in (-2.2, 2.2):  # low picket at the front
        m.add(box(2.6, 0.12, 0.5, 0.04), "trim_green", (x, -HALF + 0.4, H + 0.25))
    return m


def house_lilac():
    return cottage("bld_house_lilac", "Pickup spot: lilac cottage with a purple roof.", "wall_lav", "roof_purple", "orange")


def house_peach():
    return cottage("bld_house_peach", "Pickup spot: peach cottage with a green roof.", "wall_peach", "roof_green", "roof_purple")


def apartment():
    m = Model("bld_apartment", "buildings", "Pickup spot: 3-storey apartment block with balconies.",
              tile=[1, 1], pickup_spot=[0, -3.2])
    lot_base(m, path_w=2.4, front=-2.0)
    W, D, FH, N, cy = 6.2, 5.2, 2.7, 3, 0.6
    fy = cy - D / 2
    m.add(box(W, D, FH * N, 0.12, 2), "wall_purple", (0, cy, H + FH * N / 2))
    for f in range(1, N):
        m.add(box(W + 0.14, D + 0.14, 0.2, 0.05), "wall_lav", (0, cy, H + f * FH))
    # parapet + roof bits
    m.add(box(W + 0.3, D + 0.3, 0.45, 0.1), "roof_purple", (0, cy, H + FH * N + 0.2))
    m.add(box(W - 0.4, D - 0.4, 0.2), "wall_lav", (0, cy, H + FH * N + 0.3))
    m.add(cyl(0.7, 1.2, 12), "trim_green", (1.6, cy + 0.8, H + FH * N + 1.1))
    m.add(dome(0.7, 0.0, 12, 6), "trim_green", (1.6, cy + 0.8, H + FH * N + 1.7), scale=(1, 1, 0.5))
    for f in range(N):
        z = H + f * FH + 0.75
        for x in (-2.0, 0.0, 2.0):
            if f == 0 and x == 0.0:
                continue
            arch_window(m, x, fy, z, 0.8, 1.3)
        for y in (cy - 1.2, cy + 1.2):
            arch_window(m, W / 2, y, z, 0.8, 1.3, axis="x")
            arch_window(m, -W / 2, y, z, 0.8, 1.3, axis="x")
        if f > 0:  # balcony under the middle window
            m.add(box(1.8, 0.8, 0.14, 0.04), "wall_lav", (0, fy - 0.4, z - 0.12))
            m.add(box(1.8, 0.07, 0.07), "trim_green", (0, fy - 0.78, z + 0.55))
            for i in range(7):
                m.add(box(0.05, 0.05, 0.6), "trim_green", (-0.85 + i * 0.283, fy - 0.78, z + 0.24))
    door(m, 0, fy, w=1.1, h=1.9, col="orange")
    m.add(box(1.8, 0.9, 0.12, 0.04), "roof_purple", (0, fy - 0.45, H + 2.25))  # door canopy
    for x in (-3.2, 3.2):
        lamp_at(m, x, -3.3, H)
    bush_at(m, -2.2, -3.2, H, 0.7)
    bush_at(m, 2.2, -3.2, H, 0.7)
    return m


def cafe():
    m = Model("bld_cafe", "buildings", "Pickup spot: corner café with striped awning and giant coffee-cup sign.",
              tile=[1, 1], pickup_spot=[0, -3.2])
    lot_base(m, path=False)
    m.add(box(8.0, HALF - 1.4, 0.03), "plaza", (0, -HALF + (HALF - 1.4) / 2, H + 0.005))
    W, D, WH, cy = 5.6, 4.4, 3.3, 0.8
    fy = cy - D / 2
    m.add(box(W, D, WH, 0.1, 2), "wall_pink", (0, cy, H + WH / 2))
    m.add(box(W + 0.3, D + 0.3, 0.4, 0.1), "roof_purple", (0, cy, H + WH + 0.1))
    for x in (-1.7, 1.7):
        arch_window(m, x, fy, H + 0.7, 1.4, 1.8)
    door(m, 0, fy, col="trim_green")
    # awning: alternating stripes, tilted out over the pavement
    n = 9
    for i in range(n):
        x = -W / 2 + (i + 0.5) * W / n
        m.add(box(W / n, 1.3, 0.08), "pink" if i % 2 == 0 else "white", (x, fy - 0.55, H + 2.75), rot=(22, 0, 0))
    for i in range(n):  # scalloped edge
        x = -W / 2 + (i + 0.5) * W / n
        m.add(dome(W / n / 2, 0.0, 8, 4), "pink" if i % 2 == 0 else "white", (x, fy - 1.15, H + 2.52),
              rot=(180, 0, 0), scale=(1, 0.3, 0.8))
    # coffee cup sign on the roof
    m.add(cyl(0.75, 1.2, 16, r2=0.9), "white", (0, cy, H + WH + 0.9), smooth=True)
    m.add(cyl(0.82, 0.06, 16), "brown", (0, cy, H + WH + 1.48))
    m.add(torus(0.36, 0.1, 14, 6), "white", (0.85, cy, H + WH + 0.95), rot=(90, 0, 0), smooth=True)
    m.add(cyl(0.78, 0.2, 16), "pink", (0, cy, H + WH + 0.75))
    for i, (dx, dz) in enumerate(((-0.25, 1.9), (0.1, 2.2), (0.35, 1.95))):  # steam puffs
        m.add(ball(0.18 - i * 0.02, 10, 6), "white", (dx, cy, H + WH + dz), smooth=True)
    # outdoor table
    with at(m, 2.6, -3.0, H):
        m.add(cyl(0.45, 0.06, 12), "white", (0, 0, 0.75))
        m.add(cyl(0.05, 0.75, 6), "darkmetal", (0, 0, 0.37))
        m.add(cyl(0.04, 1.9, 6), "darkmetal", (0, 0, 1.2))
        m.add(cone(1.1, 0.5, 8), "pink", (0, 0, 2.2))
        m.mirror_x(lambda: box(0.35, 0.35, 0.45, 0.05), "trim_green", (0.7, 0, 0.23))
    return m


def pharmacy():
    m = Model("bld_pharmacy", "buildings", "Drop-off (meds runs) & pickup: pharmacy with glowing green cross.",
              tile=[1, 1], pickup_spot=[0, -3.2], dropoff=True)
    lot_base(m, path_w=2.2, front=-1.6)
    W, D, WH, cy = 5.4, 4.6, 3.6, 0.7
    fy = cy - D / 2
    m.add(box(W, D, WH, 0.1, 2), "wall_mint", (0, cy, H + WH / 2))
    m.add(box(W + 0.35, D + 0.35, 0.5, 0.1), "trim_green", (0, cy, H + WH + 0.1))
    # mansard-ish roof
    m.add(box(W - 0.2, D - 0.2, 1.0, 0.35, 2), "roof_green", (0, cy, H + WH + 0.7))
    m.add(box(W - 1.0, 0.4, 0.8, 0.1), "white", (0, fy - 0.1, H + WH + 0.4))  # sign board
    red_cross(m, (0, fy - 0.32, H + WH + 0.4), 0.55, "sign_green", axis="y", thick=0.08)
    m.add(box(3.0, 0.2, 1.6, 0.06), "frame", (-0.9, fy, H + 1.4))  # shop window
    m.add(box(2.8, 0.26, 1.4, 0.04), "window", (-0.9, fy, H + 1.4))
    door(m, 1.6, fy, col="white")
    # projecting cross sign (visible from both directions of travel)
    m.add(box(0.1, 1.0, 0.1), "darkmetal", (W / 2 - 0.3, fy - 0.5, H + 2.9))
    m.add(box(0.3, 0.9, 0.9, 0.08), "white", (W / 2 - 0.3, fy - 1.0, H + 2.4))
    red_cross(m, (W / 2 - 0.3, fy - 1.0, H + 2.4), 0.7, "sign_green", axis="x", thick=0.4)
    bush_at(m, -3.0, -3.2, H, 0.8)
    lamp_at(m, 3.3, -3.3, H)
    return m


def pizzeria():
    m = Model("bld_pizzeria", "buildings",
              "Pizza side-gig hub: grab up to 3 hot pizzas here, even mid-patient-run.",
              tile=[1, 1], pizza_spot=[0, -3.2])
    lot_base(m, path=False)
    W, D, WH, cy = 5.8, 4.6, 3.4, 0.8
    fy = cy - D / 2
    m.add(box(8.5, HALF + fy, 0.03), "plaza", (0, -HALF + (HALF + fy) / 2, H + 0.005))  # terrace
    m.add(box(W, D, WH, 0.1, 2), "wall_cream", (0, cy, H + WH / 2))
    m.add(box(W + 0.3, D + 0.3, 0.45, 0.1), "roof_red", (0, cy, H + WH + 0.12))
    m.add(box(W + 0.14, D + 0.14, 0.5, 0.05), "wall_tomato", (0, cy, H + 0.25))  # tiled skirting
    for x in (-1.8, 1.8):
        arch_window(m, x, fy, H + 0.7, 1.5, 1.8)
    door(m, 0, fy, col="trim_green")
    # tricolore awning
    n = 9
    cols = ("trim_green", "white", "red")
    for i in range(n):
        x = -W / 2 + (i + 0.5) * W / n
        m.add(box(W / n, 1.3, 0.08), cols[i % 3], (x, fy - 0.55, H + 2.8), rot=(22, 0, 0))
        m.add(dome(W / n / 2, 0.0, 8, 4), cols[i % 3], (x, fy - 1.15, H + 2.57), rot=(180, 0, 0),
              scale=(1, 0.3, 0.8))
    # brick oven chimney + giant slice sign on the roof
    m.add(cyl(0.45, 1.4, 10), "wall_tomato", (1.8, cy + 1.2, H + WH + 0.9))
    m.add(cyl(0.55, 0.2, 10), "darkbrown", (1.8, cy + 1.2, H + WH + 1.65))
    m.add(box(0.12, 0.12, 0.8), "darkmetal", (-0.6, cy, H + WH + 0.6))
    m.add(box(0.12, 0.12, 0.8), "darkmetal", (0.6, cy, H + WH + 0.6))
    pizza_slice_at(m, 0, cy - 0.2, H + WH + 0.7, 1.6)
    # outdoor table under a striped parasol
    with at(m, 2.9, -4.2, H):
        m.add(cyl(0.5, 0.06, 12), "white", (0, 0, 0.75))
        m.add(cyl(0.05, 0.75, 6), "darkmetal", (0, 0, 0.37))
        m.add(cyl(0.04, 1.9, 6), "darkmetal", (0, 0, 1.2))
        m.add(cone(1.1, 0.5, 8), "red", (0, 0, 2.2))
        m.mirror_x(lambda: box(0.35, 0.35, 0.45, 0.05), "trim_green", (0.75, 0, 0.23))
    bush_at(m, -3.4, -2.2, H, 0.8)
    lamp_at(m, -3.6, -6.5, H)
    return m


def office():
    m = Model("bld_office", "buildings", "Pickup spot / landmark: glassy office tower.", tile=[1, 1],
              pickup_spot=[0, -3.2])
    lot_base(m, path_w=4.0, front=-2.1)
    W, D, FH, N, cy = 5.4, 5.4, 2.4, 5, 0.6
    fy = cy - D / 2
    m.add(box(W, D, FH * N, 0.12, 2), "wall_lav", (0, cy, H + FH * N / 2))
    for f in range(N):
        z = H + f * FH + 1.3
        if f > 0:
            m.add(box(W - 0.6, 0.12, 1.2, 0.04), "glass", (0, fy, z))
            m.add(box(0.12, D - 0.6, 1.2, 0.04), "glass", (W / 2, cy, z))
            m.add(box(0.12, D - 0.6, 1.2, 0.04), "glass", (-W / 2, cy, z))
        m.add(box(W + 0.1, D + 0.1, 0.14), "wall_purple", (0, cy, H + f * FH))
    m.add(box(3.6, 0.2, 1.9, 0.05), "glass", (0, fy, H + 1.0))  # lobby
    m.add(box(4.2, 1.2, 0.18, 0.05), "roof_purple", (0, fy - 0.5, H + 2.15))
    m.add(box(W + 0.3, D + 0.3, 0.6, 0.12), "roof_purple", (0, cy, H + FH * N + 0.25))
    m.add(box(2.0, 2.0, 1.0, 0.1), "wall_purple", (-1.0, cy + 0.8, H + FH * N + 1.0))
    m.add(cyl(0.06, 3.0, 6), "darkmetal", (1.5, cy + 1.2, H + FH * N + 2.0))
    m.add(ball(0.16, 8, 6), "siren_red", (1.5, cy + 1.2, H + FH * N + 3.55))
    for x in (-2.8, 2.8):
        round_tree_at(m, x, -3.1, H, 0.6)
    return m


def hospital():
    m = Model("bld_hospital", "buildings",
              "Main drop-off: two-tile hospital with ER canopy, big red-cross sign and rooftop helipad.",
              tile=[2, 1], dropoff=True, dropoff_spot=[0, -3.4])
    lot_base(m, tiles=2, mat_="grass", path=False)
    m.add(box(9.0, HALF - 1.0, 0.03), "sidewalk", (0, -(HALF + 1.0) / 2, H + 0.005))  # drive-in apron
    m.add(box(4.6, 1.6, 0.035), "curb_red", (0, -2.9, H + 0.01))          # ER bay
    red_cross(m, (0, -2.9, H + 0.03), 1.2, "white", axis="z", thick=0.02)
    cy, D = 0.9, 4.8
    fy = cy - D / 2
    # wings (2 floors) + central tower (3 floors)
    m.add(box(14.0, D, 5.2, 0.15, 2), "white", (0, cy, H + 2.6))
    m.add(box(5.2, D + 0.6, 8.2, 0.15, 2), "white", (0, cy - 0.3, H + 4.1))
    m.add(box(14.2, D + 0.2, 0.3, 0.05), "teal", (0, cy, H + 2.55))
    m.add(box(14.3, D + 0.3, 0.45, 0.1), "roof_purple", (0, cy, H + 5.3))
    m.add(box(5.4, D + 0.8, 0.45, 0.1), "roof_purple", (0, cy - 0.3, H + 8.3))
    tfy = fy - 0.6
    for wx in (-4.7, 4.7):
        for dx in (-1.6, 0.0, 1.6):
            for z in (H + 0.8, H + 3.3):
                arch_window(m, wx + dx, fy, z, 0.8, 1.3)
        for dy in (-1.0, 1.0):
            for z in (H + 0.8, H + 3.3):
                arch_window(m, 7.0 if wx > 0 else -7.0, cy + dy, z, 0.8, 1.3, axis="x")
    for dx in (-1.5, 1.5):
        arch_window(m, dx, tfy, H + 3.3, 0.8, 1.3)
    # entrance: sliding glass + red ER canopy on posts
    m.add(box(3.0, 0.2, 2.2, 0.05), "glass", (0, tfy, H + 1.1))
    m.add(box(0.06, 0.24, 2.2), "frame", (0, tfy, H + 1.1))
    m.add(box(5.6, 1.6, 0.35, 0.12), "red", (0, tfy - 0.75, H + 2.7))
    m.add(box(1.6, 0.1, 0.5, 0.05), "white", (0, tfy - 1.57, H + 2.7))
    red_cross(m, (0, tfy - 1.63, H + 2.7), 0.4, axis="y")
    m.mirror_x(lambda: cyl(0.12, 2.6, 8), "white", (2.5, tfy - 1.4, H + 1.3))
    # big sign: red cross on a white disc (glows)
    m.add(cyl(1.35, 0.3, 20), "white", (0, tfy - 0.05, H + 6.3), rot=(90, 0, 0))
    m.add(torus(1.35, 0.12, 20, 6), "red", (0, tfy - 0.2, H + 6.3), rot=(90, 0, 0))
    red_cross(m, (0, tfy - 0.25, H + 6.3), 1.8, "sign_red", axis="y", thick=0.12)
    # helipad on the tower
    top = H + 8.55
    m.add(cyl(2.3, 0.14, 20), "darkmetal", (0, cy - 0.3, top))
    m.add(torus(1.8, 0.07, 24, 4), "beacon_yellow", (0, cy - 0.3, top + 0.08), scale=(1, 1, 0.4))
    for x in (-0.45, 0.45):
        m.add(box(0.2, 1.4, 0.04), "white", (x, cy - 0.3, top + 0.08))
    m.add(box(0.9, 0.2, 0.04), "white", (0, cy - 0.3, top + 0.08))
    for i in range(8):
        a = i * math.pi / 4
        m.add(ball(0.09, 6, 4), "beacon_green", (2.2 * math.cos(a), cy - 0.3 + 2.2 * math.sin(a), top + 0.1))
    # rooftop units on wings
    for x in (-4.8, 4.8):
        m.add(box(1.6, 1.4, 0.8, 0.1), "metal", (x, cy + 0.6, H + 5.9))
        m.add(cyl(0.45, 0.1, 12), "darkmetal", (x, cy + 0.6, H + 6.35))
    # landscaping
    for x in (-7.0, -5.0, 5.0, 7.0):
        bush_at(m, x, -3.2, H, 0.8)
    for x in (-3.4, 3.4):
        lamp_at(m, x, -3.5, H)
    pine_at(m, -7.2, 3.2, H, 0.8, 5)
    pine_at(m, 7.2, 3.3, H, 0.9, 30)
    return m


def lighthouse():
    """Landmark nod to the cozy-town reference: pink/white candy-striped lighthouse."""
    m = Model("bld_lighthouse", "buildings", "Landmark pickup: candy-striped lighthouse at the pier.",
              tile=[1, 1], pickup_spot=[0, -3.2])
    lot_base(m, mat_="plaza", path=False)
    m.add(cyl(2.3, 0.6, 16), "wall_lav", (0, 0.6, H + 0.3))
    segs = 5
    for i in range(segs):
        r1 = 1.7 - i * 0.16
        r2 = 1.7 - (i + 1) * 0.16
        m.add(cyl(r1, 1.5, 16, r2=r2), "pink" if i % 2 == 0 else "white", (0, 0.6, H + 0.6 + 0.75 + i * 1.5),
              smooth=True)
    top = H + 0.6 + segs * 1.5
    m.add(cyl(1.35, 0.25, 16), "roof_purple", (0, 0.6, top + 0.12))
    for i in range(12):  # gallery railing
        a = 2 * math.pi * i / 12
        m.add(box(0.07, 0.07, 0.5), "trim_green", (1.25 * math.cos(a), 0.6 + 1.25 * math.sin(a), top + 0.5))
    m.add(torus(1.25, 0.05, 16, 4), "trim_green", (0, 0.6, top + 0.75))
    m.add(cyl(0.75, 1.1, 12), "glass", (0, 0.6, top + 0.8))
    m.group("lamp", pivot=(0, 0.6, top + 0.8))
    m.add(ball(0.4, 12, 8), "lamp", (0, 0.6, top + 0.8), group="lamp", smooth=True)
    m.add(cyl(0.95, 0.12, 12), "pink", (0, 0.6, top + 1.4))
    m.add(dome(0.85, 0.0, 14, 6), "pink", (0, 0.6, top + 1.45), scale=(1, 1, 0.9), smooth=True)
    m.add(ball(0.14, 8, 6), "trim_green", (0, 0.6, top + 2.3))
    for z, r in ((3.4, 1.42), (6.2, 1.13)):
        arch_window(m, 0, 0.6 - r, H + z, 0.55, 0.9, sill=False)
    door(m, 0, 0.6 - 1.62, z=H + 0.6, w=0.8, h=1.4, col="trim_green")
    m.add(box(1.2, 0.8, 0.3, 0.04), "wall_lav", (0, 0.6 - 2.5, H + 0.15))  # step
    return m


def park():
    m = Model("lot_park", "streets", "Park lot: paths, fountain, pines, benches – shortcut through (bumpy!).",
              tile=[1, 1], drivable=True)
    lot_base(m, path=False)
    m.add(box(1.8, TILE, 0.03), "plaza", (0, 0, H + 0.005))
    m.add(box(TILE, 1.8, 0.03), "plaza", (0, 0, H + 0.005))
    m.add(cyl(1.9, 0.03, 20), "plaza", (0, 0, H + 0.006))
    # fountain
    m.add(cyl(1.4, 0.5, 16), "wall_lav", (0, 0, H + 0.25))
    m.add(cyl(1.2, 0.05, 16), "water", (0, 0, H + 0.45))
    m.add(cyl(0.2, 1.0, 8), "wall_lav", (0, 0, H + 0.8))
    m.add(cyl(0.6, 0.18, 12, r2=0.4), "wall_lav", (0, 0, H + 1.3))
    m.add(dome(0.35, 0.0, 10, 5), "water", (0, 0, H + 1.4), smooth=True)
    m.add(ball(0.2, 8, 6), "water", (0, 0, H + 1.8), smooth=True)
    for x, y, s, t in ((-4.8, 4.6, 1.0, 0), (5.2, 4.2, 0.8, 20), (-4.6, -5.0, 0.75, 40), (4.8, -4.8, 0.95, 60),
                       (-6.3, 1.8, 0.7, 10), (6.4, -2.0, 0.85, 30)):
        pine_at(m, x, y, H, s, t)
    round_tree_at(m, 2.6, 5.6, H, 0.9)
    bench_at(m, -2.2, 1.6, H)
    bench_at(m, 2.2, -1.6, H)
    lamp_at(m, 1.4, 1.4, H)
    lamp_at(m, -1.4, -1.4, H)
    for x, y in ((2.6, -4.2), (-2.8, 4.0), (-5.6, -2.2), (5.8, 1.6)):
        bush_at(m, x, y, H, 0.8)
    return m


def lot_grass():
    m = Model("lot_grass", "streets", "Empty grass lot (filler / future building).", tile=[1, 1])
    lot_base(m, path=False)
    for x, y in ((-2, 1.5), (1.5, -2), (2.5, 2.5), (-3, -3)):
        m.add(cone(0.12, 0.3, 4), "grass2", (x, y, H + 0.15))
        m.add(cone(0.1, 0.25, 4), "grass2", (x + 0.15, y + 0.1, H + 0.12))
    return m


ALL = [road_straight, road_crosswalk, road_corner, road_t, road_cross, road_end, roundabout, hwy_straight, hwy_corner,
       lot_grass, park,
       hospital, house_lilac, house_peach, apartment, cafe, pharmacy, pizzeria, office, lighthouse]
