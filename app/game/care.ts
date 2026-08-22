import type { CareActionId, GameState, StageId, VectorId } from "./types.ts";
import { stageMap, stages } from "./config/stages.ts";
import { traits } from "./config/traits.ts";
import { DAY_MS, dayKeyFor, scaled } from "./time.ts";
import { vectorIds } from "./state.ts";

/**
 * A care moment is a *meaningful* interaction. The same action repeated loses
 * value quickly, and variety across the day earns it back.
 */
export const diminishingSteps = [1, 0.6, 0.3, 0.12, 0];

export function diminishFactor(timesToday: number): number {
  return diminishingSteps[Math.min(timesToday, diminishingSteps.length - 1)];
}

/** Base weight of each action before diminishing returns. */
export const actionWeight: Record<CareActionId, number> = {
  pet: 1, hug: 1.4, tickle: 1, brush: 1.2, leaf: 0.8, dance: 1.4, comfort: 1.6, sing: 1.2,
  feed: 1.5, cook: 2.4, sleep: 2, dream: 2.4, minigame: 2.2, seed: 2, harvest: 1.8,
  plant: 1.2, toy: 1.2, explore: 2, visit: 1.8, decorate: 1.2, warm: 1, dewdrop: 1, hum: 1,
};

/** Bond earned per care moment, before the variety bonus. */
export const bondPerMoment = 0.9;
/** Extra multiplier once several different actions happened today. */
export const varietyBonus = [1, 1, 1.1, 1.2, 1.35, 1.5];

export type CareResult = {
  state: GameState;
  careMoment: boolean;
  /** 0..1 — how much of a full moment this action was worth. */
  value: number;
  bondGain: number;
};

export function recordCare(
  state: GameState,
  action: CareActionId,
  now: number,
  vectors: Partial<Record<VectorId, number>> = {},
): CareResult {
  const dayKey = dayKeyFor(now);
  const counters = dayKey === state.counters.dayKey
    ? state.counters
    : { dayKey, actions: {}, variety: [] };

  const timesToday = counters.actions[action] ?? 0;
  const factor = diminishFactor(timesToday);
  const variety = counters.variety.includes(action) ? counters.variety : [...counters.variety, action];
  const multiplier = varietyBonus[Math.min(variety.length, varietyBonus.length - 1)];
  const value = actionWeight[action] * factor;
  const bondGain = value * bondPerMoment * multiplier;

  const nextVectors = { ...state.evolution.vectors };
  for (const [id, amount] of Object.entries(vectors)) {
    // Vectors keep growing on repeat actions, just far more slowly.
    nextVectors[id as VectorId] += (amount ?? 0) * Math.max(0.15, factor);
  }

  return {
    state: {
      ...state,
      niumpi: {
        ...state.niumpi,
        careMoments: state.niumpi.careMoments + value,
        bond: Math.min(100, state.niumpi.bond + bondGain),
        lastInteractionAt: now,
      },
      evolution: { ...state.evolution, vectors: nextVectors },
      counters: { ...counters, actions: { ...counters.actions, [action]: timesToday + 1 }, variety },
      stats: { ...state.stats, variety: Math.min(100, variety.length * 12) },
    },
    careMoment: value >= 0.5,
    value,
    bondGain,
  };
}

/** Feeds a hidden trait counter; the reveal check runs separately. */
export function addSignal(state: GameState, signal: string, amount = 1): GameState {
  if (!signal) return state;
  return {
    ...state,
    personality: {
      ...state.personality,
      signals: { ...state.personality.signals, [signal]: (state.personality.signals[signal] ?? 0) + amount },
    },
  };
}

/** Any trait whose signal has crossed its threshold and is not yet known. */
export function newlyDiscoveredTraits(state: GameState): string[] {
  return traits
    .filter((trait) => !state.personality.traits[trait.id])
    .filter((trait) => (state.personality.signals[trait.signal] ?? 0) >= trait.threshold)
    .map((trait) => trait.id);
}

export function discoverTrait(state: GameState, traitId: string, now: number): GameState {
  if (state.personality.traits[traitId]) return state;
  const trait = traits.find((t) => t.id === traitId);
  const vectors = { ...state.evolution.vectors };
  for (const [id, amount] of Object.entries(trait?.vectors ?? {})) {
    vectors[id as VectorId] += amount ?? 0;
  }
  return {
    ...state,
    evolution: { ...state.evolution, vectors },
    personality: { ...state.personality, traits: { ...state.personality.traits, [traitId]: now } },
  };
}

export type StageProgress = {
  stage: StageId;
  name: string;
  blurb: string;
  /** 0..100 across both the care-moment and the elapsed-day requirement. */
  percent: number;
  careMoments: number;
  careTarget: number;
  daysDone: number;
  daysTarget: number;
  ready: boolean;
  next: string | null;
};

export function stageProgress(state: GameState, now: number): StageProgress {
  const current = stageMap[state.niumpi.stage];
  const next = stages.find((s) => s.id === state.niumpi.stage + 1) ?? null;
  const careTarget = next ? next.careMoments : current.careMoments;
  const daysTarget = next ? next.days : current.days;
  const elapsed = scaled(now - state.niumpi.createdAt);
  const daysDone = Math.floor(elapsed / DAY_MS);
  const careDone = Math.min(1, careTarget ? state.niumpi.careMoments / careTarget : 1);
  const timeDone = daysTarget ? Math.min(1, daysDone / daysTarget) : 1;
  return {
    stage: state.niumpi.stage,
    name: current.name,
    blurb: current.blurb,
    // Care is the driver; time only gates the final quarter of a stage.
    percent: Math.round(Math.min(100, (careDone * 0.75 + timeDone * 0.25) * 100)),
    careMoments: Math.floor(state.niumpi.careMoments),
    careTarget,
    daysDone,
    daysTarget,
    ready: Boolean(next) && careDone >= 1 && timeDone >= 1,
    next: next?.name ?? null,
  };
}

/** Total vector mass — used to judge how strongly a route has been earned. */
export function vectorTotal(state: GameState): number {
  return vectorIds.reduce((sum, id) => sum + state.evolution.vectors[id], 0);
}

export function topVectors(state: GameState, count = 3): VectorId[] {
  return [...vectorIds]
    .sort((a, b) => state.evolution.vectors[b] - state.evolution.vectors[a])
    .slice(0, count);
}
