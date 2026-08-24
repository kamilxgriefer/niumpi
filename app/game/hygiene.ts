import type { GameState } from "./types.ts";

export type WashTool = "sponge" | "brush";
export type HygieneCondition = "sparkling" | "fresh" | "dusty" | "messy";

export const CLEANLINESS_MAX = 100;
/** Niumpi can look muddy, but neglect never becomes a frightening crisis. */
export const CLEANLINESS_FLOOR = 20;
export const CLEANLINESS_LOW = 42;
export const CLEANLINESS_VISIBLE_DIRT = 74;

/** Natural loss per real hour. Sleeping slows it down considerably. */
export const cleanlinessPerHour = { awake: 1.6, sleeping: 0.65 } as const;

export const washTools: Record<WashTool, {
  name: string;
  note: string;
  gain: number;
  art: string;
}> = {
  sponge: { name: "Cloud Sponge", note: "Soft bubbles and a quick rinse", gain: 46, art: "drop" },
  brush: { name: "Moon Brush", note: "A slow polish for dusty fluff", gain: 32, art: "leaf" },
};

export function clampCleanliness(value: number): number {
  if (!Number.isFinite(value)) return CLEANLINESS_MAX;
  return Math.max(CLEANLINESS_FLOOR, Math.min(CLEANLINESS_MAX, value));
}

export function cleanlinessAfter(value: number, hours: number, sleeping: boolean): number {
  const chargedHours = Math.max(0, Math.min(48, Number.isFinite(hours) ? hours : 0));
  const rate = sleeping ? cleanlinessPerHour.sleeping : cleanlinessPerHour.awake;
  return clampCleanliness(value - chargedHours * rate);
}

export function soilNiumpi(state: GameState, amount: number): GameState {
  if (!state.niumpi.hatchedAt || amount <= 0) return state;
  return {
    ...state,
    niumpi: {
      ...state.niumpi,
      cleanliness: clampCleanliness(state.niumpi.cleanliness - amount),
    },
  };
}

export function hygieneCondition(value: number): HygieneCondition {
  if (value >= 92) return "sparkling";
  if (value >= CLEANLINESS_VISIBLE_DIRT) return "fresh";
  if (value >= CLEANLINESS_LOW) return "dusty";
  return "messy";
}

/** 0..1, deliberately delayed so a tiny amount of decay is not visually noisy. */
export function visibleDirt(value: number): number {
  const clean = clampCleanliness(value);
  return Math.max(0, Math.min(1, (CLEANLINESS_VISIBLE_DIRT - clean) / (CLEANLINESS_VISIBLE_DIRT - CLEANLINESS_FLOOR)));
}
