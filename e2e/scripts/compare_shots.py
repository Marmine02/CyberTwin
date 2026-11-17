"""Before/after composites: the committed screenshot (git HEAD) next to the current one.

    python e2e/scripts/compare_shots.py <out_dir> <path> [<path> ...]

Each <path> is a repo-relative screenshot (e.g. docs/screenshots/04-attack-simulation-en.png). Writes
<out_dir>/<name>.png: left = HEAD ("before"), right = working tree ("after"), both scaled to the same height.
"""

from __future__ import annotations

import io
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for rel in sys.argv[2:]:
        before = Image.open(io.BytesIO(subprocess.check_output(["git", "show", f"HEAD:{rel}"], cwd=ROOT))).convert("RGB")
        after = Image.open(ROOT / rel).convert("RGB")
        h = 720
        b = before.resize((round(before.width * h / before.height), h))
        a = after.resize((round(after.width * h / after.height), h))
        canvas = Image.new("RGB", (b.width + a.width + 24, h + 36), (20, 24, 30))
        canvas.paste(b, (0, 36))
        canvas.paste(a, (b.width + 24, 36))
        d = ImageDraw.Draw(canvas)
        d.text((8, 10), "before (HEAD)", fill=(200, 205, 215))
        d.text((b.width + 32, 10), "after", fill=(200, 205, 215))
        canvas.save(out / Path(rel).name, optimize=True)
        print(out / Path(rel).name)


if __name__ == "__main__":
    main()
