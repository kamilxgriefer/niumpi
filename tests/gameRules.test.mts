import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import { createGameState, migrateLegacy, reconcile, SAVE_VERSION, vectorIds } from "../app/game/state.ts";
import { applyElapsed, clampStat, LOW_STAT, STAT_FLOOR, tick, wellbeing } from "../app/game/stats.ts";
import { diminishFactor, recordCare, stageProgress, topVectors, vectorTotal } from "../app/game/care.ts";
import { meetsPrismatic, phenotypeFor, routeOutlook, scoreRoutes, TINT_THRESHOLD, addTint } from "../app/game/evolution.ts";
import { matchRecipe, recipes } from "../app/game/config/recipes.ts";
import { buyItem, canSpend, grant, spendIngredients } from "../app/game/inventory.ts";
import { alreadyClaimed, markClaimed, pruneClaims } from "../app/game/persistence.ts";
import { claimDream, dreamReady, startDream } from "../app/game/dreams.ts";
import { harvest, plantSeed, viewPlot, water } from "../app/game/garden.ts";
import {
  achievementProgress, claimAchievement, claimMission, claimWeeklyMission,
  progressMissions, rollMissions,
} from "../app/game/missions.ts";
import { awardMemory } from "../app/game/memories.ts";
import { feed, gesture, seedAction, hatch, cook } from "../app/game/actions.ts";
import { moodFor } from "../app/game/mood.ts";
import { unlockFor, settleUnlocks } from "../app/game/unlocks.ts";
import { seedQuestions } from "../app/game/config/seeds.ts";
import { traits } from "../app/game/config/traits.ts";
import { dialogue } from "../app/game/config/dialogue.ts";
import { shopItems } from "../app/game/config/items.ts";
import { plants } from "../app/game/config/plants.ts";
import {
  achievementMap, achievementTemplates, missionTemplates,
  weeklyMissionMap, weeklyMissionTemplates,
} from "../app/game/config/missions.ts";
import { dreamOutcomes } from "../app/game/config/dreams.ts";
import { exploreOutcomes } from "../app/game/config/explore.ts";
import { weathers } from "../app/game/config/weather.ts";
import { memoryTemplates } from "../app/game/config/memories.ts";
import { minigames } from "../app/game/config/minigames.ts";
import { routes } from "../app/game/config/routes.ts";
import { ingredients } from "../app/game/config/foods.ts";
import { hashSeed, makeRng } from "../app/game/rng.ts";

const NOW = 1_760_000_000_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

function fresh() {
  return createGameState(NOW, "test-save");
}

/* ------------------------------------------------------------- stats ----- */

test("needs decay while away but never fall to a crisis", () => {
  const state = { ...fresh(), profile: { ...fresh().profile, lastSeenAt: NOW - 12 * HOUR } };
  const { state: caught, report } = applyElapsed(state, NOW);
  assert.ok(caught.stats.fullness < state.stats.fullness, "fullness should drop");
  assert.ok(caught.stats.fullness >= STAT_FLOOR, "fullness must respect the floor");
  assert.equal(Math.round(report.hours), 12);
});

test("a very long absence stops charging decay after two days", () => {
  const base = fresh();
  const twoDays = applyElapsed({ ...base, profile: { ...base.profile, lastSeenAt: NOW - 2 * DAY } }, NOW);
  const twoMonths = applyElapsed({ ...base, profile: { ...base.profile, lastSeenAt: NOW - 60 * DAY } }, NOW);
  assert.deepEqual(twoMonths.state.stats.fullness, twoDays.state.stats.fullness);
  assert.equal(twoMonths.report.longAbsence, true);
});

test("sleeping restores energy instead of draining it", () => {
  const base = fresh();
  const sleeping = {
    ...base,
    niumpi: { ...base.niumpi, sleeping: true },
    stats: { ...base.stats, energy: 30 },
    profile: { ...base.profile, lastSeenAt: NOW - 4 * HOUR },
  };
  const { state: caught } = applyElapsed(sleeping, NOW);
  assert.ok(caught.stats.energy > 30, "sleep should restore energy");
});

test("stats stay inside their range at both extremes", () => {
  for (const value of [-500, 0, 50, 100, 900, Number.NaN]) {
    const clamped = clampStat(value);
    assert.ok(clamped >= STAT_FLOOR && clamped <= 100, `out of range for ${value}`);
  }
});

test("the in-session tick moves needs in the same direction as offline decay", () => {
  const before = fresh();
  const after = tick(before, 3600);
  assert.ok(after.stats.fullness < before.stats.fullness);
  assert.ok(wellbeing(after.stats) <= wellbeing(before.stats));
});

/* ------------------------------------------------- care and diminishing --- */

test("repeating one action loses value while variety keeps it", () => {
  assert.equal(diminishFactor(0), 1);
  assert.ok(diminishFactor(1) < diminishFactor(0));
  assert.ok(diminishFactor(2) < diminishFactor(1));
  assert.equal(diminishFactor(9), 0, "spam eventually earns nothing");
});

