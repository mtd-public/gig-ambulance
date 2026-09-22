"""Tile rendered previews into per-category contact sheets (needs Pillow)."""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CELL, COLS, BG, INK = 300, 4, (238, 230, 250, 255), (59, 46, 90)


def font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def sheet(entries, out, title):
    rows = (len(entries) + COLS - 1) // COLS
    img = Image.new("RGBA", (CELL * COLS, CELL * rows + 56), BG)
    d = ImageDraw.Draw(img)
    d.text((16, 14), title, fill=INK, font=font(26))
    for i, e in enumerate(entries):
        x, y = CELL * (i % COLS), 56 + CELL * (i // COLS)
        p = os.path.join(ROOT, "assets", e["preview"])
        if os.path.exists(p):
            im = Image.open(p).convert("RGBA").resize((CELL - 20, CELL - 20), Image.LANCZOS)
            img.alpha_composite(im, (x + 10, y))
        d.text((x + 12, y + CELL - 30), e["name"], fill=INK, font=font(15))
    img.convert("RGB").save(out, optimize=True)
    print("wrote", out)


def main(only=None):
    with open(os.path.join(ROOT, "assets", "manifest.json")) as f:
        assets = json.load(f)["assets"]
    cats = []
    for e in assets:
        if e["category"] not in cats:
            cats.append(e["category"])
    for c in cats:
        if only and c not in only:
            continue
        sheet([e for e in assets if e["category"] == c],
              os.path.join(ROOT, "assets", "previews", f"sheet_{c}.png"), c.upper())


if __name__ == "__main__":
    main(sys.argv[1:] or None)
