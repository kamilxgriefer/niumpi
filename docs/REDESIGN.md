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

## Second pass: the scenes the first pass had not reached

A parallel audit read Home and the four untouched scenes against the reference
direction, and every finding was verified against the source before being acted
on. One was rejected: deleting Home's activity tiles would have orphaned Cooking
and Dream Doors, which have no navigation entry of their own.

Most of what it found was not visual.

**Two animations named keyframe sets that did not exist.** `mote-rise` drove the
morning motes and the seed dust — both rendered as motionless dots. And the rig
rewrite above had taken `rig-hatch` and `aura-breathe` with it, so the moment
the shell opens and the hatchling appears had been playing with no animation at
all since that commit. A test now walks every stylesheet and fails on any
animation whose keyframes are missing; it found the two that had been broken by
this very redesign.

**The garden was a day-one dead end.** `plantSeed` requires a `seed:<plantId>`
key and the starter inventory had none, so a first visit opened onto a grid of
disabled cards with no way to obtain the thing being asked for.

**Recipes rendered at 23% opacity.** A disabled card at `.42` inside an unknown
list item at `.55` multiplies, and 13 of 15 recipes sat below readable contrast.

**Cooking could not show its own rule.** The mixing slots sat at 151px on a
phone and the ingredient source at 666px, so "combine two or three things" was
never visible happening. A full bench also swallowed taps in silence.

**Dream Doors had its order backwards twice.** The morning story — the payoff
for waiting a night — rendered after a freshly reset door grid, about a screen
and a half down. And the carry chips sat below the doors, so the choice a player
makes first was behind an irreversible tap.

**Friends had no panel layer**, which left a developer disclaimer as the
brightest element on the screen, and its neighbours were one flat glyph
recoloured — every neighbour the same creature.

Rendering neighbours from the real geometry then exposed a bug in the rebuilt
body: gradient and clip ids were literals. SVG ids are document-global, so a
page with more than one Niumpi resolved every `url(#...)` to whichever instance
rendered first, and the whole street wore one palette. Ids are per-instance now.
A second instance of the same class: the default coral palette was declared on
`.rig-root` rather than at the root, so any body drawn outside the full rig
resolved its gradient stops to nothing and painted a black silhouette.

### Home

The hero panel was eight stacked blocks, four of them — shared moments, growth,
discovery, vibe — sitting between the creature and the controls you use on it.
Measured: 515px of reading between looking at your pet and doing something with
it. They are readouts that link elsewhere, not actions, so they follow the care
loop instead of splitting it, as one compact strip.

Home was also rendering the creature smaller than the secondary Niumpi tab
does — 330px against 420px — because only `.companion-hero` carried an override.
A hero screen with the smaller hero.

| | Before | After |
|---|---|---|
| Creature to snack bar | 515px | **12px** |
| Creature on Home (hatchling) | 205px | **248px** |
| Share of the stage | 11.1% | **14.5%** |
| Activity tiles (375px) | 660px | **192px** |
| Status readouts (375px) | 502px | **347px** |
| Page height (375px) | 4135px | **3667px** |

`lint 0 · typecheck 0 · unit 94/94 · build 0 · e2e 17/17`

## What is deliberately not done yet

1. **Illustrated assets.** Evolution portraits, room furniture and food items
   are still geometric stand-ins rather than drawn art.
2. **Vertical rhythm.** Home is down to 3667px on a phone from 4135px, but that
   is still four screens. The remaining length is the five side panels, and
   shortening them is an information-architecture decision rather than a trim.
3. **Friends is still a closed world.** Visits are recorded and never read, and
   the whole neighbourhood is a function of the player's own save.
4. **Garden and Dream Doors have no hero.** Both are still flat grids of
   same-weight cards with the creature absent.
