export type BlenderAnimationClip =
  | "idle" | "blink" | "look" | "tap_reaction" | "happy" | "eat" | "eat_favorite" | "hatch_complete"
  | "walk" | "hover" | "land" | "sad" | "sleep" | "dance" | "sing"
  | "read" | "lamp" | "roll";

export type BlenderClipDefinition = {
  startFrame: number;
  endFrame: number;
  startSeconds: number;
  durationSeconds: number;
  loop: boolean;
};

export type BlenderManifest = {
  version: number;
  renderer: "blender-gltf";
  artDirection?: "reference-locked-pearl-cloud";
  blenderVersion: string;
  fps: number;
  variants: string[];
  clips: Record<BlenderAnimationClip, BlenderClipDefinition>;
};

export const NIUMPI_MODEL_VARIANTS = [
  "stage-1", "stage-2", "stage-3", "stage-4", "stage-5",
  "moonveil", "bloomheart", "sparkleap", "mistwander", "prismatic",
] as const;

export const NIUMPI_ANIMATION_CLIPS: BlenderAnimationClip[] = [
  "idle", "blink", "look", "tap_reaction", "happy", "eat", "eat_favorite", "hatch_complete",
  "walk", "hover", "land", "sad", "sleep", "dance", "sing", "read", "lamp", "roll",
];

export function variantFor(stage: number, morphology: string): string {
  if (stage >= 5 && morphology !== "seedling") return morphology;
  return `stage-${Math.max(1, Math.min(5, Math.round(stage)))}`;
}
