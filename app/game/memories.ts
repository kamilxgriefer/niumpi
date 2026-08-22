import { memoryTemplateMap } from "./config/memories.ts";
import type { GameState, MemoryEntry, MemoryKind } from "./types.ts";
import { alreadyClaimed, markClaimed } from "./persistence.ts";

/** Milestones use their template id as the claim key, so they fire exactly once. */
export function awardMemory(state: GameState, templateId: string, now: number): { state: GameState; entry: MemoryEntry | null } {
  const template = memoryTemplateMap[templateId];
  if (!template) return { state, entry: null };
  const key = `memory:${templateId}`;
  if (alreadyClaimed(state, key)) return { state, entry: null };
  const entry: MemoryEntry = {
    id: `${templateId}-${now}`,
    kind: template.kind,
    title: template.title,
    body: template.body,
    quote: template.quote,
    art: template.art,
    createdAt: now,
    favorite: false,
  };
  return {
    state: markClaimed({ ...state, memories: [entry, ...state.memories] }, key, now),
    entry,
  };
}

/** Free-form memories (dreams, expeditions) that may legitimately repeat. */
export function addMemory(
  state: GameState,
  memory: { kind: MemoryKind; title: string; body: string; art: string; quote?: string; trait?: string },
  now: number,
  key?: string,
): { state: GameState; entry: MemoryEntry | null } {
  if (key && alreadyClaimed(state, key)) return { state, entry: null };
  const entry: MemoryEntry = { id: `${now}-${state.memories.length}`, createdAt: now, favorite: false, ...memory };
  const next = { ...state, memories: [entry, ...state.memories] };
  return { state: key ? markClaimed(next, key, now) : next, entry };
}

export function toggleFavorite(state: GameState, id: string): GameState {
  return {
    ...state,
    memories: state.memories.map((entry) => (entry.id === id ? { ...entry, favorite: !entry.favorite } : entry)),
  };
}

export function removeMemory(state: GameState, id: string): GameState {
  return { ...state, memories: state.memories.filter((entry) => entry.id !== id) };
}

export function filterMemories(state: GameState, filter: string): MemoryEntry[] {
  if (filter === "all") return state.memories;
  if (filter === "favorite") return state.memories.filter((entry) => entry.favorite);
  return state.memories.filter((entry) => entry.kind === filter);
}
