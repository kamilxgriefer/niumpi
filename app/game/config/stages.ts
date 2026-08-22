import type { StageId } from "../types.ts";

export type StageDef = {
  id: StageId;
  name: string;
  blurb: string;
  /** Care moments needed to leave this stage. */
  careMoments: number;
  /** Real days that must also pass. Dev time multiplier scales this. */
  days: number;
  art: string;
};

/**
 * Times are configuration, never literals in components. `DAY_MS` is divided by
 * the dev time multiplier so a whole life can be simulated in a test.
 */
export const DAY_MS = 86_400_000;

export const stages: StageDef[] = [
  { id: 0, name: "Tiny Seed", blurb: "Something is waiting inside", careMoments: 4, days: 0, art: "seed" },
  { id: 1, name: "Sprouting", blurb: "First shape, first opinions", careMoments: 40, days: 1, art: "sprout" },
  { id: 2, name: "Bloom Form", blurb: "Colour settles in", careMoments: 120, days: 4, art: "bloom" },
  { id: 3, name: "Branching Evolution", blurb: "Your care picks a direction", careMoments: 260, days: 14, art: "branch" },
  { id: 4, name: "Mature Niumpi", blurb: "Fully themselves", careMoments: 460, days: 35, art: "mature" },
  { id: 5, name: "Legacy", blurb: "Ready to pass something on", careMoments: 720, days: 75, art: "legacy" },
];

export const stageMap: Record<number, StageDef> = Object.fromEntries(stages.map((s) => [s.id, s]));

export function nextStage(stage: StageId): StageDef | null {
  return stageMap[stage + 1] ?? null;
}

/** Seed actions available before hatching, and what each one gives. */
export const seedActions = [
  { id: "warm", label: "Warm the seed", note: "Cup both hands around it", art: "warm", vectors: { loving: 3, calm: 1 } },
  { id: "dewdrop", label: "Give a dewdrop", note: "One clear drop on the shell", art: "drop", vectors: { curious: 3, nature: 1 } },
  { id: "hum", label: "Hum to the seed", note: "Any tune, quietly", art: "note", vectors: { creative: 3, dream: 1 } },
] as const;

/** How far one seed action moves the shell, and the cooldown between them. */
export const SEED_STEP = 0.16;
export const SEED_COOLDOWN_MS = 4_000;

/** Shell states the Seed Chamber walks through as progress climbs. */
export const seedPhases = [
  { at: 0, key: "calm", label: "Still" },
  { at: 0.2, key: "glowing", label: "Glowing" },
  { at: 0.4, key: "stirring", label: "Stirring" },
  { at: 0.6, key: "cracked", label: "First crack" },
  { at: 0.82, key: "breaking", label: "Breaking open" },
  { at: 1, key: "hatching", label: "Hatching" },
];

export function seedPhaseFor(progress: number) {
  let found = seedPhases[0];
  for (const phase of seedPhases) if (progress >= phase.at) found = phase;
  return found;
}

/** Feature gates. A tab may be visible but locked with a reason. */
export const unlockRules: Array<{ id: string; scene: string; careMoments: number; days: number; note: string }> = [
  { id: "seeds", scene: "memory", careMoments: 6, days: 0, note: "After your first day together" },
  { id: "room", scene: "room", careMoments: 10, days: 0, note: "Once there is something to decorate" },
  { id: "games", scene: "games", careMoments: 18, days: 1, note: "Day 2 — when there is energy to play" },
  { id: "garden", scene: "garden", careMoments: 34, days: 2, note: "Day 3 — the first seeds arrive" },
  { id: "cooking", scene: "cooking", careMoments: 52, days: 3, note: "Day 4 — once the pantry has enough" },
  { id: "dreams", scene: "dreams", careMoments: 74, days: 4, note: "Day 5 — after a few good nights" },
  { id: "friends", scene: "friends", careMoments: 96, days: 5, note: "Day 6 — when word gets around" },
  { id: "evolution", scene: "evolution", careMoments: 120, days: 6, note: "Day 7 — once a direction shows" },
  { id: "shop", scene: "shop", careMoments: 24, days: 1, note: "Once you have dewdrops to spend" },
];
