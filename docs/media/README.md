# Demo media

`demo.mp4` (1440×900) and `demo.gif` (1200 px, 12 fps) are recorded from the real stack: uvicorn + the
`vite preview` build + Chromium, a fresh SQLite demo database, nothing mocked. The flow: demo reset → Overview →
Attack Simulation (run *Sensitive Data Exposure*, replay at 4×) → Remediation (apply the top 3 fixes, before/after).

Reproduce (Windows Git Bash or any POSIX shell; needs ffmpeg and Python with numpy):

```bash
cd e2e && node scripts/record-demo.ts          # -> docs/media/demo-raw.webm + demo-raw.json {startOffset, duration}
cd ../docs/media
OFF=0.67; DUR=28.05                            # values from demo-raw.json

ffmpeg -ss $OFF -t $DUR -i demo-raw.webm -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p \
  -movflags +faststart -an demo.mp4

# GIF: Playwright's VP8 video has codec noise on every edge in every frame, which defeats GIF frame diffing
# (23.6 MB raw). stabilize_frames.py keeps unchanged 16x16 blocks static first (5.3 MB).
ffmpeg -ss $OFF -t $DUR -i demo-raw.webm -vf "fps=12,scale=1200:-1:flags=lanczos" -f rawvideo -pix_fmt rgb24 - |
  python ../../e2e/scripts/stabilize_frames.py 1200 750 |
  ffmpeg -y -f rawvideo -pix_fmt rgb24 -s 1200x750 -r 12 -i - -c:v ffv1 stable.mkv
ffmpeg -i stable.mkv -vf "split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" demo.gif
rm demo-raw.webm demo-raw.json stable.mkv
```
