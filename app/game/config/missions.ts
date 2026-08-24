import type { CareActionId, Reward } from "../types.ts";

export type GoalCategory = "care" | "play" | "world" | "create" | "bond" | "collection";

export type MissionTemplate = {
  id: string; label: string; note: string; actions: CareActionId[]; target: number;
  reward: Reward[]; category: GoalCategory; needs?: string;
};

const dew = (amount: number): Reward[] => [{ kind: "currency", id: "dewdrops", amount }];
const stars = (amount: number, dewdrops = 0): Reward[] => [
  { kind: "currency", id: "starFragments", amount }, ...(dewdrops ? dew(dewdrops) : []),
];
const daily = (id: string, label: string, note: string, actions: CareActionId[], target: number,
  amount: number, category: GoalCategory, needs?: string): MissionTemplate =>
  ({ id, label, note, actions, target, reward: dew(amount), category, needs });

/** A large authored pool keeps days fresh without assigning impossible work. */
export const missionTemplates: MissionTemplate[] = [
  daily("gentle-three", "Three gentle moments", "Pet, hug or comfort", ["pet", "hug", "comfort"], 3, 12, "care"),
  daily("morning-hello", "A proper hello", "Pet Niumpi once", ["pet"], 1, 7, "bond"),
  daily("hug-once", "Cloud-soft hug", "Stay close for a moment", ["hug"], 1, 8, "bond"),
  daily("comfort-two", "A little reassurance", "Comfort Niumpi twice", ["comfort"], 2, 11, "care"),
  daily("brush-once", "Polish the cloud crown", "One careful brush", ["brush"], 1, 8, "care"),
  daily("brush-three", "Crown care", "Brush three times today", ["brush"], 3, 14, "care"),
  daily("leaf-curiosity", "Follow the flutter", "Touch the crown twice", ["leaf"], 2, 10, "bond"),
  daily("tickle-once", "Find the ticklish spot", "It moves", ["tickle"], 1, 8, "play"),
  daily("tickle-three", "Giggle cloud", "Find three tickles", ["tickle"], 3, 14, "play"),
  daily("sing-along", "Sing together", "No microphone needed", ["sing"], 1, 8, "create"),
  daily("song-trio", "Three tiny songs", "Let Niumpi join in", ["sing", "hum"], 3, 14, "create"),
  daily("dance-twice", "Two little dances", "Music optional", ["dance"], 2, 12, "play"),
  daily("joyful-mix", "Make a joyful mix", "Dance, sing or tickle", ["dance", "sing", "tickle"], 4, 16, "play"),
  daily("share-one", "Share a treat", "Any snack counts", ["feed"], 1, 7, "care"),
  daily("share-two", "A tiny tasting menu", "Share two treats", ["feed"], 2, 11, "care"),
  daily("care-variety", "Care in three ways", "Gentle gestures all count", ["pet", "hug", "brush", "comfort"], 3, 13, "care"),
  daily("tuck-in", "A cozy goodnight", "Tuck Niumpi in once", ["sleep"], 1, 10, "care"),
  daily("toy-play", "Bring out a toy", "See what Niumpi chooses", ["toy"], 1, 10, "play"),
  daily("toy-time", "Playroom afternoon", "Play with room toys twice", ["toy"], 2, 14, "play"),
  daily("room-moment", "A moment at home", "Try any room activity", ["toy", "decorate"], 1, 9, "world", "room"),
  daily("decorate-room", "Move something cozy", "Place or move one item", ["decorate"], 1, 10, "create", "room"),
  daily("room-refresh", "Refresh the room", "Make three decor changes", ["decorate"], 3, 16, "create", "room"),
  daily("answer-seed", "Answer a Memory Seed", "One honest little choice", ["seed"], 1, 10, "bond", "seeds"),
  daily("play-game", "Play a minigame", "Any game counts", ["minigame"], 1, 15, "play", "games"),
  daily("two-games", "Double game break", "Play two rounds", ["minigame"], 2, 21, "play", "games"),
  daily("three-games", "Mini-game explorer", "Play three rounds", ["minigame"], 3, 28, "play", "games"),
  daily("plant-seed", "Plant a small beginning", "Use any empty plot", ["plant"], 1, 9, "world", "garden"),
  daily("garden-pair", "Garden helper", "Plant or harvest twice", ["plant", "harvest"], 2, 15, "world", "garden"),
  daily("harvest-one", "Bring in a harvest", "Collect one ready plant", ["harvest"], 1, 13, "world", "garden"),
  daily("harvest-two", "A full little basket", "Harvest two plants", ["harvest"], 2, 20, "world", "garden"),
  daily("cook-one", "Cook something warm", "Known or experimental", ["cook"], 1, 15, "create", "cooking"),
  daily("cook-two", "Kitchen duet", "Cook two recipes", ["cook"], 2, 23, "create", "cooking"),
  daily("cook-and-share", "From pan to paw", "Cook or share three treats", ["cook", "feed"], 3, 20, "create", "cooking"),
  daily("dream-door", "Choose a dream door", "Send Niumpi somewhere gentle", ["dream"], 1, 15, "world", "dreams"),
  daily("dream-and-rest", "A dreamy evening", "Dream or tuck in twice", ["dream", "sleep"], 2, 17, "care", "dreams"),
  daily("visit-friend", "Knock on a friendly door", "Visit one neighbour", ["visit"], 1, 13, "bond", "friends"),
  daily("social-two", "A social little cloud", "Visit twice today", ["visit"], 2, 20, "bond", "friends"),
  daily("send-exploration", "Explore something new", "A room discovery or expedition counts", ["leaf", "toy", "explore"], 2, 15, "world"),
  daily("curious-day", "Follow curiosity", "Explore, play or touch the crown", ["explore", "minigame", "leaf"], 3, 17, "world"),
  daily("creative-day", "Make something together", "Cook, sing or decorate", ["cook", "sing", "decorate"], 3, 18, "create"),
  daily("active-day", "A lively little day", "Dance, play or use a toy", ["dance", "minigame", "toy"], 4, 20, "play"),
  daily("quiet-day", "A quiet little day", "Pet, comfort, brush or rest", ["pet", "comfort", "brush", "sleep"], 4, 18, "care"),
  daily("friendship-five", "Five shared moments", "Any loving or playful gesture", ["pet", "hug", "tickle", "dance", "sing"], 5, 22, "bond"),
  daily("world-trio", "Three tiny adventures", "Room, garden, dreams and games count", ["leaf", "toy", "plant", "harvest", "dream", "visit", "minigame"], 3, 20, "world"),
  daily("care-six", "A cloud full of care", "Six gentle moments, any mix", ["pet", "hug", "brush", "comfort", "feed"], 6, 24, "care"),
  daily("music-and-motion", "Music and motion", "Sing or dance four times", ["sing", "dance", "hum"], 4, 20, "create"),
  daily("curious-five", "Curiosity trail", "Five curious or playful moments", ["leaf", "toy", "explore", "minigame"], 5, 23, "world"),
  daily("whole-day", "A day well shared", "Any eight meaningful actions", ["pet", "hug", "tickle", "brush", "leaf", "dance", "comfort", "sing", "feed", "cook", "sleep", "dream", "minigame", "seed", "harvest", "plant", "toy", "explore", "visit", "decorate"], 8, 28, "bond"),
];

