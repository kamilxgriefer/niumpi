import { grant } from "./inventory.ts";
import { hashSeed, makeRng, pickWeighted } from "./rng.ts";
import {
  EPIC_PITY, LEGENDARY_PITY, WONDER_CHEST_PRICE, starlightBundleMap, wonderDrops,
} from "./config/starlightShop.ts";
import type { GameState, Reward } from "./types.ts";
import type { WonderDrop } from "./config/starlightShop.ts";

type ShopResult =
  | { ok: true; state: GameState; rewards: Reward[] }
  | { ok: false; state: GameState; reason: string; rewards: [] };

export function buyStarlightBundle(state: GameState, bundleId: string): ShopResult {
  const bundle = starlightBundleMap[bundleId];
  if (!bundle) return { ok: false, state, reason: "That bundle is unavailable right now.", rewards: [] };
  if (state.inventory.currencies.starFragments < bundle.price) {
    return { ok: false, state, reason: "You need more Star Fragments.", rewards: [] };
  }
  const paid: GameState = {
    ...state,
    inventory: {
      ...state.inventory,
      currencies: {
        ...state.inventory.currencies,
        starFragments: state.inventory.currencies.starFragments - bundle.price,
      },
    },
  };
  return { ok: true, state: grant(paid, bundle.rewards), rewards: bundle.rewards };
}

const tierRank: Record<WonderDrop["tier"], number> = { uncommon: 0, rare: 1, epic: 2, legendary: 3 };

/** Deterministic from persisted state: refreshing or waiting cannot reroll it. */
export function openWonderChest(state: GameState, now: number): ShopResult & { drop?: WonderDrop } {
  if (state.inventory.currencies.dewdrops < WONDER_CHEST_PRICE) {
    return { ok: false, state, reason: "Earn more Dewdrops through play first.", rewards: [] };
  }

  const guaranteedRank = state.starlightShop.legendaryPity >= LEGENDARY_PITY - 1
    ? tierRank.legendary
    : state.starlightShop.epicPity >= EPIC_PITY - 1
      ? tierRank.epic
      : tierRank.uncommon;
  const pool = wonderDrops.filter((drop) => tierRank[drop.tier] >= guaranteedRank);
  const rng = makeRng(hashSeed(state.profile.id, state.starlightShop.opened, "wonder-chest"));
  const drop = pickWeighted(pool, (entry) => entry.weight, rng());
  const rank = tierRank[drop.tier];
  const paid: GameState = {
    ...state,
    inventory: {
      ...state.inventory,
      currencies: {
        ...state.inventory.currencies,
        dewdrops: state.inventory.currencies.dewdrops - WONDER_CHEST_PRICE,
      },
    },
    starlightShop: {
      opened: state.starlightShop.opened + 1,
      epicPity: rank >= tierRank.epic ? 0 : state.starlightShop.epicPity + 1,
      legendaryPity: rank >= tierRank.legendary ? 0 : state.starlightShop.legendaryPity + 1,
      lastDropAt: now,
    },
  };
  return { ok: true, state: grant(paid, drop.rewards), rewards: drop.rewards, drop };
}

