/**
 * The scoring maths behind the canvas games, kept as pure functions so the
 * rules can be tested without a renderer or a frame loop. The Phaser scenes
 * own drawing and input; everything that decides a score lives here.
 */

export type DropKind = "drop" | "stone" | "gold";

/** Dewdrop Dash: what a caught item is worth, and what it does to the combo. */
export function catchValue(kind: DropKind, combo: number): { points: number; combo: number } {
  if (kind === "stone") return { points: -1, combo: 0 };
  const next = combo + 1;
  return { points: kind === "gold" ? 3 : 1 + Math.floor(next / 5), combo: next };
}

/** True when a falling item is inside the catcher's mouth. */
export function isCaught(itemX: number, itemY: number, catcherX: number, catcherY: number): boolean {
  return Math.abs(itemX - catcherX) < 40 && Math.abs(itemY - catcherY) < 36;
}

export type Block = { x: number; width: number };

/**
 * Cloud Stack: the part of a dropped block that still rests on the one below.
 * Anything hanging over the edge is trimmed away; too little contact topples.
 */
export const TOPPLE_BELOW = 6;

export function trimOverlap(slider: Block, top: Block): { placed: Block; perfect: boolean } | null {
  const left = Math.max(slider.x, top.x);
  const right = Math.min(slider.x + slider.width, top.x + top.width);
  const overlap = right - left;
  if (overlap <= TOPPLE_BELOW) return null;
  return { placed: { x: left, width: overlap }, perfect: overlap > slider.width * 0.9 };
}

export function stackPoints(perfect: boolean): number {
  return perfect ? 2 : 1;
}

/** Leafbeat: timing windows measured in pixels from the hit line. */
export const PERFECT_WINDOW = 22;
export const GOOD_WINDOW = 50;

export type Judgement = "perfect" | "good" | "miss";

export function judgeBeat(distance: number): Judgement {
  if (distance <= PERFECT_WINDOW) return "perfect";
  if (distance <= GOOD_WINDOW) return "good";
  return "miss";
}

export function beatPoints(judgement: Judgement, combo: number): number {
  if (judgement === "miss") return 0;
  if (judgement === "perfect") return 2 + Math.floor(combo / 6);
  return 1;
}
