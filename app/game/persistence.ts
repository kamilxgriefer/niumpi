import type { GameState } from "./types.ts";
import { LEGACY_KEYS, SAVE_VERSION, STORAGE_KEY, createGameState, makeId, migrateLegacy, reconcile } from "./state.ts";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type PersistenceAdapter = {
  load(): Promise<GameState | null>;
  save(state: GameState): Promise<void>;
  clear(): Promise<void>;
};

/**
 * The only adapter today. A cloud adapter can be added behind this same shape
 * without touching a single component — the shell only ever sees the interface.
 */
export function localAdapter(): PersistenceAdapter {
  return {
    async load() {
      if (typeof window === "undefined") return null;
      const now = Date.now();
      const current = window.localStorage.getItem(STORAGE_KEY);
      if (current) {
        const parsed = JSON.parse(current) as Partial<GameState>;
        if (typeof parsed.version === "number" && parsed.version > SAVE_VERSION) {
          // A newer build wrote this. Read what we understand, never destroy it.
          return reconcile(parsed, now);
        }
        return reconcile(parsed, now);
      }
      for (const key of LEGACY_KEYS) {
        const legacy = window.localStorage.getItem(key);
        if (!legacy) continue;
        const migrated = migrateLegacy(JSON.parse(legacy), now, makeId(now));
        // The old key stays put until the new save lands, so nothing is lost.
        return migrated;
      }
      return null;
    },
    async save(state) {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    },
    async clear() {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(STORAGE_KEY);
    },
  };
}

export async function loadGame(adapter: PersistenceAdapter, now: number): Promise<GameState> {
  try {
    const saved = await adapter.load();
    if (saved) return saved;
  } catch {
    // A corrupt save must never lock the player out — start fresh instead.
  }
  return createGameState(now, makeId(now));
}

/**
 * Every reward passes through here. The key is derived from what produced it,
 * so refreshing mid-claim can never pay the same reward twice.
 */
export function alreadyClaimed(state: GameState, key: string): boolean {
  return Boolean(state.claims[key]);
}

export function markClaimed(state: GameState, key: string, now: number): GameState {
  return { ...state, claims: { ...state.claims, [key]: now } };
}

/** Keeps the claim ledger from growing without bound over months of play. */
export const CLAIM_KEEP = 400;

export function pruneClaims(state: GameState): GameState {
  const entries = Object.entries(state.claims);
  if (entries.length <= CLAIM_KEEP) return state;
  const kept = entries.sort((a, b) => b[1] - a[1]).slice(0, CLAIM_KEEP);
  return { ...state, claims: Object.fromEntries(kept) };
}