/** Kept claimable until their old daily board naturally rolls over. */
const legacyDailyTemplates: MissionTemplate[] = [
  daily("pet-three", "Three gentle moments", "Pet, hug or comfort", ["pet", "hug", "comfort"], 3, 12, "care"),
  daily("feed-two", "A tiny tasting menu", "Share two treats", ["feed"], 2, 10, "care"),
  daily("new-reaction", "Try something different", "Tickle, brush, dance or sing", ["tickle", "brush", "dance", "sing"], 2, 12, "play"),
  daily("harvest-plant", "Bring in a harvest", "Collect one ready plant", ["harvest"], 1, 12, "world", "garden"),
  daily("explore-send", "Pack for an expedition", "Any length is enough", ["explore"], 1, 14, "world"),
];
export const missionMap: Record<string, MissionTemplate> = Object.fromEntries(
  [...missionTemplates, ...legacyDailyTemplates].map((m) => [m.id, m]),
);
export const DAILY_MISSION_COUNT = 5;

export const weeklyMissionTemplates: MissionTemplate[] = [
  daily("week-gentle", "Gentle rhythm", "Share 18 calm care moments this week", ["pet", "hug", "brush", "comfort"], 18, 0, "care"),
  daily("week-play", "Playful week", "Play, tickle or dance 14 times", ["minigame", "toy", "tickle", "dance"], 14, 0, "play"),
  daily("week-food", "Thoughtful table", "Cook or share 10 treats", ["cook", "feed"], 10, 0, "care"),
  daily("week-games", "Game night regular", "Finish 8 minigames", ["minigame"], 8, 0, "play", "games"),
  daily("week-garden", "Garden keeper", "Plant or harvest 8 times", ["plant", "harvest"], 8, 0, "world", "garden"),
  daily("week-chef", "Cloud kitchen", "Cook 6 recipes", ["cook"], 6, 0, "create", "cooking"),
  daily("week-dream", "Dream cartographer", "Choose 4 dream doors", ["dream"], 4, 0, "world", "dreams"),
  daily("week-social", "Good neighbour", "Make 5 visits", ["visit"], 5, 0, "bond", "friends"),
  daily("week-room", "Home maker", "Decorate or use room items 10 times", ["decorate", "toy"], 10, 0, "create", "room"),
  daily("week-music", "A week of music", "Sing, hum or dance 12 times", ["sing", "hum", "dance"], 12, 0, "create"),
  daily("week-curious", "Curiosity club", "Explore, play or discover 14 times", ["explore", "leaf", "minigame", "seed"], 14, 0, "world"),
  daily("week-bedtime", "Cozy evenings", "Tuck in or dream 5 times", ["sleep", "dream"], 5, 0, "care"),
  daily("week-bond", "Many little moments", "Share 28 moments of any kind", ["pet", "hug", "tickle", "brush", "leaf", "dance", "comfort", "sing", "feed", "cook", "sleep", "dream", "minigame", "seed", "harvest", "plant", "toy", "explore", "visit", "decorate"], 28, 0, "bond"),
  daily("week-create", "Maker's week", "Cook, decorate, sing or garden 14 times", ["cook", "decorate", "sing", "plant", "harvest"], 14, 0, "create"),
  daily("week-friends-food", "Hospitality week", "Visit, cook or share 12 times", ["visit", "cook", "feed"], 12, 0, "bond", "friends"),
  daily("week-world", "Little world tour", "Explore the wider world 12 times", ["leaf", "toy", "plant", "harvest", "dream", "visit", "explore", "minigame"], 12, 0, "world"),
].map((mission) => ({ ...mission, reward: stars(2, 24) }));

