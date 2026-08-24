"use client";

import { CompanionStage } from "../ui/CompanionStage";
import { useFoodDrop } from "../ui/useFoodDrop";
import { SnackBar } from "../ui/SnackBar";
import { Art } from "../ui/Art";
import { BondMeter, CleanlinessRow, StatRow } from "../ui/parts";
import {
  ActivityTiles, EvolutionPreviewCard, MemorySeedCard, MissionsCard,
  PersonalityPreview, PetStatusStrip, RoomPreviewCard,
} from "../ui/homeCards";
import { useGame } from "../ui/GameProvider";
import { copy } from "../game/config/copy";
import { sleep, toggleLamp, wake } from "../game/actions";
import { relationshipFor } from "../identity";
import { Brand } from "../ui/Brand";

export function HomeScene() {
  const { state, run, goTo, cue, clock} = useGame();
  const { armed, setArmed, stageRef, hitTest, dropFood } = useFoodDrop(state, run, clock);



  const relationship = relationshipFor(state.niumpi.bond, state.memories.length);
  const asleep = state.niumpi.sleeping;

  return (
    <div className="scene scene-home">
      <Brand compact />

      <div className="home-grid">
        <div className="home-main">
          <section className="hero-panel">
            <header className="hero-head">
              <span className="hero-mark"><Art name="niumpi" size={22} /> {state.niumpi.name || copy.brand.name}</span>
              <div className="hero-tools">
                <SoundToggle />
                <BondMeter bond={state.niumpi.bond} level={relationship.level} name={relationship.name} />
              </div>
            </header>

            <div className="hero-status-strip" aria-label="Niumpi's needs">
              <div className="hero-stats">
                {(["fullness", "energy", "joy"] as const).map((id) => (
                  <StatRow key={id} id={id} value={state.stats[id]} />
                ))}
                <CleanlinessRow value={state.niumpi.cleanliness} />
              </div>
            </div>

            <div className="hero-stage" ref={stageRef}>
              <CompanionStage targeting={Boolean(armed)} onDropFood={dropFood} />
            </div>

            <SnackBar armed={armed} onArm={setArmed} hitTest={hitTest} onCook={() => goTo("cooking")} />

            <div className="action-bar">
              <button className="action-button action-wash" type="button" onClick={() => goTo("niumpi")}>
                <Art name="drop" size={20} />
                {copy.actions.wash}
              </button>
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

            <PetStatusStrip />
          </section>

          <ActivityTiles />
        </div>

        <aside className="home-side">
          <MemorySeedCard />
          <MissionsCard />
          {/* Compact previews, not second copies of their scenes. */}
          <div className="preview-stack">
            <EvolutionPreviewCard />
            <PersonalityPreview />
            <RoomPreviewCard />
          </div>
        </aside>
      </div>
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
