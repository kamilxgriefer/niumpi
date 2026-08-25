import { ingredientById } from "./config/foods.ts";
import { matchRecipe, recipeMap } from "./config/recipes.ts";
import { minigameMap } from "./config/minigames.ts";
import { seedMap } from "./config/seeds.ts";
import { traitMap } from "./config/traits.ts";
import { itemMap } from "./config/items.ts";
import { weatherMap } from "./config/weather.ts";
import { stageMap } from "./config/stages.ts";
import { SEED_COOLDOWN_MS, SEED_STEP, seedActions } from "./config/stages.ts";
import type {
  CareActionId, GameState, MinigameId, PlacedItem, Reward, RoomActivityId, RoomId, StageId, VectorId,
} from "./types.ts";
import { addSignal, discoverTrait, newlyDiscoveredTraits, recordCare, stageProgress } from "./care.ts";
import { addTint, lockRoute, phenotypeFor } from "./evolution.ts";
import { addIngredient, addCurrency, grant, spendIngredients } from "./inventory.ts";
import { awardMemory, addMemory } from "./memories.ts";
import { progressMissions } from "./missions.ts";
import { reactToFood, reactToGesture } from "./reactions.ts";
import { applyStat, clampStat } from "./stats.ts";
import { dayPartAt } from "./time.ts";
import { settleUnlocks } from "./unlocks.ts";
import { alreadyClaimed, markClaimed } from "./persistence.ts";
import { hashSeed, makeRng } from "./rng.ts";
import { roomActivityMap, roomDefinitionMap } from "./config/rooms.ts";
import {
  activateRoom, newlyUnlockedRooms, recordRoomInteraction, saveActiveRoomLayout, settleRoomUnlocks,
} from "./rooms.ts";
import { claimRoomDrop, earnRoomDiscovery } from "./roomLoot.ts";
import { rarityMap } from "./config/rarities.ts";
import { soilNiumpi, washTools } from "./hygiene.ts";
import type { WashTool } from "./hygiene.ts";

export type ActionResult = {
  state: GameState;
  message?: string;
  behavior?: string;
  /** Optional visual prop used by an authored performance, such as a treat. */
  prop?: string;
  spark?: string;
  sound?: string;
  rewards: Reward[];
  toasts: Array<{ text: string; icon: string }>;
  refused?: boolean;
};

const empty = (state: GameState): ActionResult => ({ state, rewards: [], toasts: [] });

/**
 * Runs after every scoring action: reveals traits, records milestones, opens
 * features and keeps the phenotype in step with what has been earned.
 */
function settle(state: GameState, now: number, toasts: ActionResult["toasts"], rewards: Reward[]): GameState {
  let next = state;
  for (const traitId of newlyDiscoveredTraits(next)) {
    next = discoverTrait(next, traitId, now);
    const trait = traitMap[traitId];
    toasts.push({ text: `New trait — ${trait.name}`, icon: trait.symbol });
    rewards.push({ kind: "trait", id: traitId, name: trait.name });
    const first = awardMemory(next, "first-trait", now);
    next = first.state;
  }
  const before = next;
  next = settleUnlocks(next, now);
  for (const id of next.unlocks.filter((entry) => !before.unlocks.includes(entry))) {
    toasts.push({ text: `${id.charAt(0).toUpperCase()}${id.slice(1)} is open`, icon: "✦" });
  }
  const beforeRooms = next;
  next = settleRoomUnlocks(next, now);
  for (const id of newlyUnlockedRooms(beforeRooms, next)) {
    toasts.push({ text: `${roomDefinitionMap[id].name} is open`, icon: "⌂" });
  }
  next = { ...next, phenotype: phenotypeFor(next) };

  const progress = stageProgress(next, now);
  if (progress.ready) {
    const stage = (next.niumpi.stage + 1) as StageId;
    const key = `stage:${stage}`;
    if (!alreadyClaimed(next, key)) {
      next = markClaimed({ ...next, niumpi: { ...next.niumpi, stage, stageStartedAt: now } }, key, now);
      toasts.push({ text: `${next.niumpi.name || "Niumpi"} grew — ${stageMap[stage].name}`, icon: "✦" });
      rewards.push({ kind: "stage", stage, name: stageMap[stage].name });
      if (stage >= 4 && !next.evolution.lockedRoute) {
        const locked = lockRoute(next, now);
        next = locked.state;
        rewards.push({ kind: "route", id: locked.route, name: locked.route });
        next = awardMemory(next, "route-locked", now).state;
      }
      if (stage === 2) next = awardMemory(next, "first-evolution", now).state;
      if (stage === 5) next = awardMemory(next, "legacy", now).state;
    }
  }
  if (next.niumpi.bond >= 75) next = awardMemory(next, "best-friend", now).state;
  return next;
}

