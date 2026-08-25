# Niumpi Blender character pipeline

Niumpi's living stages are real-time 3D characters authored in Blender 5.2
LTS and exported as binary glTF. The browser does not swap drawings or animate
separate DOM body pieces: Three.js evaluates Blender's keyed transforms and
Bezier interpolation on every display frame.

## Shipped character set

- Growth: `stage-1` through `stage-5`
- Final care routes: `moonveil`, `bloomheart`, `sparkleap`, `mistwander`,
  `prismatic`
- Performances: idle, blink, look, touch reaction, happy, hatch, walk, hover,
  land, sad, sleep, dance, sing, read, lamp interaction and roll

Stage one has no visible arms. Stages two through five grow from soft buds to
full paws, while the mood-leaf crown follows the canonical `1 → 2 → 3 → 5 → 5`
progression.

## Rebuild

From the repository root, with Blender available on `PATH`:

```sh
npm run animation:blender
```

The deterministic source is `tools/blender/build_niumpi_3d.py`. It regenerates
all GLB files and their manifest in `public/assets/niumpi/models`, renders the
QA portraits in `art/blender/previews`, and saves the editable
`niumpi-master.blend` scene.

The authored timeline is 24 fps, as in a character-animation package. The web
player seeks through those curves at 60 fps, so Blender supplies continuous
in-between poses rather than a limited set of visible frames.
