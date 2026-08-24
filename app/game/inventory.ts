import type { CurrencyId, GameState, Reward } from "./types.ts";
import { ingredientById } from "./config/foods.ts";
import { itemMap } from "./config/items.ts";
import { plantMap } from "./config/plants.ts";

/** Consuming is transactional: either every part is available, or nothing moves. */
export function canSpend(state: GameState, parts: string[]): boolean {
  const need = new Map<string, number>();
  for (const part of parts) need.set(part, (need.get(part) ?? 0) + 1);
  for (const [id, count] of need) {
    if ((state.inventory.ingredients[id] ?? 0) < count) return false;
  }
  return true;
}

export function spendIngredients(state: GameState, parts: string[]): GameState | null {
  if (!canSpend(state, parts)) return null;
  const ingredients = { ...state.inventory.ingredients };
  for (const part of parts) ingredients[part] = (ingredients[part] ?? 0) - 1;
  return { ...state, inventory: { ...state.inventory, ingredients } };
}

export function addIngredient(state: GameState, id: string, amount: number): GameState {
  if (!ingredientById(id)) return state;
  return {
    ...state,
    inventory: {
      ...state.inventory,
      ingredients: { ...state.inventory.ingredients, [id]: (state.inventory.ingredients[id] ?? 0) + amount },
    },
  };
}

export function addSeed(state: GameState, plantId: string, amount: number): GameState {
  if (!plantMap[plantId] || amount <= 0) return state;
  const id = `seed:${plantId}`;
  return {
    ...state,
    inventory: {
      ...state.inventory,
      ingredients: { ...state.inventory.ingredients, [id]: (state.inventory.ingredients[id] ?? 0) + amount },
    },
  };
}

export function addCurrency(state: GameState, id: CurrencyId, amount: number): GameState {
  return {
    ...state,
    inventory: {
      ...state.inventory,
      currencies: { ...state.inventory.currencies, [id]: Math.max(0, state.inventory.currencies[id] + amount) },
    },
  };
}

export type PurchaseResult = { ok: true; state: GameState } | { ok: false; reason: string };

/** Prices are always visible, purchases are atomic, and nothing is random. */
export function buyItem(state: GameState, itemId: string): PurchaseResult {
  const item = itemMap[itemId];
  if (!item) return { ok: false, reason: "That item is unavailable right now." };
  if (state.inventory.items.includes(itemId)) return { ok: false, reason: "You already own this." };
  const balance = state.inventory.currencies[item.currency];
  if (balance < item.price) return { ok: false, reason: "You need more to buy this." };
  return {
    ok: true,
    state: {
      ...state,
      inventory: {
        ...state.inventory,
        items: [...state.inventory.items, itemId],
        currencies: { ...state.inventory.currencies, [item.currency]: balance - item.price },
      },
    },
  };
}

export function buySeeds(state: GameState, plantId: string, price: number): PurchaseResult {
  if (state.inventory.currencies.dewdrops < price) {
    return { ok: false, reason: "You need more dewdrops." };
  }
  return {
    ok: true,
    state: {
      ...state,
      inventory: {
        ...state.inventory,
        ingredients: { ...state.inventory.ingredients, [`seed:${plantId}`]: (state.inventory.ingredients[`seed:${plantId}`] ?? 0) + 1 },
        currencies: { ...state.inventory.currencies, dewdrops: state.inventory.currencies.dewdrops - price },
      },
    },
  };
}

/** Applies a reward list in one pass so a partial payout is impossible. */
export function grant(state: GameState, rewards: Reward[]): GameState {
  let next = state;
  for (const reward of rewards) {
    if (reward.kind === "ingredient") next = addIngredient(next, reward.id, reward.amount);
    else if (reward.kind === "seed") next = addSeed(next, reward.id, reward.amount);
    else if (reward.kind === "currency") next = addCurrency(next, reward.id, reward.amount);
    else if (reward.kind === "item" && !next.inventory.items.includes(reward.id)) {
      next = { ...next, inventory: { ...next.inventory, items: [...next.inventory.items, reward.id] } };
    } else if (reward.kind === "recipe" && !next.cooking.known.includes(reward.id)) {
      next = { ...next, cooking: { ...next.cooking, known: [...next.cooking.known, reward.id] } };
    }
  }
  return next;
}

export function ingredientCount(state: GameState, id: string): number {
  return state.inventory.ingredients[id] ?? 0;
}

export function ownsItem(state: GameState, id: string): boolean {
  return state.inventory.items.includes(id);
}