/** Seed Chamber — the four-part pre-hatch care ritual. */
export function seedAction(state: GameState, id: string, now: number): ActionResult {
  const action = seedActions.find((entry) => entry.id === id);
  if (!action || state.niumpi.hatchedAt) return empty(state);
  // The whole shell needs time to respond. A per-tool cooldown let players
  // press every card in a burst and complete the supposed ritual in seconds.
  const lastAt = seedActions.reduce(
    (latest, entry) => Math.max(latest, state.niumpi.seedActions[`${entry.id}:at`] ?? 0),
    0,
  );
  if (now - lastAt < SEED_COOLDOWN_MS) {
    return { ...empty(state), message: "Hold still… the shell is answering.", refused: true };
  }
  const care = recordCare(state, id as CareActionId, now, action.vectors);
  const progress = Math.min(1, state.niumpi.seedProgress + SEED_STEP);
  const next: GameState = {
    ...care.state,
    niumpi: {
      ...care.state.niumpi,
      seedProgress: progress,
      seedActions: {
        ...state.niumpi.seedActions,
        [id]: (state.niumpi.seedActions[id] ?? 0) + 1,
        [`${id}:at`]: now,
      },
    },
  };
  const messages: Record<string, string> = {
    brush: "A tiny pulse follows your hand around the shell.",
    dewdrop: "The dust lifts away. Something inside leans toward the cool water.",
    warm: "The blanket rises once, as if something underneath took a breath.",
    hum: "A second note answers yours from inside.",
  };
  const sounds: Record<string, "pet" | "leaf" | "hold" | "chime"> = {
    brush: "pet", dewdrop: "leaf", warm: "hold", hum: "chime",
  };
  const toasts: ActionResult["toasts"] = [];
  const rewards: Reward[] = [];
  return {
    state: settle(awardMemory(next, "we-met", now).state, now, toasts, rewards),
    message: messages[id],
    behavior: "idle",
    spark: "✧",
    sound: sounds[id] ?? "blip",
    rewards,
    toasts,
  };
}

export function hatch(state: GameState, now: number): ActionResult {
  if (state.niumpi.hatchedAt || state.niumpi.seedProgress < 1) return empty(state);
  const toasts: ActionResult["toasts"] = [];
  const rewards: Reward[] = [];
  let next: GameState = {
    ...state,
    niumpi: { ...state.niumpi, hatchedAt: now, stage: 1, stageStartedAt: now, bond: Math.max(state.niumpi.bond, 16) },
  };
  next = awardMemory(next, "first-hatch", now).state;
  return { state: settle(next, now, toasts, rewards), message: "Oh! Hello!", behavior: "happy", spark: "✦", sound: "chime", rewards, toasts };
}

export function nameNiumpi(state: GameState, name: string, tagline: string, now: number): ActionResult {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 14) || "Niumpi";
  const toasts: ActionResult["toasts"] = [];
  const rewards: Reward[] = [];
  let next: GameState = {
    ...state,
    niumpi: { ...state.niumpi, name: clean, tagline: tagline.replace(/\s+/g, " ").trim().slice(0, 40) },
  };
  next = awardMemory(next, "first-name", now).state;
  return { state: settle(next, now, toasts, rewards), message: `${clean}. That's me!`, behavior: "happy", spark: "✦", sound: "chime", rewards, toasts };
}

