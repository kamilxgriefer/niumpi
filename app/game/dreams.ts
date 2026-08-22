import { DREAM_MS, dreamDoorMap, dreamOutcomeMap } from "./config/dreams.ts";
import type { GameState, Reward, VectorId } from "./types.ts";
import { grant } from "./inventory.ts";
import { addMemory } from "./memories.ts";
import { alreadyClaimed, markClaimed } from "./persistence.ts";
import { hashSeed, makeRng, pick } from "./rng.ts";

export function startDream(state: GameState, doorId: string, carried: string | null, now: number): GameState | null {
  const door = dreamDoorMap[doorId];
  if (!door || state.dream) return null;
  // A lantern shortens the night slightly; a blanket lengthens it for a deeper result.
  const scale = carried === "lantern" ? 0.8 : carried === "blanket" ? 1.25 : 1;
  return {
    ...state,
    dream: { door: doorId, startedAt: now, completesAt: now + DREAM_MS * scale, carried, claimed: false },
    niumpi: { ...state.niumpi, sleeping: true, sleepStartedAt: now },
  };
}

export function dreamReady(state: GameState, now: number): boolean {
  return Boolean(state.dream && !state.dream.claimed && now >= state.dream.completesAt);
}

export type DreamResult = {
  state: GameState;
  title: string;
  story: string;
  rewards: Reward[];
  doorName: string;
};

/**
 * The outcome is drawn from a seed built out of the run itself, so claiming it
 * late — or claiming it twice — always produces the same single payout.
 */
export function claimDream(state: GameState, now: number): DreamResult | null {
  const run = state.dream;
  if (!run || run.claimed || now < run.completesAt) return null;
  const key = `dream:${run.startedAt}`;
  if (alreadyClaimed(state, key)) {
    return { state: { ...state, dream: null }, title: "", story: "", rewards: [], doorName: "" };
  }
  const door = dreamDoorMap[run.door];
  const rng = makeRng(hashSeed(state.profile.id, run.startedAt, run.door, run.carried ?? "none"));
  const outcome = dreamOutcomeMap[pick(door.pool, rng())];

  let next = grant(state, outcome.rewards);
  const vectors = { ...next.evolution.vectors };
  for (const [id, amount] of Object.entries(door.vectors)) vectors[id as VectorId] += amount ?? 0;
  next = { ...next, evolution: { ...next.evolution, vectors } };

  // A leaf in the pocket makes a keepsake far more likely.
  const wantsMemory = outcome.memory && (run.carried === "leaf" || rng() > 0.45);
  if (wantsMemory && outcome.memory) {
    next = addMemory(next, { kind: "dream", ...outcome.memory }, now, `${key}:memory`).state;
  }
  next = {
    ...next,
    dream: null,
    niumpi: { ...next.niumpi, sleeping: false, sleepStartedAt: null },
    stats: { ...next.stats, energy: Math.min(100, next.stats.energy + 26), joy: Math.min(100, next.stats.joy + 12) },
  };
  return {
    state: markClaimed(next, key, now),
    title: outcome.title,
    story: outcome.story,
    rewards: outcome.rewards,
    doorName: door.name,
  };
}
