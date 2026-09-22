"""Tiny procedural low-poly modelling kit on top of bpy/bmesh.

Every asset is built as a `Model`: a set of named *groups* (one mesh object
each). The `body` group is the root; any other group becomes a child node whose
origin is its pivot — that's how wheels, sirens and rotors stay separately
animatable in the exported glTF.

Conventions (Blender space, Z-up):
  * 1 unit = 1 metre (chibi-scaled).
  * Assets face -Y. The glTF exporter converts this to +Z forward / +Y up,
    which is the glTF "front" convention (three.js: yaw = atan2(dx, dz)).
  * Origin sits on the ground (z = 0) at the footprint centre.
"""

import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# ---------------------------------------------------------------------------
# Palette: name -> (sRGB hex, roughness, emission strength, alpha)
# Soft pastel "toy town" colours; saturated accents are kept for gameplay reads
# (red = medical/urgent, green = pickup, yellow = reward).
# ---------------------------------------------------------------------------
PALETTE = {
    # neutrals
    "white": ("#F6F3EC", 0.55), "offwhite": ("#E6E0D4", 0.7),
    "eye": ("#2A2433", 0.3), "eyeshine": ("#FFFFFF", 0.2), "blush": ("#FF93A8", 0.8),
    "tire": ("#34343F", 0.9), "metal": ("#BAC2CE", 0.35), "darkmetal": ("#666C7A", 0.45),
    "glass": ("#A2DEF5", 0.08), "gold": ("#FFC53A", 0.25), "darkgold": ("#E39B1C", 0.3),
    # accents
    "red": ("#EE4B5E", 0.45), "darkred": ("#B8344A", 0.5), "blue": ("#4EA4EA", 0.45),
    "navy": ("#3A4572", 0.6), "teal": ("#35C3B2", 0.55), "mint": ("#BDEBD9", 0.7),
    "yellow": ("#FFD45E", 0.45), "orange": ("#FF9E4A", 0.5), "pink": ("#FF9FBD", 0.55),
    "purple": ("#A58CF2", 0.55), "lavender": ("#CDBEFF", 0.6), "green": ("#6CC66C", 0.7),
    "darkgreen": ("#3E9A56", 0.75), "leaf": ("#45C48E", 0.8), "leaf2": ("#2FA67C", 0.8),
    "brown": ("#9C6B4A", 0.8), "darkbrown": ("#5F402F", 0.85), "sky": ("#8FC8FF", 0.6),
    # skin / hair
    "skin": ("#FFD8BA", 0.7), "skin2": ("#E8B08A", 0.7), "skin3": ("#A87150", 0.7),
    "hair_brown": ("#6B4632", 0.7), "hair_black": ("#2F2A36", 0.6),
    "hair_grey": ("#D6D2DE", 0.7), "hair_blonde": ("#F3C66C", 0.6), "hair_ginger": ("#E27B3F", 0.6),
    # town
    # town -- after the reference shots: minty teal grass, slate road, lavender pavements,
    # red/white curbs with a yellow edge line, purple roofs, glowing arched windows.
    "road": ("#4B4959", 0.92), "roadline": ("#FFD45E", 0.8), "zebra": ("#F4F1EA", 0.85),
    "sidewalk": ("#D2C4EE", 0.92), "curb": ("#B7A9DD", 0.9), "grass": ("#4CC79A", 0.95),
    "grass2": ("#3BB58A", 0.95), "rail": ("#CBC5F2", 0.6), "curb_red": ("#E8685A", 0.8),
    "pine": ("#35B889", 0.85), "pine2": ("#2A9E78", 0.85), "trunk": ("#D8784A", 0.85),
    "wall_lav": ("#DCCBF7", 0.9), "wall_purple": ("#A38BE3", 0.85), "roof_purple": ("#6E5AC8", 0.8),
    "trim_green": ("#3FAE78", 0.7), "window": ("#FFC75A", 0.4, 0.6), "frame": ("#5A48A8", 0.7),
    "plaza": ("#EACBA2", 0.9), "water": ("#7CCBF2", 0.1), "dirt": ("#C99A6B", 0.95),
    "wall_cream": ("#FFF1D6", 0.9), "wall_peach": ("#FFD3B6", 0.9), "wall_lilac": ("#E4D8FF", 0.9),
    "wall_mint": ("#D3F4E4", 0.9), "wall_sky": ("#D2E9FF", 0.9), "wall_pink": ("#FFDCE6", 0.9),
    "roof_red": ("#E3695B", 0.8), "roof_blue": ("#5E90D8", 0.8), "roof_green": ("#5DBA8B", 0.8),
    "roof_grey": ("#8C92A3", 0.85), "wood": ("#C98E5E", 0.85),
    # pizza side-gig
    "kraft": ("#E9C48F", 0.85), "cheese": ("#FFD25C", 0.6), "crust": ("#E0954A", 0.8),
    "pepperoni": ("#D9483B", 0.6), "basil": ("#3FAE5A", 0.7), "wall_tomato": ("#FFB9A8", 0.9),
    # emissive (these glow in-game; keep strength modest so bloom stays cute, not blinding)
    "lamp": ("#FFF1A8", 0.3, 1.5), "siren_red": ("#FF3D52", 0.3, 2.5),
    "siren_blue": ("#3F7DFF", 0.3, 2.5), "beacon_green": ("#56E27D", 0.3, 1.5),
    "beacon_red": ("#FF5468", 0.3, 1.5), "beacon_yellow": ("#FFD34F", 0.3, 1.5),
    "sign_green": ("#3DDC84", 0.3, 1.2), "sign_red": ("#FF4A5E", 0.3, 1.2),
    "tail": ("#FF4B4B", 0.3, 1.0),
    # translucent
    "beam_green": ("#56E27D", 0.3, 1.0, 0.28), "beam_red": ("#FF5468", 0.3, 1.0, 0.28),
    "beam_orange": ("#FFA23F", 0.3, 1.0, 0.28), "beacon_orange": ("#FFA23F", 0.3, 1.5),
    "bubble": ("#9FE3FF", 0.1, 0.3, 0.35),
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h, alpha=1.0):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (alpha,)


