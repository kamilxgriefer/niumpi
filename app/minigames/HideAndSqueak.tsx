"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Art } from "../ui/Art";
import { GameFrame } from "./GameFrame";
import type { RoundApi } from "./GameFrame";
import { useGame } from "../ui/GameProvider";
import { hashSeed, makeRng } from "../game/rng.ts";

const SPOTS = [
  { id: "sofa", art: "sofa", label: "Behind the sofa" },
  { id: "shelf", art: "shelf", label: "Under the shelf" },
  { id: "pot", art: "pot", label: "In the plant pot" },
  { id: "chest", art: "chest", label: "Inside the toy chest" },
  { id: "bed", art: "bed", label: "Under the bed" },
  { id: "tent", art: "tent", label: "In the dream tent" },
];

/** Warmth is a colour, a word AND a squeak — never colour alone. */
const warmthWord = ["stone cold", "cold", "warm", "very warm", "boiling"];

export function HideAndSqueak({ onExit }: { onExit: () => void }) {
  return <GameFrame id="hide-squeak" onExit={onExit}>{(api) => <Round api={api} />}</GameFrame>;
}

function Round({ api }: { api: RoundApi }) {
  const { cue, state } = useGame();
  const round = useRef(0);
  const nextSpot = useCallback(() => {
    round.current += 1;
    return Math.floor(makeRng(hashSeed(state.profile.id, "hide", round.current))() * SPOTS.length);
  }, [state.profile.id]);
  const [hiding, setHiding] = useState(0);
  const [checked, setChecked] = useState<Record<number, number>>({});
  const [found, setFound] = useState(false);
  const [message, setMessage] = useState("Niumpi is hiding. Where?");

  useEffect(() => {
    if (!found) return;
    const timer = window.setTimeout(() => {
      setHiding(nextSpot());
      setChecked({});
      setFound(false);
      setMessage("Hidden again! Where now?");
    }, 900);
    return () => window.clearTimeout(timer);
  }, [found, nextSpot]);

  function look(index: number) {
    if (found) return;
    if (index === hiding) {
      setFound(true);
      api.add(1);
      cue("chime");
      setMessage("Squeak! Found them.");
      return;
    }
    const distance = Math.abs(index - hiding);
    const warmth = Math.max(0, 4 - distance);
    setChecked({ ...checked, [index]: warmth });
    setMessage(`${SPOTS[index].label}: ${warmthWord[warmth]}.`);
    cue(warmth >= 3 ? "leaf" : "blip");
  }

  return (
    <div className="hide-field">
      <p className="hide-status" aria-live="polite">{message}</p>
      <ul className="hide-spots">
        {SPOTS.map((spot, index) => {
          const warmth = checked[index];
          return (
            <li key={spot.id}>
              <button
                className={`hide-spot ${warmth !== undefined ? `warmth-${warmth}` : ""} ${found && index === hiding ? "is-found" : ""}`}
                type="button"
                onClick={() => look(index)}
                aria-label={warmth !== undefined ? `${spot.label} — ${warmthWord[warmth]}` : spot.label}
              >
                <Art name={found && index === hiding ? "niumpi" : spot.art} size={34} />
                <span>{spot.label}</span>
                {warmth !== undefined && <small>{warmthWord[warmth]}</small>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