test("the fourth identical pet is worth far less than the first", () => {
  let state = fresh();
  const values: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const result = recordCare(state, "pet", NOW, { loving: 2 });
    values.push(result.value);
    state = result.state;
  }
  assert.ok(values[0] > values[1] && values[1] > values[2] && values[2] > values[3]);
  assert.ok(values[3] < values[0] * 0.2);
});

test("variety across different actions earns a bond bonus", () => {
  let repeat = fresh();
  let varied = fresh();
  for (const _ of [0, 1, 2, 3]) {
    void _;
    repeat = recordCare(repeat, "pet", NOW, {}).state;
  }
  for (const action of ["pet", "hug", "brush", "sing"] as const) {
    varied = recordCare(varied, action, NOW, {}).state;
  }
  assert.ok(varied.niumpi.bond > repeat.niumpi.bond, "variety should out-earn repetition");
});

test("bond never exceeds its ceiling", () => {
  let state = { ...fresh(), niumpi: { ...fresh().niumpi, bond: 99 } };
  for (const action of ["pet", "hug", "dance", "sing", "comfort"] as const) {
    state = recordCare(state, action, NOW, {}).state;
  }
  assert.ok(state.niumpi.bond <= 100);
});

test("stage progress reports a fillable percentage and never leaves 0-100", () => {
  const base = fresh();
  for (const careMoments of [0, 5, 39, 40, 300, 5000]) {
    const progress = stageProgress({ ...base, niumpi: { ...base.niumpi, careMoments, stage: 1 } }, NOW + 3 * DAY);
    assert.ok(progress.percent >= 0 && progress.percent <= 100, `out of range at ${careMoments}`);
  }
});

/* --------------------------------------------------------- evolution ----- */

test("route scoring is deterministic for the same care", () => {
  const state = fresh();
  const loved = { ...state, evolution: { ...state.evolution, vectors: { ...state.evolution.vectors, loving: 40, social: 20, nature: 18 } } };
  assert.equal(scoreRoutes(loved)[0].id, scoreRoutes(loved)[0].id);
  assert.equal(scoreRoutes(loved)[0].id, "bloomheart");
});

test("each care style points at its own route", () => {
  const cases: Array<[string, Record<string, number>]> = [
    ["moonveil", { dream: 40, calm: 36 }],
    ["bloomheart", { loving: 44, social: 24 }],
    ["sparkleap", { playful: 42, brave: 38 }],
    ["mistwander", { curious: 46, nature: 22 }],
  ];
  for (const [expected, vectors] of cases) {
    const state = fresh();
    const shaped = { ...state, evolution: { ...state.evolution, vectors: { ...state.evolution.vectors, ...vectors } } };
    assert.equal(routeOutlook(shaped).leading, expected, `${expected} should lead`);
  }
});

test("prismatic needs balance, bond, talents and memories together", () => {
  const state = fresh();
  const balanced = Object.fromEntries(vectorIds.map((id) => [id, 40])) as Record<string, number>;
  const almost = {
    ...state,
    niumpi: { ...state.niumpi, bond: 95 },
    evolution: { ...state.evolution, vectors: balanced as never },
  };
  assert.equal(meetsPrismatic(almost), false, "bond and balance alone are not enough");

  const complete = {
    ...almost,
    personality: { ...almost.personality, talents: { ...almost.personality.talents, cooking: 3, music: 3, gardening: 3 } },
    memories: Array.from({ length: 16 }, (_, index) => ({
      id: `m${index}`, kind: "story" as const, title: "t", body: "b", art: "leaf", createdAt: NOW, favorite: false,
    })),
  };
  assert.equal(meetsPrismatic(complete), true);
  assert.equal(scoreRoutes(complete)[0].id, "prismatic");
});

test("an unbalanced profile never reaches prismatic", () => {
  const state = fresh();
  const lopsided = Object.fromEntries(vectorIds.map((id) => [id, id === "playful" ? 200 : 4])) as Record<string, number>;
  const shaped = {
    ...state,
    niumpi: { ...state.niumpi, bond: 100 },
    evolution: { ...state.evolution, vectors: lopsided as never },
    personality: { ...state.personality, talents: { ...state.personality.talents, cooking: 4, music: 4, gardening: 4 } },
    memories: Array.from({ length: 30 }, (_, index) => ({
      id: `m${index}`, kind: "story" as const, title: "t", body: "b", art: "leaf", createdAt: NOW, favorite: false,
    })),
  };
  assert.equal(meetsPrismatic(shaped), false);
});

