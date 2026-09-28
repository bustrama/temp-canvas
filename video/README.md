# temp canvas promo video

A 21-second product video (1920×1080, 30 fps), made with [Remotion](https://www.remotion.dev): the
video is React code, rendered frame by frame in headless Chrome. The music is code too. It is a
separate npm project, not part of the Next.js app build.

## Commands

```bash
npm install
npm run music                # compose the soundtrack (public/music/theme.m4a)
npm run dev                  # Remotion Studio: preview and scrub every scene
npx remotion render Promo out/temp-canvas-promo.mp4 --crf=18
```

The site and the main README use smaller copies of that render (run from `video/`):

```bash
# Web copy for the home screen (starts playing before it has fully downloaded)
npx remotion ffmpeg -i out/temp-canvas-promo.mp4 -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -color_range tv -movflags +faststart -c:a aac -b:a 128k ../public/promo/temp-canvas.mp4
# README preview: the live ink part as a GIF
npx remotion ffmpeg -ss 8.1 -t 4.7 -i out/temp-canvas-promo.mp4 -vf "scale=768:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -r 15 -loop 0 ../docs/preview.gif
```

`public/promo/poster.jpg` is frame 240 of the LiveInk composition (`npx remotion still LiveInk`), scaled
to 1280 px wide.

## How it's put together

- `src/Promo.tsx`: the cut. Hook (mouse vs pen), Title, the second half of LiveInk (live mirroring),
  the first half of Together (five people) and the Outro, with short crossfades.
- `src/scenes/`: every scene, each also its own composition under **Scenes** in the Studio. Join
  (start + scan the QR code), Tools (pressure, hold to snap, highlighter, laser) and Private (end
  session) are there too, for a longer cut.
- `src/lib/ink.ts`: pen strokes with [perfect-freehand](https://github.com/steveruizok/perfect-freehand)
  and the same settings as the app, drawn over time, plus where the stylus tip is on each frame.
- `src/components/`: device frames, the stylus and cursors, and mock-ups of the app's own UI in its
  dark theme (colours copied from `src/app/globals.css`; icons copied from `src/ui/icons.tsx`).

## Music

`scripts/music.mjs` composes the soundtrack: a small synthesizer with no dependencies (drums, bass,
FM electric piano, pad, marimba, glockenspiel, arpeggio, reverb and delay) that writes a WAV
sample-aligned to the video. It runs at 16 frames a beat (112.5 BPM) from "Draw it with your pen.",
and `src/Promo.tsx` cuts on that grid, so the groove starts with the pen, the tune with the title, the
arpeggio with live ink, four on the floor with the five people, and the last chord with the end
logo. Change the video's timing and the score together.

`node scripts/music.mjs --stats` prints each stem's level. The WAV is not committed; its AAC copy is.

Remotion is free for individuals and companies of up to three people; larger companies need a
[company license](https://www.remotion.pro/license).

## Agent skills

Run `npx remotion skills add` to install the Remotion Agent Skills into `.agents/skills` (linked into
`.claude/skills`), so coding agents follow Remotion's best practices when editing the video. They are
not committed; `skills-lock.json` records the versions.
