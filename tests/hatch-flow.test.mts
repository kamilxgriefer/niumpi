import assert from "node:assert/strict";
import test from "node:test";

import { hatch } from "../app/game/actions.ts";
import { profileFor } from "../app/game/config/growth.ts";
import { migrateStages } from "../app/game/persistence.ts";
import { createGameState } from "../app/game/state.ts";

const NOW = 1_700_000_000_000;

test("hatching lands on the hatchling, not on a grown creature", () => {
  const fresh = createGameState(NOW, "test");
  // Hatching is refused until the seed is ready, same as in the Seed Chamber.
  assert.equal(hatch(fresh, NOW).state.niumpi.stage, 0, "an unready seed must not hatch");

  const ready = { ...fresh, niumpi: { ...fresh.niumpi, seedProgress: 1 } };
  const { state } = hatch(ready, NOW);

  assert.equal(state.niumpi.stage, 1);
  const profile = profileFor(state.niumpi.stage);
  assert.equal(profile.name, "Hatchling");
  // The first creature a player ever sees must be visibly small and simple.
  assert.ok(profile.scale < 0.7, `hatchling scale ${profile.scale} is not small`);
  assert.equal(profile.leaves, 1);
  assert.equal(profile.arms, "none");
  assert.ok(state.niumpi.hatchedAt !== null);
});

test("an existing save keeps its real age across the inserted stage", () => {
  // Version 5 pushed every post-egg stage up by one. A save that skipped this
  // would turn a long-cared-for Bloom Form back into a newborn.
  const cases: Array<[number, number]> = [[0, 0], [1, 2], [2, 3], [3, 4], [4, 5], [5, 5]];
  for (const [before, after] of cases) {
    const migrated = migrateStages({ version: 4, niumpi: { stage: before } }) as {
      niumpi: { stage: number };
    };
    assert.equal(migrated.niumpi.stage, after, `stage ${before} should migrate to ${after}`);
  }
});

test("a save already on the current version is left alone", () => {
  const current = { version: 5, niumpi: { stage: 2 } };
  assert.deepEqual(migrateStages(current), current);
});

test("migration survives a save with nothing useful in it", () => {
  assert.doesNotThrow(() => migrateStages({}));
  assert.doesNotThrow(() => migrateStages({ version: 4 }));
  assert.doesNotThrow(() => migrateStages({ version: 4, niumpi: {} }));
});
