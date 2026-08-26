# Semantic clip motion contract

Status: implementation contract for the nine post-core sprite clips. This is
normative for Blender actions, rendered frames, manifests, the Canvas player
and Gate A/B/C. It does not claim that these clips are shipped yet.

The nine required clips are `sad`, `travel`, `sleep`, `read`, `lamp`, `dance`,
`sing`, `roll` and `cozy`. They are required for all ten approved anatomies.
`hatch_complete` remains baby-only. `window` is intentionally not a tenth new
clip: looking through a window uses `look_left` or `look_right` plus scene gaze.

## Measurement and playback rules

All clips are authored and sampled at exactly 24 fps. Frame ranges in this
document are zero-based and half-open: `[8, 20)` includes frames 8 through 19.
`durationMs` is `frameCount / 24 * 1000`; individual frame durations may use
the existing 41/42 ms distribution, but their sum must equal `durationMs`
within 1 ms.

`H` is the approved character alpha-bbox height from
`art/niumpi/variant-landmarks.json`, never the canvas height. Displacement is
measured as follows:

- `root`: maximum alpha-centroid displacement divided by `H`, before global
  alignment;
- every semantic region: maximum centroid displacement after one whole-body
  affine alignment, divided by `H`;
- a required region passes only when it moves on at least three sampled frames
  and reaches the stated displacement; a single noisy pixel is not movement;
- blink/eye closure is measured separately as visible eye-height reduction;
- leaf requirements apply to every detected primary leaf, with at least a
  two-frame phase offset between neighbouring tips;
- the foot anchor may drift by at most `0.005H` during a planted hold. Travel,
  jump, roll and deliberate airborne phases are exempt while airborne.

The displacement numbers below are minima, not targets. The animator may go
larger while preserving silhouette, anchor safety and the approved character.
Motion must remain readable when the character is about 190 px tall on a
390 px mobile viewport.

### Manifest semantics required by this contract

Every clip keeps the existing `transition` counts and `events`. The later
runtime implementation also needs these fields:

```ts
type SemanticClipPlayback = {
  priority: number;
  enterBlendFrames: number;
  exitBlendFrames: number;
  loopRange?: { startFrame: number; endFrameExclusive: number };
  exitRange?: { startFrame: number; endFrameExclusive: number };
  reducedPoseFrame: number;
};
```

Only `sleep` uses `loopRange` and `exitRange`. The runtime must not pretend the
whole 112-frame sleep clip is a seamless loop. Gameplay/economy state is
committed before playback; animation events are idempotent presentation cues
for sound, props and particles and must never consume inventory, award rewards
or toggle persistent state.

## Anatomy retargeting contract

The timeline, phase boundaries and marker frame numbers are identical across
variants. Poses are retargeted from semantic landmarks, not alpha extrema.

| Runtime / approved ID | Required anatomy handling |
| --- | --- |
| `baby` / `stage-1` | One leaf, no visible arms. Never synthesize arms from body lobes. Replace an arm beat with head lean, side-body squash, one foot, cheek/mouth and leaf acting. |
| `stage-2` | Two independently delayed leaves and two small arms. Reconstructed shoulder overlap must remain covered at maximum reach. |
| `stage-3` | Three leaves and naturally raised hands. Preserve the raised-hand silhouette; do not use the rest pose as a generic stage-2 rescale. |
| `stage-4` | Five-leaf wide fan. Tip follow-through must be staggered centre-out and remain inside the fixed canvas. |
| `stage-5` | Five leaves and broad mature arms. The low-right fifth leaf must not cut through the head on rolls or recovery. |
| `moonveil` | Five leaves plus lateral crescents. Crescents are secondary ornaments, never arms or leaves; they lag body rotation by 2–4 frames. |
| `bloomheart` | Five leaves plus heart/petal ornaments. Petals open/compress with emotion but do not replace arm or cheek motion. |
| `sparkleap` | Five leaves plus golden wisps/stars. Wisps follow through; detached stars may pulse but must not inflate root displacement or region counts. |
| `mistwander` | Three visible approved leaves, arms, water tail and bubbles. Do not invent two hidden leaves. Travel and roll use the tail as propulsion; legal tail/feet separation is not an alpha tear. |
| `prismatic` | Five leaves plus detached crystals/aurora wisps. Crystals are accessories, not crown controls; use small delayed arcs without changing their identity. |

