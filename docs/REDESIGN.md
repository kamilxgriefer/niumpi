# Niumpi v2 — foundation redesign

Why the prototype could not reach the target, and what replaced it.

## The diagnosis

Three findings, all measured against the repository rather than judged by eye.
They turned out to be one problem wearing three faces.

### 1. There was no hatchling

`app/game/config/stages.ts` defined stage 0 as `Tiny Seed` — the egg — and stage
1 as `Sprouting` at 40 care moments. Hatching set `stage: 1`. So one second
after the shell opened, the player met the mid-game form. The moment the whole
product depends on emotionally did not exist in the model.

### 2. Nothing changed size

Grepping `rig.css` for rules that changed the body across stages returned **0**.
Sixteen per-stage rules existed and every one of them addressed arms or leaves.
The body was `width: clamp(168px, 62cqw, 300px)` at every stage. A newborn and a
mature Niumpi were the same creature at the same size, wearing a different
number of leaves.

### 3. The body was a photograph of an adult

`public/niumpi-rig-body.png`, 1.4MB, used both as the body and as the mask for
every recolour layer.

This is the cause of 1 and 2 rather than a coincidence alongside them. You can
scale a bitmap, but you cannot change its proportions — and babyness is
*entirely* proportion: a large round head, almost no taper, big eyes set low in
the face. Uniform scaling of an adult produces a small adult, which is exactly
what the screenshots showed. There was no way to author a hatchling, so nobody
had. A 1MB `niumpi-baby.png` sat unused in `public/` with nowhere to go.

Two consequences worth naming:

- **Feature gating filled the first screen with locks.** Nine unlock rules, most
  day-based. A day-one player saw six padlocks, four of them as full-size tiles.
  For this audience that reads as "you may not play yet".
- **Hierarchy was flat.** Every module was a card of the same visual weight, so
  nothing was the hero — including the creature.

## The rebuild

### Growth is data

`app/game/config/growth.ts` holds one profile per stage: body geometry, face
geometry, leaf count, arm development, foot development, scale. The silhouette
is generated — a round base and two curves meeting at a tip, with a `shoulder`
value deciding how much of a ball becomes a droplet.

A stage is now a set of proportions. That makes a new stage a data change, it
makes the shape testable, and it makes an evolution route a palette rather than
a new asset.

| Stage | Name | Scale | Tip rise | Eyes : body | Leaves | Arms |
|---|---|---|---|---|---|---|
| 0 | Tiny Seed | — | — | — | 0 | none |
| 1 | **Hatchling** | 0.62 | +14 | 0.308 | 1 | none |
| 2 | Sprouting | 0.73 | +36 | 0.276 | 2 | buds |
| 3 | Bloom Form | 0.85 | +47 | 0.256 | 3 | short |
| 4 | Branching Evolution | 0.94 | +58 | 0.250 | 5 | full |
| 5 | Radiant Niumpi | 1.00 | +66 | 0.247 | 5 | full |

The eye-to-body column is the babyness curve, and it is the one that matters. It
falls monotonically, which is why a hatchling reads as young rather than as
small. Size alone does not do it — an early attempt at 0.52 scale made the
creature read as *lost in the room* rather than young, at 6.9% of the stage
area. The proportions carry the read; the scale only supports it.

### What the tests now pin

Thirteen new unit tests and two new end-to-end tests, covering things that were
previously not expressible:

- a hatchling stage exists, is reachable without a day gate, and is small
- every stage is larger than the one before
- the eye-to-body ratio falls at every step
- the silhouette draws out from a nub into a point
- no facial feature escapes the silhouette at any stage
- every stage produces a closed, finite path
- hatching lands on the hatchling, and refuses on an unready seed
- an existing save keeps its real age across the inserted stage
- a rendered hatchling is measurably smaller than a rendered adult
- a hatchling has one leaf and no arms

Two existing tests asserted the PNG rig — a leaf sized in container units, and
recolour layers held inside a bitmap mask. Both properties still matter, so they
move to their new form (a fluid rig box, and shading clipped to the generated
silhouette) rather than being dropped.

### Save migration

Version 5. Inserting the hatchling shifted every post-egg stage up by one, so a
migration maps `1→2, 2→3, 3→4, 4→5, 5→5` and leaves the egg alone. Without it a
long-cared-for Bloom Form would have come back as a newborn. The v4 key stays
readable and is not deleted until the new save lands.

### Pacing

The room and the memory seeds now open immediately, so there is somewhere to go
from the first second. The rest arrive across the week rather than the first
six days being spent looking at locks.

### The scene

The room had the right pieces and none of the light. Added, in the order light
actually works: a warm pool cast where the creature stands, a vignette that
closes the corners, and a floor that catches the pool and drops away at the
back. The soft blob under the creature became a contact shadow, because a small
hatchling floats without one.

A defect found while checking mobile: the room is painted across the whole
stage, which is right on desktop where the stats card floats over it. Stacked
into one column that put the floor and the rug behind an opaque card — 301x67px
of the scene covered. The room's grid area now ends after the creature's row.

## Measured

At 1280x720, freshly hatched:

| | Before | After |
|---|---|---|
| Rendered creature | 156px | **205px** |
| Share of the stage | 6.9% | **11.1%** |
| Locked navigation tabs | 5 | **3** |
| Horizontal overflow | none | none |

`lint 0 · typecheck 0 · unit 90/90 · build 0 · e2e 17/17`

## What is deliberately not done yet

This is the foundation, not the finished product. Still open, roughly in order:

1. **Home composition.** The panel is still a tall stack rather than the
   composed hub of the reference. This is the next piece of work.
2. **Illustrated assets.** Evolution portraits, room furniture and food items
   are still geometric stand-ins.
3. **Vertical rhythm.** The home screen runs to about 2000px on desktop and
   4000px on mobile. That is too long and wants restructuring, not trimming.
4. **The remaining scenes.** Cooking, Dream Doors, Friends and Garden have not
   been touched by this pass and still carry the old visual weighting.
