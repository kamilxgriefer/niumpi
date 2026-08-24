import type { RouteId, StageId } from "../game/types.ts";

/** The gameplay rig always has a neutral cloud skeleton. Routes extend it. */
export type RigFormId = "neutral" | RouteId;

export type RigRevealPhase = "seed" | "neutral" | "surface" | "branch" | "full";

export type RigArmGrowth = "none" | "buds" | "short" | "full";
export type RigFootGrowth = "tucked" | "small" | "full";

export type RigPalette = {
  body: string;
  belly: string;
  aura: string;
  leaf: string;
};

export type RigStageGeometry = {
  stage: StageId;
  scale: number;
  puffCount: number;
  body: {
    width: number;
    height: number;
    crownHeight: number;
    shoulder: number;
    lean: number;
  };
  face: {
    eyeRadius: number;
    eyeY: number;
    eyeGap: number;
    pupilRatio: number;
    mouthY: number;
    mouthWidth: number;
    cheekRadius: number;
  };
  arms: {
    growth: RigArmGrowth;
    reach: number;
  };
  feet: {
    growth: RigFootGrowth;
    scale: number;
  };
  leaves: {
    count: number;
    fan: readonly number[];
    anchorY: number;
  };
};

export type RigAppendageKind =
  | "veil"
  | "petal"
  | "wing"
  | "mist-tail"
  | "crystal";

export type RigAppendageDefinition = {
  id: string;
  kind: RigAppendageKind;
  layer: "back" | "front";
  side: "left" | "right" | "center";
  /** Portion visible at the branch stage. Full form always resolves to 1. */
  branchAmount: number;
};

export type RigFormGeometry = {
  id: RigFormId;
  palette: RigPalette;
  appendages: readonly RigAppendageDefinition[];
  locomotion: "step" | "float" | "hop" | "drift" | "glide";
  followThrough: number;
};

export type RigSurfaceHint = {
  kind: "diet" | "trait";
  id: string;
  strength: number;
};

/**
 * Complete, immutable input for the future layered renderer. It is derived
 * from the save and never written back, so animation changes cannot migrate or
 * accidentally reshape a relationship.
 */
export type ResolvedRigAppearance = {
  stage: StageId;
  phase: RigRevealPhase;
  /** Route already committed in the save, even when a young stage hides it. */
  lockedRoute: RouteId | null;
  /** Form the renderer is allowed to reveal at this stage. */
  form: RigFormId;
  /** 0 neutral, 0.55 branch vocabulary, 1 complete authored form. */
  formBlend: number;
  geometry: RigStageGeometry;
  formGeometry: RigFormGeometry;
  palette: {
    base: RigPalette;
    form: RigPalette | null;
    mix: number;
  };
  markings: readonly string[];
  surfaceHints: readonly RigSurfaceHint[];
  accessory: string | null;
};