test("diet tints only show once they pass the threshold, and stay on a safe palette", () => {
  let state = fresh();
  for (let index = 0; index < TINT_THRESHOLD - 1; index += 1) state = addTint(state, "violet", 1);
  assert.equal(phenotypeFor(state).markings.length, 0, "one short of the threshold shows nothing");
  state = addTint(state, "violet", 1);
  assert.deepEqual(phenotypeFor(state).markings, ["violet-flecks"]);
  state = addTint(state, "not-a-real-tint", 40);
  assert.ok(phenotypeFor(state).markings.every((marking) => marking !== undefined));
});

test("a locked route selects the authored body, leaf and final morphology", () => {
  const state = fresh();
  const locked = { ...state, evolution: { ...state.evolution, lockedRoute: "moonveil" as const } };
  const look = phenotypeFor(locked);
  assert.equal(look.bodyPalette, "moonveil");
  assert.equal(look.leafType, "moon");
  assert.equal(look.morphology, "moonveil");
});

test("an untouched care profile stays visually unbranched", () => {
  assert.equal(phenotypeFor(fresh()).morphology, "seedling");
});

test("reconcile restores the canonical final form for an older locked save", () => {
  const legacy = fresh();
  legacy.evolution.lockedRoute = "moonveil";
  legacy.phenotype = {
    ...legacy.phenotype,
    bodyPalette: "coral",
    bellyPalette: "cream",
    leafType: "moonveil-leaf",
  };
  delete (legacy.phenotype as Partial<typeof legacy.phenotype>).morphology;
  const restored = reconcile(legacy, NOW + 1);
  assert.equal(restored.phenotype.bodyPalette, "moonveil");
  assert.equal(restored.phenotype.bellyPalette, "moonveil-belly");
  assert.equal(restored.phenotype.leafType, "moon");
  assert.equal(restored.phenotype.morphology, "moonveil");
});

test("a stable care direction changes the visible morphology from stage two", () => {
  const expectations = {
    dream: "moonveil",
    loving: "bloomheart",
    playful: "sparkleap",
    curious: "mistwander",
  } as const;
  for (const [vector, morphology] of Object.entries(expectations)) {
    const state = fresh();
    const shaped = {
      ...state,
      niumpi: { ...state.niumpi, stage: 2 as const },
      evolution: {
        ...state.evolution,
        vectors: { ...state.evolution.vectors, [vector]: 12 },
      },
    };
    assert.equal(phenotypeFor(shaped).morphology, morphology, `${vector} should visibly hint ${morphology}`);
  }
});

test("vector helpers agree with each other", () => {
  const state = fresh();
  const shaped = { ...state, evolution: { ...state.evolution, vectors: { ...state.evolution.vectors, calm: 10, dream: 7, brave: 3 } } };
  assert.equal(vectorTotal(shaped), 20);
  assert.deepEqual(topVectors(shaped, 2), ["calm", "dream"]);
});

/* ------------------------------------------------- feeding and cooking --- */

test("feeding consumes exactly one treat and only when one is owned", () => {
  const state = fresh();
  const before = state.inventory.ingredients.moonberry;
  const result = feed(state, "moonberry", NOW);
  assert.equal(result.state.inventory.ingredients.moonberry, before - 1);
  assert.equal(result.behavior, "eating");
  assert.equal(result.prop, "moonberry");

  const empty = { ...state, inventory: { ...state.inventory, ingredients: { ...state.inventory.ingredients, moonberry: 0 } } };
  const refused = feed(empty, "moonberry", NOW);
  assert.equal(refused.refused, true);
  assert.equal(refused.state.inventory.ingredients.moonberry, 0);
});

test("a refused treat is never consumed", () => {
  const state = fresh();
  const picky = { ...state, personality: { ...state.personality, dislikedFoods: ["moonberry"] } };
  const result = feed(picky, "moonberry", NOW);
  assert.equal(result.refused, true);
  assert.equal(result.state.inventory.ingredients.moonberry, picky.inventory.ingredients.moonberry);
});

test("a remembered favourite uses the dedicated delighted eating performance", () => {
  const state = fresh();
  const favourite = {
    ...state,
    personality: { ...state.personality, favoriteFoods: ["moonberry"] },
  };
  const result = feed(favourite, "moonberry", NOW);
  assert.equal(result.behavior, "eating-favorite");
  assert.equal(result.prop, "moonberry");
});

test("food moves the evolution vectors it is documented to move", () => {
  const state = fresh();
  const after = feed(state, "sunseed", NOW).state;
  assert.ok(after.evolution.vectors.brave > state.evolution.vectors.brave);
  assert.ok(after.evolution.vectors.playful > state.evolution.vectors.playful);
});

test("recipes match on ingredients regardless of the order they were picked", () => {
  const recipe = recipes[0];
  const forward = matchRecipe(recipe.parts);
  const reversed = matchRecipe([...recipe.parts].reverse());
  assert.equal(forward?.id, recipe.id);
  assert.equal(reversed?.id, recipe.id);
  assert.equal(matchRecipe(["moonberry", "moonberry", "moonberry"]), null);
});