For the five route forms, at least one authored accessory control must move in
`travel`, `dance`, `sing`, `roll` and `cozy`. It is secondary evidence and does
not replace any required core region. Mistwander additionally requires `tail`
for those five clips and for `sleep`.

## Clip summary

| Clip | Frames / duration | Playback | A / action / R | Priority | Enter / exit blend |
| --- | ---: | --- | ---: | ---: | ---: |
| `sad` | 48 / 2000 ms | one-shot | 6 / 30 / 12 | 3 | 4 / 6 |
| `travel` | 72 / 3000 ms | one-shot | 8 / 48 / 16 | 1 | 4 / 6 |
| `sleep` | 112 / 4666.667 ms | action sub-loop | 16 / 80 / 16 | 5 | 8 / 8 |
| `read` | 84 / 3500 ms | one-shot | 12 / 56 / 16 | 2 | 6 / 8 |
| `lamp` | 48 / 2000 ms | one-shot | 8 / 24 / 16 | 2 | 4 / 6 |
| `dance` | 72 / 3000 ms | one-shot | 8 / 52 / 12 | 2 | 4 / 6 |
| `sing` | 96 / 4000 ms | one-shot | 8 / 72 / 16 | 2 | 4 / 8 |
| `roll` | 60 / 2500 ms | one-shot | 8 / 36 / 16 | 2 | 4 / 8 |
| `cozy` | 72 / 3000 ms | one-shot with hold | 12 / 44 / 16 | 3 | 6 / 8 |

Priority uses the existing semantic-machine scale. A higher priority may
interrupt on the next frame through the declared blend. An equal-priority
explicit user request may replace another one-shot with a new motion token only
when the destination's clip section permits that transition; equal-priority
autonomous requests must wait. Lower priority and ambient blink/look requests
never interrupt. `sleep` persists until a forced wake or a system state change;
ordinary room actions cannot interrupt it.

## `sad`

Signature: weight drains downward, gaze breaks away, one quiet sigh, then a
small self-recovery. It must not resemble sleep (eyes never remain closed),
cozy (no curl/contact) or idle breathing.

| Frames | Phase | Required choreography |
| --- | --- | --- |
| `[0, 6)` | anticipation | Pupils notice downward first; head follows two frames later. Body stays planted. |
| `[6, 36)` | action | Body loses height, cheeks soften, mouth turns down, arms/side body draw inward, leaves droop with staggered tips. At frames 18–24 a visible sigh expands then releases the upper body. |
| `[36, 48)` | recovery | Head rises only halfway, pupils reconnect with the player, leaf tips recover last. End in an idle-compatible neutral pose, not a sudden happy pose. |

Minimum displacement: root `0.018H`; body `0.022H`; head `0.035H`; pupils
`0.025H`; mouth/cheeks `0.018H`; feet `0.010H`; every leaf tip `0.035H`;
arms `0.025H` when present. Baby instead requires side-body `0.025H` and its
single leaf `0.045H`. Route accessory minimum is `0.020H` when present.

Events: frame 0 `clip_start`; frame 6 `sad_drop`; frame 18 `sad_sigh`; frame 36
`recovery_start`; frame 47 `clip_complete`.

Transition: priority 3. May be interrupted by pet/eat/sleep/system wake, but
not by autonomous travel, read, lamp, dance, sing or roll. A mood change to
happy finishes from frame 36 rather than snapping.

Reduced motion: show frame 18 through an 8-frame, 333.333 ms three-pose blend
with root displacement capped at `0.010H`, then hold that pose for 900 ms and
crossfade to idle in 4 frames. Fire `sad_sigh` once; no leaf oscillation.

## `travel`

Signature: readable prepare → locomotion → airborne/glide beat → landing. It
may combine walk/hover/land only in this order. A translated idle bob does not
pass. Scene translation remains controller-owned; the atlas supplies in-place
body mechanics and contacts.

| Frames | Phase | Required choreography |
| --- | --- | --- |
| `[0, 8)` | anticipation | Gaze turns toward destination, body compresses opposite the travel direction, arms/tail prepare. |
| `[8, 44)` | action A | Three asymmetric locomotion pulses with alternating contacts at frames 20 and 32. Head counterbalances; leaves trail the direction change. |
| `[44, 56)` | action B | Clear hop/hover/glide apex, not another step. Feet leave the planted line or Mistwander's tail produces a visible propulsion wave. |
| `[56, 72)` | recovery | Landing/contact squash at frame 56, small overshoot, settle with gaze still on destination. |

