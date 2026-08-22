import type { CareActionId, Reward } from "../types.ts";

export type MissionTemplate = {
  id: string;
  label: string;
  note: string;
  /** Actions that count toward this mission. */
  actions: CareActionId[];
  target: number;
  reward: Reward[];
  /** Missions only appear once their scene is unlocked. */
  needs?: string;
};

export const missionTemplates: MissionTemplate[] = [
  { id: "pet-three", label: "Give three gentle moments", note: "Pet, hug or comfort", actions: ["pet", "hug", "comfort"], target: 3, reward: [{ kind: "currency", id: "dewdrops", amount: 12 }] },
  { id: "feed-two", label: "Share two treats", note: "Any snack counts", actions: ["feed"], target: 2, reward: [{ kind: "currency", id: "dewdrops", amount: 10 }] },
  { id: "play-game", label: "Play a minigame", note: "Any of the six", actions: ["minigame"], target: 1, reward: [{ kind: "currency", id: "dewdrops", amount: 15 }], needs: "games" },
  { id: "cook-one", label: "Cook a recipe", note: "Known or experimental", actions: ["cook"], target: 1, reward: [{ kind: "currency", id: "dewdrops", amount: 15 }], needs: "cooking" },
  { id: "hug-once", label: "Give a hug", note: "Hold for a moment", actions: ["hug"], target: 1, reward: [{ kind: "currency", id: "dewdrops", amount: 8 }] },
  { id: "answer-seed", label: "Answer a Memory Seed", note: "One quick question", actions: ["seed"], target: 1, reward: [{ kind: "currency", id: "dewdrops", amount: 10 }], needs: "seeds" },
  { id: "harvest-plant", label: "Harvest a plant", note: "Something you grew", actions: ["harvest"], target: 1, reward: [{ kind: "currency", id: "dewdrops", amount: 12 }], needs: "garden" },
  { id: "visit-friend", label: "Visit a friend", note: "Say hello next door", actions: ["visit"], target: 1, reward: [{ kind: "currency", id: "dewdrops", amount: 12 }], needs: "friends" },
  { id: "new-reaction", label: "Find a new reaction", note: "Try a gesture you rarely use", actions: ["tickle", "brush", "dance", "sing"], target: 2, reward: [{ kind: "currency", id: "dewdrops", amount: 12 }] },
  { id: "tuck-in", label: "Tuck Niumpi in", note: "One good night", actions: ["sleep"], target: 1, reward: [{ kind: "currency", id: "dewdrops", amount: 10 }] },
  { id: "dream-door", label: "Choose a dream", note: "Pick a door before sleep", actions: ["dream"], target: 1, reward: [{ kind: "currency", id: "dewdrops", amount: 14 }], needs: "dreams" },
  { id: "plant-seed", label: "Plant something", note: "Any empty plot", actions: ["plant"], target: 1, reward: [{ kind: "currency", id: "dewdrops", amount: 8 }], needs: "garden" },
  { id: "dance-twice", label: "Dance together twice", note: "Music optional", actions: ["dance"], target: 2, reward: [{ kind: "currency", id: "dewdrops", amount: 12 }] },
  { id: "brush-once", label: "Brush the leaf", note: "Very carefully", actions: ["brush"], target: 1, reward: [{ kind: "currency", id: "dewdrops", amount: 8 }] },
  { id: "toy-play", label: "Offer a toy", note: "Watch what happens", actions: ["toy"], target: 1, reward: [{ kind: "currency", id: "dewdrops", amount: 10 }] },
  { id: "explore-send", label: "Send an expedition", note: "Any length", actions: ["explore"], target: 1, reward: [{ kind: "currency", id: "dewdrops", amount: 14 }] },
  { id: "decorate-room", label: "Change the room", note: "Move or place one thing", actions: ["decorate"], target: 1, reward: [{ kind: "currency", id: "dewdrops", amount: 10 }], needs: "room" },
  { id: "two-games", label: "Play two minigames", note: "Different ones are better", actions: ["minigame"], target: 2, reward: [{ kind: "currency", id: "dewdrops", amount: 22 }], needs: "games" },
  { id: "sing-along", label: "Sing together", note: "No microphone needed", actions: ["sing"], target: 1, reward: [{ kind: "currency", id: "dewdrops", amount: 8 }] },
  { id: "tickle-once", label: "Find the ticklish spot", note: "It moves", actions: ["tickle"], target: 1, reward: [{ kind: "currency", id: "dewdrops", amount: 8 }] },
];

export const missionMap: Record<string, MissionTemplate> = Object.fromEntries(
  missionTemplates.map((m) => [m.id, m]),
);

export const DAILY_MISSION_COUNT = 3;
/** Complete activities on this many of seven days for the weekly reward. */
export const WEEKLY_TARGET = 5;
export const weeklyReward: Reward[] = [
  { kind: "currency", id: "starFragments", amount: 5 },
  { kind: "currency", id: "dewdrops", amount: 60 },
];
