import type {
  CareActionId, FeedbackSoundId, HiddenStatId, RoomActivityId, RoomId, StatId, VectorId,
} from "../types.ts";

export type RoomDefinition = {
  id: RoomId;
  name: string;
  note: string;
  defaultTheme: string;
  unlock: { stage: number; bond: number; careMoments: number };
};

/**
 * Rooms open through the relationship, never through payment. Requirements
 * are deliberately modest so each space arrives while it still feels new.
 */
export const roomDefinitions: RoomDefinition[] = [
  {
    id: "living-room",
    name: "Living Room",
    note: "The shared heart of Niumpi's home.",
    defaultTheme: "cozy",
    unlock: { stage: 0, bond: 0, careMoments: 0 },
  },
  {
    id: "bedroom",
    name: "Dreamy Bedroom",
    note: "A quiet place for resting, stories and the night sky.",
    defaultTheme: "moonlit",
    unlock: { stage: 1, bond: 14, careMoments: 6 },
  },
  {
    id: "play-nook",
    name: "Play Nook",
    note: "A soft, lively corner for music and movement.",
    defaultTheme: "greenhouse",
    unlock: { stage: 1, bond: 20, careMoments: 14 },
  },
];

export const roomDefinitionMap: Record<RoomId, RoomDefinition> = Object.fromEntries(
  roomDefinitions.map((room) => [room.id, room]),
) as Record<RoomId, RoomDefinition>;

export type RoomActivityDefinition = {
  id: RoomActivityId;
  rooms: RoomId[];
  careAction: CareActionId;
  vectors: Partial<Record<VectorId, number>>;
  stats: Partial<Record<StatId | HiddenStatId, number>>;
  message: string;
  behavior: string;
  sound: FeedbackSoundId;
};

export const roomActivities: RoomActivityDefinition[] = [
  {
    id: "read", rooms: ["living-room", "bedroom"], careAction: "explore",
    vectors: { curious: 2, creative: 1 }, stats: { curiosity: 4, joy: 2 },
    message: "One more page. This one has a map inside.", behavior: "book", sound: "blip",
  },
  {
    id: "window", rooms: ["living-room", "bedroom"], careAction: "explore",
    vectors: { curious: 2, dream: 1 }, stats: { curiosity: 3, comfort: 1 },
    message: "The clouds are going somewhere. Can we go too?", behavior: "window", sound: "chime",
  },
  {
    id: "rest", rooms: ["bedroom"], careAction: "comfort",
    vectors: { calm: 3, loving: 1 }, stats: { energy: 5, comfort: 4, wellbeing: 2 },
    message: "Everything feels softer in here.", behavior: "sway", sound: "hold",
  },
  {
    id: "roll", rooms: ["play-nook"], careAction: "dance",
    vectors: { playful: 3 }, stats: { joy: 5, energy: -2 },
    message: "Again! The floor moved first.", behavior: "roll", sound: "tap",
  },
  {
    id: "dance", rooms: ["living-room", "play-nook"], careAction: "dance",
    vectors: { playful: 3, social: 1 }, stats: { joy: 5, energy: -3 },
    message: "This is our part of the song!", behavior: "dancing", sound: "tap",
  },
  {
    id: "sing", rooms: ["living-room", "play-nook"], careAction: "sing",
    vectors: { creative: 3, social: 1 }, stats: { joy: 4, comfort: 2 },
    message: "Nium nium… now you sing the next bit.", behavior: "singing", sound: "chime",
  },
];

export const roomActivityMap: Record<RoomActivityId, RoomActivityDefinition> = Object.fromEntries(
  roomActivities.map((activity) => [activity.id, activity]),
) as Record<RoomActivityId, RoomActivityDefinition>;
