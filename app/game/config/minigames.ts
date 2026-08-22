import type { MinigameId, TalentId } from "../types.ts";

export type Difficulty = "gentle" | "normal" | "brisk";

export type MinigameDef = {
  id: MinigameId;
  name: string;
  note: string;
  art: string;
  talent: TalentId;
  /** Ingredient handed out on a decent run. */
  drop: string;
  howTo: string;
  keys: string;
  /** Seconds a round lasts at each difficulty. */
  seconds: Record<Difficulty, number>;
  /** Score needed for a full reward at each difficulty. */
  par: Record<Difficulty, number>;
};

export const minigames: MinigameDef[] = [
  { id: "dewdrop-dash", name: "Dewdrop Dash", note: "Catch the drops", art: "dash", talent: "agility", drop: "dewdrop",
    howTo: "Move Niumpi left and right to catch falling dewdrops. Avoid the grey stones.",
    keys: "Arrow keys or A/D — or drag anywhere on the field",
    seconds: { gentle: 45, normal: 40, brisk: 35 }, par: { gentle: 12, normal: 20, brisk: 28 } },
  { id: "moonberry-mix", name: "Moonberry Mix", note: "Memory game", art: "mix", talent: "cooking", drop: "moonberry",
    howTo: "Watch the order the berries light up, then repeat it. One extra step each round.",
    keys: "Click, tap, or keys 1–4",
    seconds: { gentle: 60, normal: 55, brisk: 45 }, par: { gentle: 4, normal: 6, brisk: 8 } },
  { id: "cloud-stack", name: "Cloud Stack", note: "Build the highest tower", art: "stack", talent: "gardening", drop: "cloudpuff",
    howTo: "Stop each cloud over the one below. Overhang is trimmed away.",
    keys: "Space, Enter, click or tap",
    seconds: { gentle: 60, normal: 50, brisk: 40 }, par: { gentle: 6, normal: 9, brisk: 12 } },
  { id: "leafbeat", name: "Leafbeat", note: "Rhythm time", art: "beat", talent: "music", drop: "auroraleaf",
    howTo: "Tap the leaf exactly when a note reaches the line.",
    keys: "Space, Enter, click or tap",
    seconds: { gentle: 45, normal: 45, brisk: 45 }, par: { gentle: 10, normal: 16, brisk: 22 } },
  { id: "hide-squeak", name: "Hide & Squeak", note: "Find Niumpi", art: "hide", talent: "exploration", drop: "gigglenut",
    howTo: "Niumpi hides behind the furniture. Warmer and colder is shown as a colour and said in words.",
    keys: "Tab between hiding spots, Enter to look",
    seconds: { gentle: 60, normal: 45, brisk: 35 }, par: { gentle: 3, normal: 5, brisk: 7 } },
  { id: "dream-path", name: "Dream Path", note: "Night adventure", art: "path", talent: "storytelling", drop: "dreammint",
    howTo: "Choose a way at each fork. Some paths hold something, some hold nothing.",
    keys: "Arrow keys or click a path",
    seconds: { gentle: 90, normal: 75, brisk: 60 }, par: { gentle: 4, normal: 6, brisk: 8 } },
];

export const minigameMap: Record<string, MinigameDef> = Object.fromEntries(
  minigames.map((g) => [g.id, g]),
);

export const difficulties: Array<{ id: Difficulty; label: string }> = [
  { id: "gentle", label: "Gentle" },
  { id: "normal", label: "Normal" },
  { id: "brisk", label: "Brisk" },
];

/** Rewards scale with score against par, capped so farming stays pointless. */
export const MINIGAME_DAILY_FULL_REWARDS = 3;
