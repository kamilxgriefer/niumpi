import { dialogue, gestureLines } from "./config/dialogue.ts";
import { ingredientById } from "./config/foods.ts";
import type { CareActionId, GameState, MoodId } from "./types.ts";
import { moodFor } from "./mood.ts";
import { dayPartAt } from "./time.ts";
import { hashSeed, makeRng, pickWeighted } from "./rng.ts";
import { seedMap } from "./config/seeds.ts";

/** Recent lines are remembered so the same thing is never said twice running. */
export const DIALOGUE_MEMORY = 18;

export function chooseLine(state: GameState, now: number): { text: string; id: string } {
  const mood = moodFor(state, now);
  const part = dayPartAt(now);
  const recent = new Set(state.log.dialogue);
  const eligible = dialogue.filter((line) => {
    if (line.mood && !line.mood.includes(mood)) return false;
    if (line.dayPart && !line.dayPart.includes(part)) return false;
    if (line.weather && !line.weather.includes(state.weather.key)) return false;
    if (line.route && (!state.evolution.lockedRoute || !line.route.includes(state.evolution.lockedRoute))) return false;
    if (line.trait && !state.personality.traits[line.trait]) return false;
    if (line.seed && !state.seedAnswers[line.seed]) return false;
    for (const [id, limit] of Object.entries(line.below ?? {})) {
      const value = id === "bond" ? state.niumpi.bond
        : id === "cleanliness" ? state.niumpi.cleanliness
          : state.stats[id as "fullness"];
      if (value >= (limit ?? 0)) return false;
    }
    for (const [id, limit] of Object.entries(line.above ?? {})) {
      const value = id === "bond" ? state.niumpi.bond
        : id === "cleanliness" ? state.niumpi.cleanliness
          : state.stats[id as "fullness"];
      if (value <= (limit ?? 0)) return false;
    }
    return true;
  });
  const fresh = eligible.filter((line) => !recent.has(line.id));
  const pool = fresh.length ? fresh : eligible.length ? eligible : dialogue;
  const rng = makeRng(hashSeed(state.profile.id, now, "line"));
  const chosen = pickWeighted(pool, (line) => line.weight ?? 1, rng());
  return { text: chosen.text, id: chosen.id };
}

export function rememberLine(state: GameState, id: string): GameState {
  return {
    ...state,
    log: { ...state.log, dialogue: [...state.log.dialogue, id].slice(-DIALOGUE_MEMORY) },
  };
}

/**
 * A gesture never maps to one fixed response. Mood, stats, bond, personality
 * and the time of day all steer which of several reactions plays.
 */
export type Reaction = {
  text: string;
  /** Animation the rig should switch to. */
  behavior: string;
  /** Spark glyph shown at the point of contact. */
  spark: string;
  sound: string;
  /** Set when the gesture was refused, so nothing is consumed. */
  refused?: boolean;
};

export function reactToGesture(state: GameState, action: CareActionId, now: number): Reaction {
  const mood = moodFor(state, now);
  const rng = makeRng(hashSeed(state.profile.id, now, action));
  const lines = gestureLines[action] ?? gestureLines.pet;
  const base = lines[Math.floor(rng() * lines.length)];

  if (state.niumpi.sleeping && action !== "comfort") {
    return { text: "Mmh…? Oh! Hello!", behavior: "happy", spark: "☾", sound: "wake" };
  }
  if (mood === "tired" && (action === "tickle" || action === "dance")) {
    return { text: "Not right now… too sleepy.", behavior: "sleepy", spark: "z", sound: "blip", refused: true };
  }
  if (mood === "upset" && action === "comfort") {
    return { text: "Thank you for staying.", behavior: "happy", spark: "♡", sound: "hold" };
  }
  if (mood === "upset" && (action === "tickle" || action === "dance")) {
    return { text: "Could we have a gentle moment first?", behavior: "sway", spark: "·", sound: "blip", refused: true };
  }
  if (mood === "hungry" && action === "pet") {
    return { text: "That's nice… but also, snacks?", behavior: "curious", spark: "♡", sound: "pet" };
  }
  if (mood === "excited" && action === "pet") {
    return { text: "Again! Again!", behavior: "happy", spark: "✦", sound: "pet" };
  }

  const behaviorByAction: Record<string, string> = {
    pet: "happy", hug: "happy", tickle: "spin", brush: "curious", leaf: "curious",
    dance: "dancing", comfort: "happy", sing: "singing", toy: "happy", wake: "happy",
  };
  const soundByAction: Record<string, string> = {
    pet: "pet", hug: "hold", tickle: "tap", brush: "leaf", leaf: "leaf",
    dance: "chime", comfort: "hold", sing: "chime", toy: "blip", wake: "wake",
  };
  return {
    text: base,
    behavior: behaviorByAction[action] ?? "happy",
    spark: action === "hug" || action === "comfort" ? "♡" : action === "leaf" ? "✧" : "✦",
    sound: soundByAction[action] ?? "tap",
  };
}

/**
 * Feeding is the richest reaction: the same berry lands differently depending
 * on hunger, personality, time of day and how often it has been served.
 */
export function reactToFood(state: GameState, foodId: string, now: number): Reaction & { multiplier: number } {
  const food = ingredientById(foodId);
  const mood = moodFor(state, now);
  const part = dayPartAt(now);
  const servedToday = state.counters.actions[`feed:${foodId}`] ?? 0;
  const name = food?.name ?? "snack";
  const disliked = state.personality.dislikedFoods.includes(foodId);
  const favorite = state.personality.favoriteFoods.includes(foodId);

  if (disliked && mood !== "hungry") {
    return { text: `Not that one. Anything else.`, behavior: "curious", spark: "✕", sound: "blip", refused: true, multiplier: 0 };
  }
  if (servedToday >= 4) {
    return { text: `${name} again? I'm keeping it for later.`, behavior: "curious", spark: "…", sound: "blip", multiplier: 0.25 };
  }
  if (mood === "hungry") {
    return { text: `${name}! Yes. Immediately.`, behavior: "happy", spark: "✧", sound: "eat", multiplier: 1.2 };
  }
  if (mood === "tired" || state.niumpi.sleeping) {
    return { text: `Mmh… ${name.toLowerCase()}… slowly…`, behavior: "sleepy", spark: "✧", sound: "eat", multiplier: 0.9 };
  }
  if (favorite) {
    return { text: `My favourite! You remembered!`, behavior: "happy", spark: "♡", sound: "eat", multiplier: 1.3 };
  }
  if (state.personality.traits.foodie) {
    return { text: `Interesting. Notes of… evening?`, behavior: "curious", spark: "✧", sound: "eat", multiplier: 1.1 };
  }
  if (state.personality.traits["night-owl"] && part === "night" && foodId === "moonberry") {
    return { text: `Moonberries taste better this late. Fact.`, behavior: "happy", spark: "☾", sound: "eat", multiplier: 1.25 };
  }
  return { text: `Nium! ${name} is delicious!`, behavior: "happy", spark: "✧", sound: "eat", multiplier: 1 };
}

/** The banner line built from the newest Memory Seed answer. */
export function discoveryLine(state: GameState): { title: string; note: string } | null {
  const entries = Object.entries(state.seedAnswers);
  if (!entries.length) return null;
  const [id, answer] = entries.sort((a, b) => b[1].answeredAt - a[1].answeredAt)[0];
  const question = seedMap[id];
  if (!question) return null;
  const recall = question.options[answer.choice].recall;
  return { title: "Still learning about you", note: `Niumpi remembers that ${recall}!` };
}

export function moodOf(state: GameState, now: number): MoodId {
  return moodFor(state, now);
}
