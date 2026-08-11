# media

Drop paper assets here. The filenames the build is looking for come from
`media.src` / `media.poster` in `content/publications.json` — change either
side, just keep them matching.

Until a file exists the page renders a dashed placeholder naming the missing
file, and `npm run build` lists it. Nothing silently disappears.

Guidance for clips:

- **mp4, H.264, muted, no audio track.** They autoplay on loop, so keep them
  short (4–8s) and under ~2 MB. `ffmpeg -i in.mov -vf scale=840:-2 -crf 28 \
  -an -movflags +faststart out.mp4`
- **4:3-ish framing.** The frame is `aspect-ratio: 4/3` and covers, so anything
  wildly wide gets cropped at the sides.
- **Ship a poster** (`.jpg`, same first frame) for the moment before the video
  decodes and for reduced-motion visitors.

Stills work too — set `"type": "image"` and point `src` at a `.jpg`/`.png`.