_MATS = {}


def mat(name):
    """Get (or lazily create) a shared Principled material from the palette."""
    m = _MATS.get(name)
    if m is not None and m.name in bpy.data.materials:
        return m
    spec = PALETTE[name]
    hexc, rough = spec[0], spec[1]
    emit = spec[2] if len(spec) > 2 else 0.0
    alpha = spec[3] if len(spec) > 3 else 1.0
    rgba = hex_rgba(hexc, alpha)
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:  # always-on in newer Blender
        pass
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    if emit:
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = emit
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(m, attr, val)
            except Exception:
                pass
    m.diffuse_color = rgba
    _MATS[name] = m
    return m


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()


# ---------------------------------------------------------------------------
# Primitive builders: each returns a fresh bmesh centred on the origin.
# ---------------------------------------------------------------------------
def _bevel(bm, amount, segments):
    if amount > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=amount,
                        segments=segments, affect="EDGES", profile=0.5,
                        clamp_overlap=True, offset_type="OFFSET",
                        profile_type="SUPERELLIPSE")
    return bm


def box(sx, sy, sz, bevel=0.0, seg=1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    return _bevel(bm, min(bevel, sx / 2.01, sy / 2.01, sz / 2.01), seg)


def cyl(r, h, seg=12, r2=None, bevel=0.0):
    """Cylinder / truncated cone along Z (r at bottom, r2 at top)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r, radius2=r if r2 is None else r2, depth=h)
    return _bevel(bm, bevel, 1)


def cone(r, h, seg=10):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r, radius2=0.0, depth=h)
    return bm


def ball(r, u=12, v=8):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)
    return bm


def ico(r, sub=1):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    return bm


def dome(r, cut=0.0, u=14, v=10):
    """Sphere with everything below z = cut*r removed (open cap: hair, domes)."""
    bm = ball(r, u, v)
    bmesh.ops.delete(bm, geom=[vt for vt in bm.verts if vt.co.z < cut * r - 1e-6], context="VERTS")
    return bm


def torus(R, r, seg=14, rseg=6, arc=360.0):
    """Torus in the XY plane; `arc` < 360 gives an open horseshoe/handle."""
    bm = bmesh.new()
    closed = arc >= 359.9
    n = seg if closed else seg + 1
    rings = []
    for i in range(n):
        a = math.radians(arc) * i / seg
        c = Vector((math.cos(a), math.sin(a), 0))
        ring = []
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            ring.append(bm.verts.new(c * (R + r * math.cos(b)) + Vector((0, 0, r * math.sin(b)))))
        rings.append(ring)
    for i in range(seg if closed else n - 1):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(rseg):
            bm.faces.new((a[j], a[(j + 1) % rseg], b[(j + 1) % rseg], b[j]))
    if not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def prism(pts, depth):
    """Extrude a 2D polygon (XY) along Z, centred. Handles concave outlines."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, -depth / 2)) for x, y in pts]
    f = bm.faces.new(vs)
    res = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [e for e in res["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, depth), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def star_pts(n=5, R=0.5, r=0.22, rot=90):
    return [((R if i % 2 == 0 else r) * math.cos(math.radians(rot + 180 * i / n)),
             (R if i % 2 == 0 else r) * math.sin(math.radians(rot + 180 * i / n)))
            for i in range(2 * n)]


def cross_pts(size=1.0, arm=0.34):
    a, b = size / 2, size * arm / 2
    return [(b, a), (-b, a), (-b, b), (-a, b), (-a, -b), (-b, -b),
            (-b, -a), (b, -a), (b, -b), (a, -b), (a, b), (b, b)]


def arch_pts(w, h, n=7):
    """Round-topped window/door outline: rectangle with a semicircular head."""
    r = w / 2
    pts = [(-r, 0.0), (r, 0.0)]
    for i in range(n + 1):
        a = math.pi * i / n
        pts.append((r * math.cos(a), h - r + r * math.sin(a)))
    return pts


# Rotations that stand an XY-authored prism up so it faces the given axis.
FACING = {"z": (0, 0, 0), "-y": (90, 0, 0), "y": (90, 0, 0), "x": (90, 0, 90), "-x": (90, 0, 90)}


def heart_pts(size=1.0, n=22):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 34 * size, (y + 2.5) / 34 * size))
    return list(reversed(pts))


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------
def _xform(loc, rot, scale):
    return (Matrix.Translation(Vector(loc))
            @ Euler([math.radians(a) for a in rot], "XYZ").to_matrix().to_4x4()
            @ Matrix.Diagonal((*scale, 1.0)))


class Model:
    def __init__(self, name, category, desc="", **extras):
        self.name, self.category, self.desc = name, category, desc
        self.extras = extras
        self.groups = {}
        self.origin = Vector((0, 0, 0))  # offset applied to every add() (for composing)
        self.group("body")

    def group(self, name, pivot=(0, 0, 0), parent="body"):
        if name not in self.groups:
            self.groups[name] = {"pivot": Vector(pivot) + self.origin, "bm": bmesh.new(),
                                 "mats": [], "parent": parent if name != "body" else None}
        return name

    def add(self, part, material, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), group="body",
            smooth=False):
        g = self.groups[group]
        if material not in g["mats"]:
            g["mats"].append(material)
        idx = g["mats"].index(material)
        bmesh.ops.transform(part, matrix=_xform(Vector(loc) + self.origin, rot, scale), verts=part.verts)
        dst = g["bm"]
        vmap = {v: dst.verts.new(v.co) for v in part.verts}
        for f in part.faces:
            nf = dst.faces.new([vmap[v] for v in f.verts])
            nf.material_index = idx
            nf.smooth = smooth
        part.free()

    def mirror_x(self, part_fn, material, loc, rot=(0, 0, 0), scale=(1, 1, 1), group="body",
                 smooth=False):
        """Add a part and its mirror across X=0 (part_fn builds a fresh bmesh)."""
        x, y, z = loc
        self.add(part_fn(), material, (x, y, z), rot, scale, group, smooth)
        self.add(part_fn(), material, (-x, y, z), (rot[0], -rot[1], -rot[2]), scale, group, smooth)

    def build(self, collection=None, location=(0, 0, 0), rot_z=0.0):
        """Create Blender objects. Returns the root object."""
        coll = collection or bpy.context.scene.collection
        objs = {}
        for gname, g in self.groups.items():
            if gname != "body" and not g["bm"].faces:
                continue
            bm = g["bm"]
            bmesh.ops.translate(bm, vec=-g["pivot"], verts=bm.verts)
            me = bpy.data.meshes.new(f"{self.name}_{gname}")
            bm.to_mesh(me)
            bm.free()
            for m in g["mats"]:
                me.materials.append(mat(m))
            ob = bpy.data.objects.new(self.name if gname == "body" else gname, me)
            coll.objects.link(ob)
            objs[gname] = ob
        for gname, ob in objs.items():
            g = self.groups[gname]
            if g["parent"]:
                parent = g["parent"] if g["parent"] in objs else "body"
                ob.parent = objs[parent]
                ob.location = g["pivot"] - self.groups[parent]["pivot"]
        root = objs["body"]
        root.location = Vector(location) + self.groups["body"]["pivot"]
        root.rotation_euler = (0, 0, math.radians(rot_z))
        root["category"] = self.category
        root["description"] = self.desc
        for k, v in self.extras.items():
            root[k] = v
        return root


class at:
    """Context manager: temporarily offset a model's origin (compose sub-assets)."""

    def __init__(self, m, x=0.0, y=0.0, z=0.0):
        self.m, self.d = m, Vector((x, y, z))

    def __enter__(self):
        self.m.origin += self.d
        return self.m

    def __exit__(self, *a):
        self.m.origin -= self.d
