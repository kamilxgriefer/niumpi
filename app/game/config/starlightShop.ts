import type { Reward } from "../types.ts";

export type StarlightBundle = {
  id: string;
  name: string;
  note: string;
  art: string;
  price: number;
  rewards: Reward[];
};

/** Premium currency only buys an exact, inspectable result. */
export const starlightBundles: StarlightBundle[] = [
  {
    id: "rare-pantry", name: "Rare Pantry", note: "Six difficult-to-find treats, exactly as shown", art: "snack", price: 5,
    rewards: [
      { kind: "ingredient", id: "heartberry", amount: 2 },
      { kind: "ingredient", id: "dreammint", amount: 2 },
      { kind: "ingredient", id: "frostpetal", amount: 2 },
    ],
  },
  {
    id: "night-garden", name: "Night Garden Kit", note: "Four guaranteed seeds for slower-growing plants", art: "garden", price: 7,
    rewards: [
      { kind: "seed", id: "dream-mint", amount: 2 },
      { kind: "seed", id: "star-mushroom", amount: 1 },
      { kind: "seed", id: "heartberry-vine", amount: 1 },
    ],
  },
  {
    id: "aurora-grow-kit", name: "Aurora Grow Kit", note: "The rarest garden seeds, with no random roll", art: "prism", price: 10,
    rewards: [
      { kind: "seed", id: "aurora-fern", amount: 2 },
      { kind: "seed", id: "frost-petal", amount: 1 },
      { kind: "seed", id: "ember-shrub", amount: 1 },
    ],
  },
  {
    id: "constellation-table", name: "Constellation Table", note: "A complete rare tasting set for recipes", art: "star", price: 12,
    rewards: [
      { kind: "ingredient", id: "tidepearl", amount: 2 },
      { kind: "ingredient", id: "auroraleaf", amount: 2 },
      { kind: "ingredient", id: "starmush", amount: 2 },
      { kind: "ingredient", id: "emberfruit", amount: 2 },
    ],
  },
];

export const starlightBundleMap: Record<string, StarlightBundle> = Object.fromEntries(
  starlightBundles.map((bundle) => [bundle.id, bundle]),
);

export type DiscoveryTier = "uncommon" | "rare" | "epic" | "legendary";
export type WonderDrop = {
  id: string;
  name: string;
  note: string;
  art: string;
  tier: DiscoveryTier;
  /** Integer percentage in the normal, non-pity pool. All entries total 100. */
  weight: number;
  rewards: Reward[];
};

/** Wonder Chests use play-earned Dewdrops only. The exact base probabilities
 * are part of the data so the UI and the roll can never disagree. */
export const wonderDrops: WonderDrop[] = [
  { id: "heartberry-duo", name: "Heartberry Duo", note: "Two shared fruits", art: "heartberry", tier: "uncommon", weight: 18, rewards: [{ kind: "ingredient", id: "heartberry", amount: 2 }] },
  { id: "dreammint-duo", name: "Dream Mint Pair", note: "Two cool leaves", art: "dreammint", tier: "uncommon", weight: 16, rewards: [{ kind: "ingredient", id: "dreammint", amount: 2 }] },
  { id: "frostpetal-duo", name: "Frost Petal Pair", note: "Two crisp petals", art: "frostpetal", tier: "uncommon", weight: 14, rewards: [{ kind: "ingredient", id: "frostpetal", amount: 2 }] },
  { id: "emberfruit-duo", name: "Emberfruit Pair", note: "Two warm fruits", art: "emberfruit", tier: "rare", weight: 12, rewards: [{ kind: "ingredient", id: "emberfruit", amount: 2 }] },
  { id: "starmush-duo", name: "Star Mushroom Pair", note: "Two night-glowing caps", art: "starmush", tier: "rare", weight: 10, rewards: [{ kind: "ingredient", id: "starmush", amount: 2 }] },
  { id: "heartberry-seeds", name: "Heartberry Seeds", note: "Two vines for the garden", art: "heartberry", tier: "rare", weight: 9, rewards: [{ kind: "seed", id: "heartberry-vine", amount: 2 }] },
  { id: "tidepearl-duo", name: "Tide Pearl Pair", note: "Two pearls carrying water-song", art: "tidepearl", tier: "epic", weight: 7, rewards: [{ kind: "ingredient", id: "tidepearl", amount: 2 }] },
  { id: "aurora-leaves", name: "Aurora Leaves", note: "Two colour-shifting leaves", art: "auroraleaf", tier: "epic", weight: 5, rewards: [{ kind: "ingredient", id: "auroraleaf", amount: 2 }] },
  { id: "star-mushroom-seeds", name: "Star Mushroom Seeds", note: "Two slow, luminous plantings", art: "starmush", tier: "epic", weight: 5, rewards: [{ kind: "seed", id: "star-mushroom", amount: 2 }] },
  { id: "aurora-fern-seed", name: "Aurora Fern Seed", note: "One exceptionally rare planting", art: "prism", tier: "legendary", weight: 3, rewards: [{ kind: "seed", id: "aurora-fern", amount: 1 }] },
  { id: "garden-constellation", name: "Garden Constellation", note: "Three rare gardens in one parcel", art: "star", tier: "legendary", weight: 1, rewards: [
    { kind: "seed", id: "aurora-fern", amount: 1 },
    { kind: "seed", id: "heartberry-vine", amount: 1 },
    { kind: "seed", id: "star-mushroom", amount: 1 },
  ] },
];

export const WONDER_CHEST_PRICE = 80;
export const EPIC_PITY = 7;
export const LEGENDARY_PITY = 20;

/** Display-only until a real payment provider and parental flow are selected. */
export const starPacks = [
  { id: "pocket", stars: 12, price: "€1.99", note: "For one or two exact bundles" },
  { id: "garden", stars: 32, price: "€4.99", note: "Enough for several guaranteed kits" },
  { id: "constellation", stars: 70, price: "€9.99", note: "Best value, never required for progress" },
] as const;