/** Touch and gestures. */
export function gesture(state: GameState, action: CareActionId, now: number): ActionResult {
  const reaction = reactToGesture(state, action, now);
  if (reaction.refused) {
    return { ...empty(state), message: reaction.text, behavior: reaction.behavior, sound: reaction.sound, refused: true };
  }
  const vectorsByAction: Partial<Record<CareActionId, Partial<Record<VectorId, number>>>> = {
    pet: { loving: 2 }, hug: { loving: 3 }, tickle: { playful: 3 }, brush: { loving: 1, calm: 1 },
    leaf: { curious: 2 }, dance: { playful: 3, social: 1 }, comfort: { loving: 3, calm: 1 },
    sing: { creative: 3 }, toy: { playful: 2 },
  };
  const care = recordCare(state, action, now, vectorsByAction[action] ?? {});
  let next = care.state;
  const activeMess: Partial<Record<CareActionId, number>> = {
    tickle: 0.9, dance: 1.4, toy: 1.1,
  };
  if (activeMess[action]) next = soilNiumpi(next, activeMess[action]!);
  const signals: Partial<Record<CareActionId, string>> = {
    pet: "gentle", hug: "gentle", tickle: "tickle", dance: "dance", sing: "music", brush: "gentle", toy: "items",
  };
  if (signals[action]) next = addSignal(next, signals[action]!);
  if (dayPartAt(now) === "night") next = addSignal(next, "night", 0.34);

  const relationshipEffects: Partial<Record<CareActionId, Partial<Record<"joy" | "comfort" | "trust" | "curiosity" | "wellbeing" | "energy", number>>>> = {
    pet: { joy: 3, comfort: 2, trust: 1 },
    hug: { joy: 5, comfort: 5, trust: 2, wellbeing: 1 },
    comfort: { joy: 5, comfort: 7, trust: 3, wellbeing: 2 },
    brush: { joy: 3, comfort: 3, trust: 1 },
    leaf: { joy: 2, curiosity: 2, trust: 1 },
    tickle: { joy: 4, energy: -2 },
    dance: { joy: 5, energy: -3 },
    sing: { joy: 4, comfort: 2, trust: 1 },
    toy: { joy: 4, curiosity: 1 },
  };
  let learnedStats = next.stats;
  for (const [id, delta] of Object.entries(relationshipEffects[action] ?? {})) {
    learnedStats = applyStat(learnedStats, id as "joy" | "comfort" | "trust" | "curiosity" | "wellbeing" | "energy", delta ?? 0);
  }
  next = { ...next, stats: learnedStats };
  if (state.niumpi.sleeping) {
    next = { ...next, niumpi: { ...next.niumpi, sleeping: false, sleepStartedAt: null } };
  }
  next = progressMissions(next, action, now);
  const toasts: ActionResult["toasts"] = [];
  const rewards: Reward[] = [];
  return {
    state: settle(next, now, toasts, rewards),
    message: reaction.text,
    behavior: reaction.behavior,
    spark: reaction.spark,
    sound: reaction.sound,
    rewards,
    toasts,
  };
}

/** A visible, persistent care loop. The two tools feel different, but neither
 * can be farmed endlessly because they use the normal diminishing-care rules. */
