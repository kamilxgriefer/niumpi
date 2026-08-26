# Production sprite runtime contract

The Canvas runtime and Animation Lab consume the same version 2 manifest from
`public/assets/niumpi/v2/{variant}/manifest.json`. A clip uses one or more
lossless WebP atlas pages. Production pages are capped at 4096 x 4096; each
frame names its page and keeps the shared 512 x 512 canvas and foot anchor.

## Authored repertoire

The first production baby set truthfully supports:

- `idle`, `blink`, `look_left`, `look_right`
- `tap_reaction`, `happy`, `eat`, `hatch_complete`

Gameplay requests are keyed by the controller's stable `data-motion-token`,
the semantic clip and action prop. CSS phase changes do not replay a one-shot.
Delayed atlas loads are guarded by an intent generation, so an old tap or feed
cannot start after gameplay has moved to a newer state.

## Deliberately pending clips

Sleep, sadness, room travel, lamp use, reading, dancing, singing and rolling do
not yet have approved production performances. The runtime holds a calm idle
pose for those states instead of presenting a mismatched emotion. Ambient
blink/look is suppressed while sleeping and whenever reduced motion is active.

Before these states can be advertised as animated, each needs an authored clip,
rig proof, motion-gate review and game/Lab verification under this same
manifest contract.