export const weeklyMissionMap: Record<string, MissionTemplate> = Object.fromEntries(weeklyMissionTemplates.map((m) => [m.id, m]));
export const WEEKLY_MISSION_COUNT = 3;
export const WEEKLY_TARGET = 5;
export const weeklyReward: Reward[] = stars(5, 60);

export type AchievementMetric =
  | { kind: "action"; actions: CareActionId[] }
  | { kind: "care" | "bond" | "stage" | "memories" | "traits" | "items" | "roomDrops" | "gamePlays" };
export type AchievementTemplate = {
  id: string; label: string; note: string; category: GoalCategory;
  tier: "Sprout" | "Bloom" | "Glow" | "Cosmic";
  metric: AchievementMetric; target: number; reward: Reward[];
};

const tierNames = ["Sprout", "Bloom", "Glow", "Cosmic"] as const;
const track = (id: string, labels: string[], notes: string[], category: GoalCategory,
  metric: AchievementMetric, targets: number[], rewardBase = 18): AchievementTemplate[] =>
  targets.map((target, index) => ({
    id: `${id}-${index + 1}`, label: labels[index], note: notes[index], category,
    tier: tierNames[index], metric, target,
    reward: index === 3 ? stars(4, rewardBase * 3) : index === 2 ? stars(2, rewardBase * 2) : dew(rewardBase * (index + 1)),
  }));

