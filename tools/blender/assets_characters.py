"""Chibi characters: ~2.5-head-tall bodies, giant heads, dot eyes, blush cheeks.

All characters are ~1.3 m tall (the ambulance is ~2.4 m) and face -Y.
Separate `head` group so the game can bob/tilt it; arms stay in the body mesh
to keep draw calls low.
"""

from kit import FACING, Model, ball, box, cone, cross_pts, cyl, dome, prism, torus

HEAD_Z = 0.95


def chibi(m, skin="skin", top="teal", bottom="navy", shoes="white", sleeve=None,
          hair="hair_brown", style="short", eyes="dots"):
    sleeve = sleeve or top
    S = dict(smooth=True)
    # legs + shoes
    m.mirror_x(lambda: box(0.17, 0.25, 0.1, 0.04, 2), shoes, (0.1, -0.03, 0.05))
    m.mirror_x(lambda: cyl(0.07, 0.22, 12), bottom, (0.1, 0.0, 0.19), **S)
    # smooth pear-shaped torso: hips blob + chest blob, blended by overlap
    m.add(ball(0.2, 20, 12), bottom, (0, 0, 0.34), scale=(1.0, 0.8, 0.6), **S)
    m.add(ball(0.18, 20, 12), top, (0, 0, 0.5), scale=(1.0, 0.82, 1.05), **S)
    # arms hang from shoulder balls that sit *inside* the torso, so they read as attached
    m.mirror_x(lambda: ball(0.068, 12, 8), sleeve, (0.15, 0, 0.6), **S)
    m.mirror_x(lambda: cyl(0.058, 0.24, 12, r2=0.06), sleeve, (0.195, 0, 0.5), rot=(0, -20, 0), **S)
    m.mirror_x(lambda: ball(0.066, 12, 8), skin, (0.24, 0, 0.37), **S)

    m.group("head", pivot=(0, 0, 0.64))
    h = "head"
    m.add(ball(0.34, 24, 16), skin, (0, 0, HEAD_Z), scale=(1, 0.95, 0.9), group=h, **S)
    # face (on the -Y side of the head sphere)
    if eyes == "dots":
        m.mirror_x(lambda: ball(0.056, 12, 8), "eye", (0.12, -0.296, 0.93), scale=(1, 0.55, 1.25), group=h, **S)
        m.mirror_x(lambda: ball(0.019, 8, 6), "eyeshine", (0.105, -0.326, 0.965), group=h, **S)
    else:  # happy closed "^^" eyes
        m.mirror_x(lambda: torus(0.045, 0.014, 10, 6, arc=180), "eye", (0.12, -0.3, 0.92),
                   rot=(90, 0, 0), group=h, **S)
    m.mirror_x(lambda: cyl(0.05, 0.012, 14), "blush", (0.205, -0.255, 0.855),
               rot=(90, 0, 38), scale=(1, 0.7, 1), group=h)
    m.add(torus(0.035, 0.011, 10, 6, arc=180), "eye", (0, -0.303, 0.845), rot=(-90, 0, 0), group=h, **S)
    hair_style(m, hair, style)


def hair_style(m, hair, style):
    h, S = "head", dict(smooth=True)
    if style == "bald":
        return
    # smooth cap, tilted so it sits lower at the back
    m.add(dome(0.36, cut=-0.05, u=24, v=16), hair, (0, 0.025, 0.97), rot=(-22, 0, 0),
          scale=(1.02, 1.0, 0.92), group=h, **S)
    # soft side-swept fringe: overlapping flattened blobs
    for x, z, s in ((-0.14, 1.08, 1.0), (0.0, 1.11, 1.15), (0.14, 1.08, 1.0)):
        m.add(ball(0.1, 16, 10), hair, (x, -0.24, z), scale=(1.15 * s, 0.6, 0.75), group=h, **S)
    if style == "bun":
        m.add(ball(0.15, 16, 10), hair, (0, 0.2, 1.25), group=h, **S)
    elif style == "pigtails":
        m.mirror_x(lambda: ball(0.12, 16, 10), hair, (0.34, 0.08, 1.02), group=h, **S)
    elif style == "quiff":
        m.add(ball(0.16, 16, 10), hair, (0, -0.1, 1.24), rot=(-30, 0, 0), scale=(1.1, 1.3, 0.6), group=h, **S)
    elif style == "long":
        m.add(ball(0.33, 20, 12), hair, (0, 0.12, 0.84), scale=(1.0, 0.6, 0.85), group=h, **S)


def glasses(m, color="darkmetal"):
    m.mirror_x(lambda: torus(0.07, 0.014, 12, 4), color, (0.12, -0.32, 0.93), rot=(90, 0, 0), group="head")
    m.add(box(0.1, 0.02, 0.02), color, (0, -0.335, 0.94), group="head")


