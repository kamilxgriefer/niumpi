import { GARDEN_PLOTS } from "./config/plants.ts";
import { starterRecipes } from "./config/recipes.ts";
import { shopItems } from "./config/items.ts";
import type {
  CareStats, GameState, PlacedItem, Plot, Settings, VectorId,
} from "./types.ts";
import { dayKeyFor, weekKeyFor } from "./time.ts";

export const SAVE_VERSION = 5;
export const STORAGE_KEY = "niumpi-save-v5";
/** Read in order when the current key is missing, then migrated forward. */
export const LEGACY_KEYS = ["niumpi-memory-v3", "niumpi-memory-v2", "niumpi-memory-v1"];
export const PRIOR_SAVE_KEYS = ["niumpi-save-v4"];

export const vectorIds: VectorId[] = [
  "calm", "playful", "loving", "curious", "brave",
  "creative", "social", "dream", "nature", "balance",
];

export const defaultSettings: Settings = {
  sound: true,
  music: true,
  effects: true,
  reducedMotion: "system",
  lowPower: false,
  seedQuestions: true,
  shareProfile: false,
};

export const defaultStats: CareStats = {
  fullness: 72, energy: 80, joy: 75,
  comfort: 60, curiosity: 50, wellbeing: 70, variety: 40, trust: 30,
};

function emptyVectors(): Record<VectorId, number> {
  return Object.fromEntries(vectorIds.map((id) => [id, 0])) as Record<VectorId, number>;
}

function starterPlots(): Plot[] {
  return Array.from({ length: GARDEN_PLOTS }, (_, id) => ({
    id, plantId: null, plantedAt: null, wateredAt: null, harvestReadyAt: null, rare: false,
  }));
}

/** Starter furniture, arranged so a brand-new room already looks lived in. */
function starterLayout(): PlacedItem[] {
  const spots: Array<[string, number, number]> = [
    ["cloud-sofa", 1, 2], ["cozy-cushion", 4, 3], ["garden-pot", 6, 1], ["moon-lamp", 0, 1],
  ];
  return spots.map(([itemId, x, y], index) => ({
    uid: `start-${itemId}`, itemId, x, y, flipped: false, layer: index,
  }));
}

export const starterItems = shopItems.filter((item) => item.starter).map((item) => item.id);

export function createGameState(now: number, id: string): GameState {
  return {
    version: SAVE_VERSION,
    profile: { id, createdAt: now, lastSeenAt: now, settings: { ...defaultSettings } },
    niumpi: {
      name: "", tagline: "", createdAt: now, hatchedAt: null,
      seedProgress: 0, seedActions: {},
      stage: 0, stageStartedAt: now, careMoments: 0, bond: 8,
      lastInteractionAt: now, sleeping: false, sleepStartedAt: null, lampOn: false,
    },
    stats: { ...defaultStats },
    evolution: { vectors: emptyVectors(), lockedRoute: null, routeConfidence: 0, history: [] },
    phenotype: {
      bodyPalette: "coral", bellyPalette: "cream", markings: [], leafType: "classic",
      eyeType: "round", aura: null, particles: null, accessory: null, tints: {},
    },
    personality: {
      traits: {}, signals: {}, favoriteFoods: [], dislikedFoods: [], favoriteToy: null,
      talents: { cooking: 0, music: 0, gardening: 0, agility: 0, exploration: 0, storytelling: 0 },
    },
    inventory: {
      ingredients: { moonberry: 6, cloudpuff: 5, dewdrop: 8, sunseed: 3 },
      items: [...starterItems],
      currencies: { dewdrops: 40, starFragments: 0 },
    },
    room: { theme: "cozy", placed: starterLayout() },
    garden: { plots: starterPlots() },
    memories: [],
    dream: null,
    expedition: null,
    missions: { dayKey: "", daily: [], weekly: { weekKey: weekKeyFor(now), days: [], claimed: false } },
    cooking: { known: [...starterRecipes], cooked: {} },
    minigames: {},
    seedAnswers: {},
    weather: { key: "sunny", since: now },
    counters: { dayKey: dayKeyFor(now), actions: {}, variety: [] },
    claims: {},
    unlocks: [],
    friends: [],
    log: { dialogue: [], events: [] },
  };
}

type LegacyMemory = {
  identity?: { name?: string; tagline?: string; onboarded?: boolean; bornAt?: string };
  bond?: number;
  interactions?: Record<string, number>;
  needs?: Record<string, number>;
  foods?: Record<string, number>;
  sleeping?: boolean;
  lampOn?: boolean;
  sleepSessions?: number;
  lastVisit?: string;
};

