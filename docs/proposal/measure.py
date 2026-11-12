# Measures how tall the visible content is in each screenshot (excluding sidebar, tab strip, status bar) -> shots/sizes.json
import json, glob, os
import numpy as np
from PIL import Image
out = {}
for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__), "shots", "*.jpg"))):
    im = Image.open(f).convert("RGB"); w, h = im.size
    if w < 1000:  # phone shots are not cropped
        continue
    s = w / 1440
    x0, y0, y1 = int(240 * s), int(84 * s), h - int(26 * s)   # working area
    region = np.asarray(im.crop((x0, y0, w, y1))).astype(int)
    bg = region[5, region.shape[1] - 5]                          # page background colour
    diff = (np.abs(region - bg).sum(axis=2) > 18)
    rows = np.where(diff.any(axis=1))[0]
    last = int(rows.max()) if len(rows) else region.shape[0]
    out[os.path.basename(f)] = {"w": w, "h": h, "content": round((last + 24 * s) / s)}   # px at 1x, within working area
json.dump(out, open(os.path.join(os.path.dirname(__file__), "shots", "sizes.json"), "w"), indent=1)
print(len(out), "measured; e.g.", list(out.items())[:2])
