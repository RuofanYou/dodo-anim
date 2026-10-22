#!/usr/bin/env python3
"""Pack PNG files with no trimming, rotation, resizing or repainting."""
import argparse
import json
import sys
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument("manifest", type=Path)
args = parser.parse_args()
spec = json.load(sys.stdin) if str(args.manifest) == "-" else json.loads(args.manifest.read_text(encoding="utf-8"))
records = [(entry["name"], Image.open(entry["file"]).convert("RGBA")) for entry in spec["images"]]
padding = 3
width = 256
area = sum((image.width + padding * 2) * (image.height + padding * 2) for _, image in records)
while width * width < area * 1.15 or (records and width < max(image.width + padding * 2 for _, image in records)):
    width *= 2
x = y = padding
row_height = 0
regions = {}
for name, image in sorted(records, key=lambda item: -item[1].height):
    if x + image.width + padding > width:
        x = padding
        y += row_height + padding * 2
        row_height = 0
    regions[name] = (x, y, image.width, image.height)
    x += image.width + padding * 2
    row_height = max(row_height, image.height)
height = 256
while height < y + row_height + padding:
    height *= 2
atlas = Image.new("RGBA", (width, height))
for name, image in records:
    x, y, w, h = regions[name]
    atlas.paste(image, (x, y))
    if atlas.crop((x, y, x + w, y + h)).tobytes() != image.tobytes():
        raise ValueError(f"Packed pixels changed: {name}")
base = Path(spec["outputBase"])
base.parent.mkdir(parents=True, exist_ok=True)
atlas.save(str(base) + ".png")
lines = [base.name + ".png", f"size: {width},{height}", "format: RGBA8888", "filter: Linear,Linear", "repeat: none"]
for name, _ in records:
    x, y, w, h = regions[name]
    lines.extend([name, "  rotate: false", f"  xy: {x},{y}", f"  size: {w},{h}", f"  orig: {w},{h}", "  offset: 0,0", "  index: -1"])
Path(str(base) + ".atlas").write_text("\n".join(lines) + "\n", encoding="utf-8")
print(json.dumps({"atlasSize": [width, height], "images": len(records), "pixelCopyVerified": True}))
