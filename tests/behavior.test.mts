import assert from "node:assert/strict";
import test from "node:test";

import { chooseLearnedRoomMoment, learnedBehaviorFor, learnedRoomLine } from "../app/game/behavior.ts";
import { gesture } from "../app/game/actions.ts";
import { createGameState } from "../app/game/state.ts";

const NOW = 1_760_000_000_000;

function fresh() {
  return createGameState(NOW, "behavior-test");
}

test("playful care makes energetic room moments more likely", () => {
  const base = fresh();
  const playful = {
    ...base,
    niumpi: { ...base.niumpi, bond: 90 },
    stats: { ...base.stats, joy: 96, energy: 92, trust: 84 },
    evolution: { ...base.evolution, vectors: { ...base.evolution.vectors, playful: 80, social: 55 } },
  };
  const profile = learnedBehaviorFor(playful, NOW);
  assert.equal(profile.disposition, "bubbly");
  assert.ok(profile.weights.dancing > profile.weights.book);
  assert.ok(profile.weights.roll > profile.weights.peek);
});

test("an upset Niumpi seeks calm contact instead of performing happiness", () => {
  const base = fresh();
  const upset = {
    ...base,
    stats: { ...base.stats, joy: 18, trust: 12, wellbeing: 20, energy: 70 },
  };
  const profile = learnedBehaviorFor(upset, NOW);
  assert.equal(profile.disposition, "withdrawn");
  assert.ok(profile.weights.lamp > profile.weights.dancing * 10);
  assert.equal(learnedRoomLine(upset, NOW, "peek", "fallback"), "Are you still nearby?");
});

test("the autonomous chooser does not immediately repeat a room moment", () => {
  const state = fresh();
  for (const random of [0, .25, .5, .75, .999]) {
    assert.notEqual(chooseLearnedRoomMoment(state, NOW, random, "book"), "book");
  }
});

test("gentle interaction becomes persisted trust and an upset pet can set a boundary", () => {
  const base = fresh();
  const comforted = gesture(base, "comfort", NOW).state;
  assert.ok(comforted.stats.trust > base.stats.trust);
  assert.ok(comforted.stats.comfort > base.stats.comfort);

  const upset = { ...base, stats: { ...base.stats, joy: 18 } };
  const refused = gesture(upset, "tickle", NOW);
  assert.equal(refused.refused, true);
  assert.equal(refused.state.stats.joy, upset.stats.joy);
});
