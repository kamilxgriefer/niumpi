import type { CareStats, GameState, HiddenStatId, StatId } from "./types.ts";
import { DAY_MS, dayKeyFor, weatherFor } from "./time.ts";

export const STAT_MIN = 0;
export const STAT_MAX = 100;
/** A need never falls below this, so nobody ever comes back to a crisis. */
export const STAT_FLOOR = 18;
/** Below this the UI names the state in words as well as colour. */
export const LOW_STAT = 38;

/** Per real hour, awake. Sleep changes these, it never zeroes hunger. */
export const decayPerHour: Record<StatId, number> = {
  fullness: 2.6,
  energy: 1.4,
  joy: 1.1,
};

export const sleepPerHour: Record<StatId, number> = {
  fullness: -1.1,
  energy: 11,
  joy: 0.4,
};

export function clampStat(value: number, floor = STAT_FLOOR): number {
  if (!Number.isFinite(value)) return floor;
  return Math.max(floor, Math.min(STAT_MAX, value));
}

export function applyStat(stats: CareStats, id: StatId | HiddenStatId, delta: number): CareStats {
  const floor = id === "fullness" || id === "energy" || id === "joy" ? STAT_FLOOR : STAT_MIN;
  return { ...stats, [id]: Math.max(floor, Math.min(STAT_MAX, stats[id] + delta)) };
}

export type OfflineReport = {
  hours: number;
  days: number;
  /** True once the gap is long enough to earn the warm reunion scene. */
  longAbsence: boolean;
  weatherChanged: boolean;
  statsBefore: CareStats;
};

/**
 * Advances every time-based system from timestamps, never from a timer that
 * only runs while the tab is open. Called once on load and again on wake.
 */
export function applyElapsed(state: GameState, now: number): { state: GameState; report: OfflineReport } {
  const last = state.profile.lastSeenAt || now;
  const elapsedMs = Math.max(0, now - last);
  const hours = elapsedMs / 3_600_000;
  const days = Math.floor(elapsedMs / DAY_MS);
  const statsBefore = { ...state.stats };

  // Long gaps stop counting after two days so nobody is punished for a holiday.
  const chargedHours = Math.min(hours, 48);
  const rates = state.niumpi.sleeping ? sleepPerHour : decayPerHour;
  const stats: CareStats = {
    ...state.stats,
    fullness: clampStat(state.stats.fullness - rates.fullness * chargedHours),
    energy: clampStat(state.stats.energy + (state.niumpi.sleeping ? rates.energy : -rates.energy) * chargedHours),
    joy: clampStat(state.stats.joy - (state.niumpi.sleeping ? -rates.joy : rates.joy) * chargedHours * 0.8),
  };
  // Sleeping tops energy right up rather than creeping toward it.
  if (state.niumpi.sleeping) stats.energy = clampStat(Math.min(STAT_MAX, state.stats.energy + sleepPerHour.energy * chargedHours));

  const nextWeather = weatherFor(state.profile.id, now);
  const weatherChanged = nextWeather !== state.weather.key;
  const dayKey = dayKeyFor(now);

  return {
    state: {
      ...state,
      stats,
      weather: weatherChanged ? { key: nextWeather, since: now } : state.weather,
      counters: dayKey === state.counters.dayKey
        ? state.counters
        : { dayKey, actions: {}, variety: [] },
      profile: { ...state.profile, lastSeenAt: now },
    },
    report: { hours, days, longAbsence: hours >= 40, weatherChanged, statsBefore },
  };
}

/** The small in-session drift, so a watched screen still feels alive. */
export function tick(state: GameState, seconds: number): GameState {
  const hours = seconds / 3600;
  const rates = state.niumpi.sleeping ? sleepPerHour : decayPerHour;
  return {
    ...state,
    stats: {
      ...state.stats,
      fullness: clampStat(state.stats.fullness - rates.fullness * hours),
      energy: clampStat(state.niumpi.sleeping
        ? Math.min(STAT_MAX, state.stats.energy + rates.energy * hours)
        : state.stats.energy - rates.energy * hours),
      joy: clampStat(state.niumpi.sleeping ? state.stats.joy : state.stats.joy - rates.joy * hours),
    },
  };
}

export function isLow(value: number): boolean {
  return value < LOW_STAT;
}

/** Average of the three visible needs — drives the wellbeing look. */
export function wellbeing(stats: CareStats): number {
  return Math.round((stats.fullness + stats.energy + stats.joy) / 3);
}
