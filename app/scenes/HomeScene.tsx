"use client";

import { useCallback, useRef, useState } from "react";
import { CompanionStage } from "../ui/CompanionStage";
import { SnackBar } from "../ui/SnackBar";
import { Art } from "../ui/Art";
import { BondMeter, StatRow } from "../ui/parts";
import {
  ActivityTiles, DiscoveryBanner, EvolutionPreview, GrowthCard, MemorySeedCard,
  MissionsCard, PersonalityPanel, RoomPreview, SharedMomentsCard, TodayVibe,
} from "../ui/homeCards";
import { useGame } from "../ui/GameProvider";
import { copy } from "../game/config/copy";
import { feed, sleep, toggleLamp, wake } from "../game/actions";
import { relationshipFor } from "../identity";
import { Brand } from "../ui/Brand";

export function HomeScene() {
  const { state, run, goTo, cue, clock} = useGame();
  const [armed, setArmed] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  /** The drop zone is the creature itself, not the whole panel. */
  const hitTest = useCallback((x: number, y: number) => {
    const box = stageRef.current?.querySelector(".rig-root")?.getBoundingClientRect();
    return Boolean(box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom);
  }, []);

  const dropFood = useCallback((x: number, y: number) => {
    if (!armed) return false;
    if (!hitTest(x, y)) return false;
    run(feed(state, armed, clock()));
    setArmed(null);
    return true;
  }, [armed, clock, hitTest, run, state]);

  const relationship = relationshipFor(state.niumpi.bond, state.memories.length);
  const asleep = state.niumpi.sleeping;

  return (
    <div className="scene scene-home">
      <div className="home-grid">
        <div className="home-left">
          <Brand />
          <MemorySeedCard />
          <PersonalityPanel />
        </div>

        <div className="home-centre">
          <section className="hero-panel">
            <header className="hero-head">
              <span className="hero-mark"><Art name="niumpi" size={22} /> {state.niumpi.name || copy.brand.name}</span>
              <div className="hero-tools">
                <SoundToggle />
                <BondMeter bond={state.niumpi.bond} level={relationship.level} name={relationship.name} />
              </div>
            </header>

            <div className="hero-stage" ref={stageRef}>
              <CompanionStage targeting={Boolean(armed)} onDropFood={dropFood}>
                <div className="hero-stats">
                  {(["fullness", "energy", "joy"] as const).map((id) => (
                    <StatRow key={id} id={id} value={state.stats[id]} />
                  ))}
                </div>
              </CompanionStage>
            </div>

            <SharedMomentsCard />
            <GrowthCard />
            <DiscoveryBanner />
            <TodayVibe />

            <SnackBar armed={armed} onArm={setArmed} hitTest={hitTest} onCook={() => goTo("cooking")} />

            <div className="action-bar">
              <button
                className={`action-button action-lamp ${state.niumpi.lampOn ? "is-active" : ""}`}
                type="button"
                aria-pressed={state.niumpi.lampOn}
                onClick={() => run(toggleLamp(state))}
              >
                <Art name="lamp" size={20} />
                {state.niumpi.lampOn ? copy.home.lampOff : copy.home.lampOn}
              </button>
              <button
                className={`action-button action-sleep ${asleep ? "is-active" : ""}`}
                type="button"
                onClick={() => { cue("blip"); run(asleep ? wake(state, clock()) : sleep(state, clock())); }}
              >
                <Art name={asleep ? "sun" : "moon"} size={20} />
                {asleep ? copy.home.wakeUp : copy.home.tuckIn}
              </button>
            </div>
          </section>
        </div>

        <div className="home-right">
          <EvolutionPreview />
          <RoomPreview />
          <MissionsCard />
        </div>
      </div>

      <ActivityTiles />
    </div>
  );
}

export function SoundToggle() {
  const { state, update, cue } = useGame();
  const on = state.profile.settings.sound;
  return (
    <button
      className={`sound-toggle ${on ? "is-on" : "is-off"}`}
      type="button"
      aria-pressed={on}
      onClick={() => {
        update({ ...state, profile: { ...state.profile, settings: { ...state.profile.settings, sound: !on } } });
        if (!on) cue("blip");
      }}
    >
      <Art name={on ? "sound" : "mute"} size={16} />
      Sound {on ? "on" : "off"}
    </button>
  );
}
