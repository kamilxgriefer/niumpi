"use client";

import { useEffect, useRef, useState } from "react";
import type PhaserNS from "phaser";
import type { GameBridge } from "./phaser/bridge";
import { prefersReducedMotion } from "../anim/motionPrefs";
import type { Difficulty } from "../game/config/minigames";

export type SceneFactory = (phaser: typeof PhaserNS) => new (bridge: GameBridge) => PhaserNS.Scene;

type Props = {
  /** Resolved lazily so neither Phaser nor the scene is in the main bundle. */
  load: () => Promise<SceneFactory>;
  difficulty: Difficulty;
  onScore: (points: number) => void;
  onCombo: (combo: number) => void;
  onEnd: () => void;
  cue: (name: string) => void;
  label: string;
};

/**
 * Mounts one Phaser game into a div and tears it down completely on unmount.
 * The bridge callbacks are held in a ref, so re-renders never rebuild the game
 * and the running scene always calls the current handlers.
 */
export function PhaserHost({ load, difficulty, onScore, onCombo, onEnd, cue, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onScore, onCombo, onEnd, cue });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Kept current in an effect so the running scene always calls live handlers
  // without the game being rebuilt on every parent render.
  useEffect(() => {
    handlers.current = { onScore, onCombo, onEnd, cue };
  }, [onScore, onCombo, onEnd, cue]);

  useEffect(() => {
    let game: PhaserNS.Game | null = null;
    let cancelled = false;

    (async () => {
      try {
        const [{ default: Phaser }, factory] = await Promise.all([import("phaser"), load()]);
        if (cancelled || !host.current) return;

        const bridge: GameBridge = {
          addScore: (points) => handlers.current.onScore(points),
          setCombo: (combo) => handlers.current.onCombo(combo),
          end: () => handlers.current.onEnd(),
          cue: (name) => handlers.current.cue(name),
          difficulty,
          reduced: prefersReducedMotion(),
        };

        const SceneClass = factory(Phaser);
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: host.current,
          transparent: true,
          scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
          // The page owns scrolling and audio; Phaser must not fight either.
          audio: { noAudio: true },
          input: { activePointers: 2 },
          scene: new SceneClass(bridge),
        });
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      game?.destroy(true);
      game = null;
    };
    // Difficulty is fixed for a round; changing it restarts from the frame.
  }, [difficulty, load]);

  return (
    <div className="phaser-host" ref={host} role="application" aria-label={label}>
      {status === "loading" && <p className="phaser-status">Loading the game…</p>}
      {status === "error" && <p className="phaser-status is-error">This game could not start. Nothing was lost.</p>}
    </div>
  );
}