test("cooking is transactional and an unknown mixture still returns something", () => {
  const state = fresh();
  const known = cook(state, ["cloudpuff", "dewdrop", "moonberry"], NOW);
  assert.equal(known.recipeId, "moon-cloud-cake");
  assert.equal(known.state.inventory.ingredients.dewdrop, state.inventory.ingredients.dewdrop - 1);

  const experiment = cook(state, ["moonberry", "moonberry"], NOW);
  assert.equal(experiment.recipeId, null);
  assert.ok(experiment.rewards.length > 0, "a failed experiment still gives something back");

  const broke = { ...state, inventory: { ...state.inventory, ingredients: {} } };
  const refused = cook(broke, ["moonberry", "dewdrop"], NOW);
  assert.equal(refused.refused, true);
  assert.deepEqual(refused.state.inventory.ingredients, {});
});

/* -------------------------------------------------------- inventory ------ */

test("spending is all-or-nothing", () => {
  const state = fresh();
  assert.equal(canSpend(state, ["moonberry", "moonberry"]), true);
  assert.equal(canSpend(state, ["moonberry", "starmush"]), false);
  assert.equal(spendIngredients(state, ["moonberry", "starmush"]), null);
});

test("a purchase is atomic and refuses when the wallet is short", () => {
  const state = fresh();
  // Must be something not already owned — the starter set is free.
  const dear = shopItems.find(
    (item) => item.currency === "dewdrops"
      && item.price > state.inventory.currencies.dewdrops
      && !state.inventory.items.includes(item.id),
  )!;
  const refused = buyItem(state, dear.id);
  assert.equal(refused.ok, false);

  const rich = { ...state, inventory: { ...state.inventory, currencies: { dewdrops: 9_999, starFragments: 99 } } };
  const bought = buyItem(rich, dear.id);
  assert.equal(bought.ok, true);
  if (bought.ok) {
    assert.ok(bought.state.inventory.items.includes(dear.id));
    assert.equal(bought.state.inventory.currencies.dewdrops, 9_999 - dear.price);
    assert.equal(buyItem(bought.state, dear.id).ok, false, "cannot buy the same thing twice");
  }
});

test("granting rewards never duplicates an owned item or recipe", () => {
  const state = fresh();
  const once = grant(state, [{ kind: "item", id: "moon-lamp" }, { kind: "recipe", id: "dewdrop-jelly" }]);
  const twice = grant(once, [{ kind: "item", id: "moon-lamp" }, { kind: "recipe", id: "dewdrop-jelly" }]);
  assert.equal(twice.inventory.items.filter((id) => id === "moon-lamp").length, 1);
  assert.equal(twice.cooking.known.filter((id) => id === "dewdrop-jelly").length, 1);
});

/* ------------------------------------------------------ claims & saves --- */

test("a reward can only be claimed once, even across a reload", () => {
  const state = fresh();
  assert.equal(alreadyClaimed(state, "dream:1"), false);
  const claimed = markClaimed(state, "dream:1", NOW);
  assert.equal(alreadyClaimed(claimed, "dream:1"), true);
  const reloaded = reconcile(JSON.parse(JSON.stringify(claimed)), NOW);
  assert.equal(alreadyClaimed(reloaded, "dream:1"), true);
});

test("the claim ledger is pruned without losing the newest entries", () => {
  let state = fresh();
  for (let index = 0; index < 500; index += 1) state = markClaimed(state, `k${index}`, NOW + index);
  const pruned = pruneClaims(state);
  assert.ok(Object.keys(pruned.claims).length <= 400);
  assert.equal(alreadyClaimed(pruned, "k499"), true, "newest claims survive");
});

test("a milestone memory is written exactly once", () => {
  const state = fresh();
  const first = awardMemory(state, "first-hatch", NOW);
  const second = awardMemory(first.state, "first-hatch", NOW + 1_000);
  assert.ok(first.entry);
  assert.equal(second.entry, null);
  assert.equal(second.state.memories.length, 1);
});

/* -------------------------------------------------------- persistence --- */

test("a v3 save keeps its name, bond and every counted interaction", () => {
  const legacy = {
    identity: { name: "Mango", tagline: "Naps first", onboarded: true, bornAt: "2025-05-05T00:00:00.000Z" },
    bond: 64,
    interactions: { tap: 12, pet: 20, hold: 6, leaf: 9 },
    needs: { fullness: 55, energy: 61, joy: 70 },
    foods: { moonberry: 4, cloudpuff: 2, dewdrop: 7 },
    sleepSessions: 5,
    lampOn: true,
    lastVisit: "2025-06-01T10:00:00.000Z",
  };
  const migrated = migrateLegacy(legacy, NOW, "migrated");
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.niumpi.name, "Mango");
  assert.equal(migrated.niumpi.bond, 64);
  assert.equal(migrated.niumpi.lampOn, true);
  assert.ok(migrated.niumpi.hatchedAt, "a named pet was already hatched");
  assert.equal(migrated.niumpi.careMoments, 47 + 13 * 2 + 5 * 2);
  assert.ok(migrated.evolution.vectors.loving > 0, "petting became a loving vector");
  assert.ok(migrated.inventory.ingredients.dewdrop >= 6);
  assert.equal(migrated.stats.fullness, 55);
});

