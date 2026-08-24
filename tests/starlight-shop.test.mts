import assert from "node:assert/strict";
import test from "node:test";

import {
  EPIC_PITY, LEGENDARY_PITY, WONDER_CHEST_PRICE, starlightBundles, wonderDrops,
} from "../app/game/config/starlightShop.ts";
import { createGameState, reconcile } from "../app/game/state.ts";
import { buyStarlightBundle, openWonderChest } from "../app/game/starlightShop.ts";

const NOW = Date.UTC(2026, 7, 24, 20);

function funded() {
  const state = createGameState(NOW, "starlight-shop-test");
  return {
    ...state,
    inventory: {
      ...state.inventory,
      currencies: { dewdrops: 2_000, starFragments: 100 },
    },
  };
}

test("published Wonder Chest base odds total exactly 100 and drop ids are unique", () => {
  assert.equal(wonderDrops.reduce((sum, drop) => sum + drop.weight, 0), 100);
  assert.equal(new Set(wonderDrops.map((drop) => drop.id)).size, wonderDrops.length);
  assert.ok(wonderDrops.every((drop) => drop.weight > 0));
});

test("Starlight Kits charge only stars and grant the exact advertised contents", () => {
  const state = funded();
  const bundle = starlightBundles.find((entry) => entry.id === "night-garden");
  assert.ok(bundle);
  const result = buyStarlightBundle(state, bundle.id);
  assert.equal(result.ok, true);
  assert.deepEqual(result.rewards, bundle.rewards);
  assert.equal(result.state.inventory.currencies.starFragments, 100 - bundle.price);
  assert.equal(result.state.inventory.currencies.dewdrops, 2_000);
  assert.equal(result.state.inventory.ingredients["seed:dream-mint"], 2);
  assert.equal(result.state.inventory.ingredients["seed:star-mushroom"], 1);
  assert.equal(result.state.inventory.ingredients["seed:heartberry-vine"], 1);
});

test("an unaffordable kit is atomic and never grants a partial reward", () => {
  const base = funded();
  const state = {
    ...base,
    inventory: { ...base.inventory, currencies: { ...base.inventory.currencies, starFragments: 0 } },
  };
  const result = buyStarlightBundle(state, "aurora-grow-kit");
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.deepEqual(result.rewards, []);
});

test("Wonder Chests use only play-earned Dewdrops and never consume premium stars", () => {
  const state = funded();
  const result = openWonderChest(state, NOW + 1);
  assert.equal(result.ok, true);
  assert.equal(result.state.inventory.currencies.dewdrops, 2_000 - WONDER_CHEST_PRICE);
  assert.equal(result.state.inventory.currencies.starFragments, 100);

  const noDewdrops = {
    ...state,
    inventory: { ...state.inventory, currencies: { dewdrops: 0, starFragments: 100 } },
  };
  const refused = openWonderChest(noDewdrops, NOW + 2);
  assert.equal(refused.ok, false);
  assert.equal(refused.state, noDewdrops, "premium currency cannot substitute for play currency");
});

test("a saved chest result cannot be rerolled by waiting or refreshing", () => {
  const state = funded();
  const now = openWonderChest(structuredClone(state), NOW + 1);
  const later = openWonderChest(structuredClone(state), NOW + 90_000_000);
  assert.equal(now.ok, true);
  assert.equal(later.ok, true);
  assert.equal(now.drop?.id, later.drop?.id);
  assert.deepEqual(now.rewards, later.rewards);
  assert.deepEqual(now.state.inventory, later.state.inventory);
  assert.deepEqual(
    { ...now.state.starlightShop, lastDropAt: null },
    { ...later.state.starlightShop, lastDropAt: null },
  );
});

test("pity guarantees Epic by chest 7 and Legendary by chest 20", () => {
  const base = funded();
  const epicReady = {
    ...base,
    starlightShop: { ...base.starlightShop, epicPity: EPIC_PITY - 1 },
  };
  const epic = openWonderChest(epicReady, NOW + 1);
  assert.equal(epic.ok, true);
  assert.ok(epic.drop?.tier === "epic" || epic.drop?.tier === "legendary");
  assert.equal(epic.state.starlightShop.epicPity, 0);

  const legendaryReady = {
    ...base,
    starlightShop: { ...base.starlightShop, legendaryPity: LEGENDARY_PITY - 1 },
  };
  const legendary = openWonderChest(legendaryReady, NOW + 2);
  assert.equal(legendary.ok, true);
  assert.equal(legendary.drop?.tier, "legendary");
  assert.equal(legendary.state.starlightShop.legendaryPity, 0);
});

test("old and malformed saves receive finite Starlight Shop defaults", () => {
  const legacy = funded();
  delete (legacy as Partial<typeof legacy>).starlightShop;
  assert.deepEqual(reconcile(legacy, NOW + 1).starlightShop, {
    opened: 0, epicPity: 0, legendaryPity: 0, lastDropAt: null,
  });

  const broken = funded();
  broken.starlightShop = {
    opened: Number.POSITIVE_INFINITY,
    epicPity: Number.NaN,
    legendaryPity: Number.NEGATIVE_INFINITY,
    lastDropAt: Number.POSITIVE_INFINITY,
  };
  assert.deepEqual(reconcile(broken, NOW + 2).starlightShop, {
    opened: 0, epicPity: 0, legendaryPity: 0, lastDropAt: null,
  });
});