Minimum displacement: root vertical `0.090H`; body `0.060H`; head `0.045H`;
feet `0.080H`; arms `0.060H` when present; every leaf tip `0.100H`; shadow
width/centroid equivalent `0.060H`. Baby requires alternating feet `0.070H`,
body `0.070H` and leaf `0.120H`. Mistwander replaces foot-step evidence with
tail `0.140H`, but still requires both feet to separate locally by `0.025H`.
Route accessory minimum is `0.050H`.

Events: frame 0 `clip_start`; frame 8 `travel_depart`; frames 20 and 32
`travel_pulse` with payload `{index: 1|2}`; frame 44 `travel_apex`; frame 56
`travel_land`; frame 71 `travel_arrive` and `clip_complete`.

Transition: priority 1. Explicit room switching outranks autonomous look or
travel by source rank. Any explicit care/eat/sleep/room activity may interrupt;
when interruption occurs after frame 44, play the landing blend before the
new action unless a system force transition is active.

Reduced motion: never translate, hop or roll the body. Use an 8-frame sequence
of gaze-to-destination → `0.010H` lean → destination-facing settle; fire
`travel_depart` at reduced frame 2 and `travel_arrive` at reduced frame 7.
The room may change immediately because routing is gameplay state, not an
animation event.

## `sleep`

Signature: tuck, full eye closure, low-amplitude breathing and occasional leaf
settle. It is the only persistent loop in this set.

| Frames | Phase | Required choreography |
| --- | --- | --- |
| `[0, 16)` | anticipation | Body lowers into the room surface, arms/side body tuck, pupils centre, eyelids close by frame 12. |
| `[16, 96)` | action loop | Seamless 80-frame breathing loop: inhale `[16, 36)`, hold `[36, 44)`, exhale `[44, 68)`, quiet hold `[68, 96)`. Eyes remain at least 85% closed. |
| `[96, 112)` | recovery/exit | Played only after wake/cancel. Eyes open, head leads upward, feet replant and leaves lag into neutral. |

Manifest: `loopRange = {startFrame: 16, endFrameExclusive: 96}` and
`exitRange = {startFrame: 96, endFrameExclusive: 112}`. Enter frames play once,
the action range loops, then the exit range plays once. `loop: true` alone is
not sufficient.

Minimum displacement during entry/exit: root `0.045H`; body `0.040H`; head
`0.035H`; arms `0.030H` when present; feet `0.020H`; every leaf tip `0.030H`;
shadow `0.020H`. Within the action loop, body breathing is `0.012H–0.022H`,
head is `0.008H–0.016H` and leaf tips are `0.010H–0.025H`. Eye closure must be
`>= 0.85`. Baby uses a side-body tuck. Mistwander requires a slow tail curl of
`0.035H`; bubbles may drift but do not count as breathing.

Events: frame 0 `clip_start`; frame 12 `sleep_eyes_closed`; frame 16
`sleep_loop_enter`; frames 36 and 68 `sleep_breath` with payload
`{phase: "hold"|"exhale"}`; frame 80 `sleep_murmur`; frame 95
`sleep_loop_end`; frame 96 `sleep_exit`; frame 111 `clip_complete`.

Transition: priority 5. Suppress ambient blink/look and all lower-priority
requests. Only forced system wake or a gameplay action that has already woken
Niumpi may enter the exit range. Re-entering sleep while already in its loop is
idempotent and must not replay the tuck.

Reduced motion: play an 8-frame tuck with no root translation above `0.010H`,
close the eyes fully and hold the resulting still frame indefinitely. No
breathing loop, blink or ambient gaze. Wake plays an 8-frame static-pose
crossfade to idle. Fire `sleep_eyes_closed` once.

## `read`

Signature: find/open a book, track real lines left-to-right, turn one page,
react to a discovery, then close. It must not be a long look clip.

| Frames | Phase | Required choreography |
| --- | --- | --- |
| `[0, 12)` | anticipation | Gaze finds the book; head and one hand/side-body reach on different frames. |
| `[12, 68)` | action | Book opens, pupils make three horizontal reading passes, page turns at frame 40, mouth/cheeks show a small discovery at frame 56. |
| `[68, 84)` | recovery | Book closes or leaves the crop, hand/side-body releases, eyes return to player, leaf tips settle last. |

