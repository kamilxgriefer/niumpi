"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  NAME_LIMIT,
  TAGLINE_LIMIT,
  nameIdeas,
  sanitizeName,
  sanitizeTagline,
  settleIdentity,
  suggestFrom,
  taglineIdeas,
  vibeOrder,
  vibes,
} from "./identity";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { PetIdentity, PetVibe } from "./identity";

type Props = {
  mode: "create" | "edit";
  returning: boolean;
  identity: PetIdentity;
  onSave: (identity: PetIdentity) => void;
  onCancel: () => void;
  onCue: (kind: "step" | "done") => void;
};

const steps = [
  { title: "Someone just hatched", lead: "A tiny Niumpi is looking at you. What should we call them?" },
  { title: "How do they feel?", lead: "One little line that fits them today. You can change it any time." },
  { title: "Pick a vibe", lead: "This colours how your Niumpi moves and plays." },
] as const;

/** A returning player already has a Niumpi — only the greeting changes. */
const returningIntro = {
  title: "Time for a name",
  lead: "You have been caring for this little one already. What do you call them?",
} as const;

export function Onboarding({ mode, returning, identity, onSave, onCancel, onCue }: Props) {
  const isCreate = mode === "create";
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<PetIdentity>(() =>
    isCreate ? { ...identity, name: "", tagline: "" } : identity,
  );
  const nameField = useRef<HTMLInputElement>(null);
  const taglineField = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const nameId = useId();
  const taglineId = useId();

  const displayName = draft.name.trim() || "Niumpi";

  useEffect(() => {
    if (!isCreate) {
      nameField.current?.focus();
      return;
    }
    if (step === 0) nameField.current?.focus();
    if (step === 1) taglineField.current?.focus();
  }, [isCreate, step]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !isCreate) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isCreate, onCancel]);

  function save() {
    onCue("done");
    onSave(settleIdentity(draft, new Date().toISOString()));
  }

  function goNext() {
    if (step >= steps.length - 1) {
      save();
      return;
    }
    onCue("step");
    setStep((current) => current + 1);
  }

  function goBack() {
    onCue("step");
    setStep((current) => Math.max(0, current - 1));
  }

  function submitOnEnter(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (isCreate) goNext();
    else save();
  }

  const nameBlock = (
    <div className="onboard-block">
      <label className="onboard-label" htmlFor={nameId}>
        Name
      </label>
      <div className="onboard-input-row">
        <input
          id={nameId}
          ref={nameField}
          className="onboard-input"
          type="text"
          value={draft.name}
          maxLength={NAME_LIMIT}
          placeholder="Niumpi"
          autoComplete="off"
          enterKeyHint={isCreate ? "next" : "done"}
          onKeyDown={submitOnEnter}
          onChange={(event) =>
            setDraft((current) => ({ ...current, name: sanitizeName(event.target.value) }))
          }
        />
        <button
          className="onboard-dice"
          type="button"
          aria-label="Suggest a name"
          onClick={() => {
            onCue("step");
            setDraft((current) => ({ ...current, name: suggestFrom(nameIdeas, current.name) }));
          }}
        >
          <span aria-hidden="true">✦</span>
        </button>
      </div>
      <p className="onboard-hint">Up to {NAME_LIMIT} letters. Leave it empty to keep &ldquo;Niumpi&rdquo;.</p>
    </div>
  );

  const taglineBlock = (
    <div className="onboard-block">
      <label className="onboard-label" htmlFor={taglineId}>
        Mood tagline
      </label>
      <div className="onboard-input-row">
        <input
          id={taglineId}
          ref={taglineField}
          className="onboard-input"
          type="text"
          value={draft.tagline}
          maxLength={TAGLINE_LIMIT}
          placeholder={taglineIdeas[0]}
          autoComplete="off"
          enterKeyHint={isCreate ? "next" : "done"}
          onKeyDown={submitOnEnter}
          onChange={(event) =>
            setDraft((current) => ({ ...current, tagline: sanitizeTagline(event.target.value) }))
          }
        />
        <button
          className="onboard-dice"
          type="button"
          aria-label="Suggest a tagline"
          onClick={() => {
            onCue("step");
            setDraft((current) => ({
              ...current,
              tagline: suggestFrom(taglineIdeas, current.tagline),
            }));
          }}
        >
          <span aria-hidden="true">✦</span>
        </button>
      </div>
      <div className="onboard-chips">
        {taglineIdeas.slice(0, 3).map((idea) => (
          <button
            className="onboard-chip"
            type="button"
            key={idea}
            onClick={() => {
              onCue("step");
              setDraft((current) => ({ ...current, tagline: idea }));
            }}
          >
            {idea}
          </button>
        ))}
      </div>
    </div>
  );

  const vibeBlock = (
    <fieldset className="onboard-block onboard-vibes">
      <legend className="onboard-label">Pet vibe</legend>
      {vibeOrder.map((vibe: PetVibe) => (
        <label className={`vibe-card vibe-${vibe} ${draft.vibe === vibe ? "is-picked" : ""}`} key={vibe}>
          <input
            type="radio"
            name="pet-vibe"
            value={vibe}
            checked={draft.vibe === vibe}
            onChange={() => {
              onCue("step");
              setDraft((current) => ({ ...current, vibe }));
            }}
          />
          <span className="vibe-symbol" aria-hidden="true">
            {vibes[vibe].symbol}
          </span>
          <span className="vibe-copy">
            <strong>{vibes[vibe].name}</strong>
            <span>{vibes[vibe].blurb}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );

  return (
    <div className="onboard-veil" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="onboard-card">
        <p className="onboard-eyebrow">
          <span aria-hidden="true">✦</span>
          {isCreate ? (returning ? "Getting to know you" : "First meeting") : "My Buddy"}
        </p>

        {isCreate ? (
          <>
            <h2 id={titleId}>{step === 0 && returning ? returningIntro.title : steps[step].title}</h2>
            <p className="onboard-lead">{step === 0 && returning ? returningIntro.lead : steps[step].lead}</p>
            <ol className="onboard-dots" aria-label={`Step ${step + 1} of ${steps.length}`}>
              {steps.map((entry, index) => (
                <li key={entry.title} className={index <= step ? "is-done" : ""} aria-hidden="true" />
              ))}
            </ol>
            {step === 0 && nameBlock}
            {step === 1 && taglineBlock}
            {step === 2 && vibeBlock}
            {step === steps.length - 1 && (
              <p className="onboard-preview">
                Say hello to <strong>{displayName}</strong>
              </p>
            )}
            <div className="onboard-actions">
              {step > 0 && (
                <button className="onboard-ghost" type="button" onClick={goBack}>
                  Back
                </button>
              )}
              <button className="onboard-primary" type="button" onClick={goNext}>
                {step === steps.length - 1 ? "Start our story" : "Next"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id={titleId}>Edit {identity.name}</h2>
            <p className="onboard-lead">Nothing you change here is ever lost — {identity.name} stays the same buddy.</p>
            {nameBlock}
            {taglineBlock}
            {vibeBlock}
            <div className="onboard-actions">
              <button className="onboard-ghost" type="button" onClick={onCancel}>
                Cancel
              </button>
              <button className="onboard-primary" type="button" onClick={save}>
                Save changes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
