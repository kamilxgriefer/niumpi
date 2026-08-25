# Niumpi Blender character pipeline

## Reference-locked v2

The production rig now uses `build_niumpi_reference_rig.py`. Each approved
stage/form illustration is mapped to one dense seamless mesh and animated with
Blender shape keys. This deliberately preserves the exact pearl-cloud face,
silhouette, aurora leaves and painterly materials instead of rebuilding them
from visible sphere primitives.

The editable source is `niumpi-reference-rig-v2.blend`. The generated model
sheet in `references/stage-1-turnaround-v2.png` is the art-direction authority;
the old procedural model is retained only as historical source and is not used
by the game build.

Niumpi's living stages are real-time reference-textured characters authored in
Blender 5.2 LTS and exported as binary glTF. The browser does not swap drawings
or animate separate DOM body pieces: Three.js evaluates Blender's keyed mesh
deformations and Bezier interpolation on every display frame.

## Shipped character set

- Growth: `stage-1` through `stage-5`
- Final care routes: `moonveil`, `bloomheart`, `sparkleap`, `mistwander`,
  `prismatic`
- Performances: idle, blink, look, touch reaction, happy, normal eating,
  favourite-food eating, hatch, walk, hover, land, sad, sleep, dance, sing,
  read, lamp interaction and roll

The approved stage art carries the canonical growth language: stage one has no
visible arms, later stages grow soft paws, and the mood-leaf crown follows the
canonical `1 → 2 → 3 → 5 → 5` progression.

## Rebuild

From the repository root, with Blender available on `PATH`:

```sh
npm run animation:blender
```

The deterministic source is `tools/blender/build_niumpi_reference_rig.py`. It regenerates
all GLB files and their manifest in `public/assets/niumpi/models`, renders the
QA portraits in `art/blender/previews-v2`, and saves the editable
`niumpi-reference-rig-v2.blend` scene.

The authored timeline is 24 fps, as in a character-animation package. The web
player seeks through those curves at 60 fps, so Blender supplies continuous
in-between poses rather than a limited set of visible frames.
