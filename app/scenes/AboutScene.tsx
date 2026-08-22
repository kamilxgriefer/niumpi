"use client";

import { Art } from "../ui/Art";
import { Panel } from "../ui/parts";
import { Brand } from "../ui/Brand";
import { useGame } from "../ui/GameProvider";
import { copy } from "../game/config/copy";
import { expeditionGear, expeditionLengths } from "../game/config/explore";
import { claimExpedition, startExpedition } from "../game/expeditions";
import { countdownLabel } from "../game/time";
import { useState } from "react";

export function AboutScene() {
  const { state, update, now, showReward, cue, toast, devMode, clock} = useGame();
  const [length, setLength] = useState("hour");
  const [gear, setGear] = useState("basket");
  const [story, setStory] = useState<string | null>(null);
  const trip = state.expedition;
  const ready = Boolean(trip && now >= trip.completesAt);

  return (
    <div className="scene scene-about">
      <header className="about-hero">
        <Brand />
        <p className="about-promise">{copy.brand.promise}</p>
      </header>

      <ul className="about-grid">
        {copy.about.points.map((point) => (
          <li key={point.title} className="about-card">
            <Art name={point.art} size={30} />
            <strong>{point.title}</strong>
            <small>{point.note}</small>
          </li>
        ))}
      </ul>

      <Panel title="Expeditions" art="explore" note="Send Niumpi out while you're away">
        {trip ? (
          <div className="trip-running">
            <Art name="compass" size={44} />
            <div>
              <strong>Out exploring with the {trip.gear}</strong>
              <small>{ready ? "Back at the door" : `Home in ${countdownLabel(trip.completesAt, now)}`}</small>
            </div>
            <button
              className="primary-button"
              type="button"
              disabled={!ready}
              onClick={() => {
                const result = claimExpedition(state, clock());
                if (!result) return;
                update(result.state);
                cue("chime");
                setStory(result.story);
                if (result.rewards.length) showReward("Back from an adventure", result.rewards, "Expedition");
              }}
            >
              {ready ? "Welcome them back" : "Still out…"}
            </button>
          </div>
        ) : (
          <div className="trip-picker">
            <div className="trip-row">
              {expeditionLengths.map((entry) => (
                <button key={entry.id} className={`carry-chip ${length === entry.id ? "is-active" : ""}`}
                  type="button" onClick={() => setLength(entry.id)}>
                  <strong>{entry.label}</strong>
                </button>
              ))}
            </div>
            <div className="trip-row">
              {expeditionGear.map((entry) => (
                <button key={entry.id} className={`carry-chip ${gear === entry.id ? "is-active" : ""}`}
                  type="button" onClick={() => setGear(entry.id)}>
                  <strong>{entry.label}</strong><small>{entry.note}</small>
                </button>
              ))}
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                const next = startExpedition(state, length, gear, clock());
                if (next) { update(next); cue("blip"); toast("Off they go", "➤"); }
              }}
            >
              Set off
            </button>
          </div>
        )}
        {story && <p className="trip-story">{story}</p>}
      </Panel>

      <Panel title={copy.about.playAnywhere} art="activities" note={copy.about.playAnywhereNote}>
        <div className="phone-frame" aria-hidden="true">
          <div className="phone-screen">
            <span className="phone-bar" />
            <Art name="niumpi" size={54} />
            <span className="phone-line" />
            <span className="phone-line is-short" />
            <span className="phone-nav"><i /><i /><i /><i /></span>
          </div>
        </div>
        <p className="soft-note">
          Niumpi installs as an app from your browser’s menu and keeps playing offline —
          your save lives on this device.
        </p>
      </Panel>

      <Panel title="Your data" art="lock" note="Everything stays on this device">
        <ul className="privacy-list">
          <li>{copy.safety.seedPrivacy}</li>
          <li>{copy.safety.noDeath}</li>
          <li>No account, no tracking, no advertising.</li>
        </ul>
      </Panel>

      <p className="about-closing">{copy.about.closing}</p>
      {devMode && <p className="soft-note">Developer mode is on for this session only.</p>}
    </div>
  );
}
