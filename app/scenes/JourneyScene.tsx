"use client";

import { useState } from "react";
import { Art } from "../ui/Art";
import { Meter, Panel, TabBar } from "../ui/parts";
import { useGame } from "../ui/GameProvider";
import {
  achievementTemplates, missionMap, weeklyMissionMap, type GoalCategory, type MissionTemplate,
} from "../game/config/missions";
import {
  WEEKLY_TARGET, achievementProgress, canClaimWeekly, claimAchievement,
  claimMission, claimWeekly, claimWeeklyMission,
} from "../game/missions";
import type { Reward } from "../game/types";

const categoryArt: Record<GoalCategory, string> = {
  care: "heart", play: "game", world: "spark", create: "cook", bond: "niumpi", collection: "shop",
};

function rewardLabel(rewards: Reward[]) {
  return rewards.map((reward) => {
    if (reward.kind === "currency") return `${reward.amount} ${reward.id === "dewdrops" ? "dewdrops" : "stars"}`;
    if (reward.kind === "item") return "a room item";
    return reward.kind;
  }).join(" + ");
}

function GoalCard({ entry, template, cadence }: {
  entry: { id: string; progress: number; claimed: boolean };
  template: MissionTemplate;
  cadence: "daily" | "weekly";
}) {
  const { state, update, cue, showReward, clock } = useGame();
  const progress = Math.min(entry.progress, template.target);
  const done = progress >= template.target;
  return (
    <li className={`journey-goal goal-${template.category} ${done ? "is-ready" : ""} ${entry.claimed ? "is-claimed" : ""}`}>
      <span className="journey-goal-art"><Art name={categoryArt[template.category]} size={22} /></span>
      <div className="journey-goal-copy">
        <span className="journey-kicker">{template.category}</span>
        <strong>{template.label}</strong>
        <small>{template.note}</small>
      </div>
      <span className="journey-reward">{rewardLabel(template.reward)}</span>
      <Meter label={`${progress}/${template.target}`} value={progress} max={template.target} />
      {done && !entry.claimed && (
        <button className="journey-claim" type="button" onClick={() => {
          const result = cadence === "daily"
            ? claimMission(state, entry.id, clock())
            : claimWeeklyMission(state, entry.id, clock());
          if (!result.rewards.length) return;
          update(result.state); cue("reward"); showReward(template.label, result.rewards, `${cadence === "daily" ? "Daily" : "Weekly"} goal complete`);
        }}>Claim reward</button>
      )}
      {entry.claimed && <span className="journey-complete"><Art name="check" size={15} /> Complete</span>}
    </li>
  );
}

