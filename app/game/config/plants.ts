export type Plant = {
  id: string;
  name: string;
  note: string;
  art: string;
  /** Hours from planting to harvest, before weather and watering. */
  hours: number;
  yields: string;
  amount: number;
  price: number;
  /** Weather that speeds this plant up. */
  loves: string[];
  rareChance: number;
  unlockAt: number;
};

export const plants: Plant[] = [
  { id: "moonberry-bush", name: "Moonberry Bush", note: "Fruits only after dark", art: "moonberry", hours: 4, yields: "moonberry", amount: 3, price: 20, loves: ["cloudy", "starfall"], rareChance: 0.1, unlockAt: 0 },
  { id: "sunseed-flower", name: "Sunseed Flower", note: "Turns to follow you", art: "sunseed", hours: 3, yields: "sunseed", amount: 3, price: 20, loves: ["sunny"], rareChance: 0.1, unlockAt: 0 },
  { id: "dewdrop-lily", name: "Dewdrop Lily", note: "Collects its own water", art: "dewdrop", hours: 2, yields: "dewdrop", amount: 4, price: 15, loves: ["rainy", "storm"], rareChance: 0.08, unlockAt: 0 },
  { id: "dream-mint", name: "Dream Mint", note: "Smells like falling asleep", art: "dreammint", hours: 6, yields: "dreammint", amount: 2, price: 40, loves: ["cloudy"], rareChance: 0.12, unlockAt: 3 },
  { id: "cloud-blossom", name: "Cloud Blossom", note: "Petals never quite touch", art: "cloudpuff", hours: 5, yields: "cloudpuff", amount: 3, price: 30, loves: ["cloudy", "rainy"], rareChance: 0.1, unlockAt: 2 },
  { id: "heartberry-vine", name: "Heartberry Vine", note: "Grows toward company", art: "heartberry", hours: 8, yields: "heartberry", amount: 2, price: 55, loves: ["sunny"], rareChance: 0.15, unlockAt: 5 },
  { id: "star-mushroom", name: "Star Mushroom", note: "Needs one night to decide", art: "starmush", hours: 10, yields: "starmush", amount: 2, price: 70, loves: ["starfall", "storm"], rareChance: 0.18, unlockAt: 8 },
  { id: "frost-petal", name: "Frost Petal", note: "Cool to hold, warm to eat", art: "frostpetal", hours: 7, yields: "frostpetal", amount: 2, price: 50, loves: ["cloudy"], rareChance: 0.12, unlockAt: 6 },
  { id: "ember-shrub", name: "Ember Shrub", note: "Keeps its own small heat", art: "emberfruit", hours: 9, yields: "emberfruit", amount: 2, price: 65, loves: ["sunny", "storm"], rareChance: 0.14, unlockAt: 10 },
  { id: "aurora-fern", name: "Aurora Fern", note: "Different every time you look", art: "auroraleaf", hours: 12, yields: "auroraleaf", amount: 2, price: 95, loves: ["starfall"], rareChance: 0.2, unlockAt: 14 },
];

export const plantMap: Record<string, Plant> = Object.fromEntries(plants.map((p) => [p.id, p]));

export const GARDEN_PLOTS = 6;
/** Watering shaves this fraction off the remaining wait, once per plant. */
export const WATER_BOOST = 0.25;