/**
 * v1–v3 saves stored a flat "pet memory". Nothing there is thrown away: the
 * name, bond, needs and every counted interaction become care moments and
 * starting vectors so a returning player keeps their whole relationship.
 */
export function migrateLegacy(raw: LegacyMemory, now: number, id: string): GameState {
  const state = createGameState(now, id);
  const name = (raw.identity?.name ?? "").trim();
  const taps = raw.interactions ?? {};
  const meals = raw.foods ?? {};
  const gestures = Object.values(taps).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const eaten = Object.values(meals).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const sleeps = Number(raw.sleepSessions) || 0;

  if (raw.identity?.onboarded && name) {
    state.niumpi.name = name;
    state.niumpi.tagline = (raw.identity.tagline ?? "").trim();
    state.niumpi.hatchedAt = Date.parse(raw.identity.bornAt ?? "") || now;
    state.niumpi.seedProgress = 1;
  }
  state.niumpi.bond = Math.max(8, Math.min(100, Number(raw.bond) || 8));
  state.niumpi.careMoments = gestures + eaten * 2 + sleeps * 2;
  state.niumpi.sleeping = Boolean(raw.sleeping);
  state.niumpi.lampOn = Boolean(raw.lampOn);
  state.niumpi.lastInteractionAt = Date.parse(raw.lastVisit ?? "") || now;
  state.stats.fullness = clampStat(raw.needs?.fullness ?? state.stats.fullness);
  state.stats.energy = clampStat(raw.needs?.energy ?? state.stats.energy);
  state.stats.joy = clampStat(raw.needs?.joy ?? state.stats.joy);

  state.evolution.vectors.loving += (Number(taps.pet) || 0) + (Number(taps.hold) || 0);
  state.evolution.vectors.playful += Number(taps.tap) || 0;
  state.evolution.vectors.curious += Number(taps.leaf) || 0;
  state.evolution.vectors.calm += sleeps * 2;
  for (const [food, count] of Object.entries(meals)) {
    state.inventory.ingredients[food] = (state.inventory.ingredients[food] ?? 0) + Math.min(6, Number(count) || 0);
  }
  return state;
}

function clampStat(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 60;
  return Math.max(0, Math.min(100, number));
}

/** Fills in anything a newer version added without discarding saved values. */
export function reconcile(saved: Partial<GameState>, now: number): GameState {
  const base = createGameState(now, saved.profile?.id ?? makeId(now));
  const state: GameState = {
    ...base,
    ...saved,
    version: SAVE_VERSION,
    profile: { ...base.profile, ...saved.profile, settings: { ...base.profile.settings, ...saved.profile?.settings } },
    niumpi: { ...base.niumpi, ...saved.niumpi },
    stats: { ...base.stats, ...saved.stats },
    evolution: {
      ...base.evolution, ...saved.evolution,
      vectors: { ...base.evolution.vectors, ...saved.evolution?.vectors },
      history: saved.evolution?.history ?? [],
    },
    phenotype: { ...base.phenotype, ...saved.phenotype, tints: { ...saved.phenotype?.tints } },
    personality: {
      ...base.personality, ...saved.personality,
      traits: { ...saved.personality?.traits },
      signals: { ...saved.personality?.signals },
      talents: { ...base.personality.talents, ...saved.personality?.talents },
    },
    inventory: {
      ingredients: { ...saved.inventory?.ingredients },
      items: saved.inventory?.items ?? base.inventory.items,
      currencies: { ...base.inventory.currencies, ...saved.inventory?.currencies },
    },
    room: { ...base.room, ...saved.room, placed: saved.room?.placed ?? base.room.placed },
    garden: { plots: normalisePlots(saved.garden?.plots) },
    memories: saved.memories ?? [],
    missions: saved.missions ?? base.missions,
    cooking: { known: saved.cooking?.known ?? base.cooking.known, cooked: saved.cooking?.cooked ?? {} },
    minigames: saved.minigames ?? {},
    seedAnswers: saved.seedAnswers ?? {},
    weather: saved.weather ?? base.weather,
    counters: saved.counters ?? base.counters,
    claims: saved.claims ?? {},
    unlocks: saved.unlocks ?? [],
    friends: saved.friends ?? [],
    log: { dialogue: saved.log?.dialogue ?? [], events: saved.log?.events ?? [] },
  };
  return state;
}

function normalisePlots(plots: Plot[] | undefined): Plot[] {
  const base = starterPlots();
  if (!plots) return base;
  return base.map((plot, index) => ({ ...plot, ...plots[index], id: index }));
}

export function makeId(now: number): string {
  return `n${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
