import { DAILY_MISSION_COUNT, WEEKLY_TARGET, missionMap, missionTemplates, weeklyReward } from "./config/missions.ts";
import type { CareActionId, GameState, Reward } from "./types.ts";
import { dayKeyFor, weekKeyFor } from "./time.ts";
import { hashSeed, makeRng } from "./rng.ts";
import { grant } from "./inventory.ts";
import { alreadyClaimed, markClaimed } from "./persistence.ts";

/**
 * Missions reroll on the local calendar day. Missing yesterday costs nothing —
 * there is no streak to break and no penalty for a gap.
 */
export function rollMissions(state: GameState, now: number, unlocked: (id: string) => boolean): GameState {
  const dayKey = dayKeyFor(now);
  const weekKey = weekKeyFor(now);
  const weekly = state.missions.weekly.weekKey === weekKey
    ? state.missions.weekly
    : { weekKey, days: [], claimed: false };

  if (state.missions.dayKey === dayKey) {
    return state.missions.weekly.weekKey === weekKey ? state : { ...state, missions: { ...state.missions, weekly } };
  }

  const available = missionTemplates.filter((mission) => !mission.needs || unlocked(mission.needs));
  const rng = makeRng(hashSeed(state.profile.id, dayKey, "missions"));
  const pool = [...available];
  const daily: GameState["missions"]["daily"] = [];
  while (daily.length < Math.min(DAILY_MISSION_COUNT, pool.length)) {
    const index = Math.floor(rng() * pool.length);
    const [chosen] = pool.splice(index, 1);
    daily.push({ id: chosen.id, progress: 0, claimed: false });
  }
  return { ...state, missions: { dayKey, daily, weekly } };
}

export function progressMissions(state: GameState, action: CareActionId, now: number): GameState {
  const dayKey = dayKeyFor(now);
  if (state.missions.dayKey !== dayKey) return state;
  let touched = false;
  const daily = state.missions.daily.map((entry) => {
    const template = missionMap[entry.id];
    if (!template || entry.claimed || !template.actions.includes(action)) return entry;
    if (entry.progress >= template.target) return entry;
    touched = true;
    return { ...entry, progress: entry.progress + 1 };
  });
  if (!touched) return state;

  const weekly = state.missions.weekly.days.includes(dayKey)
    ? state.missions.weekly
    : { ...state.missions.weekly, days: [...state.missions.weekly.days, dayKey] };
  return { ...state, missions: { ...state.missions, daily, weekly } };
}

export type ClaimResult = { state: GameState; rewards: Reward[] };

export function claimMission(state: GameState, id: string, now: number): ClaimResult {
  const template = missionMap[id];
  const entry = state.missions.daily.find((mission) => mission.id === id);
  const key = `mission:${state.missions.dayKey}:${id}`;
  if (!template || !entry || entry.claimed || entry.progress < template.target) return { state, rewards: [] };
  if (alreadyClaimed(state, key)) return { state, rewards: [] };
  const daily = state.missions.daily.map((mission) => (mission.id === id ? { ...mission, claimed: true } : mission));
  const paid = grant({ ...state, missions: { ...state.missions, daily } }, template.reward);
  return { state: markClaimed(paid, key, now), rewards: template.reward };
}

export function canClaimWeekly(state: GameState): boolean {
  return state.missions.weekly.days.length >= WEEKLY_TARGET && !state.missions.weekly.claimed;
}

export function claimWeekly(state: GameState, now: number): ClaimResult {
  const key = `weekly:${state.missions.weekly.weekKey}`;
  if (!canClaimWeekly(state) || alreadyClaimed(state, key)) return { state, rewards: [] };
  const paid = grant(
    { ...state, missions: { ...state.missions, weekly: { ...state.missions.weekly, claimed: true } } },
    weeklyReward,
  );
  return { state: markClaimed(paid, key, now), rewards: weeklyReward };
}

export { WEEKLY_TARGET };
