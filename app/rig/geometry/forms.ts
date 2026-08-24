import { routeMap } from "../../game/config/routes.ts";
import type { RouteId } from "../../game/types.ts";
import type { RigFormGeometry, RigFormId, RigPalette } from "../types.ts";

export const neutralCloudPalette: RigPalette = {
  body: "#EEE7F5",
  belly: "#FFFFFF",
  aura: "#D8CDEC",
  leaf: "#74E2C0",
};

const routePalette = (id: RouteId): RigPalette => ({ ...routeMap[id].palette });

export const rigFormGeometries: Record<RigFormId, RigFormGeometry> = {
  neutral: {
    id: "neutral",
    palette: neutralCloudPalette,
    appendages: [],
    locomotion: "step",
    followThrough: 0.5,
  },
  moonveil: {
    id: "moonveil",
    palette: routePalette("moonveil"),
    appendages: [
      { id: "veil-left", kind: "veil", layer: "back", side: "left", branchAmount: 0.42 },
      { id: "veil-right", kind: "veil", layer: "back", side: "right", branchAmount: 0.42 },
    ],
    locomotion: "float",
    followThrough: 0.88,
  },
  bloomheart: {
    id: "bloomheart",
    palette: routePalette("bloomheart"),
    appendages: [
      { id: "petal-left", kind: "petal", layer: "front", side: "left", branchAmount: 0.48 },
      { id: "petal-right", kind: "petal", layer: "front", side: "right", branchAmount: 0.48 },
    ],
    locomotion: "step",
    followThrough: 0.72,
  },
  sparkleap: {
    id: "sparkleap",
    palette: routePalette("sparkleap"),
    appendages: [
      { id: "wing-left", kind: "wing", layer: "back", side: "left", branchAmount: 0.38 },
      { id: "wing-right", kind: "wing", layer: "back", side: "right", branchAmount: 0.38 },
    ],
    locomotion: "hop",
    followThrough: 0.6,
  },
  mistwander: {
    id: "mistwander",
    palette: routePalette("mistwander"),
    appendages: [
      { id: "mist-tail", kind: "mist-tail", layer: "back", side: "right", branchAmount: 0.5 },
    ],
    locomotion: "drift",
    followThrough: 1,
  },
  prismatic: {
    id: "prismatic",
    palette: routePalette("prismatic"),
    appendages: [
      { id: "crystal-left", kind: "crystal", layer: "back", side: "left", branchAmount: 0.32 },
      { id: "crystal-right", kind: "crystal", layer: "back", side: "right", branchAmount: 0.32 },
      { id: "crystal-crown", kind: "crystal", layer: "front", side: "center", branchAmount: 0.28 },
    ],
    locomotion: "glide",
    followThrough: 0.78,
  },
};

export function formGeometryFor(form: RigFormId): RigFormGeometry {
  return rigFormGeometries[form];
}
