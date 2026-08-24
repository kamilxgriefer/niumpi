import { shopItems } from "./config/items.ts";
import { rarityDefinitions, rarityMap } from "./config/rarities.ts";
import { grant } from "./inventory.ts";
import { hashSeed, makeRng } from "./rng.ts";
import type { GameState, ItemRarity, Reward, RoomLootState } from "./types.ts";

export const DISCOVERY_MOMENTS = 5;

export const defaultRoomLoot: RoomLootState = {
  progress: 0,
  claimable: 0,
  opened: 0,
  rarePity: 0,
  legendaryPity: 0,
  mythicPity: 0,
  lastDropAt: null,
};

export function reconcileRoomLoot(saved: Partial<RoomLootState> | undefined): RoomLootState {
  const count = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
  };
  return {
    progress: Math.min(DISCOVERY_MOMENTS - 1, count(saved?.progress)),
    claimable: count(saved?.claimable),
    opened: count(saved?.opened),
    rarePity: count(saved?.rarePity),
    legendaryPity: count(saved?.legendaryPity),
    mythicPity: count(saved?.mythicPity),
    lastDropAt: typeof saved?.lastDropAt === "number" && Number.isFinite(saved.lastDropAt) ? saved.lastDropAt : null,
  };
}

/** Meaningful room moments fill a free discovery bloom. Repetition costs time, never money. */
export function earnRoomDiscovery(state: GameState, amount = 1): GameState {
  const total = state.roomLoot.progress + Math.max(0, amount);
  const earned = Math.floor(total / DISCOVERY_MOMENTS);
  return {
    ...state,
    roomLoot: {
      ...state.roomLoot,
      progress: total % DISCOVERY_MOMENTS,
      claimable: state.roomLoot.claimable + earned,
    },
  };
}

function guaranteedRank(loot: RoomLootState): number {
  if (loot.mythicPity >= 39) return rarityMap.mythic.rank;
  if (loot.legendaryPity >= 19) return rarityMap.legendary.rank;
  if (loot.rarePity >= 6) return rarityMap.rare.rank;
  return 0;
}

function rollRarity(rng: () => number, minimumRank: number): ItemRarity {
  const eligible = rarityDefinitions.filter((entry) => entry.rank >= minimumRank);
  const total = eligible.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = rng() * total;
  for (const entry of eligible) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.id;
  }
  return eligible[eligible.length - 1].id;
}

export type RoomDropResult = {
  state: GameState;
  reward: Reward | null;
  rarity: ItemRarity | null;
  refused?: boolean;
};

/** Rolls only unowned, room-usable collectibles. A finished tier upgrades instead of duplicating an item. */
export function claimRoomDrop(state: GameState, now: number): RoomDropResult {
  if (state.roomLoot.claimable <= 0) return { state, reward: null, rarity: null, refused: true };

  // Claim time and current room never influence the result. A saved bloom is
  // therefore impossible to reroll by refreshing, waiting or changing rooms.
  const rng = makeRng(hashSeed(state.profile.id, state.roomLoot.opened, "room-drop-v1"));
  const minimum = guaranteedRank(state.roomLoot);
  const rolled = rollRarity(rng, minimum);
  const rolledRank = rarityMap[rolled].rank;
  const unowned = shopItems.filter((item) => (
    item.category !== "accessories"
    && !item.starter
    && !state.inventory.items.includes(item.id)
  ));
  const exact = (rank: number) => unowned.filter((item) => rarityMap[item.rarity].rank === rank);
  let targetRank = Math.max(minimum, rolledRank);
  let pool = exact(targetRank);
  // Exhausted tiers upgrade one step at a time, preserving the published floor.
  while (!pool.length && targetRank < rarityMap.mythic.rank) {
    targetRank += 1;
    pool = exact(targetRank);
  }
  // If every item at and above a guaranteed floor is already owned, award the
  // best remaining lower collectible. It is not called a complete collection,
  // and because its actual rank is used below it does not consume the pity.
  if (!pool.length && unowned.length) {
    targetRank = Math.min(rolledRank - 1, rarityMap.mythic.rank - 1);
    while (!pool.length && targetRank >= 0) {
      pool = exact(targetRank);
      targetRank -= 1;
    }
  }

  let reward: Reward;
  let actualRarity: ItemRarity | null;
  if (pool.length) {
    const item = pool[Math.floor(rng() * pool.length)];
    reward = { kind: "item", id: item.id };
    actualRarity = item.rarity;
  } else {
    // Once a collection is complete, a bloom still has value and never gives a duplicate.
    reward = { kind: "currency", id: "dewdrops", amount: 120 };
    actualRarity = null;
  }

  const rank = actualRarity ? rarityMap[actualRarity].rank : -1;
  const next = grant(state, [reward]);
  return {
    reward,
    rarity: actualRarity,
    state: {
      ...next,
      roomLoot: {
        progress: next.roomLoot.progress,
        claimable: next.roomLoot.claimable - 1,
        opened: next.roomLoot.opened + 1,
        rarePity: rank >= rarityMap.rare.rank ? 0 : next.roomLoot.rarePity + 1,
        legendaryPity: rank >= rarityMap.legendary.rank ? 0 : next.roomLoot.legendaryPity + 1,
        mythicPity: rank >= rarityMap.mythic.rank ? 0 : next.roomLoot.mythicPity + 1,
        lastDropAt: now,
      },
    },
  };
}