export function washNiumpi(state: GameState, tool: WashTool, now: number): ActionResult {
  const config = washTools[tool];
  if (!config) return empty(state);
  if (!state.niumpi.hatchedAt) return empty(state);
  if (state.niumpi.cleanliness >= 98) {
    return {
      ...empty(state),
      message: "Still sparkling! Let's save the bubbles for later.",
      behavior: "happy",
      sound: "blip",
      refused: true,
    };
  }

  const action: CareActionId = tool === "brush" ? "brush" : "wash";
  const care = recordCare(state, action, now, tool === "brush"
    ? { calm: 2, loving: 1 }
    : { loving: 2, nature: 1 });
  let next = care.state;
  next = {
    ...next,
    niumpi: {
      ...next.niumpi,
      cleanliness: Math.min(100, next.niumpi.cleanliness + config.gain),
      lastWashedAt: now,
      lastWashTool: tool,
      sleeping: false,
      sleepStartedAt: null,
    },
    stats: applyStat(applyStat(next.stats, "comfort", tool === "brush" ? 3 : 2), "trust", 1),
  };
  next = addSignal(next, "gentle", tool === "brush" ? 0.75 : 0.5);
  next = progressMissions(next, action, now);
  const toasts: ActionResult["toasts"] = [];
  const rewards: Reward[] = [];
  return {
    state: settle(next, now, toasts, rewards),
    message: tool === "brush"
      ? "Slow little circles… my fluff feels lighter!"
      : "Bubbles! I am becoming extremely shiny.",
    behavior: "brushing",
    spark: tool === "brush" ? "✦" : "○",
    sound: tool === "brush" ? "leaf" : "pet",
    rewards,
    toasts,
  };
}

export function feed(state: GameState, foodId: string, now: number): ActionResult {
  const food = ingredientById(foodId);
  if (!food) return empty(state);
  if ((state.inventory.ingredients[foodId] ?? 0) < 1) {
    return { ...empty(state), message: "There are none left.", refused: true };
  }
  const reaction = reactToFood(state, foodId, now);
  if (reaction.refused) {
    // Nothing is consumed when a treat is turned down.
    return { ...empty(state), message: reaction.text, behavior: reaction.behavior, sound: reaction.sound, refused: true };
  }
  const spent = spendIngredients(state, [foodId]);
  if (!spent) return { ...empty(state), message: "There are none left.", refused: true };

  const scaledVectors = Object.fromEntries(
    Object.entries(food.vectors).map(([id, amount]) => [id, (amount ?? 0) * reaction.multiplier]),
  ) as Partial<Record<VectorId, number>>;
  const care = recordCare(spent, "feed", now, scaledVectors);
  let next = soilNiumpi(care.state, 0.8);
  next = {
    ...next,
    stats: {
      ...next.stats,
      fullness: clampStat(next.stats.fullness + (food.effects.fullness ?? 0) * reaction.multiplier),
      energy: clampStat(next.stats.energy + (food.effects.energy ?? 0) * reaction.multiplier),
      joy: clampStat(next.stats.joy + (food.effects.joy ?? 0) * reaction.multiplier),
    },
    counters: {
      ...next.counters,
      actions: { ...next.counters.actions, [`feed:${foodId}`]: (next.counters.actions[`feed:${foodId}`] ?? 0) + 1 },
    },
  };
  next = addTint(next, food.tint, reaction.multiplier);
  next = addSignal(next, "foodVariety", 0.5);
  next = addSignal(next, foodId, 1);

  // A repeatedly welcomed treat becomes a favourite; a repeatedly ignored one does not.
  const eaten = (next.personality.signals[foodId] ?? 0);
  let personality = next.personality;
  if (eaten >= 6 && !personality.favoriteFoods.includes(foodId) && reaction.multiplier >= 1) {
    personality = { ...personality, favoriteFoods: [...personality.favoriteFoods, foodId] };
  }
  next = { ...next, personality };
  next = progressMissions(next, "feed", now);

  const toasts: ActionResult["toasts"] = [];
  const rewards: Reward[] = [];
  let settled = settle(next, now, toasts, rewards);
  settled = awardMemory(settled, "first-feed", now).state;
  if (personality.favoriteFoods.length === 1 && next.personality.favoriteFoods.length === 1) {
    settled = awardMemory(settled, "first-favorite", now).state;
  }
  return {
    state: settled,
    message: reaction.text,
    behavior: state.personality.favoriteFoods.includes(foodId) ? "eating-favorite" : "eating",
    prop: foodId,
    spark: reaction.spark,
    sound: reaction.sound,
    rewards,
    toasts,
  };
}