def red_cross(m, loc, size, mat_="red", axis="y", thick=0.03, group="body"):
    """Flat medical cross. axis = facing axis ('x', 'y' or 'z')."""
    m.add(prism(cross_pts(size), thick), mat_, loc, rot=FACING[axis], group=group)


# ---------------------------------------------------------------------------

def medic():
    m = Model("char_medic", "characters", "Player driver 'Medi' – paramedic in teal scrubs and cross cap.")
    chibi(m, top="teal", bottom="teal", shoes="white", hair="hair_brown", style="short")
    # peaked cap with cross
    m.add(dome(0.37, cut=0.15, u=24, v=16), "white", (0, 0.02, 1.0), rot=(-12, 0, 0), group="head", smooth=True)
    m.add(box(0.36, 0.2, 0.035, 0.015), "white", (0, -0.33, 1.1), rot=(-12, 0, 0), group="head")
    red_cross(m, (0, -0.31, 1.2), 0.13, axis="y", group="head")
    # chest badge + radio
    red_cross(m, (-0.08, -0.155, 0.56), 0.07, axis="y")
    m.add(box(0.07, 0.05, 0.12, 0.015), "darkmetal", (0.13, -0.12, 0.6))
    return m


def doctor():
    m = Model("char_doctor", "characters", "Hospital doctor waiting at the ER drop-off.")
    chibi(m, skin="skin3", top="sky", bottom="navy", shoes="darkbrown", sleeve="white",
          hair="hair_black", style="quiff")
    # lab coat skirt + lapels
    m.add(cyl(0.21, 0.34, 20, r2=0.18), "white", (0, 0.01, 0.4), scale=(1, 0.85, 1), smooth=True)
    m.add(box(0.06, 0.02, 0.26), "sky", (0, -0.16, 0.52))
    # stethoscope
    m.add(torus(0.13, 0.016, 12, 4, arc=200), "darkmetal", (0, -0.03, 0.62), rot=(0, 0, 170), scale=(1, 0.9, 1))
    m.add(cyl(0.035, 0.03, 8), "metal", (0.06, -0.16, 0.5), rot=(90, 0, 0))
    glasses(m)
    return m


def patient_bandage():
    m = Model("char_patient_bandage", "characters", "Patient in a hospital gown with a head bandage and arm sling.")
    chibi(m, top="lavender", bottom="lavender", shoes="pink", hair="hair_ginger", style="short", eyes="happy")
    m.add(cyl(0.35, 0.1, 24), "white", (0, 0.0, 1.03), rot=(-8, 0, 0), group="head", smooth=True)
    m.add(box(0.08, 0.03, 0.03), "offwhite", (0.12, -0.33, 1.02), rot=(0, 0, 0), group="head")
    m.add(box(0.03, 0.03, 0.08), "offwhite", (0.12, -0.33, 1.02), group="head")
    # sling
    m.add(box(0.3, 0.12, 0.12, 0.04), "white", (0.05, -0.17, 0.46), rot=(0, 0, -10))
    m.add(box(0.05, 0.02, 0.36), "white", (0.02, -0.14, 0.58), rot=(0, 40, 0))
    return m


def patient_granny():
    m = Model("char_patient_granny", "characters", "Granny patient with bun, glasses, cardigan and cane.")
    chibi(m, top="purple", bottom="lavender", shoes="darkbrown", hair="hair_grey", style="bun")
    glasses(m, "gold")
    m.add(ball(0.03, 6, 4), "yellow", (0, -0.17, 0.6))  # brooch
    # cane
    m.add(cyl(0.025, 0.4, 6), "brown", (0.3, -0.05, 0.2))
    m.add(torus(0.05, 0.022, 8, 4, arc=180), "brown", (0.35, -0.05, 0.4), rot=(90, 0, 0))
    return m


def patient_kid():
    m = Model("char_patient_kid", "characters", "Kid patient with a leg cast and crutch.", scale_hint=0.85)
    chibi(m, skin="skin2", top="yellow", bottom="blue", shoes="red", hair="hair_blonde", style="pigtails")
    m.add(cyl(0.11, 0.28, 10), "white", (-0.1, 0, 0.14))  # leg cast
    m.add(cyl(0.022, 0.55, 6), "metal", (0.33, 0.02, 0.28), rot=(0, -6, 0))  # crutch
    m.add(box(0.12, 0.05, 0.04, 0.015), "darkmetal", (0.36, 0.02, 0.55))
    return m


def pedestrian():
    m = Model("char_pedestrian", "characters", "Generic townsperson with a backpack (crowd filler).")
    chibi(m, top="orange", bottom="navy", shoes="white", hair="hair_black", style="long")
    m.add(box(0.28, 0.14, 0.3, 0.06, 2), "green", (0, 0.2, 0.5))
    m.mirror_x(lambda: box(0.04, 0.2, 0.04), "darkgreen", (0.11, 0.04, 0.62))
    return m


ALL = [medic, doctor, patient_bandage, patient_granny, patient_kid, pedestrian]
