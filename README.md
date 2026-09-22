# Gig Ambulance

A cute, low-poly, isometric rush-delivery game for phones. It plays like
*Crazy Taxi*, but you drive an ambulance: pick up patients around a pastel
toy town and race them to the hospital before their timer runs out. You steer
with a virtual thumbstick, as in
[space-lion](https://github.com/mtd-public/space-lion).

![Prototype](docs/screenshots/prototype.png)

- **Game design spec:** [DESIGN.md](DESIGN.md)
- **3D models:** 61 procedural chibi low-poly GLBs built with Blender, in
  [`assets/models`](assets/models). Previews are in
  [`assets/previews`](assets/previews) (see the `sheet_*.png` contact sheets).

## Play the prototype

There's no build step. Serve the folder and open it on a phone, or in a
narrow desktop window:

```
python3 -m http.server 8080
# or: npx http-server -p 8080
```

Then open `http://localhost:8080`.

**Controls**
- **Left thumb:** drag the floating stick toward where you want to go on
  screen. Release to coast.
- **Right thumb:** **DRIFT** (handbrake slide), **BRAKE** and **BOOST** buttons.
- **⟳:** rotate the camera 90°.
- **Desktop:** WASD or arrow keys to steer, Space drift, X brake, Shift boost,
  Q/E rotate.

Stop inside a **green beam** to load a patient, then inside the **red beam** at
*their* hospital (there are three). On the side, roll through **orange beams**
to grab pizzas (up to 3, even mid-run) and drop them at a pizzeria while
they're hot. The top compasses point to your next patient stop and your next
pizza stop.

## Rebuild the models

```
pip install bpy pillow
python3 tools/blender/build.py            # GLBs, previews and assets/manifest.json
python3 tools/blender/contact_sheet.py    # category contact sheets
```

See [DESIGN.md §9](DESIGN.md#9-asset-pipeline) for asset conventions such as
axes, node names and metadata.
