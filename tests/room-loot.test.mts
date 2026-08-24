import assert from "node:assert/strict";
import test from "node:test";

import { claimRoomDiscovery, playWithItem } from "../app/game/actions.ts";
import { shopItems } from "../app/game/config/items.ts";
import { rarityMap } from "../app/game/config/rarities.ts";
import { claimRoomDrop, DISCOVERY_MOMENTS, earnRoomDiscovery } from "../app/game/roomLoot.ts";
import { createGameState, reconcile } from "../app/game/state.ts";

const NOW = 1_760_000_000_000;

function fresh() {
  return createGameState(NOW, "room-loot-test");
}

test("shared room moments grow a free discovery without losing overflow", () => {
  let state = fresh();
  state = earnRoomDiscovery(state, DISCOVERY_MOMENTS * 2 + 3);
  assert.equal(state.roomLoot.claimable, 2);
  assert.equal(state.roomLoot.progress, 3);
  assert.equal(state.inventory.currencies.dewdrops, 40, "growing a bloom never spends currency");
});

test("opening a bloom grants one unowned room collectible and consumes one claim", () => {
  const ready = { ...fresh(), roomLoot: { ...fresh().roomLoot, claimable: 1 } };
  const result = claimRoomDiscovery(ready, NOW + 1_000);
  assert.equal(result.refused, undefined);
  assert.equal(result.rewards.length, 1);
  assert.equal(result.rewards[0].kind, "item");
  if (result.rewards[0].kind !== "item") return;
  assert.equal(ready.inventory.items.includes(result.rewards[0].id), false);
  assert.equal(result.state.inventory.items.includes(result.rewards[0].id), true);
  assert.equal(result.state.roomLoot.claimable, 0);
  assert.equal(result.state.roomLoot.opened, 1);
});

test("rare, legendary and mythic pity floors cannot downgrade", () => {
  const cases = [
    { rarePity: 6, legendaryPity: 0, mythicPity: 0, minimum: rarityMap.rare.rank },
    { rarePity: 0, legendaryPity: 19, mythicPity: 0, minimum: rarityMap.legendary.rank },
    { rarePity: 0, legendaryPity: 0, mythicPity: 39, minimum: rarityMap.mythic.rank },
  ];
  for (const [index, entry] of cases.entries()) {
    const base = fresh();
    const ready = {
      ...base,
      roomLoot: { ...base.roomLoot, ...entry, claimable: 1 },
    };
    const drop = claimRoomDrop(ready, NOW + index + 1);
    assert.ok(drop.rarity);
    assert.ok(rarityMap[drop.rarity!].rank >= entry.minimum);
  }
});

test("a complete furniture collection converts a bloom instead of duplicating an item", () => {
  const base = fresh();
  const everyRoomItem = shopItems.filter((item) => item.category !== "accessories").map((item) => item.id);
  const ready = {
    ...base,
    inventory: { ...base.inventory, items: everyRoomItem },
    roomLoot: { ...base.roomLoot, claimable: 1 },
  };
  const drop = claimRoomDrop(ready, NOW + 1_000);
  assert.equal(drop.reward?.kind, "currency");
  assert.deepEqual(drop.state.inventory.items, everyRoomItem);
  assert.ok(drop.state.inventory.currencies.dewdrops > ready.inventory.currencies.dewdrops);
});

test("older saves receive discovery defaults during reconciliation", () => {
  const legacy = fresh();
  delete (legacy as Partial<typeof legacy>).roomLoot;
  const restored = reconcile(legacy, NOW + 2_000);
  assert.deepEqual(restored.roomLoot, {
    progress: 0,
    claimable: 0,
    opened: 0,
    rarePity: 0,
    legendaryPity: 0,
    mythicPity: 0,
    lastDropAt: null,
  });
});

test("repeating one room action stops growing discoveries once care loses value", () => {
  let state = fresh();
  for (let index = 0; index < 25; index += 1) state = playWithItem(state, "cloud-sofa", NOW + index).state;
  assert.equal(state.roomLoot.claimable, 0);
  assert.equal(state.roomLoot.progress, 2, "only the two meaningful toy moments count");
});

test("a saved bloom has the same reward regardless of claim time or active room", () => {
  const base = fresh();
  const ready = { ...base, roomLoot: { ...base.roomLoot, claimable: 1 } };
  const later = claimRoomDrop(ready, NOW + 90_000_000);
  const now = claimRoomDrop(ready, NOW + 1);
  assert.deepEqual(later.reward, now.reward);
  assert.equal(later.rarity, now.rarity);
});

test("an exhausted guaranteed tier falls back to an unowned item without spending pity", () => {
  const base = fresh();
  const ownedMythic = shopItems.filter((item) => item.rarity === "mythic").map((item) => item.id);
  const ready = {
    ...base,
    inventory: { ...base.inventory, items: [...new Set([...base.inventory.items, ...ownedMythic])] },
    roomLoot: { ...base.roomLoot, claimable: 1, mythicPity: 39 },
  };
  const drop = claimRoomDrop(ready, NOW + 1);
  assert.equal(drop.reward?.kind, "item");
  assert.ok(drop.rarity);
  assert.equal(drop.state.roomLoot.mythicPity, 40, "a lower fallback must not consume the mythic guarantee");
});

test("non-finite loot counters are repaired instead of poisoning the save", () => {
  const broken = fresh();
  broken.roomLoot = { ...broken.roomLoot, progress: Number.POSITIVE_INFINITY, claimable: Number.NaN, mythicPity: Number.NEGATIVE_INFINITY };
  const restored = reconcile(broken, NOW + 1);
  assert.equal(restored.roomLoot.progress, 0);
  assert.equal(restored.roomLoot.claimable, 0);
  assert.equal(restored.roomLoot.mythicPity, 0);
});
