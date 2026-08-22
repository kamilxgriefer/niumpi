import type { DayPart, WeatherId } from "../types.ts";

export type WeatherDef = {
  id: WeatherId;
  name: string;
  note: string;
  art: string;
  /** Relative chance of showing up on a fresh day. */
  chance: number;
  /** Trait signal a day of this weather feeds. */
  signal: string | null;
  joy: number;
};

export const weathers: WeatherDef[] = [
  { id: "sunny", name: "Sunny", note: "Bright and easy", art: "sunny", chance: 34, signal: null, joy: 2 },
  { id: "cloudy", name: "Cloudy", note: "Soft, grey, thoughtful", art: "cloudy", chance: 26, signal: null, joy: 0 },
  { id: "rainy", name: "Rainy", note: "Steady on the window", art: "rainy", chance: 24, signal: "rain", joy: 1 },
  { id: "storm", name: "Storm", note: "Loud and exciting", art: "storm", chance: 11, signal: "rain", joy: 1 },
  { id: "starfall", name: "Starfall", note: "Rare — something is falling", art: "starfall", chance: 5, signal: "stars", joy: 4 },
];

export const weatherMap: Record<WeatherId, WeatherDef> = Object.fromEntries(
  weathers.map((w) => [w.id, w]),
) as Record<WeatherId, WeatherDef>;

/** Day parts drive the room lighting and which dialogue is eligible. */
export const dayParts: Array<{ id: DayPart; from: number; to: number; label: string }> = [
  { id: "morning", from: 5, to: 10, label: "Morning" },
  { id: "day", from: 10, to: 17, label: "Day" },
  { id: "sunset", from: 17, to: 21, label: "Sunset" },
  { id: "night", from: 21, to: 5, label: "Night" },
];

export function dayPartFor(hour: number): DayPart {
  if (hour >= 5 && hour < 10) return "morning";
  if (hour >= 10 && hour < 17) return "day";
  if (hour >= 17 && hour < 21) return "sunset";
  return "night";
}
