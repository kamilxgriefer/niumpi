import type { StageId } from "../types.ts";
import { growthStages, type StageProfile } from "./growth.ts";

/**
 * Stage progression. The definitions live in growth.ts alongside the
 * proportions they describe — a stage is a shape and a threshold, and splitting
 * those across two files is how the old model ended up with a "Sprouting"
 * stage 1 that the renderer drew at full adult size.
 */

export type StageDef = StageProfile;

/**
 * Times are configuration, never literals in components. `DAY_MS` is divided by
 * the dev time multiplier so a whole life can be simulated in a test.
 */
export const DAY_MS = 86_400_000;

export const stages: StageDef[] = growthStages;

export const stageMap: Record<number, StageDef> = Object.fromEntries(stages.map((s) => [s.id, s]));

export function nextStage(stage: StageId): StageDef | null {
  return stageMap[stage + 1] ?? null;
}

/**
 * The pre-hatch care ritual. Each tool has a physical reason to exist and a
 * distinct effect on the shell; it is not a row of interchangeable progress
 * buttons. The ids intentionally reuse real care actions so the first minutes
 * already begin shaping Niumpi's personality.
 */
export const seedActions = [
  { id: "brush", label: "Stroke the shell", note: "Slow circles with a warm hand", art: "heart", fx: "stroke", vectors: { loving: 3, calm: 1 } },
  { id: "dewdrop", label: "Wash with dewdrops", note: "A soft cloth and clear water", art: "drop", fx: "wash", vectors: { curious: 2, nature: 2 } },
  { id: "warm", label: "Wrap it in a blanket", note: "Keep the little heartbeat warm", art: "warm", fx: "blanket", vectors: { loving: 2, calm: 3 } },
  { id: "hum", label: "Hum a little melody", note: "Listen for an answer inside", art: "note", fx: "hum", vectors: { creative: 3, dream: 2 } },
] as const;

/**
 * Thirteen calm interactions, with one shared settling beat between them,
 * turns hatching into a short relationship rather than a seven-click form.
 */
export const SEED_STEP = 0.08;
export const SEED_COOLDOWN_MS = 3_200;

/** Shell states the Seed Chamber walks through as progress climbs. */
export const seedPhases = [
  { at: 0, key: "calm", label: "Listening" },
  { at: 0.2, key: "glowing", label: "Finding warmth" },
  { at: 0.4, key: "stirring", label: "A tiny heartbeat" },
  { at: 0.6, key: "cracked", label: "The first answer" },
  { at: 0.82, key: "breaking", label: "Almost ready" },
  { at: 1, key: "hatching", label: "Hatching" },
];

export function seedPhaseFor(progress: number) {
  let found = seedPhases[0];
  for (const phase of seedPhases) if (progress >= phase.at) found = phase;
  return found;
}

/** Feature gates. A tab may be visible but locked with a reason. */
/*
 * A newly hatched player used to face six padlocks, four of them as full-size
 * tiles on the home screen. For the age this is aimed at that reads as "you may
 * not play yet". The room and the memory seeds now open immediately, so there
 * is somewhere to go from the first second, and the rest arrive over the week.
 */
export const unlockRules: Array<{ id: string; scene: string; careMoments: number; days: number; note: string }> = [
  { id: "room", scene: "room", careMoments: 0, days: 0, note: "" },
  { id: "seeds", scene: "memory", careMoments: 0, days: 0, note: "" },
  { id: "games", scene: "games", careMoments: 14, days: 0, note: "When there is energy to play" },
  { id: "shop", scene: "shop", careMoments: 22, days: 0, note: "Once you have dewdrops to spend" },
  { id: "garden", scene: "garden", careMoments: 34, days: 1, note: "Day 2 — the first seeds arrive" },
  { id: "cooking", scene: "cooking", careMoments: 52, days: 2, note: "Day 3 — once the pantry has enough" },
  { id: "dreams", scene: "dreams", careMoments: 74, days: 3, note: "Day 4 — after a few good nights" },
  { id: "friends", scene: "friends", careMoments: 96, days: 4, note: "Day 5 — when word gets around" },
  { id: "evolution", scene: "evolution", careMoments: 130, days: 5, note: "Day 6 — once a direction shows" },
];