Minimum displacement: root `0.020H`; head `0.040H`; pupils `0.035H`; body
`0.025H`; mouth/cheeks `0.015H`; arms `0.060H` when present; leaves `0.035H`;
feet `0.012H`. Baby uses head `0.050H`, side-body `0.035H`, foot `0.020H` and
leaf `0.050H` to manipulate/inspect the prop without an invented arm. Route
accessory minimum is optional for this quiet clip.

Events: frame 0 `clip_start`; frame 10 `prop_attach` with `{prop: "book"}`;
frame 12 `book_open`; frames 24, 34 and 52 `reading_pass`; frame 40
`page_turn`; frame 56 `book_discovery`; frame 68 `book_close`; frame 76
`prop_detach`; frame 83 `clip_complete`.

Transition: priority 2. Eat, pet, sad, cozy and sleep may interrupt. On
interruption after `prop_attach`, `prop_detach` must be synthesized exactly once
by cleanup even if frame 76 is not reached.

Reduced motion: 8 frames select neutral → reading key pose at source frame 34
→ neutral. Hold the reading pose 650 ms, move pupils only `0.012H`, and fire
`prop_attach`, one `reading_pass`, then `prop_detach`. No page-flip motion.

## `lamp`

Signature: notice light, reach/tap once, react to the glow, release. Persistent
`lampOn` is already changed by gameplay and must not depend on frame 20.

| Frames | Phase | Required choreography |
| --- | --- | --- |
| `[0, 8)` | anticipation | Eyes lead toward the lamp, head follows, body leans away to counterbalance. |
| `[8, 32)` | action | One hand/side-body reaches, makes contact at frame 18, pupils/cheeks visibly react to the glow at frame 20. No repeated generic tap bounce. |
| `[32, 48)` | recovery | Hand releases, head retains a brief backward glance, body and leaves settle. |

Minimum displacement: root `0.025H`; body `0.035H`; head `0.050H`; pupils
`0.040H`; mouth/cheeks `0.015H`; reaching arm `0.090H`, other arm `0.025H`;
leaves `0.050H`; feet `0.015H`. Baby requires body lean `0.055H`, head
`0.060H`, one foot `0.030H` and leaf reach/follow-through `0.070H`. Route
accessory minimum is optional.

Events: frame 0 `clip_start`; frame 8 `lamp_reach`; frame 18 `lamp_contact`;
frame 20 `lamp_glow` with payload `{presentationOnly: true}`; frame 32
`lamp_release`; frame 47 `clip_complete`.

Transition: priority 2. Sleep blocks it. Eat, pet, sad and cozy may interrupt;
cleanup releases the hand/prop target. On/off uses the same body action with
light-direction and facial response selected by an event payload, not a second
fake clip alias.

Reduced motion: 8 frames of gaze → contact pose → neutral, root capped at
`0.008H`. Fire `lamp_contact` and `lamp_glow` once at reduced frame 3. The lamp
state remains immediate and independent of playback.

## `dance`

Signature: three authored moves with different silhouettes: side step,
upward open pose and cross-body finish. Repeating happy bounce does not pass.

| Frames | Phase | Required choreography |
| --- | --- | --- |
| `[0, 8)` | anticipation | Downbeat crouch with arms/side body closing and leaf compression. |
| `[8, 24)` | action move 1 | Asymmetric side step and opposite head counter-lean. |
| `[24, 40)` | action move 2 | Upward open pose with both feet briefly light and leaves fanning outward. |
| `[40, 60)` | action move 3 | Cross-body reversal, cheek/mouth accent and planted finishing beat. |
| `[60, 72)` | recovery | Two-beat overshoot and settle, not a frozen final pose. |

Minimum displacement: root `0.110H`; body `0.090H`; head `0.065H`; arms
`0.120H` when present; feet `0.100H`; every leaf tip `0.140H`; pupils
`0.025H`; mouth/cheeks `0.020H`; shadow `0.070H`. Baby replaces arms with
side-body `0.080H`, feet `0.110H` and leaf `0.160H`. Route accessory minimum is
`0.070H`; Mistwander tail minimum is `0.150H`.

Events: frame 0 `clip_start`; frames 8, 24, 40 and 56 `dance_beat` with
`{index: 1..4}`; frame 28 `dance_airborne`; frame 44 `dance_contact`; frame 60
`recovery_start`; frame 71 `clip_complete`.

Transition: priority 2. A user-started dance may replace autonomous read/lamp/
sing/roll using source rank. Eat, pet, sad, cozy and sleep interrupt. If
interrupted during frames 24–39, use a four-frame planted safety blend before
the next grounded clip.

