import type { ItemCategory, VectorId } from "../types.ts";

export type ShopItem = {
  id: string;
  name: string;
  note: string;
  category: ItemCategory;
  art: string;
  price: number;
  currency: "dewdrops" | "starFragments";
  /** What Niumpi does with it in Play Mode. */
  reaction: string | null;
  vectors: Partial<Record<VectorId, number>>;
  /** Width/height on the room grid. */
  size: [number, number];
  starter?: boolean;
};

export const shopItems: ShopItem[] = [
  { id: "moon-lamp", name: "Moon Lamp", note: "A small moon that stays up", category: "lights", art: "moonlamp", price: 60, currency: "dewdrops", reaction: "Sits under it and goes quiet", vectors: { dream: 2, calm: 1 }, size: [1, 1], starter: true },
  { id: "cloud-sofa", name: "Cloud Sofa", note: "Sinks exactly one Niumpi deep", category: "furniture", art: "sofa", price: 90, currency: "dewdrops", reaction: "Flops over the arm and rests", vectors: { calm: 2 }, size: [2, 1], starter: true },
  { id: "star-rug", name: "Star Rug", note: "Warm underfoot, loud underpaw", category: "furniture", art: "rug", price: 70, currency: "dewdrops", reaction: "Dances on it", vectors: { playful: 2, social: 1 }, size: [2, 2] },
  { id: "dream-tent", name: "Dream Tent", note: "Dreams come out stranger in here", category: "furniture", art: "tent", price: 300, currency: "dewdrops", reaction: "Unlocks a rarer kind of dream", vectors: { dream: 3 }, size: [2, 2] },
  { id: "telescope", name: "Telescope", note: "Points at whatever is newest", category: "toys", art: "telescope", price: 220, currency: "dewdrops", reaction: "Studies the sky at night", vectors: { curious: 3, dream: 1 }, size: [1, 2] },
  { id: "music-radio", name: "Music Radio", note: "Two stations, both good", category: "music", art: "radio", price: 140, currency: "dewdrops", reaction: "Starts a Leafbeat session", vectors: { creative: 3 }, size: [1, 1] },
  { id: "memory-shelf", name: "Memory Shelf", note: "Holds the things worth keeping", category: "furniture", art: "shelf", price: 160, currency: "dewdrops", reaction: "Rearranges the collection", vectors: { creative: 2, loving: 1 }, size: [2, 2] },
  { id: "garden-pot", name: "Garden Pot", note: "One plant, indoors, spoiled", category: "plants", art: "pot", price: 45, currency: "dewdrops", reaction: "Waters it without being asked", vectors: { nature: 2 }, size: [1, 1], starter: true },
  { id: "cozy-cushion", name: "Cozy Cushion", note: "The correct shape for sitting", category: "furniture", art: "cushion", price: 35, currency: "dewdrops", reaction: "Kneads it, then sits", vectors: { calm: 2, loving: 1 }, size: [1, 1], starter: true },
  { id: "aurora-window", name: "Aurora Window", note: "A better sky than the real one", category: "themes", art: "window", price: 260, currency: "dewdrops", reaction: "Watches colours move", vectors: { dream: 2, creative: 2 }, size: [2, 2] },
  { id: "moon-bed", name: "Moon Bed", note: "Crescent-shaped, obviously", category: "furniture", art: "bed", price: 180, currency: "dewdrops", reaction: "Sleeps deeper here", vectors: { calm: 3, dream: 1 }, size: [2, 2] },
  { id: "toy-chest", name: "Toy Chest", note: "Everything ends up in here", category: "toys", art: "chest", price: 110, currency: "dewdrops", reaction: "Picks a toy at random", vectors: { playful: 2 }, size: [2, 1] },
  { id: "leaf-mobile", name: "Leaf Mobile", note: "Turns when nobody watches", category: "toys", art: "mobile", price: 80, currency: "dewdrops", reaction: "Bats at it gently", vectors: { curious: 2, playful: 1 }, size: [1, 1] },
  { id: "fern-corner", name: "Fern Corner", note: "Three ferns of increasing confidence", category: "plants", art: "fern", price: 95, currency: "dewdrops", reaction: "Hides behind the big one", vectors: { nature: 3 }, size: [1, 2] },
  { id: "paper-lanterns", name: "Paper Lanterns", note: "Warm light on a string", category: "lights", art: "lanterns", price: 120, currency: "dewdrops", reaction: "Turns them on at sunset", vectors: { calm: 2, social: 1 }, size: [2, 1] },
  { id: "star-projector", name: "Star Projector", note: "The ceiling becomes a sky", category: "lights", art: "projector", price: 240, currency: "dewdrops", reaction: "Lies down and points", vectors: { dream: 3, curious: 1 }, size: [1, 1] },
  { id: "little-mirror", name: "Little Mirror", note: "Endlessly surprising", category: "furniture", art: "mirror", price: 75, currency: "dewdrops", reaction: "Makes faces at itself", vectors: { social: 2, playful: 1 }, size: [1, 2] },
  { id: "ball-of-yarn", name: "Ball of Yarn", note: "Structurally doomed", category: "toys", art: "yarn", price: 30, currency: "dewdrops", reaction: "Unravels it enthusiastically", vectors: { playful: 3 }, size: [1, 1], starter: true },
  { id: "wind-chimes", name: "Wind Chimes", note: "Answers the window", category: "music", art: "chimes", price: 100, currency: "dewdrops", reaction: "Listens with the leaf up", vectors: { creative: 2, calm: 2 }, size: [1, 1] },
  { id: "map-table", name: "Map Table", note: "For planning long walks", category: "furniture", art: "maptable", price: 200, currency: "dewdrops", reaction: "Plans an expedition", vectors: { curious: 3, brave: 2 }, size: [2, 1] },
  { id: "sun-crown", name: "Sun Crown", note: "Worn at a slight angle", category: "accessories", art: "crown", price: 12, currency: "starFragments", reaction: null, vectors: { brave: 2 }, size: [1, 1] },
  { id: "star-scarf", name: "Star Scarf", note: "Long enough to trip on", category: "accessories", art: "scarf", price: 10, currency: "starFragments", reaction: null, vectors: { dream: 2 }, size: [1, 1] },
  { id: "flower-pin", name: "Flower Pin", note: "One perfect bloom", category: "accessories", art: "pin", price: 8, currency: "starFragments", reaction: null, vectors: { loving: 2 }, size: [1, 1] },
  { id: "explorer-cap", name: "Explorer Cap", note: "Slightly too big on purpose", category: "accessories", art: "cap", price: 10, currency: "starFragments", reaction: null, vectors: { curious: 2 }, size: [1, 1] },
];

export const itemMap: Record<string, ShopItem> = Object.fromEntries(shopItems.map((i) => [i.id, i]));

export const roomCategories: Array<{ id: "all" | ItemCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "furniture", label: "Furniture" },
  { id: "plants", label: "Plants" },
  { id: "toys", label: "Toys" },
  { id: "lights", label: "Lights" },
  { id: "themes", label: "Themes" },
];

export const shopCategories: Array<{ id: "all" | ItemCategory; label: string }> = [
  ...roomCategories,
  { id: "accessories", label: "Accessories" },
  { id: "music", label: "Music" },
];

export const roomThemes = [
  { id: "cozy", name: "Cozy Loft", note: "Warm cream and peach", art: "cozy" },
  { id: "moonlit", name: "Moonlit Study", note: "Deep blue and silver", art: "moonlit" },
  { id: "greenhouse", name: "Greenhouse", note: "Glass, ferns and light", art: "greenhouse" },
];

/** Toys that can be handed over directly on the companion scene. */
export const toys = [
  { id: "ball-of-yarn", label: "Yarn" },
  { id: "leaf-mobile", label: "Mobile" },
  { id: "toy-chest", label: "Chest" },
];

export const ROOM_COLS = 8;
export const ROOM_ROWS = 5;
