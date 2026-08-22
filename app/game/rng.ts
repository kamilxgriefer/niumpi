/**
 * Deterministic RNG. Every roll takes an explicit seed so offline progression,
 * dreams and expeditions replay identically no matter when they are claimed.
 */
export function hashSeed(...parts: Array<string | number>): number {
  let hash = 2166136261;
  const text = parts.join("|");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function makeRng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

export function pick<T>(list: readonly T[], roll: number): T {
  return list[Math.floor(roll * list.length) % list.length];
}

export function pickWeighted<T>(list: readonly T[], weight: (item: T) => number, roll: number): T {
  const total = list.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
  if (total <= 0) return list[0];
  let cursor = roll * total;
  for (const item of list) {
    cursor -= Math.max(0, weight(item));
    if (cursor <= 0) return item;
  }
  return list[list.length - 1];
}