test("a save from a newer build is read rather than destroyed", () => {
  const future = { ...fresh(), version: SAVE_VERSION + 5, niumpi: { ...fresh().niumpi, name: "Future" } };
  const read = reconcile(future, NOW);
  assert.equal(read.niumpi.name, "Future");
});

test("reconcile fills in anything a newer version added", () => {
  const partial = { version: 1, niumpi: { name: "Half" } };
  const repaired = reconcile(partial as never, NOW);
  assert.equal(repaired.niumpi.name, "Half");
  assert.equal(repaired.version, SAVE_VERSION);
  assert.equal(repaired.garden.plots.length, 6);
  assert.ok(vectorIds.every((id) => typeof repaired.evolution.vectors[id] === "number"));
});

/* ------------------------------------------------------------- dreams --- */

test("a dream cannot be claimed early and pays out exactly once", () => {
  const state = startDream(fresh(), "moon-garden", "leaf", NOW)!;
  assert.ok(state.dream);
  assert.equal(dreamReady(state, NOW), false);
  assert.equal(claimDream(state, NOW), null);

  const later = state.dream!.completesAt + 1_000;
  assert.equal(dreamReady(state, later), true);
  const first = claimDream(state, later)!;
  assert.ok(first.rewards.length > 0);
  assert.equal(first.state.dream, null);
  assert.equal(first.state.niumpi.sleeping, false);

  // Replaying the same run must not pay again.
  const replay = claimDream({ ...state, claims: first.state.claims }, later)!;
  assert.deepEqual(replay.rewards, []);
});

test("the same dream run always resolves to the same outcome", () => {
  const state = startDream(fresh(), "ember-cave", "lantern", NOW)!;
  const later = state.dream!.completesAt + 1;
  const a = claimDream(state, later)!;
  const b = claimDream(state, later)!;
  assert.equal(a.title, b.title);
});

test("only one dream can be running at a time", () => {
  const first = startDream(fresh(), "moon-garden", null, NOW)!;
  assert.equal(startDream(first, "cloud-ocean", null, NOW), null);
});

/* ------------------------------------------------------------- garden --- */

test("plants grow from timestamps and can be harvested only when ready", () => {
  const base = fresh();
  const withSeed = { ...base, inventory: { ...base.inventory, ingredients: { ...base.inventory.ingredients, "seed:dewdrop-lily": 1 } } };
  const planted = plantSeed(withSeed, 0, "dewdrop-lily", NOW)!;
  assert.equal(planted.inventory.ingredients["seed:dewdrop-lily"], 0);

  const early = viewPlot(planted.garden.plots[0], NOW + HOUR);
  assert.ok(early.growth > 0 && early.growth < 1);
  assert.equal(early.ready, false);
  assert.equal(harvest(planted, 0, NOW + HOUR), null);

  const ripe = planted.garden.plots[0].harvestReadyAt! + 1;
  const picked = harvest(planted, 0, ripe)!;
  assert.ok(picked.rewards.length > 0);
  assert.equal(picked.state.garden.plots[0].plantId, null);
});

test("watering only ever shortens the wait, and only once", () => {
  const base = fresh();
  const withSeed = { ...base, inventory: { ...base.inventory, ingredients: { ...base.inventory.ingredients, "seed:moonberry-bush": 1 } } };
  const planted = plantSeed(withSeed, 1, "moonberry-bush", NOW)!;
  const readyBefore = planted.garden.plots[1].harvestReadyAt!;
  const watered = water(planted, 1, NOW)!;
  assert.ok(watered.garden.plots[1].harvestReadyAt! < readyBefore);
  assert.equal(water(watered, 1, NOW), null, "watering twice does nothing");
});

test("planting requires a seed and an empty plot", () => {
  // States the empty pouch rather than relying on the starter inventory to
  // have none — it now ships three seeds, because opening the garden onto a
  // grid of disabled cards with no way to get a seed was a day-one dead end.
  const base = fresh();
  const empty = { ...base, inventory: { ...base.inventory, ingredients: {} } };
  assert.equal(plantSeed(empty, 0, "dewdrop-lily", NOW), null, "no seed owned");

  // And the starter pouch really does let a first visit plant something.
  const planted = plantSeed(base, 0, "dewdrop-lily", NOW);
  assert.ok(planted, "the starter seeds should be plantable");
  assert.equal(planted!.garden.plots[0].plantId, "dewdrop-lily");
  assert.equal(planted!.inventory.ingredients["seed:dewdrop-lily"], 1, "the seed is spent");

  // An occupied plot still refuses a second seed.
  assert.equal(plantSeed(planted!, 0, "sunseed-flower", NOW), null, "plot already taken");
});

