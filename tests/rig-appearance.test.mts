import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../app/game/state.ts";
import type { GameState, RouteId, StageId } from "../app/game/types.ts";
import { resolveRigAppearance } from "../app/rig/appearance.ts";

const ROUTES: RouteId[] = ["moonveil", "bloomheart", "sparkleap", "mistwander", "prismatic"];
const STAGES: StageId[] = [1, 2, 3, 4, 5];

function atStage(stage: StageId, route: RouteId): GameState {
  const state = createGameState(1_000, `rig-${stage}-${route}`);
  return {
    ...state,
    niumpi: { ...state.niumpi, stage },
    evolution: { ...state.evolution, lockedRoute: route },
    phenotype: { ...state.phenotype, morphology: route },
  };
}

test("all five stages reveal each route only at the intended phase", () => {
  for (const route of ROUTES) {
    for (const stage of STAGES) {
      const appearance = resolveRigAppearance(atStage(stage, route));
      assert.equal(appearance.stage, stage, `${route} stage ${stage}`);
      assert.equal(appearance.lockedRoute, route, `${route} stage ${stage} keeps its saved lock`);

      if (stage <= 2) {
        assert.equal(appearance.phase, "neutral");
        assert.equal(appearance.form, "neutral");
        assert.equal(appearance.formBlend, 0);
      } else if (stage === 3) {
        assert.equal(appearance.phase, "surface");
        assert.equal(appearance.form, "neutral", "surface hints must not replace the skeleton");
        assert.equal(appearance.formBlend, 0);
      } else if (stage === 4) {
        assert.equal(appearance.phase, "branch");
        assert.equal(appearance.form, route);
        assert.equal(appearance.formBlend, 0.55);
        assert.ok(appearance.formGeometry.appendages.length > 0);
      } else {
        assert.equal(appearance.phase, "full");
        assert.equal(appearance.form, route);
        assert.equal(appearance.formBlend, 1);
        assert.deepEqual(appearance.palette.form, appearance.formGeometry.palette);
      }
    }
  }
});

test("leaf progression is exactly 1, 2, 3, 5, 5", () => {
  const leaves = STAGES.map((stage) => resolveRigAppearance(atStage(stage, "moonveil")).geometry.leaves.count);
  assert.deepEqual(leaves, [1, 2, 3, 5, 5]);
});

test("arms grow from absent through buds and short arms to full reach", () => {
  const arms = STAGES.map((stage) => {
    const geometry = resolveRigAppearance(atStage(stage, "bloomheart")).geometry;
    return [geometry.arms.growth, geometry.arms.reach] as const;
  });
  assert.deepEqual(arms.map(([growth]) => growth), ["none", "buds", "short", "full", "full"]);
  for (let index = 1; index < arms.length; index += 1) {
    assert.ok(arms[index][1] >= arms[index - 1][1], `arm reach regressed at stage ${STAGES[index]}`);
  }
  assert.equal(arms[0][1], 0);
  assert.equal(arms.at(-1)?.[1], 1);
});

test("diet and trait hints wait for stage three and never choose a branch", () => {
  const base = createGameState(1_000, "surface-hints");
  const shaped: GameState = {
    ...base,
    phenotype: {
      ...base.phenotype,
      morphology: "sparkleap",
      tints: { rose: 6 },
      markings: ["legacy-mark"],
    },
    personality: { ...base.personality, traits: { singer: 2 } },
    evolution: {
      ...base.evolution,
      lockedRoute: null,
      vectors: { ...base.evolution.vectors, playful: 100 },
    },
  };

  for (const stage of [1, 2] as StageId[]) {
    const appearance = resolveRigAppearance({ ...shaped, niumpi: { ...shaped.niumpi, stage } });
    assert.deepEqual(appearance.surfaceHints, []);
    assert.deepEqual(appearance.markings, []);
    assert.equal(appearance.form, "neutral");
  }

  const bloom = resolveRigAppearance({ ...shaped, niumpi: { ...shaped.niumpi, stage: 3 } });
  assert.equal(bloom.form, "neutral", "a high live vector must not cause morph flapping");
  assert.deepEqual(bloom.markings, ["legacy-mark", "rose-hearts"]);
  assert.ok(bloom.surfaceHints.some((hint) => hint.kind === "diet" && hint.id === "rose"));
  assert.ok(bloom.surfaceHints.some((hint) => hint.kind === "trait" && hint.id === "singer"));
});

test("resolver is read-only and a locked route outranks stale saved morphology", () => {
  const state = atStage(5, "mistwander");
  state.phenotype.morphology = "sparkleap";
  const before = structuredClone(state);
  const appearance = resolveRigAppearance(state);
  assert.equal(appearance.form, "mistwander");
  assert.deepEqual(state, before);
});
