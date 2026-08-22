import { DAY_MS, unlockRules } from "./config/stages.ts";
import type { GameState, SceneId } from "./types.ts";
import { scaled } from "./time.ts";

export type UnlockState = { open: boolean; note: string };

/**
 * Tabs stay visible while locked, with a reason and a plain explanation of when
 * they open. Nothing here is ever purchasable.
 */
export function unlockFor(state: GameState, id: string, now: number): UnlockState {
  const rule = unlockRules.find((entry) => entry.id === id);
  if (!rule) return { open: true, note: "" };
  if (state.unlocks.includes(id)) return { open: true, note: "" };
  const days = Math.floor(scaled(now - state.niumpi.createdAt) / DAY_MS);
  const open = state.niumpi.careMoments >= rule.careMoments && days >= rule.days;
  return { open, note: rule.note };
}

export function sceneUnlock(state: GameState, scene: SceneId, now: number): UnlockState {
  const rule = unlockRules.find((entry) => entry.scene === scene);
  if (!rule) return { open: true, note: "" };
  return unlockFor(state, rule.id, now);
}

/** Records newly-open features so a later stat dip cannot take them away. */
export function settleUnlocks(state: GameState, now: number): GameState {
  const opened = unlockRules
    .filter((rule) => !state.unlocks.includes(rule.id) && unlockFor(state, rule.id, now).open)
    .map((rule) => rule.id);
  if (!opened.length) return state;
  return { ...state, unlocks: [...state.unlocks, ...opened] };
}

export function newlyUnlocked(before: GameState, after: GameState): string[] {
  return after.unlocks.filter((id) => !before.unlocks.includes(id));
}
