import type { ItemRarity } from "../types.ts";

export type RarityDefinition = {
  id: ItemRarity;
  name: string;
  colour: string;
  weight: number;
  rank: number;
  note: string;
};

/** Odds are deliberately public: room discoveries are earned through play and are never sold. */
export const rarityDefinitions: RarityDefinition[] = [
  { id: "common", name: "Common", colour: "#b8c6d1", weight: 52, rank: 0, note: "Simple, warm and easy to find" },
  { id: "uncommon", name: "Uncommon", colour: "#61d7a8", weight: 26, rank: 1, note: "A little more playful" },
  { id: "rare", name: "Rare", colour: "#59a9ff", weight: 12, rank: 2, note: "Detailed with a cool blue glow" },
  { id: "epic", name: "Epic", colour: "#aa78ff", weight: 6, rank: 3, note: "Ornate and violet-lit" },
  { id: "legendary", name: "Legendary", colour: "#ffc857", weight: 3, rank: 4, note: "Golden, animated and precious" },
  { id: "mythic", name: "Mythic", colour: "#ff77d4", weight: 1, rank: 5, note: "Prismatic and exceptionally rare" },
];

export const rarityMap = Object.fromEntries(
  rarityDefinitions.map((entry) => [entry.id, entry]),
) as Record<ItemRarity, RarityDefinition>;