export function cook(state: GameState, parts: string[], now: number): ActionResult & { recipeId: string | null } {
  const spent = spendIngredients(state, parts);
  if (!spent) return { ...empty(state), recipeId: null, message: "You need more of those.", refused: true };
  const recipe = matchRecipe(parts);
  const toasts: ActionResult["toasts"] = [];
  const rewards: Reward[] = [];

  if (!recipe) {
    // An experiment still returns something small — the parts are never simply gone.
    const care = recordCare(spent, "cook", now, { creative: 2 });
    let next = care.state;
    next = addIngredient(next, "cloudpuff", 1);
    next = { ...next, stats: applyStat(next.stats, "joy", 6) };
    next = progressMissions(next, "cook", now);
    rewards.push({ kind: "ingredient", id: "cloudpuff", amount: 1 });
    return {
      state: settle(next, now, toasts, rewards), recipeId: null,
      message: "That became… something. It's fine! It's edible!",
      behavior: "curious", spark: "?", sound: "blip", rewards, toasts,
    };
  }

  const care = recordCare(spent, "cook", now, recipe.vectors);
  let next = care.state;
  next = {
    ...next,
    stats: {
      ...next.stats,
      fullness: clampStat(next.stats.fullness + (recipe.effects.fullness ?? 0)),
      energy: clampStat(next.stats.energy + (recipe.effects.energy ?? 0)),
      joy: clampStat(next.stats.joy + (recipe.effects.joy ?? 0)),
    },
    cooking: {
      known: next.cooking.known.includes(recipe.id) ? next.cooking.known : [...next.cooking.known, recipe.id],
      cooked: { ...next.cooking.cooked, [recipe.id]: (next.cooking.cooked[recipe.id] ?? 0) + 1 },
    },
    personality: {
      ...next.personality,
      talents: { ...next.personality.talents, [recipe.talent]: next.personality.talents[recipe.talent] + 1 },
    },
  };
  next = addSignal(next, "foodVariety", 1);
  next = progressMissions(next, "cook", now);
  if (!state.cooking.known.includes(recipe.id)) {
    toasts.push({ text: `New recipe — ${recipe.name}`, icon: "✦" });
    rewards.push({ kind: "recipe", id: recipe.id });
  }
  let settled = settle(next, now, toasts, rewards);
  settled = awardMemory(settled, "first-recipe", now).state;
  return {
    state: settled, recipeId: recipe.id,
    message: `${recipe.name}! ${recipe.bonus ?? "Perfect."}`,
    behavior: "happy", spark: "✧", sound: "chime", rewards, toasts,
  };
}

export function answerSeed(state: GameState, questionId: string, choice: 0 | 1, now: number): ActionResult {
  const question = seedMap[questionId];
  if (!question) return empty(state);
  const option = question.options[choice];
  const care = recordCare(state, "seed", now, option.vectors);
  let next: GameState = {
    ...care.state,
    seedAnswers: { ...care.state.seedAnswers, [questionId]: { choice, answeredAt: now } },
    stats: applyStat(care.state.stats, "curiosity", 6),
  };
  if (option.signal) next = addSignal(next, option.signal, 2);
  next = progressMissions(next, "seed", now);
  const toasts: ActionResult["toasts"] = [];
  const rewards: Reward[] = [];
  return {
    state: settle(next, now, toasts, rewards),
    message: `I'll remember that ${option.recall}.`,
    behavior: "happy", spark: "✦", sound: "chime", rewards, toasts,
  };
}

export function forgetSeed(state: GameState, questionId: string): GameState {
  const answers = { ...state.seedAnswers };
  delete answers[questionId];
  return { ...state, seedAnswers: answers };
}

export function sleep(state: GameState, now: number): ActionResult {
  if (state.niumpi.sleeping) return empty(state);
  const care = recordCare(state, "sleep", now, { calm: 3, dream: 1 });
  let next: GameState = {
    ...care.state,
    niumpi: { ...care.state.niumpi, sleeping: true, sleepStartedAt: now },
  };
  next = addSignal(next, "sleep");
  next = progressMissions(next, "sleep", now);
  const toasts: ActionResult["toasts"] = [];
  const rewards: Reward[] = [];
  let settled = settle(next, now, toasts, rewards);
  settled = awardMemory(settled, "first-sleep", now).state;
  return { state: settled, message: "Nium… good night.", behavior: "asleep", sound: "sleep", rewards, toasts };
}