Reduced motion: no stepping, airborne pose or large leaf arcs. Use 8 frames of
two alternating head/cheek/hand poses, each below `0.012H`, then neutral. Fire
two `dance_beat` markers; suppress camera shake and repeated particles.

## `sing`

Signature: inhale, three visibly different mouth syllables, held note with
cheek/body resonance, breath release. It must not be dance with music notes.

| Frames | Phase | Required choreography |
| --- | --- | --- |
| `[0, 8)` | anticipation | Clear inhale: torso expands, mouth prepares, arms/side-body float outward. |
| `[8, 80)` | action | Three `nium` phrases, each with distinct mouth shapes and pupil/head phrasing. A held note at frames 56–72 lifts head and leaves while feet remain planted. |
| `[80, 96)` | recovery | Breath release, small shy smile, arms and leaf tips settle after the body. |

Minimum displacement: root `0.035H`; body `0.040H`; head `0.050H`; mouth
`0.045H`; cheeks `0.025H`; pupils `0.020H`; arms `0.060H` when present; every
leaf tip `0.070H`; feet `0.020H`. Baby uses side-body `0.040H` and leaf
`0.085H`. Route accessory minimum is `0.035H`; Mistwander tail minimum is
`0.060H`.

Events: frame 0 `clip_start`; frame 6 `sing_inhale`; frames 12, 32 and 52
`vocal_phrase` with `{index: 1..3}`; frames 16, 24, 36, 44, 56 and 68
`mouth_cue` with `{shape: "n"|"ee"|"oo"|"m"|"ah"|"hold"}`; frame 56
`sing_held_note`; frame 80 `sing_release`; frame 95 `clip_complete`.

Transition: priority 2. A user-started sing may replace autonomous read/lamp/
dance/roll. Eat, pet, sad, cozy and sleep interrupt. Audio uses the motion
token so a stale decoded clip cannot start or continue an old vocal phrase.

Reduced motion: 8-frame inhale → open-mouth key pose → smile, all planted and
below `0.010H`. Fire one `vocal_phrase`; use a quiet short sound and no
continuous note particles.

## `roll`

Signature: compress, commit to a full readable body roll, face/leaf lag, land
on feet and recover balance. A root spin of one flat image fails.

| Frames | Phase | Required choreography |
| --- | --- | --- |
| `[0, 8)` | anticipation | Deep asymmetric squash with gaze checking the roll direction. |
| `[8, 44)` | action | Launch, at least 300 degrees of readable body orientation change, face and limbs counter-lag, leaf chain follows rather than staying glued. Mistwander uses a tail-led water wheel. |
| `[44, 60)` | recovery | Feet/contact at frame 44, overshoot to the other side, blink or surprised mouth, stable planted pose by frame 59. |

Minimum displacement: root `0.150H`; body `0.120H`; head/face local
`0.090H`; arms `0.100H` when present; feet `0.110H`; every leaf tip `0.180H`;
shadow `0.080H`; mouth/cheeks `0.020H`. Baby uses body `0.140H`, feet `0.120H`
and leaf `0.200H`. Route accessory minimum is `0.100H`; Mistwander tail is
`0.200H` and may replace the 300-degree solid-body silhouette, but the motion
must still make one complete directional revolution.

Events: frame 0 `clip_start`; frame 8 `roll_launch`; frames 14 and 32
`roll_contact`; frame 26 `roll_half`; frame 44 `roll_land`; frame 48
`roll_dizzy`; frame 59 `clip_complete`.

Transition: priority 2. Eat, pet, sad, cozy and sleep interrupt. Do not cut
frames 8–43 into a non-grounded successor: either finish at frame 44 or use a
four-frame emergency landing blend. A second user roll queues after recovery;
it does not restart at frame 0 mid-rotation.

Reduced motion: replace rotation with an 8-frame side lean → cheek/mouth
reaction → planted neutral sequence, max root `0.010H` and max rotation 5°.
Fire `roll_launch` and `roll_land` once; no screen rotation.

## `cozy`

Signature: approach/contact with a soft furnishing or blanket, curl into it,
contented squeeze/sigh, then un-curl. This is not idle sway, sleep or sad.

