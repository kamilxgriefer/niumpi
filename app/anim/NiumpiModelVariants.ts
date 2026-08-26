import type { NiumpiSpriteClip } from "./NiumpiSpriteRuntime.ts";
import type { RouteId } from "../game/types.ts";

/**
 * Stable renderer IDs. Keeping this larger than the currently shipped catalog
 * lets gameplay select the correct identity today and fall back to its
 * approved still while that variant's motion pack is still being authored.
 */
export const NIUMPI_SUPPORTED_MODEL_VARIANTS = [
  "baby",
  "stage-2",
  "stage-3",
  "stage-4",
  "stage-5",
  "moonveil",
  "bloomheart",
  "sparkleap",
  "mistwander",
  "prismatic",
] as const;

export type NiumpiModelVariant = (typeof NIUMPI_SUPPORTED_MODEL_VARIANTS)[number];

/**
 * Build catalog: only manifests that really exist may be offered in Animation
 * Lab. Add an ID here only in the same change that ships its validated manifest
 * and atlas pages.
 */
export const NIUMPI_AVAILABLE_MODEL_VARIANTS = NIUMPI_SUPPORTED_MODEL_VARIANTS;

/** Backwards-compatible Lab name; deliberately means available, not planned. */
export const NIUMPI_MODEL_VARIANTS = NIUMPI_AVAILABLE_MODEL_VARIANTS;

export type NiumpiAnimationClip = NiumpiSpriteClip;

const ROUTE_VARIANTS = new Set<RouteId>([
  "moonveil", "bloomheart", "sparkleap", "mistwander", "prismatic",
]);

function routeVariant(value: string | null | undefined): RouteId | null {
  return value && ROUTE_VARIANTS.has(value as RouteId) ? value as RouteId : null;
}

export function isAvailableModelVariant(value: string): value is (typeof NIUMPI_AVAILABLE_MODEL_VARIANTS)[number] {
  return (NIUMPI_AVAILABLE_MODEL_VARIANTS as readonly string[]).includes(value);
}

/**
 * Pure saved-progress → renderer mapping. A committed route outranks a stale
 * morphology, but it is intentionally revealed as a complete form only at
 * stage five. Earlier stages keep their own authored growth silhouette.
 */
export function variantFor(
  stage: number,
  morphology: string = "seedling",
  lockedRoute: RouteId | null = null,
): NiumpiModelVariant {
  if (stage <= 1) return "baby";
  if (stage === 2) return "stage-2";
  if (stage === 3) return "stage-3";
  if (stage === 4) return "stage-4";
  return routeVariant(lockedRoute) ?? routeVariant(morphology) ?? "stage-5";
}

/** Approved still shown while a supported motion pack has not shipped yet. */
export function fallbackForVariant(variant: NiumpiModelVariant): string {
  if (variant === "baby") return "/assets/niumpi/stages/stage-1.webp";
  if (variant.startsWith("stage-")) return `/assets/niumpi/stages/${variant}.webp`;
  return `/assets/niumpi/forms/${variant}.webp`;
}
