import type { Reward, VectorId } from "../types.ts";

export type DreamDoor = {
  id: string;
  name: string;
  note: string;
  art: string;
  vectors: Partial<Record<VectorId, number>>;
  /** Outcome ids this door can produce. */
  pool: string[];
};

export type DreamOutcome = {
  id: string;
  title: string;
  story: string;
  rewards: Reward[];
  /** Optional memory the morning creates. */
  memory?: { title: string; body: string; art: string };
};

export const dreamDoors: DreamDoor[] = [
  { id: "moon-garden", name: "Moon Garden", note: "Purple flowers that open at night", art: "moongarden",
    vectors: { dream: 4, nature: 2, calm: 2 }, pool: ["silver-row", "sleeping-fox", "seed-packet", "moon-recipe"] },
  { id: "cloud-ocean", name: "Cloud Ocean", note: "Soft water, softer light", art: "cloudocean",
    vectors: { calm: 4, creative: 2, dream: 2 }, pool: ["floating-house", "long-swim", "puff-harvest", "cloud-song"] },
  { id: "ember-cave", name: "Ember Cave", note: "Warm crystals, deeper down", art: "embercave",
    vectors: { brave: 4, curious: 2, playful: 1 }, pool: ["warm-stone", "echo-room", "ember-find", "brave-step"] },
];

export const dreamOutcomes: DreamOutcome[] = [
  { id: "silver-row", title: "A row of silver flowers", story: "They opened one at a time, in order, as if introducing themselves.",
    rewards: [{ kind: "ingredient", id: "moonberry", amount: 3 }, { kind: "currency", id: "dewdrops", amount: 14 }] },
  { id: "sleeping-fox", title: "Someone else was sleeping too", story: "A small pale fox, curled in the same dream. Neither of us moved.",
    rewards: [{ kind: "ingredient", id: "dreammint", amount: 2 }],
    memory: { title: "The fox in the moon garden", body: "We shared a dream and agreed, without speaking, not to wake each other.", art: "dream" } },
  { id: "seed-packet", title: "A packet of seeds by the gate", story: "No name on it. Just a drawing of something tall.",
    rewards: [{ kind: "ingredient", id: "rootcandy", amount: 2 }, { kind: "currency", id: "starFragments", amount: 1 }] },
  { id: "moon-recipe", title: "A recipe written on a leaf", story: "Three ingredients, one instruction: wait until it is quiet.",
    rewards: [{ kind: "recipe", id: "dream-tart" }] },
  { id: "floating-house", title: "A house that floated past", story: "Its windows were lit. Someone waved. I waved back with the leaf.",
    rewards: [{ kind: "ingredient", id: "cloudpuff", amount: 3 }, { kind: "currency", id: "dewdrops", amount: 12 }] },
  { id: "long-swim", title: "I swam without getting wet", story: "The whole ocean was made of the good part of falling asleep.",
    rewards: [{ kind: "ingredient", id: "frostpetal", amount: 2 }],
    memory: { title: "Swimming in the Cloud Ocean", body: "I went all the way down and it was still soft at the bottom.", art: "dream" } },
  { id: "puff-harvest", title: "Cloud harvest", story: "They come away easily if you ask first.",
    rewards: [{ kind: "ingredient", id: "cloudpuff", amount: 5 }] },
  { id: "cloud-song", title: "A song with no words", story: "I remembered the tune and lost it again at breakfast. Mostly.",
    rewards: [{ kind: "recipe", id: "sleepy-mint-tea" }, { kind: "currency", id: "dewdrops", amount: 10 }] },
  { id: "warm-stone", title: "A stone that stayed warm", story: "I carried it the whole way and it never cooled down.",
    rewards: [{ kind: "ingredient", id: "emberfruit", amount: 2 }, { kind: "currency", id: "dewdrops", amount: 14 }] },
  { id: "echo-room", title: "The room that answered", story: "I said my name. It said it back, slightly better.",
    rewards: [{ kind: "currency", id: "starFragments", amount: 2 }],
    memory: { title: "The echo in Ember Cave", body: "Something down there knows my name now. I don't mind.", art: "dream" } },
  { id: "ember-find", title: "Something bright in the wall", story: "It came loose after three tries. I was very brave about it.",
    rewards: [{ kind: "ingredient", id: "sunseed", amount: 4 }, { kind: "currency", id: "dewdrops", amount: 16 }] },
  { id: "brave-step", title: "One step further than last time", story: "The dark went on, so I did too, and then I came home.",
    rewards: [{ kind: "recipe", id: "ember-stew" }] },
];

export const dreamOutcomeMap: Record<string, DreamOutcome> = Object.fromEntries(
  dreamOutcomes.map((o) => [o.id, o]),
);

export const dreamDoorMap: Record<string, DreamDoor> = Object.fromEntries(
  dreamDoors.map((d) => [d.id, d]),
);

/** Items Niumpi can carry into a dream, and what they bias. */
export const dreamCarry = [
  { id: "none", label: "Nothing", note: "Travel light" },
  { id: "blanket", label: "Blanket", note: "Longer, calmer dream" },
  { id: "lantern", label: "Lantern", note: "Finds more things" },
  { id: "leaf", label: "A leaf", note: "Better chance of a memory" },
];

/** How long a chosen dream takes before the morning card can be claimed. */
export const DREAM_MS = 45 * 60 * 1000;