export function wake(state: GameState, now: number): ActionResult {
  if (!state.niumpi.sleeping) return empty(state);
  return {
    ...empty({
      ...state,
      niumpi: { ...state.niumpi, sleeping: false, sleepStartedAt: null },
      stats: applyStat(state.stats, "energy", 6),
      profile: { ...state.profile, lastSeenAt: now },
    }),
    message: "Good morning — nium!",
    behavior: "happy",
    sound: "wake",
  };
}

export function toggleLamp(state: GameState): ActionResult {
  return { ...empty({ ...state, niumpi: { ...state.niumpi, lampOn: !state.niumpi.lampOn } }), sound: "blip" };
}

export function finishMinigame(
  state: GameState,
  gameId: MinigameId,
  score: number,
  par: number,
  now: number,
): ActionResult {
  const game = minigameMap[gameId];
  if (!game) return empty(state);
  const ratio = Math.max(0, Math.min(1.5, par ? score / par : 0));
  const playsToday = state.counters.actions.minigame ?? 0;
  // Playing stays free forever; only the payout tapers after a few rounds.
  const payoutScale = playsToday < 3 ? 1 : playsToday < 6 ? 0.4 : 0.15;

  const care = recordCare(state, "minigame", now, { playful: 3, brave: 1 });
  let next = care.state;
  const drops = Math.round(10 * ratio * payoutScale);
  const dewdrops = Math.round(12 * ratio * payoutScale);
  const rewards: Reward[] = [];
  if (drops > 0) { next = addIngredient(next, game.drop, drops); rewards.push({ kind: "ingredient", id: game.drop, amount: drops }); }
  if (dewdrops > 0) { next = addCurrency(next, "dewdrops", dewdrops); rewards.push({ kind: "currency", id: "dewdrops", amount: dewdrops }); }

  const previous = next.minigames[gameId] ?? { best: 0, plays: 0, lastPlayedAt: 0 };
  next = {
    ...next,
    minigames: {
      ...next.minigames,
      [gameId]: { best: Math.max(previous.best, score), plays: previous.plays + 1, lastPlayedAt: now },
    },
    personality: {
      ...next.personality,
      talents: { ...next.personality.talents, [game.talent]: next.personality.talents[game.talent] + (ratio >= 0.6 ? 1 : 0) },
    },
    stats: applyStat(applyStat(next.stats, "joy", 8), "energy", -4),
  };
  next = addSignal(next, "minigame");
  if (game.talent === "music") next = addSignal(next, "music");
  if (game.talent === "exploration") next = addSignal(next, "explore");
  next = progressMissions(next, "minigame", now);

  const toasts: ActionResult["toasts"] = [];
  let settled = settle(next, now, toasts, rewards);
  if (score > previous.best && previous.plays > 0) toasts.push({ text: "New personal best!", icon: "▲" });
  settled = awardMemory(settled, "first-game", now).state;
  return { state: settled, message: ratio >= 1 ? "We did it!" : "That was fun!", behavior: "happy", spark: "✦", sound: "chime", rewards, toasts };
}

export function placeItem(state: GameState, item: PlacedItem): GameState {
  const existing = state.room.placed.some((entry) => entry.uid === item.uid);
  const placed = existing
    ? state.room.placed.map((entry) => (entry.uid === item.uid ? item : entry))
    : [...state.room.placed, item];
  return saveActiveRoomLayout(state, placed, state.room.theme);
}

export function removeItem(state: GameState, uid: string): GameState {
  return saveActiveRoomLayout(
    state,
    state.room.placed.filter((entry) => entry.uid !== uid),
    state.room.theme,
  );
}

