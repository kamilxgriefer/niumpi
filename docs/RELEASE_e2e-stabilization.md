# Release note — e2e harness and state bootstrap sequencing

Stabilisation pass closing out the visual-polish branch. **No game rules, save
schema, persistence, sound model or scene content changed.** One deliberate UI
change is described below, because validation proved it was a defect.

## Problem

The e2e suite failed unpredictably. Symptoms reported from the outside looked
like four separate faults — HTTP 500s while rendering assets, `.scene-host`
timeouts, unstable `Pet Mango` / `Feed`, and sidebar clicks hanging on a plainly
visible button. Under parallel workers the suite scored **0/3 green**.

## Root causes

Three, each measured rather than inferred. None was an asset, routing or
base-path fault.

**1. The suite ran against the dev server.** `vinext dev` compiles on demand and
competes for CPU with the browsers driving it. It logged
`GET /?scene=home 500 in 61.3s (render: 46.7s)` — a render starved of CPU. The
"500 on assets" symptom was this, not a broken endpoint.

**2. The save fixture raced the game's own boot.** Both helpers navigated once,
wrote `localStorage` with `page.evaluate`, then navigated again. The game boots
on that first navigation and persists its own state, so whichever wrote last
won. When the game won, `hatchedAt` was `null` and the router sent the test to
the Seed Chamber — surfacing as a confusing "`.rig-root` not found" rather than
anything about saves. A DOM snapshot from a failing run showed the Seed Chamber,
which pinned it.

**3. The scene container animated its own position.** `SceneRouter` slid
`.scene-host` by 16px on mount, and remounted it when `ready` flipped and the
active scene changed — so the slide replayed exactly as the first controls
became clickable. Measured 13.7px of travel still in progress at the instant a
button first appears. Playwright reported `element is not stable`; a player
would experience a button sliding out from under a finger.

A fourth, smaller factor: Playwright's default 30s test timeout sat between the
warm-server worst case (21.3s) and the cold-server one (52.7s), so the suite
passed or failed on server warmth alone.

## Solution

- Playwright builds and serves the production output. `PW_DEV_SERVER=1` keeps
  the fast dev loop for debugging a single test.
- Both helpers seed through `addInitScript`, which runs ahead of page scripts,
  so there is no ordering left to lose. A sentinel key keeps it idempotent —
  init scripts re-run on every navigation, and without the guard a reload would
  wipe what the game had just saved and make the persistence tests meaningless.
- `openScene` asserts it did not land on the Seed Chamber, so a future
  regression of this kind names itself instead of failing on a missing element.
- **UI change:** the scene container no longer animates. This is the one
  functional change in the pass, and it is a usability fix as much as a test
  fix — controls are now motionless from the first frame they exist.
- Test timeout set to 60s, sized from the measurements above. No assertion,
  wait or retry was relaxed; under CI (`workers: 1`) these tests finish in
  single digits and never approach it.

## Evidence

| Check | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0, 0 errors |
| `npm run test:unit` | exit 0 — 77 passed, 0 failed |
| `npm run build` | exit 0 |
| `test:e2e` targeted (`layout.spec.ts`) | exit 0 — 8 passed |
| `test:e2e` targeted (`niumpi.spec.ts`) | exit 0 — 7 passed |
| `test:e2e` full, parallel, cold server ×4 | **4/4 green** — 15 passed each |
| `test:e2e` full, `CI=1` (workers: 1) | exit 0 — 15 passed |
| `npm run lint` after Playwright | exit 0 |

Flake rate on the full suite in parallel: **0/3 green before, 4/4 after.**

Button stability at the moment a test clicks, sampled over 90 frames:

| CPU throttle | Before | After |
|---|---|---|
| ×1 | 13.7px travel | **0px** |
| ×4 | 10.9px travel | **0px** |
| ×8 | 16.0px travel | **0px** |

## Risks removed

- Clicks landing on a moving target — for players as well as tests.
- Tests silently measuring a different scene than the one under test.
- Suite outcome depending on dev-server warmth and machine load.
- A reload in a test wiping the state whose persistence it was asserting.

## Verified not present

`0` real HTTP 5xx and `0` browser console errors across the final runs. The only
`500` in the logs is Vite's `Some chunks are larger than 500 kB` build warning.