/* ----------------------------------------------------------- missions --- */

test("daily missions roll once a day and pay out once", () => {
  const state = rollMissions(fresh(), NOW, () => true);
  assert.equal(state.missions.daily.length, 5);
  const again = rollMissions(state, NOW, () => true);
  assert.deepEqual(again.missions.daily, state.missions.daily);

  const target = state.missions.daily[0];
  const done = {
    ...state,
    missions: { ...state.missions, daily: state.missions.daily.map((m) => (m.id === target.id ? { ...m, progress: 99 } : m)) },
  };
  const claimed = claimMission(done, target.id, NOW);
  assert.ok(claimed.rewards.length > 0);
  assert.deepEqual(claimMission(claimed.state, target.id, NOW).rewards, [], "cannot claim twice");
});

test("journey has a deep authored pool with valid, unique and completable goals", () => {
  assert.ok(missionTemplates.length >= 45, "daily pool should keep rotating");
  assert.ok(weeklyMissionTemplates.length >= 15, "weekly pool should feel varied");
  assert.ok(achievementTemplates.length >= 60, "permanent journey should have long-term depth");
  const allIds = [...missionTemplates, ...weeklyMissionTemplates, ...achievementTemplates].map((entry) => entry.id);
  assert.equal(new Set(allIds).size, allIds.length, "every goal id must be globally unique");
  for (const mission of [...missionTemplates, ...weeklyMissionTemplates]) {
    assert.ok(mission.label.length >= 5 && mission.note.length >= 5, `${mission.id} needs useful copy`);
    assert.ok(mission.actions.length > 0 && mission.target > 0, `${mission.id} must be progressable`);
  }
});

test("lifetime achievement history grows even before today's board is rolled", () => {
  const state = progressMissions(fresh(), "hug", NOW);
  assert.equal(state.missions.lifetimeActions.hug, 1);
  const gentle = achievementMap["gentle-1"];
  assert.equal(achievementProgress(state, gentle), 1);
  const restored = reconcile(JSON.parse(JSON.stringify(state)), NOW + 1);
  assert.equal(restored.missions.lifetimeActions.hug, 1, "lifetime history survives reload");
});

test("weekly challenges progress and pay once", () => {
  let state = rollMissions(fresh(), NOW, () => true);
  const target = state.missions.weekly.entries[0];
  const template = weeklyMissionMap[target.id];
  assert.ok(template);
  for (let count = 0; count < template.target; count += 1) {
    state = progressMissions(state, template.actions[0], NOW);
  }
  const complete = state.missions.weekly.entries.find((entry) => entry.id === target.id)!;
  assert.equal(complete.progress, template.target);
  const claimed = claimWeeklyMission(state, target.id, NOW);
  assert.ok(claimed.rewards.length > 0);
  assert.deepEqual(claimWeeklyMission(claimed.state, target.id, NOW).rewards, []);
});

test("permanent achievements derive progress and cannot be claimed twice", () => {
  const template = achievementMap["care-1"];
  const ready = { ...fresh(), niumpi: { ...fresh().niumpi, careMoments: template.target } };
  assert.equal(achievementProgress(ready, template), template.target);
  const claimed = claimAchievement(ready, template.id, NOW);
  assert.ok(claimed.rewards.length > 0);
  assert.ok(claimed.state.missions.achievements.claimed.includes(template.id));
  assert.deepEqual(claimAchievement(claimed.state, template.id, NOW).rewards, []);
});

test("old mission saves receive journey fields without losing daily progress", () => {
  const current = fresh();
  const legacy = {
    ...current,
    missions: {
      dayKey: "old-day",
      daily: [{ id: "hug-once", progress: 1, claimed: false }],
      weekly: { weekKey: "old-week", days: ["old-day"], claimed: false },
    },
  };
  const restored = reconcile(legacy as never, NOW + 1);
  assert.equal(restored.missions.daily[0].progress, 1);
  assert.deepEqual(restored.missions.weekly.entries, []);
  assert.deepEqual(restored.missions.lifetimeActions, {});
  assert.deepEqual(restored.missions.achievements.claimed, []);
});

/* ------------------------------------------------------------- unlocks --- */

test("features open on care and time, and never close again", () => {
  const state = fresh();
  assert.equal(unlockFor(state, "cooking", NOW).open, false);
  const grown = { ...state, niumpi: { ...state.niumpi, careMoments: 400 } };
  const later = NOW + 10 * DAY;
  assert.equal(unlockFor(grown, "cooking", later).open, true);

  const settled = settleUnlocks(grown, later);
  assert.ok(settled.unlocks.includes("cooking"));
  // A later dip in care must not take the feature away.
  const dipped = { ...settled, niumpi: { ...settled.niumpi, careMoments: 0 } };
  assert.equal(unlockFor(dipped, "cooking", later).open, true);
});

