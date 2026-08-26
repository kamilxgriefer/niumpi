import type { SpriteClip } from "./NiumpiSpriteRuntime.ts";

export type FoodPropState = {
  active: boolean;
  id: string;
  bites: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

function smoothStep(from: number, to: number, value: number) {
  if (to <= from) return value >= to ? 1 : 0;
  const amount = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return amount * amount * (3 - 2 * amount);
}

export function foodPropStateAtFrame(clip: SpriteClip, frame: number, id = "moonberry"): FoodPropState {
  const bites = clip.events.filter((event) => event.type === "bite").map((event) => event.frame).sort((a, b) => a - b);
  const swallow = clip.events.find((event) => event.type === "swallow")?.frame ?? clip.frameCount;
  const safeFrame = Math.max(0, Math.min(clip.frameCount - 1, frame));
  const biteCount = bites.filter((bite) => safeFrame >= bite).length;
  const approachEnd = Math.max(1, (bites[0] ?? Math.floor(clip.frameCount * 0.4)) - 6);
  const approach = smoothStep(0, approachEnd, safeFrame);
  const chew = biteCount > 0 ? Math.sin((safeFrame - (bites[0] ?? 0)) * Math.PI * 0.52) * 3 : 0;
  const scales = [1, 0.78, 0.55, 0.32];
  return {
    active: safeFrame < swallow,
    id,
    bites: biteCount,
    x: 448 + (248 - 448) * approach,
    y: 304 + (338 - 304) * approach + chew,
    scale: scales[Math.min(3, biteCount)],
    rotation: -0.18 + approach * 0.24 + Math.sin(safeFrame * 0.42) * 0.035,
  };
}
