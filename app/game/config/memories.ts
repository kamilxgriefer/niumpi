import type { MemoryKind } from "../types.ts";

export type MemoryTemplate = {
  id: string;
  kind: MemoryKind;
  title: string;
  body: string;
  quote?: string;
  art: string;
};

/** Milestones only fire once — the claim key is the template id. */
export const memoryTemplates: MemoryTemplate[] = [
  { id: "we-met", kind: "milestone", title: "The day we met", body: "A seed on a cushion, and someone willing to wait for it.", quote: "…nium?", art: "seed" },
  { id: "first-hatch", kind: "milestone", title: "First hatch", body: "The shell came apart quietly and there you were.", quote: "Oh! Hello!", art: "hatch" },
  { id: "first-name", kind: "milestone", title: "A name of your own", body: "It stuck immediately, the way good names do.", art: "name" },
  { id: "first-feed", kind: "milestone", title: "First shared snack", body: "Held it in both hands and looked at you the whole time.", quote: "This is the best one.", art: "snack" },
  { id: "first-favorite", kind: "story", title: "A favourite is decided", body: "After careful research, a winner emerged.", art: "snack" },
  { id: "first-rain", kind: "story", title: "The first rainy day", body: "Nose to the window for most of the afternoon.", quote: "The rain sounds cozy today.", art: "rain" },
  { id: "first-sleep", kind: "milestone", title: "First good night", body: "Tucked in, lamp low, out in seconds.", art: "sleep" },
  { id: "first-dream", kind: "dream", title: "The first dream", body: "Somewhere with doors. That is all we know.", art: "dream" },
  { id: "first-recipe", kind: "milestone", title: "First recipe", body: "It worked. Nobody is entirely sure why.", art: "cook" },
  { id: "first-game", kind: "milestone", title: "First win", body: "Very casual about it. Not casual about it at all.", art: "game" },
  { id: "first-visitor", kind: "friend", title: "First visitor", body: "Someone knocked. It went well.", art: "friend" },
  { id: "first-trait", kind: "story", title: "Something true", body: "The first real piece of a personality showed itself.", art: "trait" },
  { id: "first-evolution", kind: "evolution", title: "First change", body: "The colours settled somewhere new overnight.", art: "evolve" },
  { id: "first-room", kind: "story", title: "A room of one's own", body: "Everything moved exactly one place to the left.", art: "room" },
  { id: "first-plant", kind: "story", title: "The first plant", body: "Watered slightly too often, and thriving anyway.", art: "plant" },
  { id: "first-harvest", kind: "story", title: "The first harvest", body: "Grown, picked and eaten within the hour.", art: "plant" },
  { id: "first-expedition", kind: "story", title: "The first long walk", body: "Left small, came back slightly larger somehow.", art: "explore" },
  { id: "best-friend", kind: "milestone", title: "Best friends", body: "The bond stopped being new and started being ordinary, in the best way.", art: "bond" },
  { id: "long-return", kind: "milestone", title: "You came back", body: "Nothing was lost. Something had been saved for you.", quote: "You're back! I kept something for you.", art: "return" },
  { id: "route-locked", kind: "evolution", title: "A direction", body: "All that care pointed one way, and it went that way.", art: "evolve" },
  { id: "legacy", kind: "milestone", title: "A seed of your own", body: "Something to pass on, when the time comes.", art: "legacy" },
];

export const memoryTemplateMap: Record<string, MemoryTemplate> = Object.fromEntries(
  memoryTemplates.map((m) => [m.id, m]),
);

export const memoryFilters: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "story", label: "Stories" },
  { id: "milestone", label: "Milestones" },
  { id: "dream", label: "Dreams" },
  { id: "evolution", label: "Evolution" },
  { id: "friend", label: "Friends" },
  { id: "favorite", label: "Favourites" },
];
