"""Temporal stabilizer for the README GIF (not part of the test suite).

Playwright's VP8 video carries codec noise on every edge in every frame, so a GIF encoder can never reuse the previous
frame and the file explodes (23.6 MB for 28 s at 1200 px / 12 fps). This filter works on 16x16 blocks and compares
each input frame with the previous *output* frame:

* a block is redrawn from the input when any pixel in it changed by more than THRESHOLD (max over R, G, B), or when
  its mean absolute difference exceeds MEAN_LIMIT (slow fades and low-contrast text on the dark UI);
* when more than SCENE_SHARE of all blocks would be redrawn (page change), the whole frame is taken;
* otherwise the block keeps its previous pixels, so codec shimmer disappears and GIF frame diffs stay small.

Redrawing whole blocks (not single pixels) avoids ghosting: low-contrast parts of new content arrive together with
the high-contrast parts of the same block.

    ffmpeg -ss <offset> -t <dur> -i in.webm -vf fps=12,scale=1200:-1:flags=lanczos -f rawvideo -pix_fmt rgb24 - |
      python stabilize_frames.py 1200 750 |
      ffmpeg -f rawvideo -pix_fmt rgb24 -s 1200x750 -r 12 -i - -c:v ffv1 stable.mkv

Requires numpy.
"""

from __future__ import annotations

import sys

import numpy as np


BLOCK = 16
THRESHOLD = 24
MEAN_LIMIT = 4.0
SCENE_SHARE = 0.30


def main() -> None:
    width, height = int(sys.argv[1]), int(sys.argv[2])
    size = width * height * 3
    bh, bw = -(-height // BLOCK), -(-width // BLOCK)
    ph, pw = bh * BLOCK - height, bw * BLOCK - width
    src, dst = sys.stdin.buffer, sys.stdout.buffer
    prev: np.ndarray | None = None
    frames = scenes = 0
    while True:
        buf = src.read(size)
        if len(buf) < size:
            break
        cur = np.frombuffer(buf, dtype=np.uint8).reshape(height, width, 3)
        if prev is None:
            out = cur.copy()
        else:
            diff = np.abs(cur.astype(np.int16) - prev.astype(np.int16)).max(axis=2)
            blocks = np.pad(diff, ((0, ph), (0, pw))).reshape(bh, BLOCK, bw, BLOCK).swapaxes(1, 2)
            redraw = (blocks.max(axis=(2, 3)) > THRESHOLD) | (blocks.mean(axis=(2, 3)) > MEAN_LIMIT)
            if redraw.mean() > SCENE_SHARE:
                out = cur.copy()
                scenes += 1
            else:
                mask = np.repeat(np.repeat(redraw, BLOCK, axis=0), BLOCK, axis=1)[:height, :width]
                out = prev.copy()
                out[mask] = cur[mask]
        dst.write(out.tobytes())
        prev = out
        frames += 1
    print(f"stabilized {frames} frames, {scenes} full redraws", file=sys.stderr)


if __name__ == "__main__":
    main()
