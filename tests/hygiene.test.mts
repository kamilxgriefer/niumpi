import test from "node:test";
import assert from "node:assert/strict";

import { washNiumpi } from "../app/game/actions.ts";
import {
  CLEANLINESS_FLOOR, cleanlinessAfter, hygieneCondition, soilNiumpi, visibleDirt,
} from "../app/game/hygiene.ts";
import { createGameState, reconcile, SAVE_VERSION, STORAGE_KEY } from "../app/game/state.ts";
import { applyElapsed, tick } from "../app/game/stats.ts";

const NOW = Date.UTC(2026, 7, 24, 12);
const HOUR = 3_600_000;

function hatched() {
  const state = createGameState(NOW, "hygiene-test");
  return {
    ...state,
    niumpi: { ...state.niumpi, hatchedAt: NOW, stage: 2 as const },
  };
}

test("hygiene ships in a new save version and a new Niumpi starts clean", () => {
  const state = createGameState(NOW, "fresh");
  assert.equal(SAVE_VERSION, 6);
  assert.equal(STORAGE_KEY, "niumpi-save-v6");
  assert.equal(state.niumpi.cleanliness, 100);
  assert.equal(state.niumpi.lastWashedAt, null);
});

test("older saves migrate cleanly without punishing a returning player", () => {
  const old = structuredClone(hatched());
  old.version = 5;
  const oldCore = old.niumpi as Partial<typeof old.niumpi>;
  delete oldCore.cleanliness;
  delete oldCore.lastWashedAt;
  delete oldCore.lastWashTool;
  const migrated = reconcile(old, NOW + HOUR);
  assert.equal(migrated.version, 6);
  assert.equal(migrated.niumpi.cleanliness, 100);
  assert.equal(migrated.niumpi.lastWashTool, null);
});

test("cleanliness drifts gently while active and respects the holiday-safe floor", () => {
  const state = hatched();
  const afterDay = applyElapsed(state, NOW + 24 * HOUR).state;
  assert.ok(afterDay.niumpi.cleanliness < 70);
  assert.ok(afterDay.niumpi.cleanliness > CLEANLINESS_FLOOR);
  assert.ok(cleanlinessAfter(100, 500, false) > CLEANLINESS_FLOOR, "a long absence is capped");
  assert.equal(cleanlinessAfter(30, 500, false), CLEANLINESS_FLOOR);

  const watched = tick(state, 6 * 3600);
  assert.ok(watched.niumpi.cleanliness < state.niumpi.cleanliness);
});

test("sleep slows hygiene decay and an unhatched seed does not get dirty", () => {
  const awake = cleanlinessAfter(90, 10, false);
  const asleep = cleanlinessAfter(90, 10, true);
  assert.ok(asleep > awake);
  const seed = createGameState(NOW, "seed");
  assert.equal(tick(seed, 24 * 3600).niumpi.cleanliness, 100);
});

test("sponge and brush both clean, remember the tool and count care", () => {
  const state = { ...hatched(), niumpi: { ...hatched().niumpi, cleanliness: 38 } };
  const sponge = washNiumpi(state, "sponge", NOW + 1);
  const brush = washNiumpi(state, "brush", NOW + 2);
  assert.equal(sponge.state.niumpi.cleanliness, 84);
  assert.equal(sponge.state.niumpi.lastWashTool, "sponge");
  assert.equal(brush.state.niumpi.cleanliness, 70);
  assert.equal(brush.state.niumpi.lastWashTool, "brush");
  assert.ok(sponge.state.niumpi.careMoments > state.niumpi.careMoments);
  assert.equal(sponge.behavior, "brushing");
});

test("washing a sparkling Niumpi is refused and cannot be farmed", () => {
  const state = hatched();
  const result = washNiumpi(state, "sponge", NOW + 1);
  assert.equal(result.refused, true);
  assert.equal(result.state, state);
});

test("visible dirt starts late, scales smoothly and activity can add a little mess", () => {
  const state = { ...hatched(), niumpi: { ...hatched().niumpi, cleanliness: 65 } };
  const soiled = soilNiumpi(state, 4);
  assert.equal(soiled.niumpi.cleanliness, 61);
  assert.equal(visibleDirt(90), 0);
  assert.ok(visibleDirt(50) > 0);
  assert.equal(visibleDirt(CLEANLINESS_FLOOR), 1);
  assert.equal(hygieneCondition(95), "sparkling");
  assert.equal(hygieneCondition(30), "messy");
});