/** Sixty permanent milestones across fifteen real progression tracks. */
export const achievementTemplates: AchievementTemplate[] = [
  ...track("care", ["First hello", "A hundred moments", "Always together", "A little lifetime"], ["Share your first care moment", "Care becomes a rhythm", "A deep everyday bond", "A history made together"], "care", { kind: "care" }, [1, 100, 350, 900]),
  ...track("bond", ["Trust begins", "Growing closer", "Heart to heart", "Unshakeable bond"], ["Reach 20% bond", "Reach 50% bond", "Reach 80% bond", "Reach full bond"], "bond", { kind: "bond" }, [20, 50, 80, 100]),
  ...track("growth", ["A cloud appears", "Growing crown", "True colours", "Final form"], ["Reach the first form", "Reach the second form", "Care shapes a direction", "Discover the final evolution"], "bond", { kind: "stage" }, [1, 2, 4, 5]),
  ...track("gentle", ["Soft touch", "Safe with you", "Gentle soul", "Cloud sanctuary"], ["Share 5 gentle gestures", "Share 40 gentle gestures", "Share 140 gentle gestures", "Share 400 gentle gestures"], "care", { kind: "action", actions: ["pet", "hug", "brush", "comfort"] }, [5, 40, 140, 400]),
  ...track("food", ["First snack", "Tasting friends", "Tiny gourmand", "Feast of seasons"], ["Share 3 treats", "Share 25 treats", "Share 90 treats", "Share 250 treats"], "care", { kind: "action", actions: ["feed"] }, [3, 25, 90, 250]),
  ...track("play", ["First giggle", "Playmate", "Joy maker", "Endless encore"], ["Share 5 playful moments", "Share 40 playful moments", "Share 150 playful moments", "Share 450 playful moments"], "play", { kind: "action", actions: ["tickle", "dance", "toy", "minigame"] }, [5, 40, 150, 450]),
  ...track("music", ["Tiny hum", "Duet", "Cloud choir", "Song of Niumpi"], ["Make music 3 times", "Make music 25 times", "Make music 90 times", "Make music 240 times"], "create", { kind: "action", actions: ["sing", "hum", "dance"] }, [3, 25, 90, 240]),
  ...track("garden", ["Green beginning", "Garden helper", "Moon gardener", "Keeper of seasons"], ["Plant or harvest 3 times", "Tend the garden 25 times", "Tend it 90 times", "Tend it 250 times"], "world", { kind: "action", actions: ["plant", "harvest"] }, [3, 25, 90, 250]),
  ...track("kitchen", ["First recipe", "Cloud cook", "Flavour finder", "Kitchen constellation"], ["Cook once", "Cook 12 recipes", "Cook 45 recipes", "Cook 140 recipes"], "create", { kind: "action", actions: ["cook"] }, [1, 12, 45, 140]),
  ...track("games", ["Press play", "Game shelf", "High-score glow", "Arcade legend"], ["Play 3 rounds", "Play 25 rounds", "Play 100 rounds", "Play 300 rounds"], "play", { kind: "gamePlays" }, [3, 25, 100, 300]),
  ...track("memory", ["Worth remembering", "Little album", "Story keeper", "Living constellation"], ["Keep 1 memory", "Keep 8 memories", "Keep 24 memories", "Keep 60 memories"], "bond", { kind: "memories" }, [1, 8, 24, 60]),
  ...track("personality", ["A clue", "Getting to know you", "A distinct soul", "One of a kind"], ["Reveal 1 trait", "Reveal 4 traits", "Reveal 8 traits", "Reveal 12 traits"], "bond", { kind: "traits" }, [1, 4, 8, 12]),
  ...track("collection", ["Something lovely", "Cozy collection", "Treasure room", "Museum of wonders"], ["Own 5 room items", "Own 15 items", "Own 30 items", "Own 50 items"], "collection", { kind: "items" }, [5, 15, 30, 50]),
  ...track("discoveries", ["Room Bloom", "Lucky shelf", "Rare glow", "Mythic home"], ["Open 1 Room Bloom", "Open 8 Room Blooms", "Open 25 Room Blooms", "Open 60 Room Blooms"], "collection", { kind: "roomDrops" }, [1, 8, 25, 60]),
  ...track("world", ["Curious step", "Small explorer", "World walker", "Beyond every door"], ["Explore something 3 times", "Take 20 journeys", "Take 70 journeys", "Take 200 journeys"], "world", { kind: "action", actions: ["leaf", "toy", "explore", "dream", "visit"] }, [3, 20, 70, 200]),
];

export const achievementMap: Record<string, AchievementTemplate> = Object.fromEntries(achievementTemplates.map((a) => [a.id, a]));