export function JourneyScene() {
  const { state, update, cue, showReward, clock } = useGame();
  const [filter, setFilter] = useState("next");
  const claimed = new Set(state.missions.achievements.claimed);
  const achievementView = (() => {
    if (filter !== "next") return achievementTemplates.filter((entry) => entry.category === filter);
    const byTrack = new Map<string, typeof achievementTemplates>();
    for (const achievement of achievementTemplates) {
      const trackId = achievement.id.replace(/-\d+$/, "");
      byTrack.set(trackId, [...(byTrack.get(trackId) ?? []), achievement]);
    }
    return [...byTrack.values()].map((track) => track.find((entry) => !claimed.has(entry.id)) ?? track[track.length - 1]);
  })();
  const totalClaimed = state.missions.achievements.claimed.length;
  const dailyDone = state.missions.daily.filter((entry) => {
    const template = missionMap[entry.id];
    return template && entry.progress >= template.target;
  }).length;
  const weeklyDone = state.missions.weekly.entries.filter((entry) => {
    const template = weeklyMissionMap[entry.id];
    return template && entry.progress >= template.target;
  }).length;
  const attendanceReady = canClaimWeekly(state);

  return (
    <div className="scene scene-journey">
      <header className="scene-head journey-head">
        <div className="scene-title-block">
          <span className="journey-eyebrow"><Art name="spark" size={16} /> A story with no finish line</span>
          <h1>Niumpi Journey</h1>
          <p>Small goals for today, bigger adventures for the week, and achievements that remember your whole story.</p>
        </div>
        <div className="journey-summary" aria-label="Journey progress">
          <span><strong>{dailyDone}/{state.missions.daily.length}</strong> today</span>
          <span><strong>{weeklyDone}/{state.missions.weekly.entries.length}</strong> this week</span>
          <span><strong>{totalClaimed}/{achievementTemplates.length}</strong> achievements</span>
        </div>
      </header>

      <section className="journey-intro" aria-label="How goals work">
        <div><Art name="sun" size={23} /><strong>Today</strong><span>5 varied moments</span></div>
        <div><Art name="spark" size={23} /><strong>This week</strong><span>3 longer adventures</span></div>
        <div><Art name="evolution" size={23} /><strong>Forever</strong><span>60 lasting achievements</span></div>
        <p>No streak anxiety. A missed day removes nothing and Niumpi never feels punished.</p>
      </section>

      <div className="journey-columns">
        <Panel title="Today's little moments" note="A balanced set chosen from everything you have unlocked" art="sun" className="journey-daily">
          <ul className="journey-goal-list">
            {state.missions.daily.map((entry) => missionMap[entry.id]
              ? <GoalCard key={entry.id} entry={entry} template={missionMap[entry.id]} cadence="daily" /> : null)}
          </ul>
        </Panel>

        <Panel title="This week's adventures" note="Progress adds up all week" art="spark" className="journey-weekly">
          <ul className="journey-goal-list">
            {state.missions.weekly.entries.map((entry) => weeklyMissionMap[entry.id]
              ? <GoalCard key={entry.id} entry={entry} template={weeklyMissionMap[entry.id]} cadence="weekly" /> : null)}
          </ul>
          <div className={`journey-week-bonus ${attendanceReady ? "is-ready" : ""} ${state.missions.weekly.claimed ? "is-claimed" : ""}`}>
            <span className="week-bonus-art"><Art name="star" size={28} /></span>
            <div><strong>Five-day glow</strong><small>Complete one daily goal on {WEEKLY_TARGET} different days. Missing a day is fine.</small></div>
            <Meter label={`${state.missions.weekly.days.length}/${WEEKLY_TARGET} active days`}
              value={state.missions.weekly.days.length} max={WEEKLY_TARGET} />
            {attendanceReady && (
              <button className="journey-claim" type="button" onClick={() => {
                const result = claimWeekly(state, clock());
                if (!result.rewards.length) return;
                update(result.state); cue("reward"); showReward("Five-day glow", result.rewards, "Weekly bonus");
              }}>Claim weekly chest</button>
            )}
            {state.missions.weekly.claimed && <span className="journey-complete"><Art name="check" size={15} /> Complete</span>}
          </div>
        </Panel>
      </div>

      <Panel title="Achievement constellations" note={`${achievementTemplates.length} milestones that never reset`} art="evolution" className="journey-achievements">
        <TabBar label="Achievement category" active={filter} onSelect={setFilter} tabs={[
          { id: "next", label: "Up next" }, { id: "care", label: "Care" }, { id: "bond", label: "Bond" },
          { id: "play", label: "Play" }, { id: "world", label: "World" }, { id: "create", label: "Create" },
          { id: "collection", label: "Collection" },
        ]} />
        <ul className="achievement-grid">
          {achievementView.map((achievement) => {
            const progress = Math.min(achievementProgress(state, achievement), achievement.target);
            const done = progress >= achievement.target;
            const isClaimed = claimed.has(achievement.id);
            return (
              <li key={achievement.id} className={`achievement-card achievement-${achievement.tier.toLowerCase()} ${done ? "is-ready" : ""} ${isClaimed ? "is-claimed" : ""}`}>
                <header>
                  <span className="achievement-emblem"><Art name={categoryArt[achievement.category]} size={23} /></span>
                  <div><span className="achievement-tier">{achievement.tier}</span><h3>{achievement.label}</h3></div>
                </header>
                <p>{achievement.note}</p>
                <Meter label={`${progress}/${achievement.target}`} value={progress} max={achievement.target} />
                <footer>
                  <span className="journey-reward">{rewardLabel(achievement.reward)}</span>
                  {done && !isClaimed && (
                    <button className="journey-claim" type="button" onClick={() => {
                      const result = claimAchievement(state, achievement.id, clock());
                      if (!result.rewards.length) return;
                      update(result.state); cue("reward"); showReward(achievement.label, result.rewards, `${achievement.tier} achievement`);
                    }}>Claim</button>
                  )}
                  {isClaimed && <span className="journey-complete"><Art name="check" size={15} /> Earned</span>}
                </footer>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
