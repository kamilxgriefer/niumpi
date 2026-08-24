import {
  DAILY_MISSION_COUNT, WEEKLY_MISSION_COUNT, WEEKLY_TARGET, achievementMap,
  missionMap, missionTemplates, weeklyMissionMap, weeklyMissionTemplates, weeklyReward,
  type AchievementTemplate,
} from "./config/missions.ts";
import type { CareActionId, GameState, MissionProgress, Reward } from "./types.ts";
import { dayKeyFor, weekKeyFor } from "./time.ts";
import { hashSeed, makeRng } from "./rng.ts";
import { grant } from "./inventory.ts";
import { alreadyClaimed, markClaimed } from "./persistence.ts";

type GoalEntry = MissionProgress["daily"][number];

function chooseGoals(
  templates: typeof missionTemplates,
  count: number,
  seed: number,
): GoalEntry[] {
  const rng = makeRng(seed);
  const pool = [...templates];
  const chosen: GoalEntry[] = [];
  while (chosen.length < Math.min(count, pool.length)) {
    const usedCategories = new Set(chosen.map((entry) => templates.find((item) => item.id === entry.id)?.category));
    const varied = pool.filter((item) => !usedCategories.has(item.category));
    const source = varied.length ? varied : pool;
    const pick = source[Math.floor(rng() * source.length)];
    pool.splice(pool.findIndex((item) => item.id === pick.id), 1);
    chosen.push({ id: pick.id, progress: 0, claimed: false });
  }
  return chosen;
}

/** Goals reroll on local calendar boundaries; missing time never breaks a streak. */
export function rollMissions(state: GameState, now: number, unlocked: (id: string) => boolean): GameState {
  const dayKey = dayKeyFor(now);
  const weekKey = weekKeyFor(now);
  const weekly = state.missions.weekly.weekKey === weekKey && state.missions.weekly.entries.length > 0
    ? state.missions.weekly
    : {
      weekKey, days: [], claimed: false,
      entries: chooseGoals(
        weeklyMissionTemplates.filter((mission) => !mission.needs || unlocked(mission.needs)),
        WEEKLY_MISSION_COUNT,
        hashSeed(state.profile.id, weekKey, "weekly-goals"),
      ),
    };

  if (state.missions.dayKey === dayKey) {
    return weekly === state.missions.weekly ? state : { ...state, missions: { ...state.missions, weekly } };
  }

  const available = missionTemplates.filter((mission) => !mission.needs || unlocked(mission.needs));
  const daily = chooseGoals(available, DAILY_MISSION_COUNT, hashSeed(state.profile.id, dayKey, "missions"));
  return { ...state, missions: { ...state.missions, dayKey, daily, weekly } };
}

function advance(entries: GoalEntry[], action: CareActionId, templates: Record<string, { actions: CareActionId[]; target: number }>) {
  let completed = false;
  const next = entries.map((entry) => {
    const template = templates[entry.id];
    if (!template || entry.claimed || !template.actions.includes(action) || entry.progress >= template.target) return entry;
    const progress = entry.progress + 1;
    if (progress >= template.target) completed = true;
    return { ...entry, progress };
  });
  return { entries: next, completed };
}

export function progressMissions(state: GameState, action: CareActionId, now: number): GameState {
  const lifetimeActions = {
    ...state.missions.lifetimeActions,
    [action]: (state.missions.lifetimeActions[action] ?? 0) + 1,
  };
  const dayKey = dayKeyFor(now);
  const weekKey = weekKeyFor(now);
  if (state.missions.dayKey !== dayKey) {
    return { ...state, missions: { ...state.missions, lifetimeActions } };
  }

  const daily = advance(state.missions.daily, action, missionMap);
  const weekly = state.missions.weekly.weekKey === weekKey
    ? advance(state.missions.weekly.entries, action, weeklyMissionMap)
    : { entries: state.missions.weekly.entries, completed: false };
  const meaningfulDay = daily.completed && !state.missions.weekly.days.includes(dayKey);
  return {
    ...state,
    missions: {
      ...state.missions,
      lifetimeActions,
      daily: daily.entries,
      weekly: {
        ...state.missions.weekly,
        entries: weekly.entries,
        days: meaningfulDay ? [...state.missions.weekly.days, dayKey] : state.missions.weekly.days,
      },
    },
  };
}

