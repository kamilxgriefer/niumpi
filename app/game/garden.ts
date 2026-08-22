import { WATER_BOOST, plantMap, plants } from "./config/plants.ts";
import type { GameState, Plot, Reward } from "./types.ts";
import { addIngredient } from "./inventory.ts";
import { hashSeed, makeRng } from "./rng.ts";
import { scaled } from "./time.ts";

export type PlotView = Plot & {
  name: string | null;
  art: string | null;
  /** 0..1 toward harvest, computed from timestamps only. */
  growth: number;
  ready: boolean;
  msLeft: number;
};

/**
 * Growth is derived from planting time, never from a running timer, so plants
 * keep growing while the tab is closed and nothing is lost on refresh.
 */
export function viewPlot(plot: Plot, now: number): PlotView {
  const plant = plot.plantId ? plantMap[plot.plantId] : null;
  if (!plant || !plot.plantedAt || !plot.harvestReadyAt) {
    return { ...plot, name: null, art: null, growth: 0, ready: false, msLeft: 0 };
  }
  const span = Math.max(1, plot.harvestReadyAt - plot.plantedAt);
  const done = Math.max(0, Math.min(1, (now - plot.plantedAt) / span));
  return {
    ...plot,
    name: plant.name,
    art: plant.art,
    growth: done,
    ready: now >= plot.harvestReadyAt,
    msLeft: Math.max(0, plot.harvestReadyAt - now),
  };
}

export function availablePlants(state: GameState) {
  const days = Math.floor(scaled(Date.now() - state.niumpi.createdAt) / 86_400_000);
  return plants.filter((plant) => plant.unlockAt <= days || plant.unlockAt <= state.niumpi.stage * 4);
}

export function plantSeed(state: GameState, plotId: number, plantId: string, now: number): GameState | null {
  const plant = plantMap[plantId];
  const plot = state.garden.plots[plotId];
  if (!plant || !plot || plot.plantId) return null;
  const seedKey = `seed:${plantId}`;
  const owned = state.inventory.ingredients[seedKey] ?? 0;
  if (owned < 1) return null;

  // Weather the plant likes shortens the wait; nothing ever makes it longer.
  const likes = plant.loves.includes(state.weather.key);
  const hours = plant.hours * (likes ? 0.8 : 1);
  const rng = makeRng(hashSeed(state.profile.id, plotId, now, "rare"));
  return {
    ...state,
    inventory: {
      ...state.inventory,
      ingredients: { ...state.inventory.ingredients, [seedKey]: owned - 1 },
    },
    garden: {
      plots: state.garden.plots.map((entry) =>
        entry.id === plotId
          ? {
              ...entry, plantId, plantedAt: now, wateredAt: null,
              harvestReadyAt: now + hours * 3_600_000,
              rare: rng() < plant.rareChance,
            }
          : entry),
    },
  };
}

/** Watering can only ever help, and only once per planting. */
export function water(state: GameState, plotId: number, now: number): GameState | null {
  const plot = state.garden.plots[plotId];
  if (!plot?.plantId || plot.wateredAt || !plot.harvestReadyAt) return null;
  const left = Math.max(0, plot.harvestReadyAt - now);
  return {
    ...state,
    garden: {
      plots: state.garden.plots.map((entry) =>
        entry.id === plotId
          ? { ...entry, wateredAt: now, harvestReadyAt: entry.harvestReadyAt! - left * WATER_BOOST }
          : entry),
    },
  };
}

export function harvest(state: GameState, plotId: number, now: number): { state: GameState; rewards: Reward[] } | null {
  const plot = state.garden.plots[plotId];
  const view = plot ? viewPlot(plot, now) : null;
  if (!plot?.plantId || !view?.ready) return null;
  const plant = plantMap[plot.plantId];
  const amount = plant.amount + (plot.rare ? 2 : 0);
  const rewards: Reward[] = [{ kind: "ingredient", id: plant.yields, amount }];
  if (plot.rare) rewards.push({ kind: "currency", id: "starFragments", amount: 1 });

  let next = addIngredient(state, plant.yields, amount);
  if (plot.rare) {
    next = {
      ...next,
      inventory: {
        ...next.inventory,
        currencies: { ...next.inventory.currencies, starFragments: next.inventory.currencies.starFragments + 1 },
      },
    };
  }
  return {
    state: {
      ...next,
      garden: {
        plots: next.garden.plots.map((entry) =>
          entry.id === plotId
            ? { ...entry, plantId: null, plantedAt: null, wateredAt: null, harvestReadyAt: null, rare: false }
            : entry),
      },
    },
    rewards,
  };
}
