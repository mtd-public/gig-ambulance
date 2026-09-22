"""Pack every GLB from assets/manifest.json into one JSON file of base64 strings
(assets/models.bundle.json) for static hosts that refuse .glb. js/assets.js
uses the bundle when present and falls back to individual GLBs otherwise."""
import base64
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "assets", "models.bundle.json")
with open(os.path.join(ROOT, "assets", "manifest.json")) as f:
    assets = json.load(f)["assets"]
bundle = {}
for a in assets:
    with open(os.path.join(ROOT, "assets", a["file"]), "rb") as g:
        bundle[a["name"]] = base64.b64encode(g.read()).decode()
with open(out, "w") as f:
    json.dump(bundle, f)
print(f"wrote {out} ({os.path.getsize(out) / 1e6:.1f} MB, {len(bundle)} models)")
