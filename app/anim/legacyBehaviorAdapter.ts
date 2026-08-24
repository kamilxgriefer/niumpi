import type { AnimState } from "./NiumpiAnimationController.ts";
import type { NiumpiBehavior } from "./NiumpiBehaviorMachine.ts";

/** Temporary bridge while existing CSS names are migrated to semantic behavior. */
export function semanticBehaviorForLegacy(state: AnimState): NiumpiBehavior {
  const map: Record<AnimState, NiumpiBehavior> = {
    idle: "idle", wander: "walk", float: "hover", spin: "roll", curious: "look", happy: "happy",
    sleepy: "sad", asleep: "sleep", peek: "look", sway: "idle", shimmy: "dance", stretch: "land",
    ponder: "look", book: "read", window: "look", lamp: "lamp", roll: "roll", singing: "sing",
    eating: "happy", hugging: "pet", petting: "pet", tickle: "happy", brushing: "pet", dancing: "dance",
    waking: "land", hatching: "happy", evolving: "happy", gift: "happy", cooking: "happy",
    gardening: "look", playing: "roll", returning: "walk",
  };
  return map[state];
}

/** CSS-compatible presentation name for one semantic behavior snapshot. */
export function legacyAnimationForBehavior(state: NiumpiBehavior): AnimState {
  const map: Record<NiumpiBehavior, AnimState> = {
    idle: "idle", walk: "wander", hover: "float", land: "stretch", look: "curious", pet: "petting",
    happy: "happy", sad: "sleepy", sleep: "asleep", dance: "dancing", sing: "singing",
    read: "book", lamp: "lamp", roll: "roll",
  };
  return map[state];
}
