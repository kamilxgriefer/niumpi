"use client";

import { useState } from "react";
import { Art } from "../ui/Art";
import { GameFrame } from "./GameFrame";
import type { RoundApi } from "./GameFrame";
import { useGame } from "../ui/GameProvider";
import { hashSeed, makeRng } from "../game/rng.ts";

type Fork = { left: Step; right: Step };
type Step = { art: string; label: string; note: string; points: number };

const STEPS: Step[] = [
  { art: "moon", label: "Toward the moon", note: "It got brighter with every step.", points: 2 },
  { art: "tree", label: "Into the trees", note: "Something small waved from a branch.", points: 1 },
  { art: "wave", label: "Along the water", note: "The path stayed dry, somehow.", points: 2 },
  { art: "ember", label: "Toward the warmth", note: "A glow at the end of the tunnel.", points: 2 },
  { art: "door", label: "Through the door", note: "It opened before you knocked.", points: 3 },
  { art: "star", label: "Following the stars", note: "They rearranged politely.", points: 3 },
  { art: "cloud", label: "Up into the cloud", note: "Nothing there but softness.", points: 1 },
  { art: "hill", label: "Over the hill", note: "The view was worth the climb.", points: 2 },
  { art: "hush", label: "Into the quiet", note: "Nothing happened. It was lovely.", points: 1 },
  { art: "prism", label: "Toward the colours", note: "Every step a different shade.", points: 3 },
];

function forkAt(seed: number): Fork {
  const rng = makeRng(seed);
  const left = STEPS[Math.floor(rng() * STEPS.length)];
  let right = STEPS[Math.floor(rng() * STEPS.length)];
  if (right === left) right = STEPS[(STEPS.indexOf(left) + 3) % STEPS.length];
  return { left, right };
}

export function DreamPath({ onExit }: { onExit: () => void }) {
  return <GameFrame id="dream-path" onExit={onExit}>{(api) => <Round api={api} />}</GameFrame>;
}

function Round({ api }: { api: RoundApi }) {
  const { state, cue } = useGame();
  const [depth, setDepth] = useState(0);
  const [trail, setTrail] = useState<Step[]>([]);
  const fork = forkAt(hashSeed(state.profile.id, depth, api.difficulty));

  function choose(step: Step) {
    setTrail([step, ...trail].slice(0, 5));
    setDepth(depth + 1);
    api.add(step.points);
    cue(step.points >= 3 ? "chime" : "leaf");
  }

  return (
    <div className="path-field">
      <p className="path-depth">Step {depth + 1}</p>
      <div className="path-forks">
        {([fork.left, fork.right] as const).map((step, index) => (
          <button
            key={`${depth}-${index}`}
            className="path-choice"
            type="button"
            onClick={() => choose(step)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" && index === 1) event.currentTarget.parentElement?.querySelector("button")?.focus();
            }}
          >
            <Art name={step.art} size={40} />
            <strong>{step.label}</strong>
          </button>
        ))}
      </div>
      <ul className="path-trail" aria-live="polite">
        {trail.map((step, index) => (
          <li key={`${step.label}-${index}`}><Art name={step.art} size={16} /> {step.note}</li>
        ))}
      </ul>
      <p className="path-hint">Arrow keys or click. Every path leads somewhere.</p>
    </div>
  );
}
