import type { RouteId, VectorId } from "../types.ts";

export type RouteDef = {
  id: RouteId;
  name: string;
  tagline: string;
  character: string[];
  look: string[];
  grow: string[];
  unlocks: string[];
  /** Vectors that push toward this route, weighted. */
  weights: Partial<Record<VectorId, number>>;
  palette: { body: string; belly: string; aura: string; leaf: string };
  rare: boolean;
  hint: string;
};

export const routes: RouteDef[] = [
  {
    id: "moonveil", name: "Moonveil", tagline: "Calm & dreamy", rare: false,
    character: ["calm", "dreamy", "gentle", "reflective"],
    look: ["Blue-lavender body", "Cool aura", "Moon markings", "Soft petal ears"],
    grow: ["Regular sleep", "Dream Doors", "Cloud Puff", "Evening visits", "Music", "Comforting"],
    unlocks: ["Deeper dreams", "Rare Dream Doors", "Night ingredients", "Dream memories"],
    weights: { dream: 3, calm: 3, creative: 1 },
    palette: { body: "#8FA5F2", belly: "#DCE3FF", aura: "#B9A3FF", leaf: "#A9C4FF" },
    hint: "drawn to moonlight and quiet evenings",
  },
  {
    id: "bloomheart", name: "Bloomheart", tagline: "Loving & gentle", rare: false,
    character: ["loving", "gentle", "caring", "social"],
    look: ["Pink-coral body", "Petals", "Heart markings", "Flowering aura"],
    grow: ["Petting", "Hugs", "Garden work", "Gifts", "Helping visitors", "Balanced meals"],
    unlocks: ["Rare plants", "Shared growing", "Healing garden", "Special gifts"],
    weights: { loving: 3, social: 2, nature: 2 },
    palette: { body: "#FF9BC4", belly: "#FFE1EC", aura: "#FF7FB2", leaf: "#FFB4D2" },
    hint: "happiest when the room is full of care",
  },
  {
    id: "sparkleap", name: "Sparkleap", tagline: "Playful & energetic", rare: false,
    character: ["playful", "energetic", "brave", "competitive"],
    look: ["Golden body", "Sun sparks", "Small wings", "Fast movement"],
    grow: ["Minigames", "Dancing", "Sunseed", "Active play", "High energy", "Exploring"],
    unlocks: ["Harder games", "Challenges", "Bigger combos", "Motion reactions"],
    weights: { playful: 3, brave: 3, social: 1 },
    palette: { body: "#FFC24A", belly: "#FFF0C6", aura: "#FF9A3D", leaf: "#FFD86B" },
    hint: "always looking for the next game",
  },
  {
    id: "mistwander", name: "Mistwander", tagline: "Curious & wise", rare: false,
    character: ["curious", "wise", "observant", "adventurous"],
    look: ["Teal-blue body", "Mist", "Water patterns", "Long leaf"],
    grow: ["Memory Seeds", "Exploration", "Dewdrop", "Telescope", "Finding things", "Variety"],
    unlocks: ["Expedition map", "World secrets", "Rarer finds", "Extra dialogue"],
    weights: { curious: 3, nature: 2, brave: 1, balance: 1 },
    palette: { body: "#5FD3D0", belly: "#D6F7F5", aura: "#49B7D8", leaf: "#7FE6DE" },
    hint: "keeps looking past the window",
  },
  {
    id: "prismatic", name: "Prismatic", tagline: "Celestial & radiant", rare: true,
    character: ["rare", "balanced", "radiant", "deeply bonded"],
    look: ["White-lavender body", "Crystal leaves", "Prism wings", "Rainbow glow"],
    grow: ["Very high bond", "Balanced care", "Wide variety", "Several talents", "Many memories"],
    unlocks: ["Blended abilities", "Unique dreams", "Prismatic memories", "Special Legacy Seed"],
    weights: { balance: 4, dream: 1, loving: 1, curious: 1, playful: 1, brave: 1, creative: 1 },
    palette: { body: "#E7DDFF", belly: "#FFFFFF", aura: "#C9A6FF", leaf: "#BFE9FF" },
    hint: "shimmering slightly at the edges",
  },
];

export const routeMap: Record<RouteId, RouteDef> = Object.fromEntries(
  routes.map((r) => [r.id, r]),
) as Record<RouteId, RouteDef>;

/** Prismatic only opens when every one of these holds. */
export const prismaticRequirements = {
  bond: 88,
  minVector: 26,
  talents: 3,
  memories: 14,
  /** Spread between the strongest and weakest vector must stay under this. */
  maxSpread: 34,
};