/* ------------------------------------------------------- seed and mood --- */

test("the seed only hatches once it is fully ready", () => {
  let state = fresh();
  assert.equal(hatch(state, NOW).state.niumpi.hatchedAt, null);
  for (let index = 0; index < 14; index += 1) {
    state = seedAction(state, "warm", NOW + index * 10_000).state;
  }
  assert.equal(state.niumpi.seedProgress, 1);
  const hatched = hatch(state, NOW + 100_000).state;
  assert.ok(hatched.niumpi.hatchedAt);
  assert.equal(hatched.niumpi.stage, 1);
});

test("seed actions respect their cooldown", () => {
  const first = seedAction(fresh(), "warm", NOW);
  const tooSoon = seedAction(first.state, "warm", NOW + 500);
  const switchedTool = seedAction(first.state, "brush", NOW + 500);
  assert.equal(tooSoon.refused, true);
  assert.equal(switchedTool.refused, true);
  assert.equal(tooSoon.state.niumpi.seedProgress, first.state.niumpi.seedProgress);
});

test("mood follows the most urgent need first", () => {
  const base = fresh();
  assert.equal(moodFor({ ...base, stats: { ...base.stats, fullness: 10 } }, NOW), "hungry");
  assert.equal(moodFor({ ...base, stats: { ...base.stats, energy: 10 } }, NOW), "tired");
  assert.equal(moodFor({ ...base, stats: { ...base.stats, joy: 10 } }, NOW), "upset");
  assert.equal(moodFor({ ...base, niumpi: { ...base.niumpi, sleeping: true } }, NOW), "dreaming");
  assert.ok(LOW_STAT > 0);
});

test("a gesture is refused rather than faked when it does not fit the mood", () => {
  const base = fresh();
  const exhausted = { ...base, stats: { ...base.stats, energy: 12 } };
  const result = gesture(exhausted, "tickle", NOW);
  assert.equal(result.refused, true);
  assert.equal(result.state.niumpi.careMoments, exhausted.niumpi.careMoments);
});

/* ------------------------------------------------------------- content --- */

test("the shipped content meets the minimum the design calls for", () => {
  assert.ok(routes.length >= 5, "five evolution routes");
  assert.ok(ingredients.filter((item) => item.base).length >= 4, "four base ingredients");
  assert.ok(ingredients.length >= 14, "ten further ingredients");
  assert.ok(recipes.length >= 15, "fifteen recipes");
  assert.ok(traits.length >= 20, "twenty traits");
  assert.ok(seedQuestions.length >= 30, "thirty Memory Seed questions");
  assert.ok(dialogue.length >= 110, "at least one hundred and ten dialogue lines");
  assert.equal(new Set(dialogue.map((line) => line.id)).size, dialogue.length, "dialogue ids stay unique");
  assert.ok(minigames.length >= 6, "six minigames");
  assert.ok(shopItems.filter((item) => item.category !== "accessories").length >= 20, "twenty room items");
  assert.ok(plants.length >= 10, "ten plants");
  assert.ok(memoryTemplates.length >= 20, "twenty memory milestones");
  assert.ok(missionTemplates.length >= 20, "twenty mission templates");
  assert.ok(dreamOutcomes.length >= 12, "twelve dream outcomes");
  assert.ok(exploreOutcomes.length >= 10, "ten expedition outcomes");
  assert.ok(weathers.length >= 5, "five weather states");
});

test("no content entry is missing an id or a name", () => {
  for (const list of [ingredients, recipes, traits, plants, shopItems, minigames, routes]) {
    for (const entry of list as Array<{ id: string; name: string }>) {
      assert.ok(entry.id, "every entry needs an id");
      assert.ok(entry.name, `entry ${entry.id} needs a name`);
    }
  }
  const ids = ingredients.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "ingredient ids must be unique");
});

test("every room collectible and evolution stage ships its production artwork", () => {
  for (const item of shopItems.filter((entry) => entry.category !== "accessories")) {
    assert.ok(item.image, `${item.id} falls back to prototype icon art`);
    assert.ok(existsSync(`./public${item.image}`), `${item.id} points to missing artwork ${item.image}`);
  }
  for (let stage = 1; stage <= 5; stage += 1) {
    assert.ok(existsSync(`./public/assets/niumpi/stages/stage-${stage}.webp`), `stage ${stage} art is missing`);
  }
  for (const route of routes) {
    assert.ok(existsSync(`./public/assets/niumpi/forms/${route.id}.webp`), `${route.id} final art is missing`);
  }
});

test("every recipe is made only from real ingredients", () => {
  const known = new Set(ingredients.map((item) => item.id));
  for (const recipe of recipes) {
    for (const part of recipe.parts) {
      assert.ok(known.has(part), `${recipe.id} uses unknown ingredient ${part}`);
    }
  }
});

