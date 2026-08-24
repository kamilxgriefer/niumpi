import { roomDefinitionMap, roomDefinitions } from "./config/rooms.ts";
import type { GameState, PlacedItem, RoomId, RoomLayout, RoomSpace } from "./types.ts";

export const ROOM_IDS = roomDefinitions.map((room) => room.id);

export type RoomUnlockRequirement = {
  id: "stage" | "bond" | "careMoments";
  label: string;
  current: number;
  target: number;
  complete: boolean;
};

export type RoomUnlockProgress = {
  open: boolean;
  percent: number;
  note: string;
  requirements: RoomUnlockRequirement[];
};

export type RoomFamiliarity = {
  level: number;
  points: number;
  percent: number;
  nextAt: number | null;
};

const familiaritySteps = [0, 4, 12, 28, 55];

function copyPlaced(placed: PlacedItem[]): PlacedItem[] {
  return placed.map((item) => ({ ...item }));
}

function emptySpace(id: RoomId, now: number): RoomSpace {
  const definition = roomDefinitionMap[id];
  return {
    id,
    theme: definition.defaultTheme,
    placed: [],
    unlockedAt: id === "living-room" ? now : null,
    visits: 0,
    lastVisitedAt: null,
    interactions: {},
  };
}

/** Creates the canonical shape while keeping the original starter room. */
export function createRoomLayout(now: number, placed: PlacedItem[], theme = "cozy"): RoomLayout {
  const rooms = Object.fromEntries(
    ROOM_IDS.map((id) => [id, emptySpace(id, now)]),
  ) as Record<RoomId, RoomSpace>;
  rooms["living-room"] = { ...rooms["living-room"], theme, placed: copyPlaced(placed) };
  return {
    activeRoomId: "living-room",
    rooms,
    theme,
    placed: copyPlaced(placed),
  };
}

function validPlaced(value: unknown, fallback: PlacedItem[]): PlacedItem[] {
  if (!Array.isArray(value)) return copyPlaced(fallback);
  return value
    .filter((entry): entry is PlacedItem => Boolean(
      entry && typeof entry === "object"
      && typeof (entry as PlacedItem).uid === "string"
      && typeof (entry as PlacedItem).itemId === "string",
    ))
    .map((entry) => ({
      ...entry,
      x: Number.isFinite(entry.x) ? entry.x : 0,
      y: Number.isFinite(entry.y) ? entry.y : 0,
      flipped: Boolean(entry.flipped),
      layer: Number.isFinite(entry.layer) ? entry.layer : 0,
    }));
}

function validCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function reconcileSpace(saved: Partial<RoomSpace> | undefined, fallback: RoomSpace): RoomSpace {
  const interactions = saved?.interactions && typeof saved.interactions === "object"
    ? Object.fromEntries(Object.entries(saved.interactions).map(([id, count]) => [id, validCount(count)]))
    : {};
  return {
    id: fallback.id,
    theme: typeof saved?.theme === "string" && saved.theme ? saved.theme : fallback.theme,
    placed: validPlaced(saved?.placed, fallback.placed),
    unlockedAt: typeof saved?.unlockedAt === "number" && Number.isFinite(saved.unlockedAt)
      ? saved.unlockedAt
      : fallback.unlockedAt,
    visits: validCount(saved?.visits),
    lastVisitedAt: typeof saved?.lastVisitedAt === "number" && Number.isFinite(saved.lastVisitedAt)
      ? saved.lastVisitedAt
      : null,
    interactions,
  };
}

/** Inventory currently owns one copy of each room item. When a partial or
 * hand-edited save contains duplicates, the earliest room keeps the object. */
function removeCrossRoomDuplicates(rooms: Record<RoomId, RoomSpace>) {
  const claimed = new Set<string>();
  for (const id of ROOM_IDS) {
    rooms[id] = {
      ...rooms[id],
      placed: rooms[id].placed.filter((item) => {
        if (claimed.has(item.itemId)) return false;
        claimed.add(item.itemId);
        return true;
      }),
    };
  }
}

/**
 * Migrates both the old single-room save and partially-written newer saves.
 * The compatibility mirror is always rebuilt from the selected canonical room.
 */
export function reconcileRoomLayout(
  saved: Partial<RoomLayout> | undefined,
  fallback: RoomLayout,
): RoomLayout {
  const hasRooms = Boolean(saved?.rooms && typeof saved.rooms === "object");
  const rooms = Object.fromEntries(ROOM_IDS.map((id) => {
    const fallbackSpace = fallback.rooms[id];
    const savedSpace = hasRooms ? saved?.rooms?.[id] : undefined;
    return [id, reconcileSpace(savedSpace, fallbackSpace)];
  })) as Record<RoomId, RoomSpace>;

  // In a v5 single-room save, the legacy fields are the living room itself.
  if (!hasRooms) {
    rooms["living-room"] = {
      ...rooms["living-room"],
      theme: typeof saved?.theme === "string" && saved.theme ? saved.theme : rooms["living-room"].theme,
      placed: validPlaced(saved?.placed, rooms["living-room"].placed),
    };
  }
  removeCrossRoomDuplicates(rooms);

  const requested = saved?.activeRoomId;
  const activeRoomId = ROOM_IDS.includes(requested as RoomId) && rooms[requested as RoomId].unlockedAt !== null
    ? requested as RoomId
    : "living-room";
  const active = rooms[activeRoomId];
  return {
    activeRoomId,
    rooms,
    theme: active.theme,
    placed: copyPlaced(active.placed),
  };
}

