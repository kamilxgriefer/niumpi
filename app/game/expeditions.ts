import { expeditionGear, expeditionLengths, exploreOutcomeMap, exploreOutcomes } from "./config/explore.ts";
import type { GameState, Reward, VectorId } from "./types.ts";
import { grant } from "./inventory.ts";
import { addMemory } from "./memories.ts";
import { alreadyClaimed, markClaimed } from "./persistence.ts";
import { hashSeed, makeRng, pickWeighted } from "./rng.ts";

export function startExpedition(state: GameState, lengthId: string, gearId: string, now: number): GameState | null {
  const length = expeditionLengths.find((entry) => entry.id === lengthId);
  const gear = expeditionGear.find((entry) => entry.id === gearId);
  if (!length || !gear || state.expedition) return null;
  return {
    ...state,
    expedition: { duration: length.ms, startedAt: now, completesAt: now + length.ms, gear: gearId, claimed: false },
  };
}

export function expeditionReady(state: GameState, now: number): boolean {
  return Boolean(state.expedition && !state.expedition.claimed && now >= state.expedition.completesAt);
}

export type ExpeditionResult = { state: GameState; story: string; rewards: Reward[] };

export function claimExpedition(state: GameState, now: number): ExpeditionResult | null {
  const run = state.expedition;
  if (!run || run.claimed || now < run.completesAt) return null;
  const key = `expedition:${run.startedAt}`;
  if (alreadyClaimed(state, key)) return { state: { ...state, expedition: null }, story: "", rewards: [] };

  const gear = expeditionGear.find((entry) => entry.id === run.gear);
  const length = expeditionLengths.find((entry) => entry.ms === run.duration);
  const rng = makeRng(hashSeed(state.profile.id, run.startedAt, run.gear));
  // Gear tilts the draw toward the kind of result it is meant for.
  const outcome = pickWeighted(
    exploreOutcomes,
    (entry) => (gear?.favours.includes(entry.kind) ? 4 : 1) * (entry.kind === "rare" ? (length?.luck ?? 1) : 1),
    rng(),
  );
  const chosen = exploreOutcomeMap[outcome.id];

  let next = grant(state, chosen.rewards);
  const vectors = { ...next.evolution.vectors };
  vectors.curious += 2;
  for (const [id, amount] of Object.entries(gear?.vectors ?? {})) vectors[id as VectorId] += amount ?? 0;
  next = { ...next, evolution: { ...next.evolution, vectors }, expedition: null };
  if (chosen.memory) {
    next = addMemory(next, { kind: "story", ...chosen.memory }, now, `${key}:memory`).state;
  }
  return { state: markClaimed(next, key, now), story: chosen.story, rewards: chosen.rewards };
}

export { expeditionGear, expeditionLengths };
