import type { StatId, VectorId } from "../types.ts";

export type Ingredient = {
  id: string;
  name: string;
  /** Small descriptive line used in tooltips and the recipe book. */
  note: string;
  art: string;
  /** Base treats are always purchasable; the rest are grown, cooked or found. */
  base: boolean;
  effects: Partial<Record<StatId, number>>;
  vectors: Partial<Record<VectorId, number>>;
  /** Cosmetic drift this ingredient nudges when eaten often. */
  tint: string | null;
  price: number;
};

/** Order matters: the first four are the Snack Bar staples on Home. */
export const ingredients: Ingredient[] = [
  { id: "moonberry", name: "Moonberry", note: "Sweet, quiet, tastes like evening", art: "moonberry", base: true,
    effects: { fullness: 22, joy: 6 }, vectors: { calm: 3, dream: 2 }, tint: "violet", price: 6 },
  { id: "cloudpuff", name: "Cloud Puff", note: "Melts before it lands", art: "cloudpuff", base: true,
    effects: { fullness: 14, energy: 10, joy: 4 }, vectors: { calm: 2, creative: 2 }, tint: "pastel", price: 6 },
  { id: "dewdrop", name: "Dewdrop", note: "Cold, bright, endlessly interesting", art: "dewdrop", base: true,
    effects: { fullness: 8, energy: 16 }, vectors: { curious: 3, nature: 1 }, tint: "teal", price: 5 },
  { id: "sunseed", name: "Sunseed", note: "Crunches like a tiny sunrise", art: "sunseed", base: true,
    effects: { fullness: 12, energy: 18, joy: 5 }, vectors: { brave: 3, playful: 2 }, tint: "gold", price: 7 },

  { id: "heartberry", name: "Heartberry", note: "Shared fruit, never eaten alone", art: "heartberry", base: false,
    effects: { fullness: 16, joy: 14 }, vectors: { loving: 4, social: 2 }, tint: "rose", price: 10 },
  { id: "dreammint", name: "Dream Mint", note: "Leaves a cool hush behind", art: "dreammint", base: false,
    effects: { energy: 8, joy: 6 }, vectors: { dream: 4, calm: 2 }, tint: "violet", price: 9 },
  { id: "starmush", name: "Star Mushroom", note: "Glows for exactly one night", art: "starmush", base: false,
    effects: { fullness: 18, energy: 6 }, vectors: { dream: 3, curious: 2 }, tint: "violet", price: 12 },
  { id: "emberfruit", name: "Emberfruit", note: "Warm all the way down", art: "emberfruit", base: false,
    effects: { fullness: 20, energy: 12 }, vectors: { brave: 4, playful: 1 }, tint: "gold", price: 11 },
  { id: "frostpetal", name: "Frost Petal", note: "Crisp, clean, a little brave", art: "frostpetal", base: false,
    effects: { energy: 14, joy: 4 }, vectors: { calm: 3, curious: 2 }, tint: "teal", price: 9 },
  { id: "honeydew", name: "Honeydew", note: "Slow, golden, generous", art: "honeydew", base: false,
    effects: { fullness: 24, joy: 8 }, vectors: { loving: 2, calm: 2 }, tint: "gold", price: 10 },
  { id: "gigglenut", name: "Gigglenut", note: "Rattles when you shake it", art: "gigglenut", base: false,
    effects: { fullness: 10, joy: 18 }, vectors: { playful: 4, social: 2 }, tint: "rose", price: 9 },
  { id: "tidepearl", name: "Tide Pearl", note: "Holds the sound of water", art: "tidepearl", base: false,
    effects: { fullness: 14, energy: 10 }, vectors: { curious: 3, nature: 3 }, tint: "teal", price: 12 },
  { id: "auroraleaf", name: "Aurora Leaf", note: "Changes colour while you look", art: "auroraleaf", base: false,
    effects: { joy: 16, energy: 6 }, vectors: { creative: 4, dream: 2 }, tint: "prism", price: 14 },
  { id: "rootcandy", name: "Root Candy", note: "Pulled straight from the soil", art: "rootcandy", base: false,
    effects: { fullness: 26 }, vectors: { nature: 4 }, tint: "green", price: 8 },
];

export const ingredientMap: Record<string, Ingredient> = Object.fromEntries(
  ingredients.map((item) => [item.id, item]),
);

/** The four treats the Snack Bar always shows. */
export const snackBarOrder = ["moonberry", "cloudpuff", "dewdrop", "sunseed"];

export function ingredientById(id: string): Ingredient | undefined {
  return ingredientMap[id];
}
