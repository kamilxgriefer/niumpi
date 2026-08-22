import type { VectorId } from "../types.ts";

export type Trait = {
  id: string;
  name: string;
  note: string;
  /** Player-facing explanation of how it showed up. */
  how: string;
  symbol: string;
  /** Hidden counter that must reach `threshold` before the trait reveals. */
  signal: string;
  threshold: number;
  vectors: Partial<Record<VectorId, number>>;
};

export const traits: Trait[] = [
  { id: "storm-lover", name: "Storm Lover", note: "Rain makes the room feel bigger", how: "You kept playing while it rained", symbol: "☂", signal: "rain", threshold: 3, vectors: { calm: 2, curious: 1 } },
  { id: "foodie", name: "Foodie", note: "Tastes everything twice before deciding", how: "You offered many different treats", symbol: "◕", signal: "foodVariety", threshold: 6, vectors: { creative: 2 } },
  { id: "curious", name: "Curious", note: "Follows anything that moves", how: "You explored instead of settling", symbol: "⌁", signal: "explore", threshold: 4, vectors: { curious: 3 } },
  { id: "music-fan", name: "Music Fan", note: "Hums along before the second bar", how: "You played rhythm games together", symbol: "♪", signal: "music", threshold: 3, vectors: { creative: 2, playful: 1 } },
  { id: "night-owl", name: "Night Owl", note: "Wakes up properly after sunset", how: "Most of your visits were at night", symbol: "☾", signal: "night", threshold: 5, vectors: { dream: 2, calm: 1 } },
  { id: "blanket-thief", name: "Blanket Thief", note: "Owns every blanket by morning", how: "You tucked them in again and again", symbol: "▧", signal: "sleep", threshold: 5, vectors: { calm: 2 } },
  { id: "shy-dancer", name: "Shy Dancer", note: "Only dances when nobody looks", how: "You danced without an audience", symbol: "✧", signal: "dance", threshold: 3, vectors: { playful: 2, social: 1 } },
  { id: "brave-explorer", name: "Brave Explorer", note: "Walks into the dark first", how: "You sent them on long adventures", symbol: "➤", signal: "expedition", threshold: 3, vectors: { brave: 3 } },
  { id: "picky-eater", name: "Picky Eater", note: "Has opinions, states them clearly", how: "One treat kept coming back", symbol: "✕", signal: "foodRepeat", threshold: 8, vectors: { creative: 1 } },
  { id: "cloud-obsessed", name: "Cloud Obsessed", note: "Names every cloud that passes", how: "Cloud Puffs became a habit", symbol: "☁", signal: "cloudpuff", threshold: 6, vectors: { calm: 2, dream: 1 } },
  { id: "gentle-soul", name: "Gentle Soul", note: "Careful with everything small", how: "You were gentle far more than rough", symbol: "♡", signal: "gentle", threshold: 8, vectors: { loving: 3 } },
  { id: "mischievous", name: "Mischievous", note: "Hides the thing you just put down", how: "You kept tickling instead of resting", symbol: "≈", signal: "tickle", threshold: 5, vectors: { playful: 3 } },
  { id: "collector", name: "Collector", note: "Keeps one of everything, just in case", how: "You filled the room with things", symbol: "▣", signal: "items", threshold: 6, vectors: { creative: 2, nature: 1 } },
  { id: "sleepyhead", name: "Sleepyhead", note: "Naps are a whole personality", how: "Sleep was the answer to most days", symbol: "z", signal: "sleep", threshold: 10, vectors: { calm: 3, dream: 1 } },
  { id: "garden-helper", name: "Garden Helper", note: "Waters plants you already watered", how: "You gardened together often", symbol: "❦", signal: "garden", threshold: 5, vectors: { nature: 3 } },
  { id: "dramatic", name: "Dramatic", note: "Every feeling is the biggest feeling", how: "Your care swung between extremes", symbol: "✦", signal: "swing", threshold: 4, vectors: { creative: 2, social: 1 } },
  { id: "fast-learner", name: "Fast Learner", note: "Beats your score on the second try", how: "You kept coming back to the games", symbol: "▲", signal: "minigame", threshold: 8, vectors: { brave: 2, playful: 1 } },
  { id: "social-butterfly", name: "Social Butterfly", note: "Knows the neighbours by name", how: "You visited other Niumpi", symbol: "❋", signal: "social", threshold: 4, vectors: { social: 3 } },
  { id: "quiet-observer", name: "Quiet Observer", note: "Watches longer than it plays", how: "You let long calm moments happen", symbol: "◌", signal: "calmVisit", threshold: 6, vectors: { calm: 2, curious: 2 } },
  { id: "star-gazer", name: "Star Gazer", note: "Finds one more star every night", how: "You looked up together", symbol: "★", signal: "stars", threshold: 4, vectors: { dream: 3, curious: 1 } },
];

export const traitMap: Record<string, Trait> = Object.fromEntries(traits.map((t) => [t.id, t]));

/** Signals a single action feeds, so the reveal check stays one table lookup. */
export const signalOrder = Array.from(new Set(traits.map((t) => t.signal)));