export function roomUnlockProgress(state: GameState, id: RoomId): RoomUnlockProgress {
  const space = state.room.rooms[id];
  const target = roomDefinitionMap[id].unlock;
  const requirements: RoomUnlockRequirement[] = [
    { id: "stage", label: "Grow together", current: state.niumpi.stage, target: target.stage, complete: state.niumpi.stage >= target.stage },
    { id: "bond", label: "Build your bond", current: state.niumpi.bond, target: target.bond, complete: state.niumpi.bond >= target.bond },
    { id: "careMoments", label: "Share care moments", current: state.niumpi.careMoments, target: target.careMoments, complete: state.niumpi.careMoments >= target.careMoments },
  ];
  const earned = requirements.every((requirement) => requirement.complete);
  const open = space.unlockedAt !== null || earned;
  const ratios = requirements
    .filter((requirement) => requirement.target > 0)
    .map((requirement) => Math.min(1, requirement.current / requirement.target));
  const percent = open ? 100 : Math.floor((ratios.length ? Math.min(...ratios) : 1) * 100);
  const next = requirements.find((requirement) => !requirement.complete);
  return {
    open,
    percent,
    note: next ? `${next.label}: ${Math.min(next.current, next.target)}/${next.target}` : "Ready",
    requirements,
  };
}

/** Permanently records rooms whose relationship requirements were met. */
export function settleRoomUnlocks(state: GameState, now: number): GameState {
  let changed = false;
  const rooms = { ...state.room.rooms };
  for (const id of ROOM_IDS) {
    if (rooms[id].unlockedAt !== null || !roomUnlockProgress(state, id).open) continue;
    rooms[id] = { ...rooms[id], unlockedAt: now };
    changed = true;
  }
  if (!changed) return state;
  return { ...state, room: { ...state.room, rooms } };
}

export function newlyUnlockedRooms(before: GameState, after: GameState): RoomId[] {
  return ROOM_IDS.filter(
    (id) => before.room.rooms[id].unlockedAt === null && after.room.rooms[id].unlockedAt !== null,
  );
}

export type RoomSwitchResult = { state: GameState; changed: boolean; reason?: string };

/** Switches the active room atomically and refreshes the compatibility mirror. */
export function activateRoom(state: GameState, id: RoomId, now: number): RoomSwitchResult {
  const settled = settleRoomUnlocks(state, now);
  const progress = roomUnlockProgress(settled, id);
  if (!progress.open || settled.room.rooms[id].unlockedAt === null) {
    return { state, changed: false, reason: progress.note };
  }
  if (settled.room.activeRoomId === id) return { state: settled, changed: false };
  const target = settled.room.rooms[id];
  const visited: RoomSpace = {
    ...target,
    visits: target.visits + 1,
    lastVisitedAt: now,
  };
  return {
    changed: true,
    state: {
      ...settled,
      room: {
        ...settled.room,
        activeRoomId: id,
        rooms: { ...settled.room.rooms, [id]: visited },
        theme: visited.theme,
        placed: copyPlaced(visited.placed),
      },
    },
  };
}

/** Updates only the active room; layouts in every other space remain intact. */
export function saveActiveRoomLayout(
  state: GameState,
  placed: PlacedItem[],
  theme: string,
): GameState {
  const id = state.room.activeRoomId;
  const claimedElsewhere = new Set(
    ROOM_IDS
      .filter((roomId) => roomId !== id)
      .flatMap((roomId) => state.room.rooms[roomId].placed.map((item) => item.itemId)),
  );
  const seen = new Set<string>();
  const uniquePlaced = placed.filter((item) => {
    if (claimedElsewhere.has(item.itemId) || seen.has(item.itemId)) return false;
    seen.add(item.itemId);
    return true;
  });
  const active = { ...state.room.rooms[id], placed: copyPlaced(uniquePlaced), theme };
  return {
    ...state,
    room: {
      ...state.room,
      rooms: { ...state.room.rooms, [id]: active },
      theme,
      placed: copyPlaced(uniquePlaced),
    },
  };
}

/** Records meaningful use without coupling the model to any animation layer. */
export function recordRoomInteraction(state: GameState, interactionId: string, now: number): GameState {
  const id = state.room.activeRoomId;
  const active = state.room.rooms[id];
  const interactions = {
    ...active.interactions,
    [interactionId]: (active.interactions[interactionId] ?? 0) + 1,
  };
  return {
    ...state,
    room: {
      ...state.room,
      rooms: {
        ...state.room.rooms,
        [id]: { ...active, interactions, lastVisitedAt: now },
      },
    },
  };
}

export function roomFamiliarity(space: RoomSpace): RoomFamiliarity {
  const points = space.visits + Object.values(space.interactions).reduce((sum, count) => sum + count, 0);
  const level = Math.min(familiaritySteps.length, familiaritySteps.filter((step) => points >= step).length);
  const start = familiaritySteps[level - 1] ?? 0;
  const nextAt = familiaritySteps[level] ?? null;
  const percent = nextAt === null ? 100 : Math.floor(((points - start) / (nextAt - start)) * 100);
  return { level, points, percent: Math.max(0, Math.min(100, percent)), nextAt };
}
