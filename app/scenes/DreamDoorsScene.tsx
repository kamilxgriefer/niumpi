"use client";

import { useState } from "react";
import { Art } from "../ui/Art";
import { Meter, Panel } from "../ui/parts";
import { useGame } from "../ui/GameProvider";
import { dreamCarry, dreamDoorMap, dreamDoors } from "../game/config/dreams";
import { claimDream, startDream } from "../game/dreams";
import { countdownLabel } from "../game/time";
import { recordCare } from "../game/care";
import { progressMissions } from "../game/missions";
import { awardMemory } from "../game/memories";
import { copy } from "../game/config/copy";

export function DreamDoorsScene() {
  const { state, update, now, showReward, cue, say, clock} = useGame();
  const [carry, setCarry] = useState("none");
  const [morning, setMorning] = useState<{ title: string; story: string; door: string } | null>(null);
  const run = state.dream;
  const ready = Boolean(run && now >= run.completesAt);

  function choose(doorId: string) {
    const next = startDream(state, doorId, carry === "none" ? null : carry, clock());
    if (!next) return;
    const care = recordCare(next, "dream", clock(), { dream: 2 });
    let settled = progressMissions(care.state, "dream", clock());
    settled = awardMemory(settled, "first-dream", clock()).state;
    update(settled);
    cue("sleep");
    say("Nium… see you in the morning.");
  }

  function collect() {
    const result = claimDream(state, clock());
    if (!result) return;
    update(result.state);
    cue("chime");
    setMorning({ title: result.title, story: result.story, door: result.doorName });
    if (result.rewards.length) showReward(result.title, result.rewards, `${result.doorName} dream`);
  }

  return (
    <div className="scene scene-dreams">
      <header className="scene-head">
        <div>
          <h1>{copy.home.dreamDoors}</h1>
          <p>{run ? "A dream is already underway." : copy.home.dreamDoorsNote}</p>
        </div>
      </header>

      {morning ? (
        <div className="dream-morning" role="status">
          <span className="morning-motes" aria-hidden="true"><i /><i /><i /></span>
          <Art name="niumpi" size={64} />
          <div>
            <p className="morning-door">{morning.door}</p>
            <h2>{morning.title}</h2>
            <p>{morning.story}</p>
          </div>
          <button className="ghost-button" type="button" onClick={() => setMorning(null)}>Good morning</button>
        </div>
      ) : run ? (
        <Panel title="Tonight's dream" art="dream" tone="cosmic">
          <div className="dream-running">
            {/* The door's own art and name. This rendered `run.door` — an id —
                as an art name, and a de-slugged id as the title, so the panel
                lost the identity of the door the player had just chosen. */}
            <Art name={dreamDoorMap[run.door]?.art ?? "dream"} size={64} />
            <div>
              <strong>{dreamDoorMap[run.door]?.name ?? run.door}</strong>
              <Meter label={ready ? "Ready" : countdownLabel(run.completesAt, now)}
                value={Math.min(1, (now - run.startedAt) / (run.completesAt - run.startedAt)) * 100} max={100} />
            </div>
            <button className="primary-button" type="button" disabled={!ready} onClick={collect}>
              {ready ? "Wake up together" : "Still dreaming…"}
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <Panel title="Take something along" art="collect" note="It changes what the night turns up">
            <div className="carry-row">
              {dreamCarry.map((item) => (
                <button key={item.id} className={`carry-chip ${carry === item.id ? "is-active" : ""}`}
                  type="button" onClick={() => setCarry(item.id)}>
                  <strong>{item.label}</strong><small>{item.note}</small>
                </button>
              ))}
            </div>
          </Panel>
          <ul className="door-row">
            {dreamDoors.map((door) => (
              <li key={door.id}>
                <button className={`dream-door door-${door.id}`} type="button" onClick={() => choose(door.id)}>
                  <span className="door-art"><Art name={door.art} size={64} /></span>
                  <strong>{door.name}</strong>
                  <small>{door.note}</small>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
