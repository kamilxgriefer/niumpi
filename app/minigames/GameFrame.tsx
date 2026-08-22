"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Art } from "../ui/Art";
import { Meter } from "../ui/parts";
import { useGame } from "../ui/GameProvider";
import { finishMinigame } from "../game/actions";
import { difficulties, minigameMap } from "../game/config/minigames";
import type { Difficulty } from "../game/config/minigames";
import type { MinigameId } from "../game/types";
import { enterLift } from "../anim/transitions";

export type RoundApi = {
  score: number;
  add: (points: number) => void;
  setCombo: (combo: number) => void;
  end: () => void;
  seconds: number;
  difficulty: Difficulty;
  par: number;
  running: boolean;
};

type Props = {
  id: MinigameId;
  onExit: () => void;
  children: (api: RoundApi) => ReactNode;
};

/**
 * Every minigame shares this shell: tutorial first, difficulty always visible,
 * a real countdown, and a result screen that hands the score to the rules.
 * Score arrives as discrete events, so this re-renders on gameplay milestones
 * and one tick a second — never on a frame.
 */
export function GameFrame({ id, onExit, children }: Props) {
  const { state, run, cue, clock} = useGame();
  const game = minigameMap[id];
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [phase, setPhase] = useState<"intro" | "playing" | "done">("intro");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const best = state.minigames[id]?.best ?? 0;
  const par = game.par[difficulty];
  // The phase itself is the guard, so no ref is read during render.
  const finish = useCallback(() => {
    setPhase((current) => {
      if (current !== "playing") return current;
      setScore((latest) => { cue(latest >= par ? "chime" : "blip"); return latest; });
      return "done";
    });
  }, [cue, par]);

  // One interval owns the countdown; the round ends from inside the tick.
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) { finish(); return 0; }
        return value - 1;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [finish, phase]);

  function start() {
    setScore(0);
    setCombo(0);
    setSeconds(game.seconds[difficulty]);
    setPhase("playing");
    cue("blip");
  }

  function bank() {
    run(finishMinigame(state, id, score, par, clock()), game.name);
    onExit();
  }

  const api: RoundApi = {
    score,
    add: useCallback((points: number) => setScore((value) => Math.max(0, value + points)), []),
    setCombo,
    end: finish,
    seconds,
    difficulty,
    par,
    running: phase === "playing",
  };

  return (
    <div className={`minigame minigame-${id}`}>
      <header className="minigame-head">
        <button className="ghost-button" type="button" onClick={onExit}>← All games</button>
        <div className="minigame-title">
          <Art name={game.art} size={22} />
          <div><strong>{game.name}</strong><small>{game.note}</small></div>
        </div>
        <div className="minigame-score">
          <motion.span className="score-now" key={score} initial={{ scale: 1.35 }} animate={{ scale: 1 }}>
            {score}
          </motion.span>
          <small>best {best}</small>
        </div>
      </header>

      {phase === "playing" && (
        <div className="minigame-timer">
          <Meter label={`${seconds}s`} value={seconds} max={game.seconds[difficulty]} />
          <Meter label={`Target ${par}`} value={Math.min(score, par)} max={par} tone="gold" />
          <AnimatePresence>
            {combo > 2 && (
              <motion.span
                className="combo-flag"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                combo ×{combo}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="minigame-field">
        {/* Phases swap directly. Mounting the round must never wait on an exit
            animation — a throttled frame loop would stop the game starting. */}
        {phase === "intro" && (
          <motion.div className="minigame-intro" {...enterLift}>
            <Art name={game.art} size={54} />
            <p className="intro-how">{game.howTo}</p>
            <p className="intro-keys">{game.keys}</p>
            <div className="difficulty-row" role="radiogroup" aria-label="Difficulty">
              {difficulties.map((entry) => (
                <button
                  key={entry.id}
                  className={`carry-chip ${difficulty === entry.id ? "is-active" : ""}`}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === entry.id}
                  onClick={() => setDifficulty(entry.id)}
                >
                  <strong>{entry.label}</strong>
                  <small>{game.seconds[entry.id]}s · target {game.par[entry.id]}</small>
                </button>
              ))}
            </div>
            <button className="primary-button" type="button" onClick={start}>Play</button>
          </motion.div>
        )}

        {phase === "playing" && (
          <motion.div className="minigame-play" {...enterLift}>
            {children(api)}
          </motion.div>
        )}

        {phase === "done" && (
          <motion.div className="minigame-done" role="status" {...enterLift}>
            <Art name={score >= par ? "star" : "leaf"} size={54} />
            <h3>{score >= par ? "Target beaten!" : "Nice round"}</h3>
            <p>{score} points{score > best ? " — a new personal best" : ""}</p>
            <div className="done-actions">
              <button className="ghost-button" type="button" onClick={start}>Play again</button>
              <button className="primary-button" type="button" onClick={bank}>Collect</button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
