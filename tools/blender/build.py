"""Build every asset -> .glb, render isometric previews, write a manifest.

Usage (needs Blender's Python module: `pip install bpy`, or run inside Blender):
    python3 tools/blender/build.py                 # everything
    python3 tools/blender/build.py --only char_    # names starting with a prefix
    python3 tools/blender/build.py --no-render     # glb + manifest only
    python3 tools/blender/build.py --diorama       # also render the town diorama
    blender -b -P tools/blender/build.py -- --only veh_
"""

import argparse
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402  (must precede addon_utils)
import addon_utils  # noqa: E402
from mathutils import Euler, Vector  # noqa: E402

import assets_characters  # noqa: E402
import assets_powerups  # noqa: E402
import assets_props  # noqa: E402
import assets_town  # noqa: E402
import assets_vehicles  # noqa: E402
from kit import hex_rgba, reset_scene  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MODELS = os.path.join(ROOT, "assets", "models")
PREVIEWS = os.path.join(ROOT, "assets", "previews")

BUILDERS = (assets_characters.ALL + assets_vehicles.ALL + assets_town.ALL
            + assets_props.ALL + assets_powerups.ALL)

# Game camera: isometric-ish, 45 deg yaw, looking down ~35 deg.
ISO_ROT = (math.radians(58), 0.0, math.radians(38))


def enable_cycles(samples):
    addon_utils.enable("cycles", default_set=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"


def light_rig(sun_energy=3.2, sky="#CFE6FF", strength=0.9):
    sc = bpy.context.scene
    world = bpy.data.worlds.new("World")
    sc.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = hex_rgba(sky)
    bg.inputs["Strength"].default_value = strength
    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = sun_energy
    sun_data.angle = math.radians(12)
    sun_data.color = (1.0, 0.96, 0.9)
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = (math.radians(40), math.radians(-12), math.radians(-30))
    sc.collection.objects.link(sun)


def world_bbox(objs):
    pts = []
    for ob in objs:
        if ob.type == "MESH":
            pts += [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return pts


def frame_camera(pts, res=(512, 512), pad=1.12, rot=ISO_ROT):
    sc = bpy.context.scene
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("Cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    rm = Euler(rot).to_matrix()
    inv = rm.transposed()
    local = [inv @ p for p in pts]
    xs, ys, zs = [p.x for p in local], [p.y for p in local], [p.z for p in local]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    aspect = res[0] / res[1]
    cam_data.ortho_scale = max(w, h * aspect) * pad
    cam.rotation_euler = rot
    cam.location = rm @ Vector((cx, cy, max(zs) + 50))
    cam_data.clip_end = 500
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100


def outlines(thickness=1.1, color="#3B2E5A"):
    """Thin ink outlines (Freestyle), echoing the cozy-town reference look."""
    sc = bpy.context.scene
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = thickness
    fs = sc.view_layers[0].freestyle_settings
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new("ink")
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new("ink")
    ls.select_by_visibility = True
    ls.select_silhouette, ls.select_border, ls.select_crease = True, True, False
    ls.linestyle.color = hex_rgba(color)[:3]
    ls.linestyle.alpha = 0.85


def ground_catcher(pts):
    """Invisible plane that only catches shadows, so previews feel grounded."""
    zmin = min(p.z for p in pts)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, zmin - 0.001))
    plane = bpy.context.active_object
    plane.is_shadow_catcher = True


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=False,
                              export_apply=True, export_extras=True, export_yup=True,
                              export_cameras=False, export_lights=False,
                              export_materials="EXPORT")


def render(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def build_one(fn, do_render, samples):
    reset_scene()
    model = fn()
    root = model.build()
    bpy.context.view_layer.update()  # child matrix_world is stale until this
    objs = [root] + list(root.children_recursive)
    pts = world_bbox(objs)
    dims = [max(p[i] for p in pts) - min(p[i] for p in pts) for i in range(3)]
    rel = os.path.join(model.category, model.name + ".glb")
    export_glb(os.path.join(MODELS, rel))
    tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in objs if ob.type == "MESH")
    entry = {
        "name": model.name, "category": model.category, "file": "models/" + rel.replace(os.sep, "/"),
        "preview": f"previews/{model.name}.png", "description": model.desc,
        # glTF axes (Y up): width X, height Y, depth Z
        "size": {"x": round(dims[0], 2), "y": round(dims[2], 2), "z": round(dims[1], 2)},
        "tris": tris, "nodes": sorted(o.name for o in objs if o is not root),
        **model.extras,
    }
    if do_render:
        enable_cycles(samples)
        light_rig()
        frame_camera(pts)
        outlines()
        ground_catcher(pts)
        render(os.path.join(PREVIEWS, model.name + ".png"))
    print(f"[ok] {model.name:28s} {tris:6d} tris", flush=True)
    return entry


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--no-render", action="store_true")
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--diorama", action="store_true")
    ap.add_argument("--diorama-only", action="store_true")
    a = ap.parse_args(argv)

    if not a.diorama_only:
        manifest_path = os.path.join(ROOT, "assets", "manifest.json")
        existing = {}
        if os.path.exists(manifest_path):
            with open(manifest_path) as f:
                existing = {e["name"]: e for e in json.load(f)["assets"]}
        for fn in BUILDERS:
            if a.only and not any(fn.__module__.endswith(p) or fn.__name__.startswith(p)
                                  for p in a.only.split(",")):
                continue
            entry = build_one(fn, not a.no_render, a.samples)
            existing[entry["name"]] = entry
        assets = sorted(existing.values(), key=lambda e: (CATEGORY_ORDER.index(e["category"]), e["name"]))
        with open(manifest_path, "w") as f:
            json.dump({"units": "metres", "up": "+Y", "forward": "+Z (glTF front)",
                       "tile_size": assets_town.TILE, "assets": assets}, f, indent=2)
    if a.diorama or a.diorama_only:
        import diorama
        diorama.render_diorama(a.samples)


CATEGORY_ORDER = ["characters", "vehicles", "buildings", "streets", "props", "powerups"]

if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    main(argv)
