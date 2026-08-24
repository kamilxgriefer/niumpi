import { moodFor } from "./mood.ts";
import type { GameState, MoodId, VectorId } from "./types.ts";

/** Autonomous room actions. Kept in game code so the same learned profile can
 * later drive Rive, native mobile, or a server simulation without React. */
export type RoomMomentId =
  | "book" | "window" | "lamp" | "roll" | "dancing" | "singing" | "peek" | "stretch";

export type DispositionId = "bubbly" | "secure" | "curious" | "quiet" | "withdrawn";

export type LearnedBehavior = {
  disposition: DispositionId;
  mood: MoodId;
  /** 0..1: willingness to begin an energetic activity on its own. */
  playReadiness: number;
  /** Long-term tendencies learned from persisted care vectors and talents. */
  weights: Record<RoomMomentId, number>;
};

const MOMENTS: RoomMomentId[] = ["book", "window", "lamp", "roll", "dancing", "singing", "peek", "stretch"];

function unit(value: number) {
  return Math.max(0, Math.min(1, value / 100));
}

function vectorUnit(state: GameState, ids: VectorId[]) {
  const strongest = Math.max(...ids.map((id) => state.evolution.vectors[id] ?? 0), 0);
  // Evolution vectors have no hard cap. Twenty meaningful matching moments
  // are enough to establish a preference without making it permanent.
  return Math.max(0, Math.min(1, strongest / 40));
}

export function learnedBehaviorFor(state: GameState, now: number): LearnedBehavior {
  const mood = moodFor(state, now);
  const trust = unit(state.stats.trust);
  const joy = unit(state.stats.joy);
  const energy = unit(state.stats.energy);
  const bond = unit(state.niumpi.bond);
  const playful = vectorUnit(state, ["playful", "social"]);
  const curious = vectorUnit(state, ["curious", "brave", "nature"]);
  const creative = Math.max(vectorUnit(state, ["creative", "dream"]), Math.min(1, state.personality.talents.music / 12));
  const gentle = vectorUnit(state, ["loving", "calm", "balance"]);

  let disposition: DispositionId = "secure";
  if (mood === "upset" || state.stats.wellbeing < 28 || state.stats.trust < 22) disposition = "withdrawn";
  else if (mood === "tired" || energy < .36) disposition = "quiet";
  else if (mood === "curious" || curious > .58) disposition = "curious";
  else if (mood === "excited" || (joy > .82 && playful > .45)) disposition = "bubbly";

  const playReadiness = Math.max(0, Math.min(1, energy * .45 + joy * .3 + trust * .15 + bond * .1));
  const weights: Record<RoomMomentId, number> = {
    book: 1 + curious * 2.2 + creative * .5,
    window: 1 + curious * 2.5,
    lamp: 1 + gentle * 1.8,
    roll: .65 + playful * 2.7,
    dancing: .55 + playful * 2.4 + state.personality.talents.agility * .08,
    singing: .65 + creative * 2.8 + gentle * .45,
    peek: .9 + curious * .8,
    stretch: .9 + gentle * .45,
  };

  // Current care always outranks personality. A sad or exhausted pet seeks a
  // calm, recoverable moment instead of performing happiness for the player.
  if (disposition === "withdrawn") {
    weights.lamp *= 2.5; weights.peek *= 2.2; weights.window *= 1.7; weights.book *= 1.35;
    weights.roll *= .08; weights.dancing *= .06; weights.singing *= .45;
  } else if (disposition === "quiet") {
    weights.stretch *= 2.4; weights.book *= 1.8; weights.window *= 1.45; weights.lamp *= 1.5;
    weights.roll *= .15; weights.dancing *= .12;
  } else if (disposition === "bubbly") {
    weights.roll *= 1.8; weights.dancing *= 2; weights.singing *= 1.35;
  } else if (disposition === "curious") {
    weights.book *= 1.5; weights.window *= 1.65; weights.peek *= 1.35;
  }

  if (mood === "hungry") {
    weights.roll *= .1; weights.dancing *= .1; weights.stretch *= .5;
  }

  return { disposition, mood, playReadiness, weights };
}

/** Weighted choice is injected with a random number so the rule is testable. */
export function chooseLearnedRoomMoment(
  state: GameState,
  now: number,
  random: number,
  previous: RoomMomentId | null = null,
): RoomMomentId {
  const profile = learnedBehaviorFor(state, now);
  const candidates = MOMENTS.filter((id) => id !== previous);
  const total = candidates.reduce((sum, id) => sum + profile.weights[id], 0);
  let cursor = Math.max(0, Math.min(.999999, random)) * total;
  for (const id of candidates) {
    cursor -= profile.weights[id];
    if (cursor <= 0) return id;
  }
  return candidates[candidates.length - 1];
}

const RELATIONSHIP_LINES: Partial<Record<DispositionId, Partial<Record<RoomMomentId, string>>>> = {
  bubbly: {
    roll: "Wheee— I meant to do that!",
    dancing: "One, two… leaf turn!",
    singing: "Nium… niuuum! Your part!",
  },
  curious: {
    book: "This one has a map inside.",
    window: "Something moved past the window…",
    peek: "Just checking what you're doing.",
  },
  quiet: {
    book: "Could we read this one slowly?",
    lamp: "A little warmer. That's better.",
    stretch: "Tiny stretch. Then a rest.",
  },
  withdrawn: {
    lamp: "Can we keep the little light on?",
    window: "I'll stay here for a quiet minute.",
    peek: "Are you still nearby?",
    book: "Maybe a gentle story would help.",
  },
};

export function learnedRoomLine(state: GameState, now: number, moment: RoomMomentId, fallback: string) {
  const { disposition } = learnedBehaviorFor(state, now);
  return RELATIONSHIP_LINES[disposition]?.[moment] ?? fallback;
}
