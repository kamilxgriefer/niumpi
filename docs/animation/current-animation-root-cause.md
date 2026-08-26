# Niumpi animation root cause

## What was traced

The production path before the v2 sprite work was:

1. `public/assets/niumpi/stages/stage-1.webp` supplied the approved art.
2. `tools/blender/build_niumpi_reference_rig.py` mapped the complete painting to
   one dense mesh and exported `public/assets/niumpi/models/stage-1.glb`.
3. `app/ui/niumpi/NiumpiFrameCanvas.tsx` played the GLB performance.

Git history confirms that commit `b00492d` previously shipped full-frame
atlases, but commit `1e72038` removed those atlases and their manifest when the
GLB path replaced them. Commit `985c8fb` improved reference fidelity, but its
own builder and `art/blender/README.md` still explicitly describe one dense,
seamless artwork mesh.

## Exact failure boundary

Motion was not lost by an atlas packer or by repeated output paths: the current
production path had no production sprite render/atlas stage at all. The loss
happened at rig construction. The approved painting became one 32 x 32 grid
(1,089 vertices) with no armature, skin, modifier, constraint or driver. It had
only a root transform and nine broad whole-art shape keys. The historical
master contained 67 objects, 15 controls and 34 varying non-root channels, so
the fidelity rewrite removed the separation that made local acting possible.
It did not provide independently controllable arms, feet, pupils, eyelids,
mouth, cheeks and leaf-chain regions from which strong local acting could be
authored and verified. Runtime timing metadata could not create motion that did
not exist independently in the source rig.

The GLB exporter was not the loss point. Round-trip inspection preserved all
nine morph curves and their sampled keys; the production files consistently
contained one mesh and the expected animation channels. The browser therefore
reproduced the limited billboard deformation it was given.

The earlier frame pipeline also did not satisfy the new gate: it rendered much
shorter clips (for example 48 idle frames and 8 blink frames), had no three-bite
`eat` performance, and those public assets were deleted by the GLB migration.

During the replacement work a second, independent authoring defect was caught
before release: the first Blender action pass wrote the animation-facing
vertical value into each bone's local Z axis and rotations into local Y. For
this armature those axes point mostly into camera depth, so large keyframe
numbers rendered as only 1.5-2.8 pixels of centroid travel on a 512 px canvas.
The corrected action API maps vertical translation to the visible local Y axis
and in-plane rotation to local Z. That change is what makes anticipation,
jumps, landings, limb gestures and leaf follow-through visibly readable.

## Fix boundary

The v2 pipeline partitions the approved art into functional render objects,
adds pearl underlays where separated parts reveal the body, drives those parts
from a real armature plus shape controls, renders every timeline frame after
`scene.frame_set()` and dependency-graph evaluation, verifies hashes and local
regional pixel changes, and only then packs lossless WebP atlases. The source
art remains the visual authority; the structural change is the addition of
independent controls and an auditable render boundary.
