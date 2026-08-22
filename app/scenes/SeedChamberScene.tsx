"use client";

import { useState } from "react";
import { Art } from "../ui/Art";
import { useGame } from "../ui/GameProvider";
import { hatch, nameNiumpi, seedAction } from "../game/actions";
import { SEED_COOLDOWN_MS, seedActions, seedPhaseFor } from "../game/config/stages";
import { copy } from "../game/config/copy";
import { nameIdeas, suggestFrom, taglineIdeas } from "../identity";

/**
 * The first scene anybody sees. Every state is saved, so a refresh mid-hatch
 * resumes exactly where it stopped.
 */
export function SeedChamberScene() {
  const { state, run, now, goTo, cue, message, clock} = useGame();
  const [hatching, setHatching] = useState(false);
  const [name, setName] = useState("Niumpi");
  const [tagline, setTagline] = useState(taglineIdeas[0]);

  const progress = state.niumpi.seedProgress;
  const phase = seedPhaseFor(progress);
  const hatched = Boolean(state.niumpi.hatchedAt);
  const named = Boolean(state.niumpi.name);

  if (hatched && !named) {
    return (
      <div className="scene scene-seed is-naming">
        <div className="seed-room">
          <div className="hatch-halo" aria-hidden="true" />
          <Art name="niumpi" size={140} className="hatch-baby" />
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
    <div className={`scene scene-seed phase-${phase.key} ${hatching ? "is-hatching" : ""}`}>
      <header className="seed-head">
        <h1>{copy.seed.title}</h1>
        <p>{ready ? copy.seed.hatching : copy.seed.lead}</p>
      </header>

      <div className="seed-room">
        <span className="seed-dust" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        <div className="seed-pedestal" aria-hidden="true" />
        <div className="seed-shell" role="img" aria-label={`The seed is ${phase.label.toLowerCase()}`}>
          <span className="egg-body" />
          <span className="egg-glow" />
          <span className="egg-crack crack-one" />
          <span className="egg-crack crack-two" />
          <span className="egg-crack crack-three" />
        </div>
      </div>

      <p className="seed-phase">{phase.label}</p>
      <p className="seed-speech" aria-live="polite">{message}</p>

      {ready ? (
        <button
          className="primary-button hatch-button"
          type="button"
          onClick={() => {
            setHatching(true);
            cue("hatch");
            // A short beat so the crack animation reads before the reveal.
            window.setTimeout(() => run(hatch(state, clock())), 1_400);
          }}
        >
          Open it gently
        </button>
      ) : (
        <ul className="seed-actions">
          {seedActions.map((action) => {
            const lastAt = state.niumpi.seedActions[`${action.id}:at`] ?? 0;
            const cooling = now - lastAt < SEED_COOLDOWN_MS;
            return (
              <li key={action.id}>
                <button
                  className={`seed-action ${cooling ? "is-cooling" : ""}`}
                  type="button"
                  disabled={cooling}
                  onClick={() => run(seedAction(state, action.id, clock()))}
                >
                  <Art name={action.art} size={30} />
                  <strong>{action.label}</strong>
                  <small>{cooling ? "It needs a moment…" : action.note}</small>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="seed-progress" role="progressbar" aria-label="Hatching progress"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="seed-safety">{copy.safety.noDeath}</p>
    </div>
  );
}
