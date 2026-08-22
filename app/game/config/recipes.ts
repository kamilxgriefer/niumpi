import type { StatId, TalentId, VectorId } from "../types.ts";

export type Recipe = {
  id: string;
  name: string;
  note: string;
  art: string;
  /** Sorted ingredient ids; matching ignores the order the cook picked. */
  parts: string[];
  effects: Partial<Record<StatId, number>>;
  vectors: Partial<Record<VectorId, number>>;
  /** Extra flavour shown on the result card. */
  bonus: string | null;
  talent: TalentId;
};

export const recipes: Recipe[] = [
  { id: "moon-cloud-cake", name: "Moonberry Cloud Cake", note: "The first cake anyone learns", art: "cake",
    parts: ["cloudpuff", "dewdrop", "moonberry"], effects: { fullness: 20, joy: 20 },
    vectors: { dream: 4, calm: 3, creative: 2 }, bonus: "Dream Bonus", talent: "cooking" },
  { id: "dewdrop-jelly", name: "Dewdrop Jelly", note: "Wobbles when it hears you", art: "jelly",
    parts: ["dewdrop", "frostpetal"], effects: { fullness: 14, energy: 18 },
    vectors: { curious: 4, calm: 2 }, bonus: "Clear Head", talent: "cooking" },
  { id: "sunseed-crunch", name: "Sunseed Crunch", note: "Loud, golden, unstoppable", art: "crunch",
    parts: ["emberfruit", "sunseed"], effects: { fullness: 18, energy: 22, joy: 8 },
    vectors: { brave: 5, playful: 3 }, bonus: "Sprint Bonus", talent: "cooking" },
  { id: "starlight-soup", name: "Starlight Soup", note: "Best eaten with the lamp off", art: "soup",
    parts: ["dewdrop", "starmush", "tidepearl"], effects: { fullness: 26, energy: 10 },
    vectors: { dream: 5, curious: 3 }, bonus: "Night Vision", talent: "cooking" },
  { id: "sleepy-mint-tea", name: "Sleepy Mint Tea", note: "A cup that makes the room quieter", art: "tea",
    parts: ["dreammint", "honeydew"], effects: { fullness: 8, energy: 20, joy: 6 },
    vectors: { calm: 5, dream: 3 }, bonus: "Deeper Sleep", talent: "cooking" },
  { id: "cloud-pudding", name: "Cloud Pudding", note: "Somehow both warm and cold", art: "pudding",
    parts: ["cloudpuff", "honeydew"], effects: { fullness: 22, joy: 12 },
    vectors: { calm: 3, loving: 2 }, bonus: null, talent: "cooking" },
  { id: "dream-tart", name: "Dream Tart", note: "Its filling remembers last night", art: "tart",
    parts: ["dreammint", "moonberry", "starmush"], effects: { fullness: 24, joy: 18 },
    vectors: { dream: 6, calm: 2 }, bonus: "Rare Dream", talent: "cooking" },
  { id: "garden-salad", name: "Garden Salad", note: "Everything picked this morning", art: "salad",
    parts: ["auroraleaf", "rootcandy", "tidepearl"], effects: { fullness: 28, energy: 8 },
    vectors: { nature: 6, creative: 2 }, bonus: "Green Thumb", talent: "gardening" },
  { id: "aurora-smoothie", name: "Aurora Smoothie", note: "Three colours that refuse to mix", art: "smoothie",
    parts: ["auroraleaf", "dewdrop", "heartberry"], effects: { fullness: 16, energy: 16, joy: 16 },
    vectors: { creative: 5, loving: 3, balance: 2 }, bonus: "Balanced", talent: "cooking" },
  { id: "mystery-puff", name: "Mystery Puff", note: "Nobody agrees on the flavour", art: "puff",
    parts: ["cloudpuff", "gigglenut"], effects: { fullness: 12, joy: 24 },
    vectors: { playful: 5, social: 2 }, bonus: "Surprise", talent: "cooking" },
  { id: "heart-jam", name: "Heartberry Jam", note: "Made in a jar meant for sharing", art: "jam",
    parts: ["heartberry", "honeydew"], effects: { fullness: 20, joy: 20 },
    vectors: { loving: 6, social: 3 }, bonus: "Warm Hug", talent: "cooking" },
  { id: "ember-stew", name: "Ember Stew", note: "Keeps a cave warm for hours", art: "stew",
    parts: ["emberfruit", "rootcandy", "sunseed"], effects: { fullness: 32, energy: 14 },
    vectors: { brave: 6, nature: 2 }, bonus: "Brave Heart", talent: "cooking" },
  { id: "tide-fizz", name: "Tide Fizz", note: "Pops like small polite waves", art: "fizz",
    parts: ["frostpetal", "tidepearl"], effects: { energy: 24, joy: 10 },
    vectors: { curious: 5, nature: 2 }, bonus: "Explorer's Kick", talent: "exploration" },
  { id: "giggle-cookies", name: "Giggle Cookies", note: "Impossible to eat quietly", art: "cookies",
    parts: ["gigglenut", "sunseed"], effects: { fullness: 18, joy: 22 },
    vectors: { playful: 6, brave: 2 }, bonus: "Dance Bonus", talent: "music" },
  { id: "prism-parfait", name: "Prism Parfait", note: "Every spoonful a different colour", art: "parfait",
    parts: ["auroraleaf", "heartberry", "starmush"], effects: { fullness: 24, energy: 18, joy: 24 },
    vectors: { creative: 4, dream: 4, loving: 4, balance: 4 }, bonus: "Prismatic Spark", talent: "cooking" },
];

export const recipeMap: Record<string, Recipe> = Object.fromEntries(recipes.map((r) => [r.id, r]));

/** Recipes are matched on their sorted parts, so pick order never matters. */
export const recipeByKey: Record<string, Recipe> = Object.fromEntries(
  recipes.map((r) => [[...r.parts].sort().join("+"), r]),
);

export function matchRecipe(parts: string[]): Recipe | null {
  return recipeByKey[[...parts].sort().join("+")] ?? null;
}

/** Known from the very first cook so the book is never empty. */
export const starterRecipes = ["moon-cloud-cake", "dewdrop-jelly"];
