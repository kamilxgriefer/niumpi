import { TINT_THRESHOLD, tintPalettes } from "../game/evolution.ts";
import type { GameState, RouteId, StageId } from "../game/types.ts";
import { formGeometryFor, neutralCloudPalette } from "./geometry/forms.ts";
import { stageGeometryFor } from "./geometry/stages.ts";
import type { ResolvedRigAppearance, RigFormId, RigRevealPhase, RigSurfaceHint } from "./types.ts";

function phaseFor(stage: StageId): RigRevealPhase {
  if (stage === 0) return "seed";
  if (stage <= 2) return "neutral";
  if (stage === 3) return "surface";
  if (stage === 4) return "branch";
  return "full";
}

function formFor(stage: StageId, lockedRoute: RouteId | null): RigFormId {
  // A changing leader must never reshape a young pet. Only the route snapshot
  // already committed to the save is allowed to alter skeleton geometry.
  if (stage < 4 || !lockedRoute) return "neutral";
  return lockedRoute;
}

function dietHints(state: GameState): RigSurfaceHint[] {
  return Object.entries(state.phenotype.tints)
    .filter(([id, amount]) => Boolean(tintPalettes[id]) && amount >= TINT_THRESHOLD)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([id, amount]) => ({ kind: "diet" as const, id, strength: Math.min(1, amount / (TINT_THRESHOLD * 2)) }));
}

function traitHints(state: GameState): RigSurfaceHint[] {
  return Object.entries(state.personality.traits)
    .filter(([, strength]) => strength > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([id, strength]) => ({ kind: "trait" as const, id, strength: Math.min(1, strength / 3) }));
}

function visibleMarkings(state: GameState): string[] {
  const fromDiet = dietHints(state)
    .map((hint) => tintPalettes[hint.id]?.marking)
    .filter((marking): marking is string => Boolean(marking));
  // Preserve authored or legacy markings even if an older save did not retain
  // the tint counter that originally produced them.
  return [...new Set([...state.phenotype.markings, ...fromDiet])].slice(0, 3);
}

/**
 * Resolves saved progression into a stable visual contract for the new rig.
 * It is deliberately pure: no route is selected, locked, migrated or written.
 */
export function resolveRigAppearance(state: GameState): ResolvedRigAppearance {
  const stage = state.niumpi.stage;
  const phase = phaseFor(stage);
  const lockedRoute = state.evolution.lockedRoute;
  const form = formFor(stage, lockedRoute);
  const formGeometry = formGeometryFor(form);
  const surfaceVisible = stage >= 3;
  const formBlend = phase === "branch" && form !== "neutral" ? 0.55 : phase === "full" && form !== "neutral" ? 1 : 0;
  const surfaceHints = surfaceVisible ? [...dietHints(state), ...traitHints(state)] : [];

  return {
    stage,
    phase,
    lockedRoute,
    form,
    formBlend,
    geometry: stageGeometryFor(stage),
    formGeometry,
    palette: {
      base: neutralCloudPalette,
      form: form === "neutral" ? null : formGeometry.palette,
      mix: formBlend,
    },
    markings: surfaceVisible ? visibleMarkings(state) : [],
    surfaceHints,
    accessory: state.phenotype.accessory,
  };
}

export type {
  ResolvedRigAppearance, RigFormGeometry, RigFormId, RigStageGeometry,
} from "./types.ts";