test("every Memory Seed question is a non-sensitive either/or", () => {
  const banned = /address|password|phone|email|money|salary|health|medical|location|school|surname/i;
  for (const question of seedQuestions) {
    assert.equal(question.options.length, 2, `${question.id} must offer exactly two options`);
    assert.doesNotMatch(question.prompt, banned, `${question.id} asks something sensitive`);
    for (const option of question.options) assert.ok(option.recall, `${question.id} option needs a recall line`);
  }
});

/* ----------------------------------------------------------------- rng --- */

test("the seeded rng replays identically and stays in range", () => {
  const seed = hashSeed("save", 42, "dream");
  const a = Array.from({ length: 20 }, makeRng(seed));
  const b = Array.from({ length: 20 }, makeRng(seed));
  assert.deepEqual(a, b);
  assert.ok(a.every((value) => value >= 0 && value < 1));
  assert.notDeepEqual(a, Array.from({ length: 20 }, makeRng(hashSeed("save", 43, "dream"))));
});

/* ------------------------------------------------------- minigame maths --- */

test("Dewdrop Dash scores catches, penalises stones and grows a combo", async () => {
  const { catchValue, isCaught } = await import("../app/minigames/phaser/rules.ts");
  assert.deepEqual(catchValue("drop", 0), { points: 1, combo: 1 });
  assert.deepEqual(catchValue("gold", 0), { points: 3, combo: 1 });
  assert.deepEqual(catchValue("stone", 7), { points: -1, combo: 0 }, "a stone resets the combo");
  // Every fifth catch in a row is worth one more.
  assert.equal(catchValue("drop", 4).points, 2);
  assert.equal(catchValue("drop", 9).points, 3);

  assert.equal(isCaught(100, 100, 100, 100), true);
  assert.equal(isCaught(100, 100, 145, 100), false, "too far sideways");
  assert.equal(isCaught(100, 100, 100, 145), false, "too far below");
});

test("Cloud Stack trims the overhang and topples when contact runs out", async () => {
  const { trimOverlap, stackPoints, TOPPLE_BELOW } = await import("../app/minigames/phaser/rules.ts");
  const base = { x: 100, width: 100 };

  const offset = trimOverlap({ x: 140, width: 100 }, base);
  assert.deepEqual(offset?.placed, { x: 140, width: 60 }, "only the resting part survives");
  assert.equal(offset?.perfect, false);

  const dead = trimOverlap({ x: 100, width: 100 }, base);
  assert.deepEqual(dead?.placed, { x: 100, width: 100 });
  assert.equal(dead?.perfect, true, "a clean landing is perfect");
  assert.equal(stackPoints(true), 2);
  assert.equal(stackPoints(false), 1);

  assert.equal(trimOverlap({ x: 100 + 100 - TOPPLE_BELOW, width: 100 }, base), null, "a sliver topples");
  assert.equal(trimOverlap({ x: 400, width: 100 }, base), null, "a clean miss topples");

  // The tower can only ever narrow, never widen.
  let top = base;
  for (const offsetBy of [10, 20, 5, 30]) {
    const step = trimOverlap({ x: top.x + offsetBy, width: top.width }, top);
    assert.ok(step, "should still be standing");
    assert.ok(step!.placed.width <= top.width);
    top = step!.placed;
  }
});

test("Leafbeat judges timing by distance and rewards a long combo", async () => {
  const { judgeBeat, beatPoints, PERFECT_WINDOW, GOOD_WINDOW } = await import("../app/minigames/phaser/rules.ts");
  assert.equal(judgeBeat(0), "perfect");
  assert.equal(judgeBeat(PERFECT_WINDOW), "perfect");
  assert.equal(judgeBeat(PERFECT_WINDOW + 1), "good");
  assert.equal(judgeBeat(GOOD_WINDOW), "good");
  assert.equal(judgeBeat(GOOD_WINDOW + 1), "miss");

  assert.equal(beatPoints("miss", 30), 0);
  assert.equal(beatPoints("good", 30), 1, "a good hit never scales");
  assert.equal(beatPoints("perfect", 0), 2);
  assert.equal(beatPoints("perfect", 12), 4, "combo lifts perfect hits");
});

test("the three original treats kept the numbers the old build balanced", async () => {
  const { ingredientMap } = await import("../app/game/config/foods.ts");
  // These were tuned in the previous version; a rebuild must not silently
  // reprice the food the player already knows.
  assert.deepEqual(ingredientMap.moonberry.effects, { fullness: 22, joy: 6 });
  assert.deepEqual(ingredientMap.cloudpuff.effects, { fullness: 14, energy: 10, joy: 4 });
  assert.deepEqual(ingredientMap.dewdrop.effects, { fullness: 8, energy: 16 });
});