export type ClaimResult = { state: GameState; rewards: Reward[] };

export function claimMission(state: GameState, id: string, now: number): ClaimResult {
  const template = missionMap[id];
  const entry = state.missions.daily.find((mission) => mission.id === id);
  const key = `mission:${state.missions.dayKey}:${id}`;
  if (!template || !entry || entry.claimed || entry.progress < template.target || alreadyClaimed(state, key)) return { state, rewards: [] };
  const daily = state.missions.daily.map((mission) => mission.id === id ? { ...mission, claimed: true } : mission);
  const paid = grant({ ...state, missions: { ...state.missions, daily } }, template.reward);
  return { state: markClaimed(paid, key, now), rewards: template.reward };
}

export function claimWeeklyMission(state: GameState, id: string, now: number): ClaimResult {
  const template = weeklyMissionMap[id];
  const entry = state.missions.weekly.entries.find((mission) => mission.id === id);
  const key = `weekly-goal:${state.missions.weekly.weekKey}:${id}`;
  if (!template || !entry || entry.claimed || entry.progress < template.target || alreadyClaimed(state, key)) return { state, rewards: [] };
  const entries = state.missions.weekly.entries.map((mission) => mission.id === id ? { ...mission, claimed: true } : mission);
  const paid = grant({ ...state, missions: { ...state.missions, weekly: { ...state.missions.weekly, entries } } }, template.reward);
  return { state: markClaimed(paid, key, now), rewards: template.reward };
}

export function achievementProgress(state: GameState, template: AchievementTemplate): number {
  const metric = template.metric;
  if (metric.kind === "action") return metric.actions.reduce((sum, action) => sum + (state.missions.lifetimeActions[action] ?? 0), 0);
  if (metric.kind === "care") return state.niumpi.careMoments;
  if (metric.kind === "bond") return Math.round(state.niumpi.bond);
  if (metric.kind === "stage") return state.niumpi.stage;
  if (metric.kind === "memories") return state.memories.length;
  if (metric.kind === "traits") return Object.keys(state.personality.traits).length;
  if (metric.kind === "items") return state.inventory.items.length;
  if (metric.kind === "roomDrops") return state.roomLoot.opened;
  if (metric.kind === "gamePlays") return Object.values(state.minigames).reduce((sum, game) => sum + game.plays, 0);
  return 0;
}

export function claimAchievement(state: GameState, id: string, now: number): ClaimResult {
  const template = achievementMap[id];
  const key = `achievement:${id}`;
  if (!template || state.missions.achievements.claimed.includes(id)
    || achievementProgress(state, template) < template.target || alreadyClaimed(state, key)) return { state, rewards: [] };
  const claimed = [...state.missions.achievements.claimed, id];
  const paid = grant({ ...state, missions: { ...state.missions, achievements: { claimed } } }, template.reward);
  return { state: markClaimed(paid, key, now), rewards: template.reward };
}

export function canClaimWeekly(state: GameState): boolean {
  return state.missions.weekly.days.length >= WEEKLY_TARGET && !state.missions.weekly.claimed;
}

export function claimWeekly(state: GameState, now: number): ClaimResult {
  const key = `weekly:${state.missions.weekly.weekKey}`;
  if (!canClaimWeekly(state) || alreadyClaimed(state, key)) return { state, rewards: [] };
  const paid = grant({ ...state, missions: { ...state.missions, weekly: { ...state.missions.weekly, claimed: true } } }, weeklyReward);
  return { state: markClaimed(paid, key, now), rewards: weeklyReward };
}

export { WEEKLY_TARGET };
