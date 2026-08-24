import { growthStages } from "../../game/config/growth.ts";
import type { StageId } from "../../game/types.ts";
import type { RigArmGrowth, RigFootGrowth, RigStageGeometry } from "../types.ts";

const LEAF_FANS: Record<number, readonly number[]> = {
  0: [],
  1: [0],
  2: [-18, 18],
  3: [-28, 0, 28],
  5: [-38, -19, 0, 19, 38],
};

const PUFFS_BY_STAGE: Record<StageId, number> = {
  0: 0,
  1: 5,
  2: 6,
  3: 7,
  4: 8,
  5: 9,
};

const ARM_REACH: Record<RigArmGrowth, number> = {
  none: 0,
  buds: 0.24,
  short: 0.62,
  full: 1,
};

const FOOT_SCALE: Record<RigFootGrowth, number> = {
  tucked: 0.72,
  small: 0.88,
  full: 1,
};

/**
 * Adapts the existing progression table instead of copying its thresholds.
 * The old save remains authoritative while the new rig receives semantic,
 * renderer-independent geometry.
 */
export const rigStageGeometries: readonly RigStageGeometry[] = growthStages.map((profile) => {
  const crownTop = profile.body.baseY - profile.body.ry;
  const arms = profile.arms as RigArmGrowth;
  const feet = profile.feet as RigFootGrowth;
  return {
    stage: profile.id,
    scale: profile.scale,
    puffCount: PUFFS_BY_STAGE[profile.id],
    body: {
      width: profile.body.rx * 2,
      height: profile.body.ry * 2,
      crownHeight: Math.max(0, crownTop - profile.body.tipY),
      shoulder: profile.body.shoulder,
      lean: profile.body.tipLean,
    },
    face: {
      eyeRadius: profile.face.eyeR,
      eyeY: profile.face.eyeY,
      eyeGap: profile.face.eyeGap,
      pupilRatio: profile.face.pupil,
      mouthY: profile.face.mouthY,
      mouthWidth: profile.face.mouthW,
      cheekRadius: profile.face.cheekR,
    },
    arms: { growth: arms, reach: ARM_REACH[arms] },
    feet: { growth: feet, scale: FOOT_SCALE[feet] },
    leaves: {
      count: profile.leaves,
      fan: LEAF_FANS[profile.leaves] ?? LEAF_FANS[3],
      anchorY: profile.body.tipY,
    },
  };
});

const geometryMap = Object.fromEntries(
  rigStageGeometries.map((geometry) => [geometry.stage, geometry]),
) as Record<StageId, RigStageGeometry>;

export function stageGeometryFor(stage: number): RigStageGeometry {
  const clamped = Math.max(0, Math.min(5, Math.round(stage))) as StageId;
  return geometryMap[clamped];
}
