# Niumpi full-frame animation

Niumpi's living stages use complete painted frames rendered on a Canvas 2D
surface. The runtime never rebuilds the character from separate DOM eyes,
limbs, leaves or cloud pieces, so a frame can contain only one coherent face.

## Source and generated assets

- Approved identity art: `public/assets/niumpi/stages/` and
  `public/assets/niumpi/forms/`.
- Authored 12-pose sheets: `artifacts/niumpi-frame-animation/pose-sheets/`.
- Logical preparation masks: `artifacts/niumpi-frame-animation/layers/`.
- Inspectable source frames: `artifacts/niumpi-frame-animation/frames/`.
- Runtime atlases and metadata: `public/assets/niumpi/frame-animation/`.

The source set covers five growth stages and the five final care routes:
Moonveil, Bloomheart, Sparkleap, Mistwander and Prismatic.

## Clips

All clips have a 24 FPS timeline. Every variant contains 164 frames:

| Clip | Frames | Behaviour |
| --- | ---: | --- |
| `idle` | 48 | looping breath and weight shift |
| `blink` | 8 | full eye closure and reopening |
| `look` | 16 | brief directional attention |
| `tap_reaction` | 24 | anticipatory recoil, delight and recovery |
| `happy` | 32 | larger joyful gesture |
| `hatch_complete` | 36 | first entrance after hatching |

`NiumpiFrameMachine` owns state priority and clip completion. Frame selection
uses elapsed time, not React render count, so a slow frame skips forward rather
than slowing the character down. `ENTERING` and touch reactions cannot be
interrupted by a low-priority blink or look request.

## Rebuilding

From the repository root:

```sh
python3 -m venv .venv-animation
.venv-animation/bin/pip install -r scripts/requirements-animation.txt
npm run animation:build
```

The generator chroma-keys each full-character pose, registers its contact
plane, creates motion-compensated in-betweens, writes individually inspectable
WebP frames, and packs one atlas per variant. It deliberately selects one
motion-warped drawing at a time instead of cross-fading complete characters;
cross-fading would create duplicate pupils, mouths and leaves.

## Runtime and QA

`NiumpiFrameCanvas` preloads and decodes only the current evolution atlas. The
approved static portrait remains visible until the atlas is ready; reduced
motion keeps that calm portrait instead of playing the timeline.

Open `/?animation-lab=1` in development to inspect every variant, clip, frame
counter and light/dark background without changing a save. Automated coverage
lives in `tests/frame-animation.test.mts` and
`tests/e2e/frame-animation.spec.ts`.

## Known boundary

This is a production 2D full-frame system, not a 3D Unreal model. Future art
revisions should be made in the pose sheets and regenerated, rather than by
adding CSS transforms to the flattened runtime character.
