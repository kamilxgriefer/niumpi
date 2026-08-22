import type { FriendState, GameState, RouteId } from "./types.ts";
import { hashSeed, makeRng, pick } from "./rng.ts";

/**
 * There is no social backend yet. Rather than pretending local data is
 * multiplayer, this builds clearly-labelled neighbours from the local seed and
 * `SOCIAL_BACKEND` stays false until a real service exists behind the adapter.
 */
export const SOCIAL_BACKEND = false;

const names = ["Luna", "Pip", "Nora", "Bimbi", "Ollie", "Zuzu", "Mango", "Tinu"];
const routeIds: RouteId[] = ["moonveil", "bloomheart", "sparkleap", "mistwander"];
const statuses: FriendState["status"][] = ["online", "dreaming", "playing", "exploring", "away"];

export function ensureFriends(state: GameState, now: number): GameState {
  if (state.friends.length) return refreshStatuses(state, now);
  const rng = makeRng(hashSeed(state.profile.id, "friends"));
  const chosen = new Set<string>();
  const friends: FriendState[] = [];
  while (friends.length < 3) {
    const name = pick(names, rng());
    if (chosen.has(name)) continue;
    chosen.add(name);
    friends.push({
      id: `friend-${name.toLowerCase()}`,
      name: `${name}'s Niumpi`,
      route: pick(routeIds, rng()),
      status: pick(statuses, rng()),
      giftedAt: null,
      visitedAt: null,
    });
  }
  return { ...state, friends };
}

/** Statuses drift on a schedule derived from the hour, not from live data. */
function refreshStatuses(state: GameState, now: number): GameState {
  const hour = Math.floor(now / 3_600_000);
  return {
    ...state,
    friends: state.friends.map((friend, index) => ({
      ...friend,
      status: pick(statuses, makeRng(hashSeed(friend.id, hour, index))()),
    })),
  };
}

export const GIFT_COOLDOWN_MS = 20 * 3_600_000;

export function canGift(friend: FriendState, now: number): boolean {
  return !friend.giftedAt || now - friend.giftedAt > GIFT_COOLDOWN_MS;
}

export function sendGift(state: GameState, friendId: string, now: number): GameState | null {
  const friend = state.friends.find((entry) => entry.id === friendId);
  if (!friend || !canGift(friend, now)) return null;
  if (state.inventory.currencies.dewdrops < 5) return null;
  return {
    ...state,
    inventory: {
      ...state.inventory,
      currencies: { ...state.inventory.currencies, dewdrops: state.inventory.currencies.dewdrops - 5 },
    },
    friends: state.friends.map((entry) => (entry.id === friendId ? { ...entry, giftedAt: now } : entry)),
  };
}

export function markVisited(state: GameState, friendId: string, now: number): GameState {
  return {
    ...state,
    friends: state.friends.map((entry) => (entry.id === friendId ? { ...entry, visitedAt: now } : entry)),
  };
}
