"use client";

import { useEffect, useRef, useState } from "react";
import { Art } from "../ui/Art";
import { NiumpiBody } from "../ui/niumpi/NiumpiBody";
import { profileFor } from "../game/config/growth";
import { useGame } from "../ui/GameProvider";
import { hatch, nameNiumpi, seedAction } from "../game/actions";
import { SEED_COOLDOWN_MS, SEED_STEP, seedActions, seedPhaseFor } from "../game/config/stages";
import { copy } from "../game/config/copy";
import { nameIdeas, suggestFrom, taglineIdeas } from "../identity";
import { startSeedLullaby, stopSeedLullaby } from "../ui/audio";

type SeedCare = (typeof seedActions)[number];

const HATCH_LINES = [
  "The heartbeat comes closer.",
  "Warm light travels through every crack.",
  "A tiny breath. Then another.",
];

const RITUAL_MARKS = [
  { at: 0, label: "Meet" },
  { at: 0.32, label: "Trust" },
  { at: 0.64, label: "Heartbeat" },
  { at: 0.88, label: "Ready" },
];

/**
 * The first scene anybody sees. Every state is saved, so a refresh mid-hatch
 * resumes exactly where it stopped.
 */
export function SeedChamberScene() {
  const { state, run, now, goTo, cue, message, clock} = useGame();
  const [hatching, setHatching] = useState(false);
  const [hatchBeat, setHatchBeat] = useState(0);
  const [careFx, setCareFx] = useState<SeedCare["fx"] | null>(null);
  const [name, setName] = useState("Niumpi");
  const [tagline, setTagline] = useState(taglineIdeas[0]);
  const timers = useRef<number[]>([]);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    stopSeedLullaby();
  }, []);

  const progress = state.niumpi.seedProgress;
  const phase = seedPhaseFor(progress);
  const hatched = Boolean(state.niumpi.hatchedAt);
  const named = Boolean(state.niumpi.name);
  const lastCareAt = seedActions.reduce(
    (latest, action) => Math.max(latest, state.niumpi.seedActions[`${action.id}:at`] ?? 0),
    0,
  );
  const settling = now - lastCareAt < SEED_COOLDOWN_MS;
  const busy = hatching || careFx !== null || settling;
  const careCount = Math.min(Math.ceil(1 / SEED_STEP), Math.round(progress / SEED_STEP));

  function later(callback: () => void, delay: number) {
    const timer = window.setTimeout(callback, delay);
    timers.current.push(timer);
  }

  function careForSeed(action: SeedCare) {
    if (busy || progress >= 1) return;
    const result = seedAction(state, action.id, clock());
    if (result.refused) { run(result); return; }
    if (state.profile.settings.music) startSeedLullaby();
    setCareFx(action.fx);
    run(result);
    later(() => setCareFx(null), 2_150);
  }

  function beginHatching() {
    if (hatching) return;
    setHatching(true);
    setHatchBeat(0);
    if (state.profile.settings.music) startSeedLullaby();
    cue("hatch");
    later(() => setHatchBeat(1), 1_250);
    later(() => setHatchBeat(2), 2_650);
    later(() => run(hatch(state, clock())), 4_500);
  }

  if (hatched && !named) {
    return (
      <div className="scene scene-seed is-naming">
        <div className="seed-room">
          <div className="hatch-halo" aria-hidden="true" />
          {/*
            * The real creature, at the stage it actually hatched into. This was
            * a flat 140px sprite — the one moment the whole product is built
            * around was introducing a different character from the one the
            * player then spends every session with.
            *
            * The reveal, the first blink and the first look are CSS animations
            * on this wrapper: no frame loop, nothing to interrupt, and a
            * refresh mid-sequence simply lands on the settled pose.
            */}
          <div className="hatch-baby body-cloud morph-seedling">
            <NiumpiBody
              profile={profileFor(1)}
              phenotype={{ ...state.phenotype, morphology: "seedling", markings: [] }}
              animation="hatch"
            />
          </div>
        </div>
        <form
          className="name-card"
          onSubmit={(event) => {
            event.preventDefault();
            run(nameNiumpi(state, name, tagline, clock()));
            goTo("home");
          }}
        >
          <h2>{copy.seed.nameTitle}</h2>
          <p className="soft-note">{copy.seed.nameLead}</p>
          <label className="field">
            <span>Name</span>
            <span className="field-row">
              <input value={name} maxLength={14} onChange={(event) => setName(event.target.value)} required />
              <button className="dice" type="button" aria-label="Suggest a name"
                onClick={() => setName(suggestFrom(nameIdeas, name))}>
                <Art name="spark" size={16} />
              </button>
            </span>
          </label>
          <label className="field">
            <span>A few words about them</span>
            <span className="field-row">
              <input value={tagline} maxLength={40} onChange={(event) => setTagline(event.target.value)} />
              <button className="dice" type="button" aria-label="Suggest a description"
                onClick={() => setTagline(suggestFrom(taglineIdeas, tagline))}>
                <Art name="spark" size={16} />
              </button>
            </span>
          </label>
          <button className="primary-button" type="submit">That’s their name</button>
        </form>
      </div>
    );
  }

  const ready = progress >= 1;

  return (
    <div
      className={`scene scene-seed phase-${phase.key} ${hatching ? "is-hatching" : ""} ${careFx ? `is-caring-${careFx}` : ""}`}
      aria-busy={hatching || undefined}
    >
      <header className="seed-head">
        <span className="seed-eyebrow">A quiet beginning</span>
        <h1>{copy.seed.title}</h1>
        <p>{ready ? copy.seed.hatching : copy.seed.lead}</p>
      </header>

      <div className="seed-care-layout">
        <div className="seed-focus">
          <div className="seed-room">
            <span className="seed-dust" aria-hidden="true"><i /><i /><i /><i /><i /></span>
            <div className="seed-pedestal" aria-hidden="true" />
            <span className="seed-heartbeat" aria-hidden="true"><i /><i /></span>
            <span className="care-hand" aria-hidden="true"><i /></span>
            <span className="care-cloth" aria-hidden="true"><i /></span>
            <span className="care-droplets" aria-hidden="true"><i /><i /><i /><i /></span>
            <span className="care-blanket" aria-hidden="true"><i /></span>
            <span className="care-notes" aria-hidden="true"><i>♪</i><i>·</i><i>♫</i></span>
            <button
              className="seed-shell seed-touch"
              type="button"
              disabled={busy || ready}
              aria-label={`Stroke the shell directly. The seed is ${phase.label.toLowerCase()}.`}
              onClick={() => careForSeed(seedActions[0])}
            >
              <span className="egg-body" />
              <span className="egg-glow" />
              <span className="egg-crack crack-one" />
              <span className="egg-crack crack-two" />
              <span className="egg-crack crack-three" />
            </button>
          </div>

          <div className="seed-response">
            <span className="seed-phase">{phase.label}</span>
            <p className="seed-speech" aria-live="polite">
              {hatching ? HATCH_LINES[hatchBeat] : message}
            </p>
          </div>
        </div>

        {ready ? (
          <div className="hatch-welcome">
            <span className="ritual-kicker">The final moment</span>
            <h2>The seed knows you now.</h2>
            <p>Nothing more to prepare. Stay close while Niumpi finds the way out.</p>
            <button
              className="primary-button hatch-button"
              type="button"
              disabled={hatching}
              onClick={beginHatching}
            >
              {hatching ? "Stay with the light…" : "Hold the seed and welcome them"}
            </button>
          </div>
        ) : (
          <section className="seed-ritual" aria-labelledby="ritual-title">
          <header className="ritual-head">
            <div>
              <span className="ritual-kicker">Care ritual</span>
              <h2 id="ritual-title">Help the seed feel safe</h2>
            </div>
            <span className="ritual-count">{careCount} / {Math.ceil(1 / SEED_STEP)} moments</span>
          </header>
          <ul className="seed-actions">
            {seedActions.map((action) => (
              <li key={action.id}>
                <button
                  className={`seed-action seed-action-${action.fx} ${busy ? "is-cooling" : ""}`}
                  type="button"
                  disabled={busy}
                  onClick={() => careForSeed(action)}
                >
                  <span className="seed-action-art"><Art name={action.art} size={28} /></span>
                  <span className="seed-action-copy">
                    <strong>{action.label}</strong>
                    <small>{busy ? "Listen for its answer…" : action.note}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          </section>
        )}
      </div>

      <div className="seed-journey">
        <div className="seed-progress" role="progressbar" aria-label="Hatching progress"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <ol className="ritual-marks" aria-hidden="true">
          {RITUAL_MARKS.map((mark) => (
            <li className={progress >= mark.at ? "is-reached" : ""} key={mark.label}>{mark.label}</li>
          ))}
        </ol>
      </div>
      <p className="seed-safety">{copy.safety.noDeath}</p>
    </div>
  );
}