| Frames | Phase | Required choreography |
| --- | --- | --- |
| `[0, 12)` | anticipation | Gaze finds the cozy target; body lowers and arms/side-body open for contact. |
| `[12, 56)` | action | Contact at frame 12, curl and asymmetrical squash, eyes soften but do not remain fully closed, one contented squeeze at frame 36, then a short held nest pose. |
| `[56, 72)` | recovery | Release target, restore height, glance back once, leaves and accessories settle last. |

Minimum displacement: root `0.040H`; body `0.050H`; head `0.040H`; arms
`0.065H` when present; mouth/cheeks `0.022H`; feet `0.025H`; every leaf tip
`0.045H`; eye-height reduction `0.35–0.70` but never the sleep minimum of
`0.85`. Baby requires side-body `0.055H`, feet `0.030H` and leaf `0.060H`.
Route accessory minimum is `0.035H`; Mistwander tail curl is `0.070H`.

Events: frame 0 `clip_start`; frame 10 `prop_attach` with
`{prop: "cozy-target"}`; frame 12 `cozy_contact`; frame 24 `cozy_curl`; frame
36 `cozy_sigh`; frame 52 `cozy_hold_end`; frame 56 `cozy_release`; frame 64
`prop_detach`; frame 71 `clip_complete`.

Transition: priority 3. Pet, eat and sleep may interrupt; dance/sing/read/lamp/
roll/travel do not. Prop cleanup is mandatory on interruption. Future gameplay
mapping changes cozy furniture and the bedroom `rest` activity from legacy
`sway → idle` to semantic `cozy`; until then this clip is not reachable.

Reduced motion: 8 frames neutral → curled key pose from source frame 36 →
neutral, max root `0.008H`. Hold 700 ms with a static soft-eye pose, fire
`cozy_contact` and `cozy_sigh` once, and never enter the sleep loop.

## Required implementation and verifier extension

No code in this section is implemented by this document. The implementation
must land as one coherent change so a semantic name is never exposed before
its atlas exists for the selected variant.

1. Extend the sprite clip union and manifest validator with all nine names and
   the playback fields above. Baby then requires core 8 + 9; every other
   anatomy requires core 7 + 9.
2. Add semantic mappings without idle aliases: `sad→sad`,
   `walk|hover|land|wander|returning→travel`, `sleep|asleep→sleep`,
   `book→read`, `lamp→lamp`, `dancing→dance`, `singing→sing`, `roll→roll`, and
   the new `cozy→cozy`. `window` remains directional look.
3. Add `cozy` to `NiumpiBehavior`, the controller adapter and room/furniture
   action results. Align behavior phase times to the exact frame boundaries in
   this document. Do not let animation events mutate game state.
4. Gate A reads a per-clip feature table derived from this document and the
   variant topology. Stage-1 must not fail for absent arm curves; Mistwander
   must fail if a required tail curve is absent; route ornaments cannot satisfy
   arm/leaf requirements.
5. Gate B checks exact frame count, fps, phase ranges, marker names/frames,
   normalized displacement per required region, planted-anchor drift, sleep
   loop seam and closure, travel phase readability, and prop attach/detach
   balance. Metrics use approved `H` and semantic landmarks.
6. Add an anti-alias gate. For each variant, compare root-aligned regional
   displacement trajectories and phase energy across the nine clips. A pair
   fails when both its regional-motion cosine similarity exceeds 0.94 and its
   phase-energy correlation exceeds 0.92 after time normalization. Explicitly
   assert these pairs differ: `sad/sleep`, `sad/cozy`, `travel/dance`,
   `dance/roll`, `dance/sing`, `read/look_left`, `lamp/tap_reaction` and
   `cozy/idle`.
7. Gate C keeps alpha lossless and the current codec limits. Validate unique
   rectangles/pages for all new clips and load their pages on demand; startup
   must not decode nine clips for ten variants.
8. Runtime tests cover exact semantic mapping, one-shot queueing, stale preload
   rejection, sleep enter/sub-loop/exit, forced wake, emergency landing,
   interruption cleanup, marker idempotency, reduced-motion key poses and
   suppression of ambient blink/look during sleep.
9. Visual E2E runs real Home and Room triggers at desktop and 390 px mobile for
   every anatomy. It must capture at least anticipation, peak action and
   recovery, and prove the production game uses the same atlas/clip as the Lab.

Acceptance is all-or-nothing per variant: a missing clip, an idle fallback, a
duplicated motion fingerprint, a missing required anatomy region, a broken
sleep sub-loop, or a gameplay side effect driven by a marker is a failure.
