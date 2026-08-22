/**
 * Every shape the saved game uses. Kept free of React so the rules can be
 * tested as plain functions and reused by any future server adapter.
 */

export type VectorId =
  | "calm" | "playful" | "loving" | "curious"
  | "brave" | "creative" | "social" | "dream"
  | "nature" | "balance";

export type RouteId = "moonveil" | "bloomheart" | "sparkleap" | "mistwander" | "prismatic";

export type StageId = 0 | 1 | 2 | 3 | 4 | 5;

export type StatId = "fullness" | "energy" | "joy";
export type HiddenStatId = "comfort" | "curiosity" | "wellbeing" | "variety" | "trust";

export type MoodId =
  | "excited" | "happy" | "tired" | "hungry"
  | "curious" | "upset" | "dreaming" | "evolving";

export type WeatherId = "sunny" | "cloudy" | "rainy" | "storm" | "starfall";
export type DayPart = "morning" | "day" | "sunset" | "night";

export type TalentId = "cooking" | "music" | "gardening" | "agility" | "exploration" | "storytelling";

export type MinigameId =
  | "dewdrop-dash" | "moonberry-mix" | "cloud-stack"
  | "leafbeat" | "hide-squeak" | "dream-path";

export type SceneId =
  | "home" | "niumpi" | "room" | "memory" | "garden" | "games" | "shop"
  | "evolution" | "cooking" | "dreams" | "friends" | "about" | "seed";

export type CurrencyId = "dewdrops" | "starFragments";

export type ItemCategory = "furniture" | "plants" | "toys" | "lights" | "themes" | "accessories" | "music";

/** A gesture or activity that can earn a care moment. */
export type CareActionId =
  | "pet" | "hug" | "tickle" | "brush" | "leaf" | "dance" | "comfort" | "sing"
  | "feed" | "cook" | "sleep" | "dream" | "minigame" | "seed" | "harvest"
  | "plant" | "toy" | "explore" | "visit" | "decorate" | "warm" | "dewdrop" | "hum";

export type Settings = {
  sound: boolean;
  music: boolean;
  effects: boolean;
  reducedMotion: "system" | "on" | "off";
  lowPower: boolean;
  seedQuestions: boolean;
  shareProfile: boolean;
};

export type PlayerProfile = {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  settings: Settings;
};

export type NiumpiCore = {
  name: string;
  tagline: string;
  createdAt: number;
  hatchedAt: number | null;
  /** Seed progress 0..1 before hatching. */
  seedProgress: number;
  seedActions: Record<string, number>;
  stage: StageId;
  stageStartedAt: number;
  careMoments: number;
  bond: number;
  lastInteractionAt: number;
  sleeping: boolean;
  sleepStartedAt: number | null;
  lampOn: boolean;
};

export type CareStats = Record<StatId, number> & Record<HiddenStatId, number>;

export type EvolutionProfile = {
  vectors: Record<VectorId, number>;
  lockedRoute: RouteId | null;
  routeConfidence: number;
  /** Snapshot of the vectors at the moment a route locked in. */
  history: Array<{ at: number; stage: StageId; route: RouteId | null; top: VectorId[] }>;
};

export type Phenotype = {
  bodyPalette: string;
  bellyPalette: string;
  markings: string[];
  leafType: string;
  eyeType: string;
  aura: string | null;
  particles: string | null;
  accessory: string | null;
  /** Slow cosmetic drift earned by diet, independent of a full evolution. */
  tints: Record<string, number>;
};

export type PersonalityProfile = {
  traits: Record<string, number>;
  /** Hidden counters that decide when a trait reveals itself. */
  signals: Record<string, number>;
  favoriteFoods: string[];
  dislikedFoods: string[];
  favoriteToy: string | null;
  talents: Record<TalentId, number>;
};

export type Inventory = {
  ingredients: Record<string, number>;
  items: string[];
  currencies: Record<CurrencyId, number>;
};

export type PlacedItem = {
  uid: string;
  itemId: string;
  x: number;
  y: number;
  flipped: boolean;
  layer: number;
};

export type RoomLayout = {
  theme: string;
  placed: PlacedItem[];
};

export type Plot = {
  id: number;
  plantId: string | null;
  plantedAt: number | null;
  wateredAt: number | null;
  harvestReadyAt: number | null;
  rare: boolean;
};

export type MemoryKind = "story" | "milestone" | "dream" | "evolution" | "friend";

export type MemoryEntry = {
  id: string;
  kind: MemoryKind;
  title: string;
  body: string;
  quote?: string;
  trait?: string;
  art: string;
  createdAt: number;
  favorite: boolean;
};

export type DreamRun = {
  door: string;
  startedAt: number;
  completesAt: number;
  carried: string | null;
  claimed: boolean;
};

export type Expedition = {
  duration: number;
  startedAt: number;
  completesAt: number;
  gear: string;
  claimed: boolean;
};

export type MissionProgress = {
  dayKey: string;
  daily: Array<{ id: string; progress: number; claimed: boolean }>;
  weekly: { weekKey: string; days: string[]; claimed: boolean };
};

export type SeedAnswer = { choice: 0 | 1; answeredAt: number };

export type FriendState = {
  id: string;
  name: string;
  route: RouteId;
  status: "online" | "dreaming" | "playing" | "exploring" | "away";
  giftedAt: number | null;
  visitedAt: number | null;
};

export type GameState = {
  version: number;
  profile: PlayerProfile;
  niumpi: NiumpiCore;
  stats: CareStats;
  evolution: EvolutionProfile;
  phenotype: Phenotype;
  personality: PersonalityProfile;
  inventory: Inventory;
  room: RoomLayout;
  garden: { plots: Plot[] };
  memories: MemoryEntry[];
  dream: DreamRun | null;
  expedition: Expedition | null;
  missions: MissionProgress;
  cooking: { known: string[]; cooked: Record<string, number> };
  minigames: Record<string, { best: number; plays: number; lastPlayedAt: number }>;
  seedAnswers: Record<string, SeedAnswer>;
  weather: { key: WeatherId; since: number };
  /** Per-day action tallies that drive diminishing returns. */
  counters: { dayKey: string; actions: Record<string, number>; variety: string[] };
  /** Idempotency keys so a refresh mid-reward cannot pay out twice. */
  claims: Record<string, number>;
  unlocks: string[];
  friends: FriendState[];
  log: { dialogue: string[]; events: Array<{ at: number; text: string }> };
};

/** What a rule returns so the UI can react without reaching into state. */
export type CareOutcome = {
  state: GameState;
  careMoment: boolean;
  bondGain: number;
  rewards: Reward[];
  message?: string;
};

export type Reward =
  | { kind: "ingredient"; id: string; amount: number }
  | { kind: "currency"; id: CurrencyId; amount: number }
  | { kind: "item"; id: string }
  | { kind: "recipe"; id: string }
  | { kind: "memory"; id: string; title: string }
  | { kind: "trait"; id: string; name: string }
  | { kind: "talent"; id: TalentId; level: number }
  | { kind: "stage"; stage: StageId; name: string }
  | { kind: "route"; id: RouteId; name: string };
