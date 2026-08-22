import type { CareStyle } from "./RiggedNiumpi";

export type Gesture = "tap" | "pet" | "hold" | "leaf";
export type Need = "fullness" | "energy" | "joy";
export type FoodId = "moonberry" | "cloudpuff" | "dewdrop";
export type DayPeriod = "day" | "evening" | "night";
export type GrowthStage = 1 | 2 | 3 | 4;

export const needOrder: Need[] = ["fullness", "energy", "joy"];

export const needMeta: Record<Need, { label: string; icon: string; lowNote: string }> = {
  fullness: { label: "Fullness", icon: "●", lowNote: "Hungry" },
  energy: { label: "Energy", icon: "⚡", lowNote: "Tired" },
  joy: { label: "Joy", icon: "♥", lowNote: "Needs play" },
};

/** A need below this reads as low, and says so in words as well as colour. */
export const LOW_NEED = 38;

export const foodOrder: FoodId[] = ["moonberry", "cloudpuff", "dewdrop"];

export const foods: Record<FoodId, { name: string; effects: Partial<Record<Need, number>> }> = {
  moonberry: { name: "Moonberry", effects: { fullness: 22, joy: 6 } },
  cloudpuff: { name: "Cloud puff", effects: { fullness: 14, energy: 10, joy: 4 } },
  dewdrop: { name: "Dewdrop", effects: { fullness: 8, energy: 16 } },
};

export const gestureLabels: Record<Gesture, string> = {
  tap: "tapping",
  pet: "petting",
  hold: "cuddling",
  leaf: "leaf touches",
};

export const gestureSparks: Record<Gesture, string> = {
  tap: "✦",
  pet: "♡",
  hold: "♡",
  leaf: "✧",
};

export const careStyleDetails: Record<CareStyle, { name: string; note: string; symbol: string }> = {
  growing: { name: "Still discovering", note: "Your care will shape the leaves", symbol: "◌" },
  playful: { name: "Playful bond", note: "The leaves bounce with your energy", symbol: "✦" },
  restful: { name: "Dreamy bond", note: "The leaves glow softly after rest", symbol: "☾" },
  explorer: { name: "Curious bond", note: "Patterns grow from discovery", symbol: "⌁" },
  affection: { name: "Tender bond", note: "The leaves lean toward a heart", symbol: "♡" },
  chaotic: { name: "Wild-hearted bond", note: "Every leaf grows its own way", symbol: "≈" },
};

export const growthNames = ["", "Tiny seed", "Brave sprout", "Little explorer", "True companion"];

/** Care points needed to reach each stage. Unchanged rules, one place to read them. */
export const growthFloors: Record<GrowthStage, number> = { 1: 0, 2: 10, 3: 30, 4: 60 };

export function growthStageFor(carePoints: number): GrowthStage {
  if (carePoints >= growthFloors[4]) return 4;
  if (carePoints >= growthFloors[3]) return 3;
  if (carePoints >= growthFloors[2]) return 2;
  return 1;
}

export function growthProgressFor(carePoints: number, stage: GrowthStage) {
  if (stage === 4) return { floor: growthFloors[4], next: growthFloors[4], percent: 100, remaining: 0 };
  const floor = growthFloors[stage];
  const next = growthFloors[(stage + 1) as GrowthStage];
  const percent = Math.max(0, Math.min(100, ((carePoints - floor) / (next - floor)) * 100));
  return { floor, next, percent, remaining: Math.max(0, next - carePoints) };
}

export function dayPeriodFor(hour: number): DayPeriod {
  if (hour >= 7 && hour < 17) return "day";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}
