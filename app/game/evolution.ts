import { prismaticRequirements, routeMap, routes } from "./config/routes.ts";
import type { GameState, Phenotype, RouteId, VectorId } from "./types.ts";
import { vectorIds } from "./state.ts";
import { topVectors, vectorTotal } from "./care.ts";

export type RouteScore = { id: RouteId; score: number; share: number; rare: boolean };

/**
 * Deterministic scoring: the same care always points the same way. Randomness
 * is only ever used for small cosmetic variants, never for the route itself.
 */
export function scoreRoutes(state: GameState): RouteScore[] {
  const total = Math.max(1, vectorTotal(state));
  const raw = routes
    .filter((route) => route.id !== "prismatic")
    .map((route) => {
      let score = 0;
      for (const [id, weight] of Object.entries(route.weights)) {
        score += state.evolution.vectors[id as VectorId] * (weight ?? 0);
      }
      return { id: route.id, score, rare: route.rare };
    });
  const sum = Math.max(1, raw.reduce((acc, entry) => acc + entry.score, 0));
  const scored: RouteScore[] = raw
    .map((entry) => ({ ...entry, share: entry.score / sum }))
    .sort((a, b) => b.score - a.score);

  if (meetsPrismatic(state)) {
    scored.unshift({ id: "prismatic", score: total * 1.2, share: 1, rare: true });
  }
  return scored;
}

/** Prismatic is a reward for genuinely balanced, long, high-bond care. */
export function meetsPrismatic(state: GameState): boolean {
  const values = vectorIds.map((id) => state.evolution.vectors[id]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const talents = Object.values(state.personality.talents).filter((level) => level >= 2).length;
  return (
    state.niumpi.bond >= prismaticRequirements.bond &&
    min >= prismaticRequirements.minVector &&
    max - min <= prismaticRequirements.maxSpread &&
    talents >= prismaticRequirements.talents &&
    state.memories.length >= prismaticRequirements.memories
  );
}

export type RouteOutlook = {
  leading: RouteId | null;
  confidence: number;
  hint: string;
  scores: RouteScore[];
};

/** What the player is shown before a route locks: a direction, not numbers. */
export function routeOutlook(state: GameState): RouteOutlook {
  const scores = scoreRoutes(state);
  const leader = scores[0];
  const runnerUp = scores[1];
  if (!leader || leader.score <= 0) {
    return { leading: null, confidence: 0, hint: "Too early to tell — keep going.", scores };
  }
  const gap = runnerUp ? (leader.score - runnerUp.score) / Math.max(1, leader.score) : 1;
  const confidence = Math.round(Math.min(100, gap * 140));
  return {
    leading: leader.id,
    confidence,
    hint: `Niumpi seems especially ${routeMap[leader.id].hint}.`,
    scores,
  };
}

export function lockRoute(state: GameState, now: number): { state: GameState; route: RouteId } {
  const outlook = routeOutlook(state);
  const route = outlook.leading ?? "mistwander";
  return {
    state: {
      ...state,
      evolution: {
        ...state.evolution,
        lockedRoute: route,
        routeConfidence: outlook.confidence,
        history: [
          ...state.evolution.history,
          { at: now, stage: state.niumpi.stage, route, top: topVectors(state, 3) },
        ],
      },
      phenotype: phenotypeFor({ ...state, evolution: { ...state.evolution, lockedRoute: route } }),
    },
    route,
  };
}

/** Diet tints only ever pick from a safe named palette — no random colours. */
export const tintPalettes: Record<string, { marking: string; label: string }> = {
  violet: { marking: "violet-flecks", label: "Violet flecks" },
  teal: { marking: "teal-spots", label: "Turquoise spots" },
  gold: { marking: "gold-sparks", label: "Golden sparks" },
  rose: { marking: "rose-hearts", label: "Rose hearts" },
  pastel: { marking: "pastel-swirl", label: "Pastel swirl" },
  green: { marking: "leaf-bud", label: "A small bud" },
  prism: { marking: "prism-edge", label: "Prismatic edges" },
};

/** How much of one tint is needed before it shows up on the body. */
export const TINT_THRESHOLD = 8;

export function phenotypeFor(state: GameState): Phenotype {
  const route = state.evolution.lockedRoute ? routeMap[state.evolution.lockedRoute] : null;
  const markings = Object.entries(state.phenotype.tints)
    .filter(([, amount]) => amount >= TINT_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tint]) => tintPalettes[tint]?.marking)
    .filter((marking): marking is string => Boolean(marking));

  const top = topVectors(state, 1)[0];
  return {
    ...state.phenotype,
    bodyPalette: route ? route.id : "coral",
    bellyPalette: route ? `${route.id}-belly` : "cream",
    markings,
    leafType: route ? `${route.id}-leaf` : leafForVector(top),
    eyeType: state.niumpi.bond > 70 ? "bright" : "round",
    aura: route ? route.palette.aura : state.niumpi.bond > 55 ? "soft" : null,
    particles: route?.id === "prismatic" ? "prism" : state.stats.joy > 80 ? "spark" : null,
  };
}

function leafForVector(vector: VectorId | undefined): string {
  if (vector === "dream") return "moon-leaf";
  if (vector === "loving") return "petal-leaf";
  if (vector === "brave" || vector === "playful") return "sun-leaf";
  if (vector === "curious" || vector === "nature") return "long-leaf";
  return "classic";
}

/** Records what a meal nudges cosmetically, separately from evolution. */
export function addTint(state: GameState, tint: string | null, amount = 1): GameState {
  if (!tint) return state;
  const tints = { ...state.phenotype.tints, [tint]: (state.phenotype.tints[tint] ?? 0) + amount };
  return { ...state, phenotype: phenotypeFor({ ...state, phenotype: { ...state.phenotype, tints } }) };
}

/** Human-readable list of what shaped the current look. */
export function phenotypeNotes(state: GameState): string[] {
  const notes: string[] = [];
  for (const [tint, amount] of Object.entries(state.phenotype.tints)) {
    if (amount >= TINT_THRESHOLD && tintPalettes[tint]) notes.push(tintPalettes[tint].label);
  }
  if (state.niumpi.bond > 70) notes.push("Brighter eyes from a strong bond");
  if (state.stats.joy > 80) notes.push("Sparks that follow the movement");
  return notes;
}
