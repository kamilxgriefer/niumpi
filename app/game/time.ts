import { DAY_MS } from "./config/stages.ts";
import { dayPartFor, weatherMap, weathers } from "./config/weather.ts";
import type { DayPart, WeatherId } from "./types.ts";
import { hashSeed, makeRng, pickWeighted } from "./rng.ts";

export { DAY_MS, dayPartFor };

/**
 * Dev-only time multiplier. Production always runs at 1× — the flag is read
 * from the URL and never persists, so a shipped build cannot be sped up.
 */
let timeMultiplier = 1;

export function setTimeMultiplier(value: number) {
  timeMultiplier = Math.max(1, Math.min(20_000, value));
}

export function getTimeMultiplier() {
  return timeMultiplier;
}

/** Real elapsed milliseconds, scaled by the dev multiplier. */
export function scaled(ms: number): number {
  return ms * timeMultiplier;
}

export function dayKeyFor(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function weekKeyFor(at: number): string {
  const date = new Date(at);
  const start = new Date(date.getFullYear(), 0, 1).getTime();
  const week = Math.floor((date.getTime() - start) / (7 * DAY_MS));
  return `${date.getFullYear()}-w${week}`;
}

export function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function calendarDaysBetween(from: number, to: number): number {
  return Math.max(0, Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS));
}

export function dayPartAt(at: number): DayPart {
  return dayPartFor(new Date(at).getHours());
}

/**
 * Weather is generated inside the game world, never from the player's real
 * location. The same day key always yields the same weather for one save.
 */
export function weatherFor(profileId: string, at: number): WeatherId {
  const rng = makeRng(hashSeed(profileId, dayKeyFor(at), "weather"));
  return pickWeighted(weathers, (w) => w.chance, rng()).id;
}

export function weatherLabel(id: WeatherId) {
  return weatherMap[id];
}

/** "in 12 minutes" / "ready" — used by dreams, expeditions and plants. */
export function countdownLabel(completesAt: number, now: number): string {
  const left = completesAt - now;
  if (left <= 0) return "ready";
  const minutes = Math.ceil(left / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
