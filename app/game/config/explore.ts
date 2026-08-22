import type { Reward, VectorId } from "../types.ts";

export type ExpeditionLength = { id: string; label: string; ms: number; luck: number };

export const expeditionLengths: ExpeditionLength[] = [
  { id: "short", label: "15 minutes", ms: 15 * 60_000, luck: 1 },
  { id: "hour", label: "1 hour", ms: 60 * 60_000, luck: 1.6 },
  { id: "long", label: "4 hours", ms: 4 * 60 * 60_000, luck: 2.4 },
  { id: "night", label: "All night", ms: 8 * 60 * 60_000, luck: 3.4 },
];

export type Gear = { id: string; label: string; note: string; vectors: Partial<Record<VectorId, number>>; favours: string[] };

export const expeditionGear: Gear[] = [
  { id: "basket", label: "Basket", note: "Comes home full", vectors: { nature: 2 }, favours: ["ingredient"] },
  { id: "umbrella", label: "Umbrella", note: "Weather stops mattering", vectors: { calm: 2 }, favours: ["story"] },
  { id: "camera", label: "Camera", note: "Brings back a picture", vectors: { creative: 2 }, favours: ["memory"] },
  { id: "blanket", label: "Blanket", note: "For long sits", vectors: { loving: 2 }, favours: ["memory", "story"] },
  { id: "compass", label: "Compass", note: "Goes further out", vectors: { brave: 2, curious: 2 }, favours: ["rare", "map"] },
];

export type ExploreOutcome = {
  id: string;
  story: string;
  kind: "ingredient" | "story" | "memory" | "rare" | "map";
  rewards: Reward[];
  memory?: { title: string; body: string; art: string };
};

export const exploreOutcomes: ExploreOutcome[] = [
  { id: "tiny-door", kind: "story", story: "Niumpi found a tiny door beneath a mushroom, but it was too shy to knock.",
    rewards: [{ kind: "currency", id: "dewdrops", amount: 18 }] },
  { id: "berry-patch", kind: "ingredient", story: "A whole patch of Moonberries nobody had claimed. Niumpi claimed them.",
    rewards: [{ kind: "ingredient", id: "moonberry", amount: 5 }] },
  { id: "wet-path", kind: "ingredient", story: "It rained the entire way. Niumpi came back damp and delighted, pockets full.",
    rewards: [{ kind: "ingredient", id: "dewdrop", amount: 6 }] },
  { id: "warm-hill", kind: "ingredient", story: "A south-facing hill where everything ripens early.",
    rewards: [{ kind: "ingredient", id: "sunseed", amount: 5 }, { kind: "currency", id: "dewdrops", amount: 10 }] },
  { id: "old-map", kind: "map", story: "Half a map, torn along a river. The other half is somewhere.",
    rewards: [{ kind: "currency", id: "starFragments", amount: 2 }] },
  { id: "lost-recipe", kind: "rare", story: "A page from someone's cookbook, pressed flat under a stone.",
    rewards: [{ kind: "recipe", id: "starlight-soup" }] },
  { id: "quiet-clearing", kind: "memory", story: "Niumpi sat in a clearing for a long time and did not do anything at all.",
    rewards: [{ kind: "currency", id: "dewdrops", amount: 12 }],
    memory: { title: "The quiet clearing", body: "Nothing happened there, and that was the whole point of going.", art: "explore" } },
  { id: "new-friend", kind: "story", story: "Someone small waved from a hollow tree. They agreed to wave again tomorrow.",
    rewards: [{ kind: "currency", id: "dewdrops", amount: 16 }, { kind: "currency", id: "starFragments", amount: 1 }] },
  { id: "storm-shelter", kind: "memory", story: "The weather turned. Niumpi waited it out under a wide leaf and rather enjoyed it.",
    rewards: [{ kind: "ingredient", id: "frostpetal", amount: 2 }],
    memory: { title: "Waiting out the storm", body: "Wide leaf, loud rain, no hurry. Niumpi wants to do it again.", art: "explore" } },
  { id: "glowing-cave", kind: "rare", story: "Something glowed at the back of a cave. It came home in Niumpi's arms.",
    rewards: [{ kind: "ingredient", id: "starmush", amount: 3 }, { kind: "currency", id: "starFragments", amount: 2 }] },
];

export const exploreOutcomeMap: Record<string, ExploreOutcome> = Object.fromEntries(
  exploreOutcomes.map((o) => [o.id, o]),
);