export function saveRoom(state: GameState, placed: PlacedItem[], theme: string, now: number): ActionResult {
  const care = recordCare(state, "decorate", now, { creative: 2 });
  let next = saveActiveRoomLayout(care.state, placed, theme);
  next = recordRoomInteraction(next, "decorate", now);
  if (care.careMoment) next = earnRoomDiscovery(next);
  next = addSignal(next, "items", 0.5);
  next = progressMissions(next, "decorate", now);
  const toasts: ActionResult["toasts"] = [];
  const rewards: Reward[] = [];
  let settled = settle(next, now, toasts, rewards);
  settled = awardMemory(settled, "first-room", now).state;
  return { state: settled, message: "It looks different! I like it.", behavior: "happy", sound: "chime", rewards, toasts };
}

/** Play Mode: touching furniture produces a real, item-specific reaction. */
export function playWithItem(state: GameState, itemId: string, now: number): ActionResult {
  const item = itemMap[itemId];
  if (!item?.reaction) return empty(state);
  const care = recordCare(state, "toy", now, item.vectors);
  let next = care.state;
  next = { ...next, stats: applyStat(next.stats, "joy", 4) };
  next = recordRoomInteraction(next, `item:${itemId}`, now);
  if (care.careMoment) next = earnRoomDiscovery(next);
  if (itemId === "telescope") next = addSignal(next, "stars", 1);
  if (itemId === "music-radio" || itemId === "wind-chimes") next = addSignal(next, "music", 1);
  if (itemId === "toy-chest" || itemId === "ball-of-yarn") next = addSignal(next, "items", 1);
  next = progressMissions(next, "toy", now);
  const toasts: ActionResult["toasts"] = [];
  const rewards: Reward[] = [];
  const interaction = itemInteractionFor(itemId, item.category);
  return {
    state: settle(next, now, toasts, rewards),
    message: item.reaction,
    behavior: interaction.behavior,
    spark: interaction.spark,
    sound: interaction.sound,
    rewards,
    toasts,
  };
}

/** Furniture keeps its own movement vocabulary instead of every object causing
 * the same generic happy bounce. */
function itemInteractionFor(itemId: string, category: string) {
  if (["music-radio", "wind-chimes"].includes(itemId)) return { behavior: "singing", sound: "chime", spark: "♪" };
  if (["star-rug"].includes(itemId)) return { behavior: "dancing", sound: "tap", spark: "♪" };
  if (["ball-of-yarn", "toy-chest", "leaf-mobile"].includes(itemId)) return { behavior: "roll", sound: "tap", spark: "✦" };
  if (["memory-shelf", "map-table", "cloud-bookshelf"].includes(itemId)) return { behavior: "book", sound: "blip", spark: "✧" };
  if (["telescope", "aurora-window", "crystal-terrarium", "star-fountain"].includes(itemId)) return { behavior: "window", sound: "chime", spark: "✧" };
  if (["moon-lamp", "paper-lanterns", "star-projector"].includes(itemId)) return { behavior: "lamp", sound: "chime", spark: "✦" };
  if (["cloud-sofa", "cozy-cushion", "moon-bed", "dream-tent", "rainbow-beanbag"].includes(itemId)) return { behavior: "sway", sound: "hold", spark: "♡" };
  if (itemId === "little-mirror") return { behavior: "peek", sound: "blip", spark: "✦" };
  if (category === "plants") return { behavior: "sway", sound: "leaf", spark: "✧" };
  return { behavior: "happy", sound: "blip", spark: "✦" };
}

/** Changes rooms without leaking room-specific state into the navigation UI. */
export function switchRoom(state: GameState, roomId: RoomId, now: number): ActionResult {
  const switched = activateRoom(state, roomId, now);
  if (switched.reason) {
    return {
      ...empty(state),
      message: `${roomDefinitionMap[roomId].name} is still growing with you. ${switched.reason}.`,
      refused: true,
      sound: "blip",
    };
  }
  if (!switched.changed) return empty(switched.state);
  return {
    ...empty(switched.state),
    message: `Let's go to the ${roomDefinitionMap[roomId].name}.`,
    behavior: "wander",
    sound: "blip",
  };
}

/**
 * Performs an authored room activity as a pure game action. The UI only asks
 * for an activity; eligibility, learning and progression all remain here.
 */
