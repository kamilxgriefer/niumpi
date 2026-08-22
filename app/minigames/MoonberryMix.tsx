"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Art } from "../ui/Art";
import { GameFrame } from "./GameFrame";
import type { RoundApi } from "./GameFrame";
import { useGame } from "../ui/GameProvider";
import { hashSeed, makeRng } from "../game/rng.ts";

const PADS = ["moonberry", "cloudpuff", "dewdrop", "sunseed"];
const SHOW_MS = { gentle: 700, normal: 550, brisk: 400 } as const;

export function MoonberryMix({ onExit }: { onExit: () => void }) {
  return <GameFrame id="moonberry-mix" onExit={onExit}>{(api) => <Round api={api} />}</GameFrame>;
}

/**
 * Turn-based, so it stays in the DOM: every pad is a real button with a label,
 * reachable by keyboard and announced to a screen reader. The sequence is drawn
 * from a seeded generator rather than Math.random during render.
 */
function Round({ api }: { api: RoundApi }) {
  const { cue, state } = useGame();
  const [sequence, setSequence] = useState<number[]>([]);
  const [lit, setLit] = useState<number | null>(null);
  const [showing, setShowing] = useState(true);
  const [step, setStep] = useState(0);
  const timers = useRef<number[]>([]);
  const round = useRef(0);

  const clear = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  const nextPad = useCallback(() => {
    round.current += 1;
    const rng = makeRng(hashSeed(state.profile.id, api.difficulty, round.current));
    return Math.floor(rng() * PADS.length);
  }, [api.difficulty, state.profile.id]);

  const play = useCallback((order: number[]) => {
    clear();
    setShowing(true);
    const gap = SHOW_MS[api.difficulty];
    order.forEach((pad, index) => {
      timers.current.push(window.setTimeout(() => { setLit(pad); cue("blip"); }, index * gap));
      timers.current.push(window.setTimeout(() => setLit(null), index * gap + gap * 0.6));
    });
    timers.current.push(window.setTimeout(() => { setShowing(false); setStep(0); }, order.length * gap + 200));
  }, [api.difficulty, clear, cue]);

  useEffect(() => {
    // Deferred by a timer so the first sequence is not a synchronous cascade.
    const start = window.setTimeout(() => {
      const first = [nextPad()];
      setSequence(first);
      play(first);
    }, 0);
    return () => { window.clearTimeout(start); clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function press(pad: number) {
    if (showing) return;
    setLit(pad);
    window.setTimeout(() => setLit(null), 180);
    if (sequence[step] !== pad) {
      cue("fail");
      // A wrong step replays the same order rather than ending the round.
      play(sequence);
      return;
    }
    cue("leaf");
    if (step + 1 >= sequence.length) {
      api.add(1);
      const next = [...sequence, nextPad()];
      setSequence(next);
      window.setTimeout(() => play(next), 550);
    } else {
      setStep(step + 1);
    }
  }

  return (
    <div className="mix-field">
      <p className="mix-status" aria-live="polite">
        {showing ? "Watch the order…" : `Your turn — ${step}/${sequence.length}`}
      </p>
      <div className="mix-pads">
        {PADS.map((pad, index) => (
          <button
            key={pad}
            className={`mix-pad pad-${index} ${lit === index ? "is-lit" : ""}`}
            type="button"
            disabled={showing}
            aria-label={`Pad ${index + 1}`}
            onClick={() => press(index)}
            onKeyDown={(event) => {
              const number = Number(event.key);
              if (number >= 1 && number <= 4) { event.preventDefault(); press(number - 1); }
            }}
          >
            <Art name={pad} size={40} />
          </button>
        ))}
      </div>
      <p className="mix-hint">Keys 1–4 work too. A wrong tap just replays the order.</p>
    </div>
  );
}