export function roomActivity(state: GameState, activityId: RoomActivityId, now: number): ActionResult {
  const activity = roomActivityMap[activityId];
  if (!activity || !activity.rooms.includes(state.room.activeRoomId)) {
    return { ...empty(state), message: "That activity belongs in another room.", refused: true };
  }
  if (state.niumpi.sleeping && activityId !== "rest") {
    return { ...empty(state), message: "Nium… after this nap.", behavior: "asleep", refused: true, sound: "sleep" };
  }

  const care = recordCare(state, activity.careAction, now, activity.vectors);
  let next = care.state;
  for (const [stat, amount] of Object.entries(activity.stats)) {
    next = { ...next, stats: applyStat(next.stats, stat as keyof typeof next.stats, amount ?? 0) };
  }
  next = recordRoomInteraction(next, `activity:${activityId}`, now);
  if (care.careMoment) next = earnRoomDiscovery(next);
  next = progressMissions(next, activity.careAction, now);
  if (activityId === "dance" || activityId === "roll") next = addSignal(next, "dance", 0.75);
  if (activityId === "sing") next = addSignal(next, "music", 1);
  if (activityId === "read" || activityId === "window") next = addSignal(next, "explore", 0.75);

  const toasts: ActionResult["toasts"] = [];
  const rewards: Reward[] = [];
  return {
    state: settle(next, now, toasts, rewards),
    message: activity.message,
    behavior: activity.behavior,
    sound: activity.sound,
    spark: activityId === "sing" || activityId === "dance" ? "♪" : "✦",
    rewards,
    toasts,
  };
}

/** Opens an earned discovery bloom. Rolls are free, odds are visible, and duplicates are impossible. */
export function claimRoomDiscovery(state: GameState, now: number): ActionResult {
  const drop = claimRoomDrop(state, now);
  if (drop.refused || !drop.reward) {
    return { ...empty(state), message: "Share a few more room moments first.", refused: true, sound: "blip" };
  }
  const item = drop.reward.kind === "item" ? itemMap[drop.reward.id] : null;
  const rarity = drop.rarity ? rarityMap[drop.rarity] : null;
  return {
    state: drop.state,
    message: item ? `${item.name} found a home with you.` : "Your complete collection became dewdrops.",
    behavior: "gift",
    spark: drop.rarity === "mythic" ? "✦" : "✧",
    sound: "reward",
    rewards: [drop.reward],
    toasts: [{ text: item && rarity ? `${rarity.name} discovery — ${item.name}` : "Collection bonus", icon: "✦" }],
  };
}

export function recordWeatherDay(state: GameState, now: number): GameState {
  const weather = weatherMap[state.weather.key];
  const key = `weather:${state.counters.dayKey}:${state.weather.key}`;
  if (!weather.signal || alreadyClaimed(state, key)) return state;
  let next = addSignal(state, weather.signal, 1);
  next = { ...next, stats: applyStat(next.stats, "joy", weather.joy) };
  return markClaimed(next, key, now);
}

/** The warm return after a long gap — a gift, never a scolding. */
export function reunion(state: GameState, now: number): ActionResult {
  const key = `reunion:${state.counters.dayKey}`;
  if (alreadyClaimed(state, key)) return empty(state);
  const rng = makeRng(hashSeed(state.profile.id, now, "reunion"));
  const gifts = ["moonberry", "dewdrop", "cloudpuff", "sunseed"];
  const gift = gifts[Math.floor(rng() * gifts.length)];
  const rewards: Reward[] = [{ kind: "ingredient", id: gift, amount: 3 }];
  let next = grant(state, rewards);
  next = { ...next, stats: applyStat(next.stats, "joy", 14) };
  next = awardMemory(next, "long-return", now).state;
  return {
    state: markClaimed(next, key, now),
    message: "You're back! I kept something for you.",
    behavior: "happy", spark: "♡", sound: "chime",
    rewards,
    toasts: [{ text: `${ingredientById(gift)?.name ?? "A treat"} ×3 saved for you`, icon: "♡" }],
  };
}

export { recipeMap, addMemory };
